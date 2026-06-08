import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto/encrypt';

const PRICELABS_API_BASE = 'https://api.pricelabs.co';

// Building number patterns → building group name
// Used to resolve "Combined Listings" to their actual building
const BUILDING_PATTERNS: [RegExp, string][] = [
  [/\b29\b/, '29.Millenium'],
  [/\b833\b/, '833.Aurelien'],
  [/\b1125\b/, '1125.Avra'],
  [/\b365\b/, '365.K2'],
  [/\b747\b/, '747.Bernardin'],
  [/\b160\b/, '160.Fulbrix'],
  [/\b215\b/, '215.Linea'],
  [/\b1044\b/, '1044.Sage'],
  [/\b730\b/, '730.Avenir'],
  [/\b1475\b/, '1475.Foundry'],
  [/\b601\b/, '601'],
  [/\b60\b/, '60.Parkline'],
  [/\b1000\b/, '1000M'],
];

/** Resolve a listing's building group from its customization group and tags */
function resolveBuildingGroup(custGroup: string, tags: string, listingName: string): string {
  // If it's directly assigned to a known group (not "Combined Listings" or "PH")
  if (custGroup && custGroup !== 'Combined Listings' && custGroup !== 'PH') {
    return custGroup;
  }

  // Check for PH tag
  const tagList = tags.split(',').map(t => t.trim());
  const hasPH = tagList.some(t => t === 'PH');

  // For "Combined Listings", find the building from tags or listing name
  if (custGroup === 'Combined Listings') {
    // Check tags first for building number
    const source = tags + ',' + listingName;
    for (const [pattern, group] of BUILDING_PATTERNS) {
      if (pattern.test(source)) {
        // If also has PH tag, it's a PH listing in that building
        return hasPH ? 'PH' : group;
      }
    }
    return hasPH ? 'PH' : 'Combined Listings';
  }

  // "PH" customization group
  if (custGroup === 'PH' || hasPH) {
    return 'PH';
  }

  return custGroup || 'Unknown';
}

interface ListingLinks {
  listingUrl: string | null;
  airbnbUrl: string | null;
  bookingUrl: string | null;
  airbnbId: string | null;
  bookingId: string | null;
}

interface ListingRow {
  client_id: string;
  listing_id: string;
  listing_name: string;
  pms: string;
  building_group: string;
  customization_group: string | null;
  tags: string | null;
  base_price: number | null;
  min_price: number | null;
  bedroom_count: number | null;
  listing_sync: boolean;
  airbnb_id: string | null;
  listing_url: string | null;
  airbnb_url: string | null;
  booking_url: string | null;
  raw: unknown;
}

// PMS values that are themselves a direct OTA connection (vs. a real PMS).
const OTA_DIRECT_PMS = ['airbnb', 'bookingcom', 'booking', 'vrbo', 'homeaway', 'expedia'];
function isOtaDirectPms(pms: string): boolean {
  return OTA_DIRECT_PMS.some(p => pms.includes(p));
}

/**
 * Pull OTA/channel links + ids out of a PriceLabs listing record, for ANY PMS
 * (Guesty, OwnerRez, Hostaway, direct Airbnb/Booking, ...).
 *
 * PriceLabs' /v1/listings field names for these aren't publicly documented and
 * vary, so we work from whatever the record contains:
 *   1. read explicit URL fields,
 *   2. regex-scan the raw record for any airbnb / booking.com URL,
 *   3. parse the OTA id out of those URLs (or explicit id fields),
 *   4. only as a last resort, treat the listing id as the OTA id when the PMS
 *      is itself a direct OTA connection.
 * The OTA id is what we de-duplicate on across PMSs.
 */
function extractListingLinks(l: Record<string, unknown>): ListingLinks {
  const json = JSON.stringify(l ?? {});
  const matchUrl = (host: string): string | null => {
    const m = json.match(new RegExp(`https?:\\/\\/[^"'\\s\\\\]*${host}[^"'\\s\\\\]*`, 'i'));
    return m ? m[0] : null;
  };
  const pickStr = (...vals: unknown[]): string | null => {
    for (const v of vals) if (typeof v === 'string' && v) return v;
    return null;
  };

  const pms = String(l.pms ?? '').toLowerCase();
  const id = l.id != null ? String(l.id) : '';

  let airbnbUrl = matchUrl('airbnb\\.');
  const bookingUrl = matchUrl('booking\\.com');

  // --- Airbnb id: explicit field → URL → listing id (Airbnb-direct only) ---
  let airbnbId = pickStr(l.airbnb_id, l.airbnb_listing_id, l.airbnbId);
  if (!airbnbId && airbnbUrl) {
    const m = airbnbUrl.match(/(?:rooms|h)\/(\d+)/i) ?? airbnbUrl.match(/(\d{4,})/);
    if (m) airbnbId = m[1];
  }
  if (!airbnbId && pms.includes('airbnb') && /^\d+$/.test(id)) {
    airbnbId = id;
  }
  if (!airbnbUrl && airbnbId && /^\d+$/.test(airbnbId)) {
    airbnbUrl = `https://www.airbnb.com/rooms/${airbnbId}`;
  }

  // --- Booking.com id: explicit field → URL slug → listing id (Booking-direct) ---
  let bookingId = pickStr(l.booking_id, l.bookingcom_id, l.bookingId);
  if (!bookingId && bookingUrl) {
    const m = bookingUrl.match(/hotel\/[a-z]{2}\/([^.?#/]+)/i);
    if (m) bookingId = m[1].toLowerCase();
  }
  if (!bookingId && (pms.includes('booking')) && id) {
    bookingId = id;
  }

  const listingUrl = pickStr(l.listing_url, l.url, l.listing_link, l.link);

  return { listingUrl, airbnbUrl, bookingUrl, airbnbId, bookingId };
}

// GET — fetch listings, optionally filtered by building_group
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const buildingGroup = req.nextUrl.searchParams.get('building_group');
  const clientName = req.nextUrl.searchParams.get('client');

  const supabase = createSupabaseAdmin();

  // Find client
  let clientFilter = supabase.from('listing_groups').select('*');
  if (clientName) {
    const { data: clientData } = await supabase
      .from('pricelabs_clients')
      .select('id')
      .ilike('client_name', `%${clientName}%`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (clientData) {
      clientFilter = clientFilter.eq('client_id', clientData.id);
    }
  }

  if (buildingGroup) {
    clientFilter = clientFilter.eq('building_group', buildingGroup);
  }

  const { data, error } = await clientFilter.order('building_group').order('listing_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data ?? [] });
}

// POST — sync listings from PriceLabs API (/v1/listings)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { clientName } = body;

  // Find client with API key
  const supabase = createSupabaseAdmin();
  const { data: clientData } = await supabase
    .from('pricelabs_clients')
    .select('id, api_key_encrypted')
    .ilike('client_name', `%${clientName || 'marcus'}%`)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (!clientData) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  if (!clientData.api_key_encrypted) {
    return NextResponse.json({ error: 'No API key configured for this client. Add one in the API Key field above.' }, { status: 400 });
  }

  const apiKey = decrypt(clientData.api_key_encrypted);

  // Fetch listings from PriceLabs API
  let allListings: any[] = [];
  try {
    const res = await fetch(`${PRICELABS_API_BASE}/v1/listings`, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `PriceLabs API error (${res.status}): ${text}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    allListings = data.listings || [];
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to reach PriceLabs API: ${e.message}` },
      { status: 502 },
    );
  }

  if (allListings.length === 0) {
    return NextResponse.json({ error: 'No listings returned from PriceLabs API' }, { status: 404 });
  }

  // Map API response to listing_groups rows
  // API fields: id, pms, name, group, subgroup, tags, no_of_bedrooms,
  //             base, min, max, isHidden, push_enabled, ...
  const enriched = allListings
    .filter(l => !l.isHidden && l.push_enabled !== false)
    .map(l => {
      const custGroup = (l.group || '').trim();
      const tags = (l.tags || '').trim();
      const listingName = (l.name || '').trim();
      const links = extractListingLinks(l);
      const pms = (l.pms || 'guesty').trim().toLowerCase();
      const row: ListingRow = {
        client_id: clientData.id,
        listing_id: String(l.id),
        listing_name: listingName,
        pms,
        building_group: resolveBuildingGroup(custGroup, tags, listingName),
        customization_group: custGroup || null,
        tags: tags || null,
        base_price: l.base != null ? Number(l.base) : null,
        min_price: l.min != null ? Number(l.min) : null,
        bedroom_count: l.no_of_bedrooms != null ? Number(l.no_of_bedrooms) : null,
        listing_sync: true,
        airbnb_id: links.airbnbId,
        listing_url: links.listingUrl,
        airbnb_url: links.airbnbUrl,
        booking_url: links.bookingUrl,
        raw: l,
      };
      // De-dup key: the OTA listing this row points at, regardless of PMS.
      const otaKey = links.airbnbId
        ? `airbnb:${links.airbnbId}`
        : links.bookingId
          ? `booking:${links.bookingId}`
          : null;
      return { row, otaKey, isOtaDirect: isOtaDirectPms(pms) };
    });

  // Merge rows that resolve to the same OTA id. The canonical row is the
  // price-syncing PMS row (e.g. Guesty/OwnerRez) rather than a direct OTA
  // connection; links from the other rows are merged onto it. Rows without an
  // OTA id are kept as-is.
  const merged = new Map<string, typeof enriched[number]>();
  const standalone: ListingRow[] = [];
  const removedDuplicateIds: string[] = [];

  const mergeLinks = (keep: ListingRow, other: ListingRow) => {
    keep.airbnb_url ??= other.airbnb_url;
    keep.booking_url ??= other.booking_url;
    keep.listing_url ??= other.listing_url;
    keep.airbnb_id ??= other.airbnb_id;
  };

  for (const e of enriched) {
    if (!e.otaKey) { standalone.push(e.row); continue; }
    const existing = merged.get(e.otaKey);
    if (!existing) { merged.set(e.otaKey, e); continue; }

    // Prefer the non-OTA-direct (real PMS) row as canonical.
    const keepExisting = existing.isOtaDirect === e.isOtaDirect
      ? true                          // same category → keep first seen (stable)
      : !existing.isOtaDirect;        // keep whichever is NOT a direct OTA row
    const keep = keepExisting ? existing : e;
    const drop = keepExisting ? e : existing;

    mergeLinks(keep.row, drop.row);
    if (drop.row.listing_id !== keep.row.listing_id) removedDuplicateIds.push(drop.row.listing_id);
    merged.set(e.otaKey, keep);
  }

  // Final canonical set, de-duped by listing_id as a last safety (the upsert
  // can't touch the same conflict target twice in one batch).
  const byListingId = new Map<string, ListingRow>();
  for (const row of [...standalone, ...[...merged.values()].map(m => m.row)]) {
    if (!byListingId.has(row.listing_id)) byListingId.set(row.listing_id, row);
  }
  const listings = [...byListingId.values()];

  // Upsert canonical listings
  const { error } = await supabase
    .from('listing_groups')
    .upsert(listings, { onConflict: 'client_id,listing_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Remove the de-duplicated channel rows that earlier syncs may have stored.
  // Never delete a listing_id we're keeping.
  const keepIds = new Set(listings.map(l => l.listing_id));
  const toDelete = [...new Set(removedDuplicateIds)].filter(id => !keepIds.has(id));
  let removed = 0;
  if (toDelete.length) {
    const { error: delErr, count } = await supabase
      .from('listing_groups')
      .delete({ count: 'exact' })
      .eq('client_id', clientData.id)
      .in('listing_id', toDelete);
    if (delErr) {
      return NextResponse.json({ error: `Listings saved but cleanup failed: ${delErr.message}` }, { status: 500 });
    }
    removed = count ?? 0;
  }

  // Summary by building group
  const groups: Record<string, number> = {};
  listings.forEach(l => { groups[l.building_group] = (groups[l.building_group] || 0) + 1; });

  return NextResponse.json({
    imported: listings.length,
    total: allListings.length,
    hidden: allListings.length - enriched.length,
    mergedDuplicates: toDelete.length,
    removedFromDb: removed,
    groups,
    links: {
      airbnb: listings.filter(l => l.airbnb_url).length,
      booking: listings.filter(l => l.booking_url).length,
    },
  });
}
