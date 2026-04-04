import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

function toTask(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    priority: row.priority,
    assignee: row.assignee ?? '',
    client: row.client ?? '',
    dueDate: row.due_date ?? '',
    createdAt: row.created_at,
  };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const supabase = createSupabaseAdmin();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('title' in body)       update.title       = body.title;
  if ('description' in body) update.description = body.description;
  if ('status' in body)      update.status      = body.status;
  if ('priority' in body)    update.priority    = body.priority;
  if ('assignee' in body)    update.assignee    = body.assignee;
  if ('client' in body)      update.client      = body.client;
  if ('dueDate' in body)     update.due_date    = body.dueDate;

  const { data, error } = await supabase
    .from('tasks')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toTask(data));
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('tasks').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
