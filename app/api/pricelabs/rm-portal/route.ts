import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/crypto/encrypt';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('rm_portal_credentials')
    .select('id, email, created_at, updated_at')
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ credentials: data ?? null });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const encrypted = encrypt(body.password);

  // Check if credentials already exist
  const { data: existing } = await supabase
    .from('rm_portal_credentials')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('rm_portal_credentials')
      .update({
        email: body.email,
        password_encrypted: encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, email, updated_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ credentials: data });
  } else {
    // Create new
    const { data, error } = await supabase
      .from('rm_portal_credentials')
      .insert({
        email: body.email,
        password_encrypted: encrypted,
      })
      .select('id, email, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ credentials: data });
  }
}
