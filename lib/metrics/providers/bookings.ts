import { createSupabaseAdmin } from '@/lib/supabase';
import type { ClientListItem, DateRange } from '../types';
import { priorRange } from '../range';

// Raw building blocks aggregated from booking_reports. Derived metrics (ADR,
// booking window) are computed from these sums so cross-client aggregation stays
// exact (no averaging of averages).
export interface BookingAgg {
  // Rental revenue only (excludes fees/taxes in total_cost). Cancellations are
  // never folded in — the sync stores booked reservations only.
  rentalRevenue: number;
  bookings: number;
  nights: number;
  windowSum: number;
  windowCount: number;
}

export interface ClientBookingData {
  clientId: string;
  clientName: string;
  currency: string;
  current: BookingAgg;
  prior: BookingAgg;
  days: { date: string; agg: BookingAgg }[]; // current range only, ascending
}

interface BookingReportRow {
  client_id: string;
  booked_date: string | null;
  rental_revenue: number | null;
  los: number | null;
  booking_window: number | null;
  currency: string | null;
}

export function emptyAgg(): BookingAgg {
  return { rentalRevenue: 0, bookings: 0, nights: 0, windowSum: 0, windowCount: 0 };
}

export function addAgg(target: BookingAgg, src: BookingAgg): void {
  target.rentalRevenue += src.rentalRevenue;
  target.bookings += src.bookings;
  target.nights += src.nights;
  target.windowSum += src.windowSum;
  target.windowCount += src.windowCount;
}

function fold(agg: BookingAgg, row: BookingReportRow): void {
  agg.rentalRevenue += row.rental_revenue ?? 0;
  agg.bookings += 1;
  agg.nights += row.los ?? 0;
  if (row.booking_window !== null) {
    agg.windowSum += row.booking_window;
    agg.windowCount += 1;
  }
}

/** Fetch booking rows for one [from, to] window, paginating past PostgREST's 1000-row cap. */
async function fetchWindow(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  ids: string[],
  from: string,
  to: string
): Promise<BookingReportRow[]> {
  const PAGE = 1000;
  const rows: BookingReportRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('booking_reports')
      .select('client_id, booked_date, rental_revenue, los, booking_window, currency')
      .in('client_id', ids)
      .gte('booked_date', from)
      .lte('booked_date', to)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`Failed to fetch booking metrics: ${error.message}`);
    const batch = (data ?? []) as BookingReportRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/**
 * Fetch booking aggregates for the given clients across the current range and
 * the prior window (year-over-year for month/quarter/year, equal-length before
 * for 7d/30d — see priorRange). The two windows are fetched separately because
 * for YoY they sit a year apart. Clients with no bookings are returned with
 * zeroed aggregates so they still appear in the matrix.
 */
export async function getBookingData(
  clients: ClientListItem[],
  range: DateRange
): Promise<ClientBookingData[]> {
  if (!clients.length) return [];

  const supabase = createSupabaseAdmin();
  const prior = priorRange(range);
  const ids = clients.map((c) => c.id);

  const [currentRows, priorRows] = await Promise.all([
    fetchWindow(supabase, ids, range.from, range.to),
    fetchWindow(supabase, ids, prior.from, prior.to),
  ]);

  const result = new Map<string, ClientBookingData>(
    clients.map((c) => [
      c.id,
      {
        clientId: c.id,
        clientName: c.name,
        currency: 'USD',
        current: emptyAgg(),
        prior: emptyAgg(),
        days: [],
      },
    ])
  );
  const dayMaps = new Map<string, Map<string, BookingAgg>>();

  for (const row of currentRows) {
    const entry = result.get(row.client_id);
    if (!entry || !row.booked_date) continue;
    if (row.currency) entry.currency = row.currency;

    fold(entry.current, row);
    let dm = dayMaps.get(row.client_id);
    if (!dm) {
      dm = new Map();
      dayMaps.set(row.client_id, dm);
    }
    let dayAgg = dm.get(row.booked_date);
    if (!dayAgg) {
      dayAgg = emptyAgg();
      dm.set(row.booked_date, dayAgg);
    }
    fold(dayAgg, row);
  }

  for (const row of priorRows) {
    const entry = result.get(row.client_id);
    if (!entry || !row.booked_date) continue;
    if (row.currency) entry.currency = row.currency;
    fold(entry.prior, row);
  }

  for (const [clientId, dm] of dayMaps) {
    const entry = result.get(clientId);
    if (!entry) continue;
    entry.days = [...dm.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, agg]) => ({ date, agg }));
  }

  return [...result.values()];
}
