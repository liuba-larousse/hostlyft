import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://api.hubapi.com/crm/v3/objects/contacts';

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
