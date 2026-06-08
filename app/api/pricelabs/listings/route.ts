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
}

/**
 * Pull OTA/channel links out of a PriceLabs listing record.
 * PriceLabs' /v1/listings field names for these aren't publicly documented and
 * vary, so we: (1) read explicit URL fields, (2) regex-scan the raw record for
 * any airbnb/booking.com URL, and (3) build the Airbnb URL from the listing id
 * when the PMS is Airbnb (the PriceLabs id is the Airbnb room id in that case).
 */
function extractListingLinks(l: Record<string, unknown>): ListingLinks {
  const json = JSON.stringify(l ?? {});
  const matchUrl = (host: string): string | null => {
    const m = json.match(new RegExp(`https?:\\/\\/[^"'\\s\\\\]*${host}[^"'\\s\\\\]*`, 'i'));
    return m ? m[0] : null;
  };

  let airbnbUrl = matchUrl('airbnb\\.');
  const bookingUrl = matchUrl('booking\\.com');

  const pms = String(l.pms ?? '').toLowerCase();
  const id = l.id != null ? String(l.id) : '';
  let airbnbId: string | null =
    l.airbnb_id != null ? String(l.airbnb_id)
    : l.airbnb_listing_id != null ? String(l.airbnb_listing_id)
    : null;

  // For Airbnb-connected listings the PriceLabs listing id is the Airbnb room id.
  if (!airbnbUrl && pms.includes('airbnb') && /^\d+$/.test(id)) {
    airbnbId = id;
  }
  if (!airbnbUrl && airbnbId && /^\d+$/.test(airbnbId)) {
    airbnbUrl = `https://www.airbnb.com/rooms/${airbnbId}`;
  }

  const pickStr = (...vals: unknown[]): string | null => {
    for (const v of vals) if (typeof v === 'string' && v) return v;
    return null;
  };
  const listingUrl = pickStr(l.listing_url, l.url, l.listing_link, l.link);

  return { listingUrl, airbnbUrl, bookingUrl, airbnbId };
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
  const listings = allListings
    .filter(l => !l.isHidden && l.push_enabled !== false)
    .map(l => {
      const custGroup = (l.group || '').trim();
      const tags = (l.tags || '').trim();
      const listingName = (l.name || '').trim();
      const links = extractListingLinks(l);
      return {
        client_id: clientData.id,
        listing_id: String(l.id),
        listing_name: listingName,
        pms: (l.pms || 'guesty').trim().toLowerCase(),
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
    });

  // Upsert all listings
  const { error } = await supabase
    .from('listing_groups')
    .upsert(listings, { onConflict: 'client_id,listing_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Summary by building group
  const groups: Record<string, number> = {};
  listings.forEach(l => { groups[l.building_group] = (groups[l.building_group] || 0) + 1; });

  return NextResponse.json({
    imported: listings.length,
    total: allListings.length,
    hidden: allListings.length - listings.length,
    groups,
    links: {
      airbnb: listings.filter(l => l.airbnb_url).length,
      booking: listings.filter(l => l.booking_url).length,
    },
  });
}
