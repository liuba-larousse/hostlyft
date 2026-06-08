import { createSupabaseAdmin } from '@/lib/supabase';
import type { ClientListItem, DateRange } from '../types';
import { priorRange } from '../range';

// Raw building blocks aggregated from booking_reports. Derived metrics (ADR,
// booking window) are computed from these sums so cross-client aggregation stays
// exact (no averaging of averages).
export interface BookingAgg {
  revenue: number; // total_revenue (incl. fees) — the headline revenue
  rentalRevenue: number; // rental-only revenue — used for ADR
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
  total_revenue: number | null;
  rental_revenue: number | null;
  los: number | null;
  booking_window: number | null;
  currency: string | null;
}

export function emptyAgg(): BookingAgg {
  return { revenue: 0, rentalRevenue: 0, bookings: 0, nights: 0, windowSum: 0, windowCount: 0 };
}

export function addAgg(target: BookingAgg, src: BookingAgg): void {
  target.revenue += src.revenue;
  target.rentalRevenue += src.rentalRevenue;
  target.bookings += src.bookings;
  target.nights += src.nights;
  target.windowSum += src.windowSum;
  target.windowCount += src.windowCount;
}

function fold(agg: BookingAgg, row: BookingReportRow): void {
  agg.revenue += row.total_revenue ?? 0;
  agg.rentalRevenue += row.rental_revenue ?? 0;
  agg.bookings += 1;
  agg.nights += row.los ?? 0;
  if (row.booking_window !== null) {
    agg.windowSum += row.booking_window;
    agg.windowCount += 1;
  }
}

/**
 * Fetch booking aggregates for the given clients across the current range and
 * the equal-length prior window in a single query. Clients with no bookings are
 * returned with zeroed aggregates so they still appear in the matrix.
 */
export async function getBookingData(
  clients: ClientListItem[],
  range: DateRange
): Promise<ClientBookingData[]> {
  if (!clients.length) return [];

  const supabase = createSupabaseAdmin();
  const prior = priorRange(range);
  const ids = clients.map((c) => c.id);

  // Paginate explicitly — Supabase/PostgREST caps a select at 1000 rows by
  // default, which would silently truncate wide ranges or all-client scope.
  const PAGE = 1000;
  const rows: BookingReportRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('booking_reports')
      .select('client_id, booked_date, total_revenue, rental_revenue, los, booking_window, currency')
      .in('client_id', ids)
      .gte('booked_date', prior.from)
      .lte('booked_date', range.to)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch booking metrics: ${error.message}`);
    const batch = (data ?? []) as BookingReportRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

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

  for (const row of rows) {
    const entry = result.get(row.client_id);
    if (!entry || !row.booked_date) continue;
    if (row.currency) entry.currency = row.currency;

    if (row.booked_date >= range.from && row.booked_date <= range.to) {
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
    } else if (row.booked_date >= prior.from && row.booked_date <= prior.to) {
      fold(entry.prior, row);
    }
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
