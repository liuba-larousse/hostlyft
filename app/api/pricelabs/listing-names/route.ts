import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

interface ByListing {
  listingId: string;
  listing: string;
}

// Active listings (id + name) for a client, from the latest synced portfolio
// report's per-listing roster. Used to build the Manage Clients listing-URL table.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('portfolio_reports')
    .select('report_data')
    .eq('client_id', clientId)
    .order('report_date', { ascending: false })
    .limit(1);

  const listings = ((data?.[0]?.report_data?.byListing ?? []) as ByListing[])
    .filter((l) => l.listingId && l.listing)
    .map((l) => ({ id: l.listingId, name: l.listing }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ listings });
}
