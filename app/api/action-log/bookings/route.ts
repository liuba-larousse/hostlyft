import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

async function getClientId() {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('pricelabs_clients')
    .select('id')
    .or('client_name.ilike.%marcus%,client_name.ilike.%halawi%')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// GET /api/action-log/bookings?group=833&since=2026-05-10&stayFrom=2026-06-01&stayTo=2026-06-30
// Searches in 3 rounds: last 24h, last 72h, last 7d — deduplicates
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const group = req.nextUrl.searchParams.get('group') || '';
  const since = req.nextUrl.searchParams.get('since') || '';
  const stayFrom = req.nextUrl.searchParams.get('stayFrom') || '';
  const stayTo = req.nextUrl.searchParams.get('stayTo') || '';

  const clientId = await getClientId();
  if (!clientId) {
    return NextResponse.json({ bookings: [], rounds: {} });
  }

  const supabase = createSupabaseAdmin();
  const isPortfolioWide = !group || ['account', 'all', 'portfolio'].includes(group.toLowerCase());
  const buildingNum = !isPortfolioWide ? group.split('.')[0] : '';

  // Base query builder
  const buildQuery = (sinceDate: string) => {
    let query = supabase
      .from('booking_reports')
      .select('*')
      .eq('client_id', clientId)
      .gte('booked_date', sinceDate)
      .order('booked_date', { ascending: false })
      .limit(100);

    if (!isPortfolioWide && buildingNum) {
      query = query.ilike('listing_name', `%${buildingNum}%`);
    }

    // If stay dates provided, filter for overlap
    if (stayFrom && stayTo) {
      query = query.lte('checkin_date', stayTo).gte('checkout_date', stayFrom);
    }

    return query;
  };

  const seenIds = new Set<string>();
  const allBookings: any[] = [];
  const rounds: Record<string, number> = {};

  // Round 1: Last 24 hours
  const since24h = since || addDays(new Date().toISOString().split('T')[0], -1);
  const { data: r1 } = await buildQuery(since24h);
  let r1Count = 0;
  (r1 || []).forEach(b => {
    const key = b.reservation_id || `${b.listing_name}-${b.checkin_date}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      allBookings.push({ ...b, _round: '24h' });
      r1Count++;
    }
  });
  rounds['24h'] = r1Count;

  // Round 2: Last 72 hours (skip already found)
  const since72h = addDays(since || new Date().toISOString().split('T')[0], -3);
  const { data: r2 } = await buildQuery(since72h);
  let r2Count = 0;
  (r2 || []).forEach(b => {
    const key = b.reservation_id || `${b.listing_name}-${b.checkin_date}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      allBookings.push({ ...b, _round: '72h' });
      r2Count++;
    }
  });
  rounds['72h'] = r2Count;

  // Round 3: Last 7 days (skip already found)
  const since7d = addDays(since || new Date().toISOString().split('T')[0], -7);
  const { data: r3 } = await buildQuery(since7d);
  let r3Count = 0;
  (r3 || []).forEach(b => {
    const key = b.reservation_id || `${b.listing_name}-${b.checkin_date}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      allBookings.push({ ...b, _round: '7d' });
      r3Count++;
    }
  });
  rounds['7d'] = r3Count;

  return NextResponse.json({
    bookings: allBookings,
    rounds,
    total: allBookings.length,
  });
}
