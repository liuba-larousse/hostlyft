import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

// GET — fetch stored reports from Supabase (no Playwright needed)
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  const { data: clientData } = await supabase
    .from('pricelabs_clients')
    .select('id')
    .or('client_name.ilike.%marcus%,client_name.ilike.%halawi%')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (!clientData) {
    return NextResponse.json({ reports: [] });
  }

  const { data: reports } = await supabase
    .from('portfolio_reports')
    .select('*')
    .eq('client_id', clientData.id)
    .order('report_date', { ascending: false })
    .limit(180);

  return NextResponse.json({ reports: reports ?? [] });
}
