import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getActiveClients } from '@/lib/supabase/clients';

const PRICELABS_API = 'https://api.pricelabs.co/v1';

/** Find client and return their API key, or error response */
async function getClientApiKey(clientName?: string | null) {
  const clients = await getActiveClients();

  // If clientName provided, find that specific client; otherwise find any with an API key
  const client = clientName
    ? clients.find(c => c.client_name.toLowerCase().includes(clientName.toLowerCase()))
    : clients.find(c => c.api_key);

  if (!client) return { error: 'Client not found', status: 404 };
  if (!client.api_key) return { error: `No API key configured for ${client.client_name}`, status: 400 };

  return { client, apiKey: client.api_key };
}

// GET — fetch overrides for a listing
// ?listingId=2854562&pms=airbnb&client=Marcus
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listingId = req.nextUrl.searchParams.get('listingId');
  const pms = req.nextUrl.searchParams.get('pms') || 'airbnb';
  const clientName = req.nextUrl.searchParams.get('client');

  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  const result = await getClientApiKey(clientName);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = await fetch(`${PRICELABS_API}/listings/${listingId}/overrides?pms=${pms}`, {
    headers: { 'X-API-Key': result.apiKey },
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.message || `PriceLabs API ${res.status}`, data }, { status: res.status });
  }

  return NextResponse.json(data);
}

// POST — create/update overrides for a listing
// Body: { listingId, pms, client?, overrides: [{ date, price, price_type, currency?, min_stay?, min_price?, min_price_type?, base_price? }] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { listingId, pms = 'airbnb', client: clientName, overrides } = body;

  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }
  if (!overrides || !Array.isArray(overrides) || overrides.length === 0) {
    return NextResponse.json({ error: 'overrides array is required' }, { status: 400 });
  }

  const result = await getClientApiKey(clientName);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = await fetch(`${PRICELABS_API}/listings/${listingId}/overrides`, {
    method: 'POST',
    headers: {
      'X-API-Key': result.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pms, overrides }),
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.message || `PriceLabs API ${res.status}`, data }, { status: res.status });
  }

  return NextResponse.json(data);
}

// DELETE — remove overrides for specific dates
// Body: { listingId, pms, client?, overrides: [{ date }] }
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { listingId, pms = 'airbnb', client: clientName, overrides } = body;

  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }
  if (!overrides || !Array.isArray(overrides) || overrides.length === 0) {
    return NextResponse.json({ error: 'overrides array with dates is required' }, { status: 400 });
  }

  const result = await getClientApiKey(clientName);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = await fetch(`${PRICELABS_API}/listings/${listingId}/overrides`, {
    method: 'DELETE',
    headers: {
      'X-API-Key': result.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pms, overrides }),
  });

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return NextResponse.json({ ok: true });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.message || `PriceLabs API ${res.status}`, data }, { status: res.status });
  }

  return NextResponse.json(data);
}
