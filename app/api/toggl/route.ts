import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.TOGGL_API_TOKEN;
const BASE = 'https://api.track.toggl.com';

function auth() {
  return 'Basic ' + Buffer.from(`${TOKEN}:api_token`).toString('base64');
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

export async function GET(req: NextRequest) {
  if (!TOKEN) return NextResponse.json({ error: 'TOGGL_API_TOKEN not configured' }, { status: 500 });

  const action = req.nextUrl.searchParams.get('action') || 'sync';

  try {
    // Always fetch workspace + projects
    const meRes = await fetch(`${BASE}/api/v9/me`, {
      headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    });
    if (!meRes.ok) throw new Error('Toggl auth failed');
    const me = await meRes.json();
    const wsId: number = me.default_workspace_id;

    const [projRes, clientsRes] = await Promise.all([
      fetch(`${BASE}/api/v9/workspaces/${wsId}/projects?active=both&per_page=200`, { headers: { Authorization: auth() } }),
      fetch(`${BASE}/api/v9/workspaces/${wsId}/clients?active=both`, { headers: { Authorization: auth() } }),
    ]);
    const projects: { id: number; name: string }[] = projRes.ok ? await projRes.json() : [];
    const clients: { id: number; name: string }[] = clientsRes.ok ? await clientsRes.json() : [];

    if (action === 'sync') {
      const weeks = getWeeks();
      const current = weeks[weeks.length - 1]; // w0 = this week
      const sumRes = await fetch(
        `${BASE}/reports/api/v3/workspace/${wsId}/summary/time_entries`,
        {
          method: 'POST',
          headers: { Authorization: auth(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ start_date: current.start, end_date: current.end, group_by: 'projects' }),
        }
      );
      const sum = sumRes.ok ? await sumRes.json() : {};
      return NextResponse.json({
        email: me.email,
        workspaceId: wsId,
        projects: projects.map(p => ({ id: p.id, name: p.name })),
        clients: clients.map(c => ({ id: c.id, name: c.name })),
        weekGroups: (sum.groups || []).map((g: { id: number; seconds: number }) => ({
          projectId: g.id,
          seconds: g.seconds || 0,
        })),
      });
    }

    if (action === 'weekly') {
      const firstName = req.nextUrl.searchParams.get('firstName') || '';
      const company = req.nextUrl.searchParams.get('company') || '';
      const weeks = getWeeks();

      const results = await Promise.all(
        weeks.map(async (w) => {
          const res = await fetch(
            `${BASE}/reports/api/v3/workspace/${wsId}/summary/time_entries`,
            {
              method: 'POST',
              headers: { Authorization: auth(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ start_date: w.start, end_date: w.end, group_by: 'projects' }),
            }
          );
          if (!res.ok) return { key: w.key, hours: 0 };
          const data = await res.json();
          let hours = 0;
          (data.groups || []).forEach((g: { id: number; seconds: number }) => {
            const proj = projects.find(p => p.id === g.id);
            if (proj && matchesContact(proj.name, firstName, company)) {
              hours += (g.seconds || 0) / 3600;
            }
          });
          return { key: w.key, hours };
        })
      );

      const hoursByWeek: Record<string, number> = {};
      results.forEach(r => { hoursByWeek[r.key] = r.hours; });
      return NextResponse.json({ hoursByWeek });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!TOKEN) return NextResponse.json({ error: 'TOGGL_API_TOKEN not configured' }, { status: 500 });

  const { name } = await req.json() as { name: string };
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  try {
    const meRes = await fetch(`${BASE}/api/v9/me`, {
      headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    });
    if (!meRes.ok) throw new Error('Toggl auth failed');
    const me = await meRes.json();
    const wsId: number = me.default_workspace_id;

    // Check if client already exists
    const clientsRes = await fetch(
      `${BASE}/api/v9/workspaces/${wsId}/clients?active=both`,
      { headers: { Authorization: auth() } }
    );
    const existingClients: { id: number; name: string }[] = clientsRes.ok ? await clientsRes.json() : [];
    let client = existingClients.find(c => c.name.toLowerCase() === name.toLowerCase());
    let clientExisted = !!client;

    if (!client) {
      const clientRes = await fetch(`${BASE}/api/v9/workspaces/${wsId}/clients`, {
        method: 'POST',
        headers: { Authorization: auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (clientRes.ok) {
        client = await clientRes.json() as { id: number; name: string };
      }
    }

    // Check if project already exists
    const projRes = await fetch(
      `${BASE}/api/v9/workspaces/${wsId}/projects?active=both&per_page=200`,
      { headers: { Authorization: auth() } }
    );
    const existing: { id: number; name: string }[] = projRes.ok ? await projRes.json() : [];
    const duplicate = existing.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      return NextResponse.json({ project: duplicate, client, existed: true, clientExisted });
    }

    const res = await fetch(`${BASE}/api/v9/workspaces/${wsId}/projects`, {
      method: 'POST',
      headers: { Authorization: auth(), 'Content-Type': 'application/json' },
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
