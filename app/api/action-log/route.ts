import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

// Find Marcus Halawi's client ID
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

// GET — load all action log state
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = await getClientId();
  if (!clientId) {
    return NextResponse.json({ rows: [], scratchpad: '', notes: [], screenshots: { scratchpad: [], byNote: {} }, funnel: {}, states: [] });
  }

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('action_log_state')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ rows: [], scratchpad: '', notes: [], screenshots: { scratchpad: [], byNote: {} }, funnel: {}, states: [] });
  }

  return NextResponse.json({
    rows: data.rows ?? [],
    scratchpad: data.scratchpad ?? '',
    notes: data.notes ?? [],
    screenshots: data.screenshots ?? { scratchpad: [], byNote: {} },
    funnel: data.funnel ?? {},
    states: data.states ?? [],
  });
}

// PATCH — update specific fields of action log state
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = await getClientId();
  if (!clientId) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const body = await req.json();
  const allowedFields = ['rows', 'scratchpad', 'notes', 'screenshots', 'funnel', 'states'];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowedFields) {
    if (field in body) {
      update[field] = body[field];
    }
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('action_log_state')
    .upsert(
      { client_id: clientId, ...update },
      { onConflict: 'client_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
