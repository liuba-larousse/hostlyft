import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients, type PriceLabsClient } from '@/lib/supabase/clients';
import {
  dominantPms,
  fetchListings,
  fetchReservations,
  parseMoney,
  type ApiReservation,
} from './api';
import { computeMonthly, computePerListingYear, type Stay } from './monthly';

export interface ClientSyncResult {
  clientId: string;
  clientName: string;
  status: 'synced' | 'skipped' | 'error';
  mode?: 'backfill' | 'incremental';
  pms?: string;
  reservations?: number; // booked rows stored/refreshed this run
  listings?: number;
  months?: number;
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
    // report_date keyed to the booking itself so re-syncs are idempotent.
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

/**
 * Forward window: stays from the start of the current month onward. Elapsed past
 * months never change, so we don't re-pull them — only current + future stays
 * (where new bookings and cancellations happen) are refreshed each sync.
 */
function forwardWindow(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 365);
  return { start: isoDate(start), end: isoDate(end) };
}

/** First import: grab all available history (3 years back) + a year forward. */
function backfillWindow(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today);
  start.setUTCFullYear(start.getUTCFullYear() - 3);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 365);
  return { start: isoDate(start), end: isoDate(end) };
}

interface StayRowDB {
  checkin_date: string | null;
  checkout_date: string | null;
  rental_revenue: number | null;
  listing_name: string | null;
}

/** All booking_reports stays for a client (past retained + forward refreshed). */
async function loadStays(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  clientId: string
): Promise<Stay[]> {
  const PAGE = 1000;
  const stays: Stay[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('booking_reports')
      .select('checkin_date, checkout_date, rental_revenue, listing_name')
      .eq('client_id', clientId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as StayRowDB[];
    for (const r of batch) {
      if (!r.checkin_date || !r.checkout_date) continue;
      stays.push({
        checkIn: r.checkin_date,
        checkOut: r.checkout_date,
        rentalRevenue: r.rental_revenue ?? 0,
        listing: r.listing_name ?? 'Unknown',
      });
    }
    if (batch.length < PAGE) break;
  }
  return stays;
}

export async function syncClientFromApi(client: PriceLabsClient): Promise<ClientSyncResult> {
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

    // First import → full backfill of all history. Afterwards → forward-only
    // (past stays don't change; only current + future need refreshing).
    const { count } = await supabase
      .from('booking_reports')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id);
    const firstImport = (count ?? 0) === 0;
    const window = firstImport ? backfillWindow() : forwardWindow();

    const reservations = await fetchReservations(client.api_key, pms, window.start, window.end);
    const mapped = reservations
      .filter((r) => r.booking_status === 'booked')
      .map((r) => toBookingRow(r, client.id, reportDate));

    const byKey = new Map<string, (typeof mapped)[number]>();
    for (const row of mapped) byKey.set(`${row.reservation_id}|${row.report_date}`, row);
    const rows = [...byKey.values()];

    // Don't touch data on an empty pull (API hiccup) — leave existing intact.
    if (rows.length === 0) {
      return {
        clientId: client.id,
        clientName: client.client_name,
        status: 'skipped',
        mode: firstImport ? 'backfill' : 'incremental',
        pms,
        listings: listings.length,
        reason: 'no booked reservations returned — existing data left intact',
      };
    }

    // Backfill replaces everything; incremental refreshes only the forward
    // slice (drop current+future, re-insert current booked so cancellations
    // fall out) while keeping all past rows.
    let del = supabase.from('booking_reports').delete().eq('client_id', client.id);
    if (!firstImport) del = del.gte('checkin_date', window.start);
    const { error: delError } = await del;
    if (delError) throw new Error(delError.message);

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from('booking_reports')
        .upsert(chunk, { onConflict: 'client_id,reservation_id,report_date' });
      if (error) throw new Error(error.message);
    }

    // Recompute performance from the FULL retained table (past + refreshed
    // forward), not just this pull. Occupancy = reserved dates ÷ (listings ×
    // calendar days); per-listing breakdown included.
    const stays = await loadStays(supabase, client.id);
    const monthlyRows = computeMonthly(stays, listings.length);
    const roster = listings.map((l) => l.name).filter(Boolean);
    const byListing = computePerListingYear(stays, reportDate.slice(0, 4), roster);

    const { error: pErr } = await supabase.from('portfolio_reports').upsert(
      {
        client_id: client.id,
        report_date: reportDate,
        segment: 'all',
        report_data: {
          source: 'customer-api',
          uploadedAt: reportDate,
          segment: 'all',
          listingCount: listings.length,
          rawRows: monthlyRows,
          rowCount: monthlyRows.length,
          byListing,
        },
      },
      { onConflict: 'client_id,report_date,segment' }
    );
    if (pErr) throw new Error(pErr.message);

    return {
      clientId: client.id,
      clientName: client.client_name,
      status: 'synced',
      mode: firstImport ? 'backfill' : 'incremental',
      pms,
      reservations: rows.length,
      listings: listings.length,
      months: monthlyRows.length,
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

export async function syncAllFromApi(): Promise<ClientSyncResult[]> {
  const clients = await getActiveClients();
  const results: ClientSyncResult[] = [];
  for (const client of clients) {
    results.push(await syncClientFromApi(client));
  }
  return results;
}
