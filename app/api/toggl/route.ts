import { NextRequest, NextResponse } from 'next/server';

const TOKEN = process.env.TOGGL_API_TOKEN;
const BASE = 'https://api.track.toggl.com';

function auth() {
  return 'Basic ' + Buffer.from(`${TOKEN}:api_token`).toString('base64');
}

function isoDate(d: Date) { return d.toISOString().split('T')[0]; }

function getDateRange(range: string): { start: string; end: string } {
  const now = new Date();
  switch (range) {
    case 'last_week': {
      const end = new Date(now);
      end.setDate(now.getDate() - now.getDay()); // last Sunday
      const start = new Date(end);
      start.setDate(end.getDate() - 6); // last Monday
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
    default: { // this_week
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay() + 1); // Monday
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

export async function GET(req: NextRequest) {
  if (!TOKEN) return NextResponse.json({ error: 'TOGGL_API_TOKEN not configured' }, { status: 500 });

  const action = req.nextUrl.searchParams.get('action') || 'sync';
  const range = req.nextUrl.searchParams.get('range') || 'this_week';

  try {
    const meRes = await fetch(`${BASE}/api/v9/me`, {
      headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    });
    if (!meRes.ok) throw new Error('Toggl auth failed');
    const me = await meRes.json();
    const wsId: number = me.default_workspace_id;

    const [projRes, clientsRes] = await Promise.all([
      fetch(`${BASE}/api/v9/workspaces/${wsId}/projects?active=both&per_page=200`, { headers: { Authorization: auth() } }),
      fetch(`${BASE}/api/v9/workspaces/${wsId}/clients?status=both`, { headers: { Authorization: auth() } }),
    ]);
    const projects: { id: number; name: string; client_id?: number | null }[] = projRes.ok ? await projRes.json() : [];
    const clients: { id: number; name: string }[] = clientsRes.ok ? await clientsRes.json() : [];

    // Fetch time entries for a date range and aggregate seconds by project_id
    async function fetchSecondsByProject(start: string, end: string): Promise<Record<number, number>> {
      const res = await fetch(
        `${BASE}/api/v9/me/time_entries?start_date=${start}T00:00:00Z&end_date=${end}T23:59:59Z`,
        { headers: { Authorization: auth() } }
      );
      if (!res.ok) return {};
      const entries: { project_id: number | null; duration: number }[] = await res.json();
      const map: Record<number, number> = {};
      for (const e of entries) {
        if (!e.project_id || e.duration < 0) continue; // skip running entries
        map[e.project_id] = (map[e.project_id] || 0) + e.duration;
      }
      return map;
    }

    if (action === 'sync') {
      const { start, end } = getDateRange(range);
      const secByProject = await fetchSecondsByProject(start, end);

      // Derive client totals from project totals using project→client mapping
      const secByClient: Record<number, number> = {};
      for (const p of projects) {
        if (p.client_id && secByProject[p.id]) {
          secByClient[p.client_id] = (secByClient[p.client_id] || 0) + secByProject[p.id];
        }
      }

      return NextResponse.json({
        email: me.email,
        workspaceId: wsId,
        range,
        projects: projects.map(p => ({ id: p.id, name: p.name, clientId: p.client_id ?? null })),
        clients: clients.map(c => ({ id: c.id, name: c.name })),
        clientGroups: Object.entries(secByClient).map(([clientId, seconds]) => ({
          clientId: Number(clientId),
          seconds,
        })),
        weekGroups: Object.entries(secByProject).map(([projectId, seconds]) => ({
          projectId: Number(projectId),
          seconds,
        })),
      });
    }

    if (action === 'debug') {
      const { start, end } = getDateRange(range);
      const secByProject = await fetchSecondsByProject(start, end);

      const secByClient: Record<number, number> = {};
      for (const p of projects) {
        if (p.client_id && secByProject[p.id]) {
          secByClient[p.client_id] = (secByClient[p.client_id] || 0) + secByProject[p.id];
        }
      }

      return NextResponse.json({
        range, start, end,
        projectsWithClientId: projects.filter(p => p.client_id).map(p => ({
          id: p.id, name: p.name, clientId: p.client_id,
          hours: (secByProject[p.id] || 0) / 3600,
        })),
        projectsWithoutClientId: projects.filter(p => !p.client_id).map(p => ({
          id: p.id, name: p.name,
          hours: (secByProject[p.id] || 0) / 3600,
        })),
        clients: clients.map(c => ({
          id: c.id, name: c.name,
          hours: (secByClient[c.id] || 0) / 3600,
        })),
      });
    }

    if (action === 'weekly') {
      const firstName = req.nextUrl.searchParams.get('firstName') || '';
      const company = req.nextUrl.searchParams.get('company') || '';
      const clientId = req.nextUrl.searchParams.get('clientId');
      const weeks = getWeeks();

      const results = await Promise.all(
        weeks.map(async (w) => {
          const secByProject = await fetchSecondsByProject(w.start, w.end);
          let hours = 0;

          if (clientId) {
            const cid = parseInt(clientId);
            projects
              .filter(p => p.client_id === cid)
              .forEach(p => { hours += (secByProject[p.id] || 0) / 3600; });
          } else {
            for (const [projId, secs] of Object.entries(secByProject)) {
              const proj = projects.find(p => p.id === Number(projId));
              if (proj && matchesContact(proj.name, firstName, company)) {
                hours += secs / 3600;
              }
            }
          }

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
      `${BASE}/api/v9/workspaces/${wsId}/clients?status=both`,
      { headers: { Authorization: auth() } }
    );
    const existingClients: { id: number; name: string }[] = clientsRes.ok ? await clientsRes.json() : [];
    let client = existingClients.find(c => c.name.toLowerCase() === name.toLowerCase());
    const clientExisted = !!client;

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
