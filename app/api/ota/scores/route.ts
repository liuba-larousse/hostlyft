import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { isHiddenClientName, joinedClientName } from '@/lib/clients/exclusions';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('ota_scores')
    .select('*, ota_listings(*, pricelabs_clients(client_name))')
    .order('scraped_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Drop scores belonging to hidden clients (managed in a separate app).
  const visible = (data ?? []).filter((row) => {
    const listing = Array.isArray(row.ota_listings) ? row.ota_listings[0] : row.ota_listings;
    return !isHiddenClientName(joinedClientName(listing?.pricelabs_clients));
  });
  return NextResponse.json(visible);
}
