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

// GET /api/action-log/bookings?group=833&since=2026-05-10&stayFrom=2026-06-01&stayTo=2026-06-30
// All bookings must be booked ON OR AFTER the action date (since).
// Rounds broaden the stay-date filter, not the booked-date filter.
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
    return NextResponse.json({ bookings: [] });
  }

  const supabase = createSupabaseAdmin();
  const isPortfolioWide = !group || ['account', 'all', 'portfolio'].includes(group.toLowerCase());
  const buildingNum = !isPortfolioWide ? group.split('.')[0] : '';

  // All bookings must be booked AFTER the action date — never go before it
  let query = supabase
    .from('booking_reports')
    .select('*')
    .eq('client_id', clientId)
    .order('booked_date', { ascending: false })
    .limit(200);

  // ALWAYS filter: booking must be made on or after the action date
  if (since) {
    query = query.gte('booked_date', since);
  }

  // Filter by group
  if (!isPortfolioWide && buildingNum) {
    query = query.ilike('listing_name', `%${buildingNum}%`);
  }

  // Optionally filter by stay date overlap
  if (stayFrom && stayTo) {
    query = query.lte('checkin_date', stayTo).gte('checkout_date', stayFrom);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data ?? [] });
}
