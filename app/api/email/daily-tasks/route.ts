import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';

export const maxDuration = 30;

const resend = new Resend(process.env.RESEND_API_KEY);

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  client: string;
  due_date: string;
}

interface TeamMember {
  email: string;
  first_name: string;
  last_name: string;
}

function priorityBadge(priority: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high:   { bg: '#fef2f2', text: '#ef4444', label: 'High' },
    medium: { bg: '#fffbeb', text: '#d97706', label: 'Medium' },
    low:    { bg: '#f9fafb', text: '#6b7280', label: 'Low' },
  };
  const s = map[priority] ?? map.low;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${s.bg};color:${s.text};font-size:11px;font-weight:600;">${s.label}</span>`;
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    todo:       { bg: '#f3f4f6', text: '#6b7280', label: 'To Do' },
    inprogress: { bg: '#eff6ff', text: '#3b82f6', label: 'In Progress' },
    review:     { bg: '#faf5ff', text: '#8b5cf6', label: 'Review' },
    done:       { bg: '#f0fdf4', text: '#22c55e', label: 'Done' },
  };
  const s = map[status] ?? map.todo;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${s.bg};color:${s.text};font-size:11px;font-weight:600;">${s.label}</span>`;
}

function taskRow(task: Task, highlight = false) {
  const bg = highlight ? '#fffbeb' : '#ffffff';
  const dueDateStr = task.due_date
    ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  return `
    <tr>
      <td style="padding:10px 16px;background:${bg};border-bottom:1px solid #f3f4f6;vertical-align:top;">
        <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:4px;">${task.title}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          ${statusBadge(task.status)}
          ${priorityBadge(task.priority)}
          ${task.assignee ? `<span style="font-size:12px;color:#6b7280;">👤 ${task.assignee}</span>` : ''}
          ${task.client ? `<span style="font-size:12px;color:#6b7280;">· ${task.client}</span>` : ''}
          ${dueDateStr ? `<span style="font-size:12px;color:${highlight ? '#d97706' : '#6b7280'};">📅 ${dueDateStr}</span>` : ''}
        </div>
      </td>
    </tr>`;
}

function section(title: string, tasks: Task[], emptyMsg: string, highlight = false) {
  return `
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;padding:0 4px;">
        ${title} <span style="color:#d1d5db;">(${tasks.length})</span>
      </div>
      ${tasks.length === 0
        ? `<p style="font-size:13px;color:#9ca3af;padding:12px 16px;background:#f9fafb;border-radius:10px;margin:0;">${emptyMsg}</p>`
        : `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #f3f4f6;">
            <tbody>${tasks.map(t => taskRow(t, highlight)).join('')}</tbody>
           </table>`
      }
    </div>`;
}

function buildEmailHtml(tasks: Task[], date: string) {
  const today = new Date().toISOString().split('T')[0];

  const active = tasks.filter(t => t.status !== 'done');
  const overdue    = active.filter(t => t.due_date && t.due_date < today);
  const dueToday   = active.filter(t => t.due_date === today);
  const inProgress = active.filter(t => t.status === 'inprogress' && (!t.due_date || t.due_date > today));
  const todo       = active.filter(t => t.status === 'todo' && (!t.due_date || t.due_date > today));
  const review     = active.filter(t => t.status === 'review');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:28px 32px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:36px;height:36px;background:#facc15;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#111827;">H</div>
            <span style="color:#ffffff;font-size:18px;font-weight:700;margin-left:12px;">Hostlyft Team</span>
          </div>
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 4px;">Daily Task Digest</h1>
          <p style="color:#9ca3af;font-size:14px;margin:0;">${date}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px;">

          ${overdue.length > 0 ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 18px;margin-bottom:28px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#dc2626;">⚠️ ${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue</p>
          </div>` : ''}

          ${section('Overdue', overdue, 'No overdue tasks', true)}
          ${section('Due Today', dueToday, 'Nothing due today')}
          ${section('In Progress', inProgress, 'No tasks in progress')}
          ${section('In Review', review, 'No tasks in review')}
          ${section('To Do', todo, 'No open tasks')}

          <!-- Stats bar -->
          <div style="margin-top:8px;padding:16px;background:#f9fafb;border-radius:12px;display:flex;gap:24px;flex-wrap:wrap;">
            <div style="text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#111827;">${active.length}</div>
              <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Active</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#ef4444;">${overdue.length}</div>
              <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Overdue</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#3b82f6;">${inProgress.length}</div>
              <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">In Progress</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#22c55e;">${tasks.filter(t => t.status === 'done').length}</div>
              <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Done</div>
            </div>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0;text-align:center;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">Hostlyft Team Dashboard · Sent automatically every morning</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function handler(req: NextRequest) {
  // Allow cron (CRON_SECRET) or authenticated session
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createSupabaseAdmin();

  // Fetch all tasks
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false });

  if (tasksError) return NextResponse.json({ error: tasksError.message }, { status: 500 });

  // Fetch team member emails
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('email, first_name, last_name');

  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const recipients = (members as TeamMember[])
    .map(m => m.email)
    .filter(Boolean);

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No team members to send to' }, { status: 400 });
  }

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const html = buildEmailHtml(tasks as Task[], dateStr);
  const from = process.env.FROM_EMAIL ?? 'onboarding@resend.dev';

  const { data: emailData, error: emailError } = await resend.emails.send({
    from,
    to: recipients,
    subject: `Daily Task Digest — ${dateStr}`,
    html,
  });

  if (emailError) return NextResponse.json({ error: emailError.message }, { status: 500 });

  return NextResponse.json({
    sent: true,
    recipients: recipients.length,
    taskCount: (tasks as Task[]).length,
    emailId: emailData?.id,
  });
}

// POST — triggered from dashboard button
export { handler as POST };
// GET — triggered by Vercel Cron
export { handler as GET };
