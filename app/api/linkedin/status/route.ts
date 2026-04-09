import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['linkedin_person_id', 'linkedin_token_expires_at', 'linkedin_name']);

  const map = Object.fromEntries((data ?? []).map(r => [r.key, r.value]));

  if (!map.linkedin_person_id) return NextResponse.json({ connected: false });

  const expiresAt = map.linkedin_token_expires_at ? new Date(map.linkedin_token_expires_at) : null;
  const expired = expiresAt ? expiresAt < new Date() : false;

  return NextResponse.json({
    connected: !expired,
    expired,
    name: map.linkedin_name ?? '',
    expiresAt: map.linkedin_token_expires_at ?? '',
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  await supabase.from('settings')
    .delete()
    .in('key', ['linkedin_access_token', 'linkedin_person_id', 'linkedin_token_expires_at', 'linkedin_name']);

  return NextResponse.json({ ok: true });
}
