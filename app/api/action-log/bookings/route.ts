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

// GET /api/action-log/bookings?group=833&since=2026-05-10
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const group = req.nextUrl.searchParams.get('group') || '';
  const since = req.nextUrl.searchParams.get('since') || '';

  const clientId = await getClientId();
  if (!clientId) {
    return NextResponse.json({ bookings: [] });
  }

  const supabase = createSupabaseAdmin();
  let query = supabase
    .from('booking_reports')
    .select('*')
    .eq('client_id', clientId)
    .order('booked_date', { ascending: false })
    .limit(200);

  if (since) {
    query = query.gte('booked_date', since);
  }

  // Filter by group unless it's portfolio-wide
  const isPortfolioWide = !group || ['account', 'all', 'portfolio'].includes(group.toLowerCase());
  if (!isPortfolioWide) {
    query = query.ilike('listing_name', `%${group}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data ?? [] });
}
