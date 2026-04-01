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
      fetch(`${BASE}/api/v9/workspaces/${wsId}/clients?active=both`, { headers: { Authorization: auth() } }),
    ]);
    const projects: { id: number; name: string; client_id?: number | null }[] = projRes.ok ? await projRes.json() : [];
    const clients: { id: number; name: string }[] = clientsRes.ok ? await clientsRes.json() : [];

    if (action === 'sync') {
      const { start, end } = getDateRange(range);
      const reportBase = `${BASE}/reports/api/v2/summary?workspace_id=${wsId}&user_agent=hostlyft&since=${start}&until=${end}`;

      // Fetch summary grouped by both clients and projects in parallel (v2 API)
      const [clientSumRes, projSumRes] = await Promise.all([
        fetch(`${reportBase}&grouping=clients`, { headers: { Authorization: auth() } }),
        fetch(`${reportBase}&grouping=projects`, { headers: { Authorization: auth() } }),
      ]);

      const clientSum = clientSumRes.ok ? await clientSumRes.json() : {};
      const projSum = projSumRes.ok ? await projSumRes.json() : {};

      return NextResponse.json({
        email: me.email,
        workspaceId: wsId,
        range,
        projects: projects.map(p => ({ id: p.id, name: p.name, clientId: p.client_id ?? null })),
        clients: clients.map(c => ({ id: c.id, name: c.name })),
        // Hours grouped by Toggl client id — v2 uses `data` array, time in milliseconds
        clientGroups: (clientSum.data || []).map((g: { id: number; time: number }) => ({
          clientId: g.id,
          seconds: Math.round((g.time || 0) / 1000),
        })),
        // Hours grouped by project — v2 uses `data` array, time in milliseconds
        weekGroups: (projSum.data || []).map((g: { id: number; time: number }) => ({
          projectId: g.id,
          seconds: Math.round((g.time || 0) / 1000),
        })),
      });
    }

    if (action === 'debug') {
      const { start, end } = getDateRange(range);
      const reportBase = `${BASE}/reports/api/v2/summary?workspace_id=${wsId}&user_agent=hostlyft&since=${start}&until=${end}`;
      const [projSumRes, clientSumRes] = await Promise.all([
        fetch(`${reportBase}&grouping=projects`, { headers: { Authorization: auth() } }),
        fetch(`${reportBase}&grouping=clients`, { headers: { Authorization: auth() } }),
      ]);
      const projSum = projSumRes.ok ? await projSumRes.json() : {};
      const clientSum = clientSumRes.ok ? await clientSumRes.json() : {};
      return NextResponse.json({
        range, start, end,
        projectsWithClientId: projects.filter(p => p.client_id).map(p => ({ id: p.id, name: p.name, clientId: p.client_id })),
        projectsWithoutClientId: projects.filter(p => !p.client_id).map(p => ({ id: p.id, name: p.name })),
        clients: clients.map(c => ({ id: c.id, name: c.name })),
        rawProjectSumFirst3: (projSum.data || []).slice(0, 3),
        rawClientSumFirst3: (clientSum.data || []).slice(0, 3),
      });
    }

    if (action === 'weekly') {
      const firstName = req.nextUrl.searchParams.get('firstName') || '';
      const company = req.nextUrl.searchParams.get('company') || '';
      const clientId = req.nextUrl.searchParams.get('clientId');
      const weeks = getWeeks();

      const results = await Promise.all(
        weeks.map(async (w) => {
          const grouping = clientId ? 'clients' : 'projects';
          const url = `${BASE}/reports/api/v2/summary?workspace_id=${wsId}&user_agent=hostlyft&since=${w.start}&until=${w.end}&grouping=${grouping}`;
          const res = await fetch(url, { headers: { Authorization: auth() } });
          if (!res.ok) return { key: w.key, hours: 0 };
          const data = await res.json();
          let hours = 0;

          if (clientId) {
            // Find the specific client entry and sum its time
            (data.data || []).forEach((g: { id: number; time: number }) => {
              if (g.id === parseInt(clientId)) {
                hours += (g.time || 0) / 3600000;
              }
            });
          } else {
            (data.data || []).forEach((g: { id: number; time: number }) => {
              const proj = projects.find(p => p.id === g.id);
              if (proj && matchesContact(proj.name, firstName, company)) {
                hours += (g.time || 0) / 3600000;
              }
            });
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
      `${BASE}/api/v9/workspaces/${wsId}/clients?active=both`,
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
