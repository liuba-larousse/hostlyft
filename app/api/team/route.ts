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
  const myEmail = session.user?.email?.toLowerCase() ?? '';
  return NextResponse.json(data.map(m => ({
    ...m,
    isCurrentUser: m.email.toLowerCase() === myEmail,
    isAdmin: !!data.find(x => x.email.toLowerCase() === myEmail)?.is_admin,
  })));
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const supabase = createSupabaseAdmin();

  // Check if caller is admin
  const { data: caller } = await supabase
    .from('team_members')
    .select('is_admin')
    .eq('email', session.user.email)
    .single();

  // Admin can update any member by id; otherwise only own record
  const targetId: string | undefined = body.memberId;
  let query = supabase.from('team_members').update({ toggl_api_token: body.togglApiToken ?? '' });

  if (targetId && caller?.is_admin) {
    query = query.eq('id', targetId);
  } else {
    query = query.eq('email', session.user.email);
  }

  const { data, error } = await query.select().single();
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
