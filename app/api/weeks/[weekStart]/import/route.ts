import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ weekStart: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weekStart } = await params;
  const body = await req.json();
  const supabase = createSupabaseAdmin();
  const createdBy = session.user?.email ?? 'unknown';

  // 1. Upsert the week
  const { data: week, error: weekErr } = await supabase
    .from('weeks')
    .upsert({
      week_start: weekStart,
      week_label: body.week_label ?? '',
      invoices: body.invoices ?? [],
      carry_over: body.carry_over ?? [],
      person_hours: body.person_hours ?? {},
      created_by: createdBy,
    }, { onConflict: 'week_start' })
    .select()
    .single();

  if (weekErr) return NextResponse.json({ error: weekErr.message }, { status: 500 });

  // 2. Bulk insert tasks
  const tasks = (body.tasks ?? []) as Array<{
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    client?: string;
    dueDate?: string;
    duration?: string;
    tags?: string[];
    dayOfWeek?: string;
    taskType?: string;
    dependency?: string;
    delegate?: string;
    sortOrder?: number;
  }>;

  if (tasks.length === 0) {
    return NextResponse.json({ week, tasks: [], imported: 0 });
  }

  const rows = tasks.map((t, i) => ({
    week_id: week.id,
    created_by: createdBy,
    title: t.title,
    description: t.description ?? '',
    status: t.status ?? 'todo',
    priority: t.priority ?? 'medium',
    assignee: t.assignee ?? '',
    client: t.client ?? '',
    due_date: t.dueDate ?? '',
    duration: t.duration ?? '',
    tags: t.tags ?? [],
    day_of_week: t.dayOfWeek ?? '',
    task_type: t.taskType ?? 'client',
    dependency: t.dependency ?? '',
    delegate: t.delegate ?? '',
    sort_order: t.sortOrder ?? i,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('tasks')
    .insert(rows)
    .select();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({
    week,
    imported: inserted?.length ?? 0,
  });
}
