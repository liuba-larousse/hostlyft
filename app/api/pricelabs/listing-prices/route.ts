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
// ?listingIds=123,456,789&pms=guesty&client=Marcus
// Also accepts legacy ?listingId=123 for single listing
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

  const result = await getClientApiKey(clientName);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Fetch overrides for first listing + prices for all listings in parallel
  const firstId = listingIds[0];
  const fetches: Promise<Response>[] = [
    fetch(`${PRICELABS_API}/listings/${firstId}/overrides?pms=${pms}`, {
      headers: { 'X-API-Key': result.apiKey },
    }),
  ];

  // Fetch pricing for each listing (PriceLabs listing_prices takes one listing_id)
  for (const id of listingIds) {
    fetches.push(
      fetch(`${PRICELABS_API}/listing_prices?listing_id=${id}&pms=${pms}`, {
        headers: { 'X-API-Key': result.apiKey },
      })
    );
  }

  const responses = await Promise.all(fetches);
  const overridesData = await responses[0].json().catch(() => ({}));

  // Parse all listing price responses
  const allListings: any[] = [];
  for (let i = 1; i < responses.length; i++) {
    const data = await responses[i].json().catch(() => ([]));
    const listing = Array.isArray(data)
      ? data.find(l => String(l.id) === String(listingIds[i - 1])) || data[0] || null
      : data;
    if (listing) allListings.push(listing);
  }

  // If multiple listings, compute averaged daily data
  let averaged: any = null;
  if (allListings.length > 1) {
    // Group daily data by date across all listings
    const dateMap: Record<string, any[]> = {};
    for (const listing of allListings) {
      if (!listing.data) continue;
      for (const day of listing.data) {
        if (!dateMap[day.date]) dateMap[day.date] = [];
        dateMap[day.date].push(day);
      }
    }

    const avgDays = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, days]) => {
        const n = days.length;
        const avg = (key: string) => {
          const vals = days.map(d => d[key]).filter(v => v != null && v !== -1 && v !== '');
          if (vals.length === 0) return null;
          return Math.round(vals.reduce((s, v) => s + Number(v), 0) / vals.length);
        };
        // Pick first non-null for text fields
        const first = (key: string) => days.find(d => d[key] != null && d[key] !== '' && d[key] !== -1)?.[key] ?? null;

        return {
          date,
          price: avg('price'),
          user_price: avg('user_price'),
          uncustomized_price: avg('uncustomized_price'),
          min_stay: avg('min_stay'),
          booking_status: first('booking_status'),
          booking_status_STLY: first('booking_status_STLY'),
          ADR: avg('ADR'),
          ADR_STLY: avg('ADR_STLY'),
          demand_color: first('demand_color'),
          demand_desc: first('demand_desc'),
          reason: days.find(d => d.reason)?.reason || null,
          market_factors: days.find(d => d.market_factors)?.market_factors || null,
          pricing_customizations: days.find(d => d.pricing_customizations)?.pricing_customizations || null,
          thresholds: days.find(d => d.thresholds)?.thresholds || null,
          _count: n,
        };
      });

    // Build averaged listing-level info
    const listingInfos = allListings
      .flatMap(l => l.data || [])
      .map(d => d.reason?.listing_info)
      .filter(Boolean);
    const avgInfo = listingInfos.length > 0 ? {
      base_price: Math.round(listingInfos.reduce((s, i) => s + Number(i.base_price || 0), 0) / listingInfos.length),
      minimum_price: Math.round(listingInfos.reduce((s, i) => s + Number(i.minimum_price || 0), 0) / listingInfos.length),
      maximum_price: Math.round(listingInfos.reduce((s, i) => s + Number(i.maximum_price || 0), 0) / listingInfos.length),
      occupancy: listingInfos.reduce((s, i) => s + Number(i.occupancy || 0), 0) / listingInfos.length,
      nhood_occ: listingInfos.find(i => i.nhood_occ)?.nhood_occ || null,
      ADR_STLY: (() => { const vals = listingInfos.filter(i => i.ADR_STLY != null && i.ADR_STLY !== -1); return vals.length ? Math.round(vals.reduce((s, i) => s + Number(i.ADR_STLY), 0) / vals.length) : -1; })(),
      base_price_type: 'Avg',
    } : null;

    averaged = {
      id: `${allListings.length} listings (avg)`,
      pms: allListings[0].pms,
      currency: allListings[0].currency,
      los_pricing: allListings[0].los_pricing,
      last_refreshed_at: allListings[0].last_refreshed_at,
      data: avgDays,
      _averaged_listing_info: avgInfo,
      _listing_count: allListings.length,
    };
  }

  return NextResponse.json({
    overrides: overridesData.overrides || [],
    listing: averaged || allListings[0] || null,
    listings: allListings,
    listingCount: allListings.length,
  });
}
