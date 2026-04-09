import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('linkedin_posts')
    .select('*')
    .order('call_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, post_content, status } = await req.json() as {
    id: string; post_content?: string; status?: string;
  };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const update: Record<string, string> = {};
  if (post_content !== undefined) update.post_content = post_content;
  if (status !== undefined) update.status = status;

  const { data, error } = await supabase
    .from('linkedin_posts')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('linkedin_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
