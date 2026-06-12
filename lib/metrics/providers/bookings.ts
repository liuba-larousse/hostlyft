import { createSupabaseAdmin } from '@/lib/supabase';
import type { ClientListItem, DateRange } from '../types';
import { addDays, daysBetween, priorRange } from '../range';

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
  checkin_date: string | null;
  checkout_date: string | null;
  rental_revenue: number | null;
  los: number | null;
  booking_window: number | null;
  currency: string | null;
}

// 7d/30d measure booking activity (attributed to booked_date). Month/quarter/year
// measure period revenue: each reservation's rental_revenue is spread across the
// nights it occupies and counted in the period(s) those nights fall in.
type Basis = 'booked' | 'stay';

function basisFor(preset: DateRange['preset']): Basis {
  return preset === 'mtd' || preset === 'qtd' || preset === 'ytd' ? 'stay' : 'booked';
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

function getDay(dm: Map<string, BookingAgg>, date: string): BookingAgg {
  let agg = dm.get(date);
  if (!agg) {
    agg = emptyAgg();
    dm.set(date, agg);
  }
  return agg;
}

function addWindow(agg: BookingAgg, row: BookingReportRow): void {
  if (row.booking_window !== null) {
    agg.windowSum += row.booking_window;
    agg.windowCount += 1;
  }
}

// ── booked-date basis (7d / 30d) ─────────────────────────────────────────────
function foldBooked(agg: BookingAgg, row: BookingReportRow): void {
  agg.rentalRevenue += row.rental_revenue ?? 0;
  agg.bookings += 1;
  agg.nights += row.los ?? 0;
  addWindow(agg, row);
}

// ── stay-night basis (month / quarter / year) ────────────────────────────────
interface StayOverlap {
  overlapStart: string; // first occupied night within the period
  overlapEnd: string; // last occupied night within the period
  nights: number; // nights of this reservation inside the period
  perNight: number; // rental_revenue spread evenly across the stay's nights
}

/** Nights of a reservation that fall inside [periodFrom, periodTo], with per-night revenue. */
function stayOverlap(row: BookingReportRow, periodFrom: string, periodTo: string): StayOverlap | null {
  if (!row.checkin_date || !row.checkout_date) return null;
  const lastNight = addDays(row.checkout_date, -1); // checkout day is not a night
  if (lastNight < row.checkin_date) return null; // zero-night stay
  const overlapStart = row.checkin_date > periodFrom ? row.checkin_date : periodFrom;
  const overlapEnd = lastNight < periodTo ? lastNight : periodTo;
  if (overlapEnd < overlapStart) return null;
  const nights = daysBetween(overlapStart, overlapEnd);
  const totalNights = row.los && row.los > 0 ? row.los : daysBetween(row.checkin_date, lastNight);
  if (totalNights <= 0) return null;
  return { overlapStart, overlapEnd, nights, perNight: (row.rental_revenue ?? 0) / totalNights };
}

function foldStay(agg: BookingAgg, row: BookingReportRow, ov: StayOverlap): void {
  agg.rentalRevenue += ov.perNight * ov.nights;
  agg.nights += ov.nights;
  agg.bookings += 1;
  addWindow(agg, row);
}

/** Fetch booking rows for one window, paginating past PostgREST's 1000-row cap. */
async function fetchWindow(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  ids: string[],
  from: string,
  to: string,
  basis: Basis
): Promise<BookingReportRow[]> {
  const PAGE = 1000;
  const rows: BookingReportRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from('booking_reports')
      .select('client_id, booked_date, checkin_date, checkout_date, rental_revenue, los, booking_window, currency')
      .in('client_id', ids);
    // stay basis: any reservation whose stay overlaps [from, to] (checkout after
    // the period start, check-in on/before the period end).
    query =
      basis === 'stay'
        ? query.gt('checkout_date', from).lte('checkin_date', to)
        : query.gte('booked_date', from).lte('booked_date', to);

    const { data, error } = await query
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
 * for 7d/30d — see priorRange). 7d/30d attribute revenue to booked_date; month/
 * quarter/year prorate each reservation's revenue across the nights it occupies
 * within the period (so already-booked future stays count). The two windows are
 * fetched separately because for YoY they sit a year apart. Clients with no
 * bookings are returned with zeroed aggregates so they still appear in the matrix.
 */
export async function getBookingData(
  clients: ClientListItem[],
  range: DateRange
): Promise<ClientBookingData[]> {
  if (!clients.length) return [];

  const supabase = createSupabaseAdmin();
  const prior = priorRange(range);
  const basis = basisFor(range.preset);
  const ids = clients.map((c) => c.id);

  const [currentRows, priorRows] = await Promise.all([
    fetchWindow(supabase, ids, range.from, range.to, basis),
    fetchWindow(supabase, ids, prior.from, prior.to, basis),
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

  const dmFor = (clientId: string): Map<string, BookingAgg> => {
    let dm = dayMaps.get(clientId);
    if (!dm) {
      dm = new Map();
      dayMaps.set(clientId, dm);
    }
    return dm;
  };

  for (const row of currentRows) {
    const entry = result.get(row.client_id);
    if (!entry) continue;
    if (row.currency) entry.currency = row.currency;

    if (basis === 'booked') {
      if (!row.booked_date) continue;
      foldBooked(entry.current, row);
      foldBooked(getDay(dmFor(row.client_id), row.booked_date), row);
    } else {
      const ov = stayOverlap(row, range.from, range.to);
      if (!ov) continue;
      foldStay(entry.current, row, ov);
      // Daily series: spread revenue/nights across each occupied night; count the
      // booking + its window once, on the reservation's first night in the period.
      const dm = dmFor(row.client_id);
      for (let d = ov.overlapStart; d <= ov.overlapEnd; d = addDays(d, 1)) {
        const dayAgg = getDay(dm, d);
        dayAgg.rentalRevenue += ov.perNight;
        dayAgg.nights += 1;
      }
      const first = getDay(dm, ov.overlapStart);
      first.bookings += 1;
      addWindow(first, row);
    }
  }

  for (const row of priorRows) {
    const entry = result.get(row.client_id);
    if (!entry) continue;
    if (row.currency) entry.currency = row.currency;

    if (basis === 'booked') {
      if (!row.booked_date) continue;
      foldBooked(entry.prior, row);
    } else {
      const ov = stayOverlap(row, prior.from, prior.to);
      if (ov) foldStay(entry.prior, row, ov);
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
