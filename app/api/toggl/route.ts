import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { auth } from '@/lib/auth';

const BASE = 'https://api.track.toggl.com';

function authHeader(token: string) {
  return 'Basic ' + Buffer.from(`${token}:api_token`).toString('base64');
}

function isoDate(d: Date) { return d.toISOString().split('T')[0]; }

function getDateRange(range: string): { start: string; end: string } {
  const now = new Date();
  switch (range) {
    case 'last_week': {
      const end = new Date(now);
      end.setDate(now.getDate() - now.getDay());
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return { start: isoDate(start), end: isoDate(end) };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: isoDate(start), end: isoDate(end) };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: isoDate(start), end: isoDate(end) };
    }
    case 'last_4_weeks': {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(now.getDate() - 27);
      return { start: isoDate(start), end: isoDate(end) };
    }
    default: {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay() + 1);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start: isoDate(start), end: isoDate(new Date(end.getTime() + 86400000)) };
    }
  }
}

function getWeeks() {
  const weeks: { key: string; start: string; end: string }[] = [];
  for (let i = 3; i >= 0; i--) {
    const now = new Date();
    now.setDate(now.getDate() - i * 7);
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    weeks.push({
      key: 'w' + i,
      start: start.toISOString().split('T')[0],
      end: new Date(end.getTime() + 86400000).toISOString().split('T')[0],
    });
  }
  return weeks;
}

function matchesContact(projectName: string, firstName: string, company: string): boolean {
  const pn = projectName.toLowerCase();
  const fn = firstName.toLowerCase();
  const co = company.toLowerCase().split(' ')[0];
  return (
    (fn.length > 2 && pn.includes(fn)) ||
    (co.length > 3 && co !== '—' && pn.includes(co))
  );
}

// Fetch workspace info + projects/clients for a given token
async function fetchWorkspaceData(token: string) {
  const meRes = await fetch(`${BASE}/api/v9/me`, {
    headers: { Authorization: authHeader(token) },
  });
  if (!meRes.ok) return null;
  const me = await meRes.json();
  const wsId: number = me.default_workspace_id;

  const [projRes, clientsRes] = await Promise.all([
    fetch(`${BASE}/api/v9/workspaces/${wsId}/projects?active=both&per_page=200`, { headers: { Authorization: authHeader(token) } }),
    fetch(`${BASE}/api/v9/workspaces/${wsId}/clients?status=both`, { headers: { Authorization: authHeader(token) } }),
  ]);

  const projects: { id: number; name: string; client_id?: number | null }[] = projRes.ok ? await projRes.json() : [];
  const clients: { id: number; name: string }[] = clientsRes.ok ? await clientsRes.json() : [];

  return { me, wsId, projects, clients };
}

// Fetch seconds per project for a member token in a date range
async function fetchSecondsByProject(token: string, start: string, end: string): Promise<Record<number, number>> {
  const res = await fetch(
    `${BASE}/api/v9/me/time_entries?start_date=${start}T00:00:00Z&end_date=${end}T23:59:59Z`,
    { headers: { Authorization: authHeader(token) } }
  );
  if (!res.ok) return {};
  const entries: { project_id: number | null; duration: number }[] = await res.json();
  const map: Record<number, number> = {};
  for (const e of entries) {
    if (!e.project_id || e.duration < 0) continue;
    map[e.project_id] = (map[e.project_id] || 0) + e.duration;
  }
  return map;
}

// Get all team member tokens from Supabase, falling back to env var
async function getTeamTokens(): Promise<{ name: string; email: string; token: string }[]> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('team_members')
    .select('first_name, last_name, email, toggl_api_token')
    .neq('toggl_api_token', '');

  const members = (data ?? [])
    .filter(m => m.toggl_api_token)
    .map(m => ({
      name: `${m.first_name} ${m.last_name}`,
      email: m.email,
      token: m.toggl_api_token as string,
    }));

  // Fall back to env var token if no member tokens set yet
  if (members.length === 0 && process.env.TOGGL_API_TOKEN) {
    members.push({ name: 'Default', email: '', token: process.env.TOGGL_API_TOKEN });
  }

  return members;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action') || 'sync';
  const range  = req.nextUrl.searchParams.get('range')  || 'this_week';

  try {
    const teamTokens = await getTeamTokens();
    if (!teamTokens.length) {
      return NextResponse.json({ error: 'No Toggl tokens configured. Add your Toggl API token on the Team page.' }, { status: 500 });
    }

    // Use the first token for workspace structure (projects/clients)
    const ws = await fetchWorkspaceData(teamTokens[0].token);
    if (!ws) return NextResponse.json({ error: 'Toggl auth failed' }, { status: 500 });
    const { wsId, projects, clients } = ws;

    if (action === 'sync') {
      const { start, end } = getDateRange(range);

      // Fetch each member's entries in parallel
      const memberResults = await Promise.all(
        teamTokens.map(async m => {
          const secByProject = await fetchSecondsByProject(m.token, start, end);
          const secByClient: Record<number, number> = {};
          for (const p of projects) {
            if (p.client_id && secByProject[p.id]) {
              secByClient[p.client_id] = (secByClient[p.client_id] || 0) + secByProject[p.id];
            }
          }
          return { name: m.name, email: m.email, secByProject, secByClient };
        })
      );

      // Aggregate totals across all members
      const totalSecByProject: Record<number, number> = {};
      const totalSecByClient: Record<number, number> = {};
      for (const m of memberResults) {
        for (const [k, v] of Object.entries(m.secByProject)) {
          totalSecByProject[Number(k)] = (totalSecByProject[Number(k)] || 0) + v;
        }
        for (const [k, v] of Object.entries(m.secByClient)) {
          totalSecByClient[Number(k)] = (totalSecByClient[Number(k)] || 0) + v;
        }
      }

      return NextResponse.json({
        email: ws.me.email,
        workspaceId: wsId,
        range,
        projects: projects.map(p => ({ id: p.id, name: p.name, clientId: p.client_id ?? null })),
        clients: clients.map(c => ({ id: c.id, name: c.name })),
        clientGroups: Object.entries(totalSecByClient).map(([clientId, seconds]) => ({
          clientId: Number(clientId), seconds,
        })),
        weekGroups: Object.entries(totalSecByProject).map(([projectId, seconds]) => ({
          projectId: Number(projectId), seconds,
        })),
        // Per-member breakdown
        memberBreakdown: memberResults.map(m => ({
          name: m.name,
          email: m.email,
          clientGroups: Object.entries(m.secByClient).map(([clientId, seconds]) => ({
            clientId: Number(clientId), seconds,
          })),
          totalSeconds: Object.values(m.secByProject).reduce((a, b) => a + b, 0),
        })),
      });
    }

    if (action === 'weekly') {
      const firstName = req.nextUrl.searchParams.get('firstName') || '';
      const company   = req.nextUrl.searchParams.get('company')   || '';
      const clientId  = req.nextUrl.searchParams.get('clientId');
      const weeks     = getWeeks();

      const results = await Promise.all(
        weeks.map(async w => {
          // Fetch all members' entries for this week in parallel
          const memberSecs = await Promise.all(
            teamTokens.map(m => fetchSecondsByProject(m.token, w.start, w.end))
          );

          // Combine into total seconds by project
          const combined: Record<number, number> = {};
          for (const secByProject of memberSecs) {
            for (const [k, v] of Object.entries(secByProject)) {
              combined[Number(k)] = (combined[Number(k)] || 0) + v;
            }
          }

          let hours = 0;
          if (clientId) {
            const cid = parseInt(clientId);
            projects.filter(p => p.client_id === cid).forEach(p => { hours += (combined[p.id] || 0) / 3600; });
          } else {
            for (const [projId, secs] of Object.entries(combined)) {
              const proj = projects.find(p => p.id === Number(projId));
              if (proj && matchesContact(proj.name, firstName, company)) hours += secs / 3600;
            }
          }
          return { key: w.key, hours };
        })
      );

      const hoursByWeek: Record<string, number> = {};
      results.forEach(r => { hoursByWeek[r.key] = r.hours; });
      return NextResponse.json({ hoursByWeek });
    }

    if (action === 'debug') {
      const { start, end } = getDateRange(range);
      const secByProject = await fetchSecondsByProject(teamTokens[0].token, start, end);
      const secByClient: Record<number, number> = {};
      for (const p of projects) {
        if (p.client_id && secByProject[p.id]) {
          secByClient[p.client_id] = (secByClient[p.client_id] || 0) + secByProject[p.id];
        }
      }
      return NextResponse.json({
        range, start, end,
        members: teamTokens.map(m => m.name),
        projectsWithClientId: projects.filter(p => p.client_id).map(p => ({
          id: p.id, name: p.name, clientId: p.client_id, hours: (secByProject[p.id] || 0) / 3600,
        })),
        clients: clients.map(c => ({ id: c.id, name: c.name, hours: (secByClient[c.id] || 0) / 3600 })),
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamTokens = await getTeamTokens();
  if (!teamTokens.length) return NextResponse.json({ error: 'No Toggl tokens configured' }, { status: 500 });

  const { name } = await req.json() as { name: string };
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  try {
    const ws = await fetchWorkspaceData(teamTokens[0].token);
    if (!ws) throw new Error('Toggl auth failed');
    const { wsId } = ws;
    const token = teamTokens[0].token;

    const clientsRes = await fetch(`${BASE}/api/v9/workspaces/${wsId}/clients?status=both`, { headers: { Authorization: authHeader(token) } });
    const existingClients: { id: number; name: string }[] = clientsRes.ok ? await clientsRes.json() : [];
    let client = existingClients.find(c => c.name.toLowerCase() === name.toLowerCase());
    const clientExisted = !!client;

    if (!client) {
      const clientRes = await fetch(`${BASE}/api/v9/workspaces/${wsId}/clients`, {
        method: 'POST',
        headers: { Authorization: authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (clientRes.ok) client = await clientRes.json() as { id: number; name: string };
    }

    const projRes = await fetch(`${BASE}/api/v9/workspaces/${wsId}/projects?active=both&per_page=200`, { headers: { Authorization: authHeader(token) } });
    const existing: { id: number; name: string }[] = projRes.ok ? await projRes.json() : [];
    const duplicate = existing.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return NextResponse.json({ project: duplicate, client, existed: true, clientExisted });

    const res = await fetch(`${BASE}/api/v9/workspaces/${wsId}/projects`, {
      method: 'POST',
      headers: { Authorization: authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, active: true, ...(client ? { client_id: client.id } : {}) }),
    });
    if (!res.ok) throw new Error('Failed to create Toggl project');
    const project = await res.json();
    return NextResponse.json({ project, client, existed: false, clientExisted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
