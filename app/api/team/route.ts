import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('team_members')
    .update({ toggl_api_token: body.togglApiToken ?? '' })
    .eq('email', session.user.email)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('team_members')
    .upsert({
      email: session.user.email,
      first_name: body.firstName,
      last_name: body.lastName,
      google_id: session.user.id ?? '',
      avatar_url: session.user.image ?? '',
    }, { onConflict: 'email' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
