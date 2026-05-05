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
  day_of_week: string;
  duration: string;
  week_id: string | null;
}

interface TeamMember {
  email: string;
  first_name: string;
  last_name: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function priorityBadge(priority: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    critical: { bg: '#fef2f2', text: '#dc2626', label: 'Critical' },
    high:     { bg: '#fff7ed', text: '#ea580c', label: 'High' },
    medium:   { bg: '#fffbeb', text: '#d97706', label: 'Medium' },
    low:      { bg: '#f9fafb', text: '#6b7280', label: 'Low' },
  };
  const s = map[priority] ?? map.medium;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${s.bg};color:${s.text};font-size:11px;font-weight:600;">${s.label}</span>`;
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    todo:       { bg: '#f5efe6', text: '#8b7355', label: 'To Do' },
    inprogress: { bg: '#fffbeb', text: '#d97706', label: 'In Progress' },
    done:       { bg: '#f0fdf4', text: '#22c55e', label: 'Done' },
  };
  const s = map[status] ?? map.todo;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${s.bg};color:${s.text};font-size:11px;font-weight:600;">${s.label}</span>`;
}

function taskRow(task: Task) {
  return `
    <tr>
      <td style="padding:12px 16px;background:#ffffff;border-bottom:1px solid #f3f4f6;vertical-align:top;">
        <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:4px;">${task.title}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          ${statusBadge(task.status)}
          ${priorityBadge(task.priority)}
          ${task.duration ? `<span style="font-size:12px;color:#6b7280;">⏱ ${task.duration}</span>` : ''}
          ${task.client ? `<span style="font-size:12px;color:#6b7280;">· ${task.client}</span>` : ''}
        </div>
      </td>
    </tr>`;
}

function buildPersonalEmail(firstName: string, tasks: Task[], todayName: string, dateStr: string) {
  const todayTasks = tasks.filter(t => t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

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
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 4px;">Good morning, ${firstName}!</h1>
          <p style="color:#9ca3af;font-size:14px;margin:0;">Your tasks for ${todayName} · ${dateStr}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px;">

          ${todayTasks.length === 0
            ? `<div style="text-align:center;padding:32px 0;">
                <p style="font-size:16px;color:#22c55e;font-weight:600;margin:0 0 8px;">All clear!</p>
                <p style="font-size:13px;color:#9ca3af;margin:0;">No tasks assigned for today. Enjoy your day!</p>
              </div>`
            : `
              <div style="margin-bottom:20px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;">
                  Today's Tasks <span style="color:#d1d5db;">(${todayTasks.length})</span>
                </div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #f3f4f6;">
                  <tbody>${todayTasks.map(t => taskRow(t)).join('')}</tbody>
                </table>
              </div>
            `}

          ${doneTasks.length > 0 ? `
            <div style="margin-top:16px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;">
                Completed <span style="color:#d1d5db;">(${doneTasks.length})</span>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid #f3f4f6;">
                <tbody>${doneTasks.map(t => taskRow(t)).join('')}</tbody>
              </table>
            </div>
          ` : ''}

          <!-- Stats -->
          <div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:12px;display:flex;gap:24px;flex-wrap:wrap;">
            <div style="text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#111827;">${todayTasks.length}</div>
              <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">To Do</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#22c55e;">${doneTasks.length}</div>
              <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Done</div>
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
  const today = new Date();
  const todayName = DAY_NAMES[today.getDay()];
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  // Get current week's Monday
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  // Get the week record
  const { data: week } = await supabase
    .from('weeks')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle();

  if (!week) {
    return NextResponse.json({ message: 'No schedule for this week', sent: 0 });
  }

  // Fetch today's tasks for this week
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('week_id', week.id)
    .eq('day_of_week', todayName)
    .order('sort_order', { ascending: true });

  if (tasksError) return NextResponse.json({ error: tasksError.message }, { status: 500 });

  // Fetch team members
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('email, first_name, last_name');

  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

  const teamMembers = (members as TeamMember[]).filter(m => m.email);
  if (teamMembers.length === 0) {
    return NextResponse.json({ error: 'No team members to send to' }, { status: 400 });
  }

  const from = process.env.FROM_EMAIL ?? 'onboarding@resend.dev';
  const results: Array<{ email: string; taskCount: number; status: string }> = [];

  // Send personalized email to each team member
  for (const member of teamMembers) {
    const fullName = `${member.first_name} ${member.last_name}`;

    // Find tasks assigned to this person
    const myTasks = (tasks as Task[]).filter(t => t.assignee === fullName);

    // Skip if no tasks for this person today
    if (myTasks.length === 0) {
      results.push({ email: member.email, taskCount: 0, status: 'skipped' });
      continue;
    }

    const html = buildPersonalEmail(member.first_name, myTasks, todayName, dateStr);

    try {
      await resend.emails.send({
        from,
        to: [member.email],
        subject: `${todayName}'s Tasks — ${myTasks.filter(t => t.status !== 'done').length} to do`,
        html,
      });
      results.push({ email: member.email, taskCount: myTasks.length, status: 'sent' });
    } catch (e) {
      results.push({ email: member.email, taskCount: myTasks.length, status: `error: ${String(e)}` });
    }
  }

  return NextResponse.json({
    sent: results.filter(r => r.status === 'sent').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    results,
  });
}

// POST — triggered from dashboard button
export { handler as POST };
// GET — triggered by Vercel Cron
export { handler as GET };
