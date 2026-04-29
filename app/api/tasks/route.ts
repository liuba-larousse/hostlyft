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

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekId = searchParams.get('week_id');
  const backlog = searchParams.get('backlog');

  const supabase = createSupabaseAdmin();
  let query = supabase.from('tasks').select('*').order('sort_order', { ascending: true });

  if (backlog === 'true') {
    query = query.is('week_id', null);
  } else if (weekId) {
    query = query.eq('week_id', weekId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map(toTask));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      created_by: session.user?.id ?? session.user?.email ?? 'unknown',
      title: body.title,
      description: body.description ?? '',
      status: body.status ?? 'todo',
      priority: body.priority ?? 'medium',
      assignee: body.assignee ?? '',
      client: body.client ?? '',
      due_date: body.dueDate ?? '',
      duration: body.duration ?? '',
      tags: body.tags ?? [],
      week_id: body.weekId ?? null,
      day_of_week: body.dayOfWeek ?? '',
      task_type: body.taskType ?? 'client',
      dependency: body.dependency ?? '',
      delegate: body.delegate ?? '',
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toTask(data));
}
