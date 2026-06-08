import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients, type PriceLabsClient } from '@/lib/supabase/clients';
import {
  dominantPms,
  fetchListings,
  fetchReservations,
  parseMoney,
  parsePercent,
  type ApiReservation,
} from './api';
import { computeMonthlyPerformance } from './monthly';

export interface ClientSyncResult {
  clientId: string;
  clientName: string;
  status: 'synced' | 'skipped' | 'error';
  pms?: string;
  reservations?: number; // booked rows upserted
  listings?: number;
  months?: number;
  occupancy30?: number;
  marketOccupancy30?: number;
  reason?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function toBookingRow(r: ApiReservation, clientId: string, fallbackDate: string) {
  const booked = (r.booked_date ?? '').slice(0, 10);
  const checkin = (r.check_in ?? '').slice(0, 10);
  const los = r.no_of_days ?? 0;
  const rental = parseMoney(r.rental_revenue);
  const total = parseMoney(r.total_cost);

  return {
    client_id: clientId,
    // report_date keyed to the booking itself so re-syncs are idempotent
    // (one row per reservation), not per sync-day.
    report_date: booked || fallbackDate,
    reservation_id: r.reservation_id,
    listing_name: r.listing_name ?? null,
    checkin_date: checkin || null,
    checkout_date: (r.check_out ?? '').slice(0, 10) || null,
    booked_date: booked || null,
    adr: los > 0 ? rental / los : 0,
    rental_revenue: rental,
    total_revenue: total,
    los,
    booking_window: booked && checkin ? Math.max(0, daysBetween(booked, checkin)) : null,
    booking_source: r.booking_channel ?? null,
    currency: r.currency ?? 'USD',
  };
}

interface SyncWindow {
  start: string;
  end: string;
}

function defaultWindow(): SyncWindow {
  // reservation_data filters by STAY date. A year back gives monthly performance
  // history; a year forward captures upcoming stays / recent forward bookings.
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 365);
  const end = new Date(today);
  end.setDate(end.getDate() + 365);
  return { start: isoDate(start), end: isoDate(end) };
}

export async function syncClientFromApi(
  client: PriceLabsClient,
  window: SyncWindow = defaultWindow()
): Promise<ClientSyncResult> {
  if (!client.api_key) {
    return {
      clientId: client.id,
      clientName: client.client_name,
      status: 'skipped',
      reason: 'no API key configured',
    };
  }

  try {
    const supabase = createSupabaseAdmin();
    const reportDate = isoDate(new Date());

    const listings = await fetchListings(client.api_key);
    const pms = dominantPms(listings) ?? 'guesty';

    // Occupancy snapshot — average forward occupancy across listings.
    const occ = listings.map((l) => parsePercent(l.occupancy_next_30)).filter((n) => n > 0);
    const mkt = listings.map((l) => parsePercent(l.market_occupancy_next_30)).filter((n) => n > 0);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0);

    const reservations = await fetchReservations(client.api_key, pms, window.start, window.end);
    const mapped = reservations
      .filter((r) => r.booking_status === 'booked')
      .map((r) => toBookingRow(r, client.id, reportDate));

    // Dedup on the table's conflict key — a feed that repeats a reservation on
    // the same booked_date would otherwise trigger Postgres "ON CONFLICT cannot
    // affect row a second time" and abort the whole upsert.
    const byKey = new Map<string, (typeof mapped)[number]>();
    for (const row of mapped) byKey.set(`${row.reservation_id}|${row.report_date}`, row);
    const rows = [...byKey.values()];

    // Never wipe a client on an empty result — an API hiccup that returns 200
    // with no rows must not delete historical data. Skip instead.
    if (rows.length === 0) {
      return {
        clientId: client.id,
        clientName: client.client_name,
        status: 'skipped',
        pms,
        listings: listings.length,
        reason: 'no booked reservations returned — existing data left intact',
      };
    }

    // Full-refresh: delete then insert. Not transactional (supabase-js has no
    // multi-statement tx); a mid-insert failure is self-healed by the next run,
    // and we only reach the delete once a non-empty set is in hand.
    const { error: delError } = await supabase
      .from('booking_reports')
      .delete()
      .eq('client_id', client.id);
    if (delError) throw new Error(delError.message);

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from('booking_reports')
        .upsert(chunk, { onConflict: 'client_id,reservation_id,report_date' });
      if (error) throw new Error(error.message);
    }

    // Monthly performance computed from the same reservations (by stay date),
    // written in the shape the portfolio provider reads — replaces the scraped
    // PriceLabs report. Occupancy uses current listing count as capacity proxy.
    const monthlyRows = computeMonthlyPerformance(reservations, listings.length);
    const { error: pErr } = await supabase.from('portfolio_reports').upsert(
      {
        client_id: client.id,
        report_date: reportDate,
        segment: 'all',
        report_data: {
          source: 'customer-api',
          uploadedAt: reportDate,
          segment: 'all',
          rawRows: monthlyRows,
          rowCount: monthlyRows.length,
        },
      },
      { onConflict: 'client_id,report_date,segment' }
    );
    if (pErr) throw new Error(pErr.message);

    return {
      clientId: client.id,
      clientName: client.client_name,
      status: 'synced',
      pms,
      reservations: rows.length,
      listings: listings.length,
      months: monthlyRows.length,
      occupancy30: Math.round(avg(occ) * 10) / 10,
      marketOccupancy30: Math.round(avg(mkt) * 10) / 10,
    };
  } catch (e) {
    return {
      clientId: client.id,
      clientName: client.client_name,
      status: 'error',
      reason: String(e),
    };
  }
}

export async function syncAllFromApi(window?: SyncWindow): Promise<ClientSyncResult[]> {
  const clients = await getActiveClients();
  const results: ClientSyncResult[] = [];
  for (const client of clients) {
    results.push(await syncClientFromApi(client, window));
  }
  return results;
}
