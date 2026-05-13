import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getActiveClients } from '@/lib/supabase/clients';

const PRICELABS_API = 'https://api.pricelabs.co/v1';

async function getClientApiKey(clientName?: string | null) {
  const clients = await getActiveClients();
  const client = clientName
    ? clients.find(c => c.client_name.toLowerCase().includes(clientName.toLowerCase()))
    : clients.find(c => c.api_key);
  if (!client) return { error: 'Client not found', status: 404 };
  if (!client.api_key) return { error: `No API key configured for ${client.client_name}`, status: 400 };
  return { client, apiKey: client.api_key };
}

// Try multiple endpoint formats for listing_prices since PriceLabs docs vary
async function fetchListingPrices(apiKey: string, listingId: string, pms: string) {
  const attempts: { url: string; method: string; body?: string }[] = [
    // Customer API — GET with query params
    { url: `${PRICELABS_API}/listing_prices?listing_id=${listingId}&pms=${pms}`, method: 'GET' },
    // Customer API — POST with JSON body
    { url: `${PRICELABS_API}/listing_prices`, method: 'POST', body: JSON.stringify({ listing_id: listingId, pms }) },
    // Alternate path format
    { url: `${PRICELABS_API}/listing_prices/${listingId}?pms=${pms}`, method: 'GET' },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers: {
          'X-API-Key': apiKey,
          ...(attempt.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(attempt.body ? { body: attempt.body } : {}),
      });

      const raw = await res.text();
      if (res.ok && raw) {
        try {
          const data = JSON.parse(raw);
          // Success — return the parsed data
          const listing = Array.isArray(data)
            ? data.find(l => String(l.id) === String(listingId)) || data[0] || null
            : data?.data ? data : null;
          if (listing) return { listing, attempt: `${attempt.method} ${attempt.url}` };
        } catch {}
      }
      errors.push(`${attempt.method} ${attempt.url} → ${res.status}: ${raw.slice(0, 200)}`);
    } catch (e: any) {
      errors.push(`${attempt.method} ${attempt.url} → ${e.message}`);
    }
  }

  return { listing: null, errors };
}

// GET — fetch listing prices (overrides + pricing breakdown)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listingIdsParam = req.nextUrl.searchParams.get('listingIds')
    || req.nextUrl.searchParams.get('listingId');
  const pms = req.nextUrl.searchParams.get('pms') || 'guesty';
  const clientName = req.nextUrl.searchParams.get('client');

  if (!listingIdsParam) {
    return NextResponse.json({ error: 'listingIds is required' }, { status: 400 });
  }

  const listingIds = listingIdsParam.split(',').map(s => s.trim()).filter(Boolean);
  const firstId = listingIds[0];

  const result = await getClientApiKey(clientName);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Fetch overrides (this endpoint works) + attempt listing prices
  const [overridesRes, pricesResult] = await Promise.all([
    fetch(`${PRICELABS_API}/listings/${firstId}/overrides?pms=${pms}`, {
      headers: { 'X-API-Key': result.apiKey },
    }).then(r => r.json()).catch(() => ({})),
    fetchListingPrices(result.apiKey, firstId, pms),
  ]);

  return NextResponse.json({
    overrides: overridesRes.overrides || [],
    listing: pricesResult.listing,
    listingCount: 1,
    ...(pricesResult.errors ? { pricesDebug: pricesResult.errors } : {}),
    ...(pricesResult.attempt ? { pricesSource: pricesResult.attempt } : {}),
  });
}
