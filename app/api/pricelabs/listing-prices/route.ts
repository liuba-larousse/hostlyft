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

// GET — fetch listing prices (overrides + pricing breakdown)
// ?listingIds=123,456&pms=guesty&client=Marcus
// Fetches overrides for the first listing and pricing for first listing only
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

  // Fetch overrides + pricing for first listing in parallel
  let overridesData: any = {};
  let listingPrices: any = null;
  let pricesError: string | null = null;

  try {
    const [overridesRes, pricesRes] = await Promise.all([
      fetch(`${PRICELABS_API}/listings/${firstId}/overrides?pms=${pms}`, {
        headers: { 'X-API-Key': result.apiKey },
      }),
      fetch(`${PRICELABS_API}/listing_prices?listing_id=${firstId}&pms=${pms}`, {
        headers: { 'X-API-Key': result.apiKey },
      }),
    ]);

    overridesData = await overridesRes.json().catch(() => ({}));
    if (!overridesRes.ok) {
      console.warn('Overrides fetch failed:', overridesRes.status, overridesData);
    }

    const pricesRaw = await pricesRes.json().catch(() => null);
    if (!pricesRes.ok) {
      pricesError = `PriceLabs listing_prices returned ${pricesRes.status}`;
      console.warn('Listing prices fetch failed:', pricesRes.status, pricesRaw);
    } else if (pricesRaw) {
      // pricesRaw is an array of listings
      listingPrices = Array.isArray(pricesRaw)
        ? pricesRaw.find(l => String(l.id) === String(firstId)) || pricesRaw[0] || null
        : pricesRaw;
    }
  } catch (e: any) {
    pricesError = `Fetch failed: ${e.message}`;
    console.error('Listing prices error:', e);
  }

  return NextResponse.json({
    overrides: overridesData.overrides || [],
    listing: listingPrices,
    listingCount: 1,
    ...(pricesError ? { pricesError } : {}),
  });
}
