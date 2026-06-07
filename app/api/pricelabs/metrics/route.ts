import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getReservations } from '@/lib/supabase/reservations';
import { computeMetrics, type ListingInfo } from '@/lib/metrics/reservations-metrics';

// GET /api/pricelabs/metrics?client=Marcus&from=2026-06-01&to=2026-07-01&building_group=29.Millenium
// Computes occupancy / ADR / RevPAR / revenue from reservation data joined with listing data.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const clientName = params.get('client');
  const buildingGroup = params.get('building_group');

  // Default window: the current calendar month.
  const now = new Date();
  const defFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const from = params.get('from') || defFrom.toISOString().split('T')[0];
  const to = params.get('to') || defTo.toISOString().split('T')[0];

  const supabase = createSupabaseAdmin();

  // Resolve client.
  let clientId: string | undefined;
  if (clientName) {
    const { data: client } = await supabase
      .from('pricelabs_clients')
      .select('id')
      .ilike('client_name', `%${clientName}%`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (!client) {
      return NextResponse.json({ error: `Client "${clientName}" not found` }, { status: 404 });
    }
    clientId = client.id;
  }

  // Load listing metadata (optionally scoped to a building group).
  let listingQuery = supabase
    .from('listing_groups')
    .select('listing_id, listing_name, building_group, bedroom_count');
  if (clientId) listingQuery = listingQuery.eq('client_id', clientId);
  if (buildingGroup) listingQuery = listingQuery.eq('building_group', buildingGroup);
  const { data: listingRows, error: listingErr } = await listingQuery;
  if (listingErr) {
    return NextResponse.json({ error: listingErr.message }, { status: 500 });
  }
  const listings = (listingRows ?? []) as ListingInfo[];

  // Load reservations overlapping the window.
  const reservations = await getReservations({ clientId, from, to });

  // If filtered to a building group, only keep reservations for those listings.
  const filtered = buildingGroup
    ? reservations.filter(r => listings.some(l => l.listing_id === r.listing_id))
    : reservations;

  const metrics = computeMetrics(filtered, listings, from, to);
  return NextResponse.json(metrics);
}
