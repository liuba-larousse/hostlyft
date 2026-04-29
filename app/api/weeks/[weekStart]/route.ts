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
    completedBy: row.completed_by ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
  };
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ weekStart: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weekStart } = await params;
  const supabase = createSupabaseAdmin();

  // Get the week
  const { data: week, error: weekErr } = await supabase
    .from('weeks')
    .select('*')
    .eq('week_start', weekStart)
    .single();

  if (weekErr && weekErr.code !== 'PGRST116') {
    return NextResponse.json({ error: weekErr.message }, { status: 500 });
  }

  // Get tasks for this week
  let tasks: Record<string, unknown>[] = [];
  if (week) {
    const { data: taskData, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('week_id', week.id)
      .order('sort_order', { ascending: true });

    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });
    tasks = taskData ?? [];
  }

  return NextResponse.json({
    week: week ?? null,
    tasks: tasks.map(toTask),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ weekStart: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weekStart } = await params;
  const body = await req.json();
  const supabase = createSupabaseAdmin();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('week_label' in body) update.week_label = body.week_label;
  if ('invoices' in body) update.invoices = body.invoices;
  if ('carry_over' in body) update.carry_over = body.carry_over;
  if ('person_hours' in body) update.person_hours = body.person_hours;

  const { data, error } = await supabase
    .from('weeks')
    .update(update)
    .eq('week_start', weekStart)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
