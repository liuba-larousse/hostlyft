import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto/encrypt';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name, email, active, hubspot_contact_id, connection_type, api_key_encrypted, report_urls, created_at')
    .order('client_name');

  // Mark which clients have an API key (don't expose the key itself in GET)
  const safeData = (data ?? []).map(c => ({
    ...c,
    has_api_key: !!c.api_key_encrypted,
    api_key_encrypted: undefined,
  }));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(safeData);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { hubspot_contact_id, client_name, email, password, connection_type, api_key } = await req.json();

  // RM Portal connection: no individual credentials needed
  if (connection_type === 'rm_portal') {
    if (!client_name) return NextResponse.json({ error: 'client_name is required' }, { status: 400 });
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from('pricelabs_clients')
      .insert({
        client_name,
        email: '',
        password_encrypted: '',
        connection_type: 'rm_portal',
        hubspot_contact_id: hubspot_contact_id ?? null,
      })
      .select('id, client_name, email, active, hubspot_contact_id, connection_type, created_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  // Direct connection: requires individual credentials
  if (!client_name || !email || !password) {
    return NextResponse.json({ error: 'client_name, email and password are required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('pricelabs_clients')
    .insert({ client_name, email, password_encrypted: encrypt(password), connection_type: 'direct', hubspot_contact_id: hubspot_contact_id ?? null, api_key_encrypted: api_key ? encrypt(api_key) : null })
    .select('id, client_name, email, active, hubspot_contact_id, connection_type, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('pricelabs_clients').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, active, password, api_key, report_urls } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (active !== undefined) updates.active = active;
  if (password) updates.password_encrypted = encrypt(password);
  if (api_key !== undefined) updates.api_key_encrypted = api_key ? encrypt(api_key) : null;
  if (report_urls !== undefined) updates.report_urls = report_urls;

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('pricelabs_clients').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
