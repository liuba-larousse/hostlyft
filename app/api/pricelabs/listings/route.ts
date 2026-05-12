import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import Papa from 'papaparse';

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

// POST — import listings from CSV
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { csvText, clientName } = body;

  if (!csvText) {
    return NextResponse.json({ error: 'csvText is required' }, { status: 400 });
  }

  // Find client
  const supabase = createSupabaseAdmin();
  const { data: clientData } = await supabase
    .from('pricelabs_clients')
    .select('id')
    .ilike('client_name', `%${clientName || 'marcus'}%`)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (!clientData) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // Parse CSV
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    return NextResponse.json({ error: `CSV parse error: ${parsed.errors[0].message}` }, { status: 400 });
  }

  const rows = parsed.data as Record<string, string>[];
  const listings = rows
    .filter(r => r['Listing ID'] && r['Listing Sync'] === 'TRUE')
    .map(r => {
      const custGroup = (r['Customization Group'] || '').trim();
      const tags = (r['Tags'] || '').trim();
      const listingName = (r['Listing Name'] || '').trim();
      return {
        client_id: clientData.id,
        listing_id: r['Listing ID'].trim(),
        listing_name: listingName,
        pms: (r['PMS Name'] || 'guesty').trim().toLowerCase(),
        building_group: resolveBuildingGroup(custGroup, tags, listingName),
        customization_group: custGroup || null,
        tags: tags || null,
        base_price: r['Base Price'] ? parseFloat(r['Base Price']) : null,
        min_price: r['Min Price'] ? parseFloat(r['Min Price']) : null,
        bedroom_count: r['Bedroom Count'] ? parseInt(r['Bedroom Count']) : null,
        listing_sync: r['Listing Sync'] === 'TRUE',
        airbnb_id: r['Airbnb ID']?.trim() || null,
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
    groups,
  });
}
