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
    duration: row.duration ?? '',
    tags: row.tags ?? [],
    weekId: row.week_id ?? null,
    dayOfWeek: row.day_of_week ?? '',
    taskType: row.task_type ?? 'client',
    dependency: row.dependency ?? '',
    delegate: row.delegate ?? '',
    sortOrder: row.sort_order ?? 0,
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
  if ('duration' in body)    update.duration    = body.duration;
  if ('tags' in body)        update.tags        = body.tags;
  if ('weekId' in body)      update.week_id     = body.weekId;
  if ('dayOfWeek' in body)   update.day_of_week = body.dayOfWeek;
  if ('taskType' in body)    update.task_type   = body.taskType;
  if ('dependency' in body)  update.dependency  = body.dependency;
  if ('delegate' in body)    update.delegate    = body.delegate;
  if ('sortOrder' in body)   update.sort_order  = body.sortOrder;

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
