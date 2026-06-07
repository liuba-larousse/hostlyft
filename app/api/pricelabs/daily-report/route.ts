import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients } from '@/lib/supabase/clients';
import { fetchReservations, type ParsedReservation } from '@/lib/pricelabs/reservations';
import { upsertReservations } from '@/lib/supabase/reservations';

// Fetching reservations across every listing for every client can take a while.
export const maxDuration = 300;

// Cap concurrent PriceLabs API calls per client to stay polite to their API.
const CONCURRENCY = 5;

interface ClientResult {
  clientId: string;
  clientName: string;
  status: 'ok' | 'error';
  bookingsFound: number;
  listings: number;
  error?: string;
  debug?: string[];
}

interface ListingRef {
  listing_id: string;
  pms: string | null;
  listing_name: string | null;
}

/** Run an async mapper over items with bounded concurrency. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET(req: NextRequest) {
  // Allow Vercel Cron (Bearer secret) OR logged-in dashboard users
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = secret && authHeader === `Bearer ${secret}`;

  if (!isCron) {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let clients;
  try {
    clients = await getActiveClients();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  if (!clients.length) {
    return NextResponse.json({ message: 'No active clients found', results: [] });
  }

  const supabase = createSupabaseAdmin();
  const results: ClientResult[] = [];

  for (const client of clients) {
    if (!client.api_key) {
      results.push({
        clientId: client.id,
        clientName: client.client_name,
        status: 'error',
        bookingsFound: 0,
        listings: 0,
        error: 'No API key configured for this client',
      });
      continue;
    }

    try {
      // Listings to pull reservations for come from the synced listing_groups table.
      const { data: listings, error: listingErr } = await supabase
        .from('listing_groups')
        .select('listing_id, pms, listing_name')
        .eq('client_id', client.id);

      if (listingErr) throw new Error(`Failed to load listings: ${listingErr.message}`);

      const listingRefs = (listings ?? []) as ListingRef[];
      if (!listingRefs.length) {
        results.push({
          clientId: client.id,
          clientName: client.client_name,
          status: 'error',
          bookingsFound: 0,
          listings: 0,
          error: 'No listings synced for this client — sync listings first.',
        });
        continue;
      }

      const debug: string[] = [];
      const perListing = await mapPool(listingRefs, CONCURRENCY, async (l) => {
        const res = await fetchReservations(client.api_key!, l.listing_id, l.pms || 'guesty');
        if (res.errors?.length && res.reservations.length === 0) {
          debug.push(`listing ${l.listing_id}: ${res.errors[res.errors.length - 1]}`);
        }
        return res.reservations.map(r => ({
          ...r,
          listingName: r.listingName || l.listing_name || '',
        }));
      });

      const all: ParsedReservation[] = perListing.flat();
      const saved = await upsertReservations(client.id, all);

      results.push({
        clientId: client.id,
        clientName: client.client_name,
        status: 'ok',
        bookingsFound: saved,
        listings: listingRefs.length,
        ...(debug.length ? { debug: debug.slice(0, 10) } : {}),
      });
    } catch (err) {
      results.push({
        clientId: client.id,
        clientName: client.client_name,
        status: 'error',
        bookingsFound: 0,
        listings: 0,
        error: String(err),
      });
    }
  }

  const allOk = results.every(r => r.status === 'ok');
  return NextResponse.json({ success: allOk, results }, { status: allOk ? 200 : 207 });
}
