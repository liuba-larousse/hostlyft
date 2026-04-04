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

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

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
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toTask(data));
}
