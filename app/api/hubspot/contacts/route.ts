import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const BASE = 'https://api.hubapi.com/crm/v3/objects/contacts';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ names: [] });

  const names: string[] = [];
  let after: string | undefined;

  do {
    const params = new URLSearchParams({ properties: 'firstname,lastname,lifecyclestage', limit: '100', ...(after ? { after } : {}) });
    const res = await fetch(`${BASE}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    for (const c of data.results ?? []) {
      const p = c.properties as Record<string, string>;
      if (p.lifecyclestage !== 'customer') continue;
      const name = [p.firstname, p.lastname].filter(Boolean).join(' ');
      if (name) names.push(name);
    }
    after = data.paging?.next?.after;
  } while (after);

  names.sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ names });
}

export async function POST(req: NextRequest) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }, { status: 500 });

  const body = await req.json() as {
    firstName: string;
    lastName: string;
    email: string;
    company: string;
  };

  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        firstname: body.firstName,
        lastname: body.lastName,
        email: body.email,
        company: body.company,
        lifecyclestage: 'customer',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(err, { status: res.status });
  }

  const contact = await res.json();
  return NextResponse.json({ contact });
}
