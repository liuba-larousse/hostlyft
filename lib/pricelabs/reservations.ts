// PriceLabs API client for reservation data.
//
// Reservations used to be scraped from the PriceLabs Bookings UI via Playwright.
// They are now fetched directly from the PriceLabs API, per listing.
//
// PriceLabs' public docs are gated, and reservation endpoint/field names have
// varied across API versions, so this module:
//   1. tries a few known endpoint shapes (mirroring lib/../listing-prices), and
//   2. maps responses through a tolerant field mapper (handles snake/camel
//      variants and common aliases).
// The original record is preserved in `raw` so mappings can be corrected later
// against a real response without re-fetching.

const PRICELABS_API = 'https://api.pricelabs.co/v1';

export interface ParsedReservation {
  reservationId: string;
  listingId: string;
  listingName: string;
  pms: string;
  status: string;
  checkinDate: string;   // YYYY-MM-DD
  checkoutDate: string;  // YYYY-MM-DD
  bookedDate: string;    // YYYY-MM-DD
  nights: number;
  adr: number;
  rentalRevenue: number;
  totalRevenue: number;
  bookingWindow: number;
  bookingSource: string;
  currency: string;
  raw: Record<string, unknown>;
}

export interface FetchReservationsResult {
  reservations: ParsedReservation[];
  source?: string;       // endpoint that succeeded
  errors?: string[];     // attempts that failed (for debugging)
}

interface FetchOptions {
  /** Optional inclusive lower bound on booked/checkin date (YYYY-MM-DD). */
  dateFrom?: string;
  /** Optional inclusive upper bound on booked/checkin date (YYYY-MM-DD). */
  dateTo?: string;
}

/** Fetch reservations for a single listing from the PriceLabs API. */
export async function fetchReservations(
  apiKey: string,
  listingId: string,
  pms: string,
  opts: FetchOptions = {},
): Promise<FetchReservationsResult> {
  const qs = new URLSearchParams({ listing_id: listingId, pms });
  if (opts.dateFrom) qs.set('date_from', opts.dateFrom);
  if (opts.dateTo) qs.set('date_to', opts.dateTo);

  const attempts: { url: string; method: 'GET' }[] = [
    { url: `${PRICELABS_API}/reservation_data?${qs.toString()}`, method: 'GET' },
    { url: `${PRICELABS_API}/reservations?${qs.toString()}`, method: 'GET' },
    { url: `${PRICELABS_API}/listings/${listingId}/reservations?pms=${encodeURIComponent(pms)}`, method: 'GET' },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      });
      const raw = await res.text();
      if (!res.ok) {
        errors.push(`${attempt.method} ${attempt.url} → ${res.status}: ${raw.slice(0, 200)}`);
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        errors.push(`${attempt.method} ${attempt.url} → non-JSON response: ${raw.slice(0, 120)}`);
        continue;
      }
      const records = extractRecords(json);
      if (records === null) {
        errors.push(`${attempt.method} ${attempt.url} → unrecognised response shape`);
        continue;
      }
      const reservations = records
        .map(r => mapReservation(r, listingId, pms))
        .filter((r): r is ParsedReservation => r !== null);
      return { reservations, source: `${attempt.method} ${attempt.url}` };
    } catch (e) {
      errors.push(`${attempt.method} ${attempt.url} → ${(e as Error).message}`);
    }
  }

  return { reservations: [], errors };
}

/** Pull the array of reservation records out of the various response shapes. */
function extractRecords(json: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    for (const key of ['reservations', 'reservation_data', 'data', 'bookings', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return null;
}

/** Read the first present value across a set of candidate keys. */
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
}

function mapReservation(
  row: Record<string, unknown>,
  listingId: string,
  pms: string,
): ParsedReservation | null {
  const reservationId = String(
    pick(row, ['reservation_id', 'reservationId', 'booking_id', 'bookingId', 'id', 'uuid']) ?? '',
  ).trim();
  if (!reservationId) return null;

  const checkinDate = normaliseDate(
    pick(row, ['checkin', 'check_in', 'checkin_date', 'checkInDate', 'start_date', 'arrival_date', 'from']),
  );
  const checkoutDate = normaliseDate(
    pick(row, ['checkout', 'check_out', 'checkout_date', 'checkOutDate', 'end_date', 'departure_date', 'to']),
  );
  const bookedDate = normaliseDate(
    pick(row, ['booked_date', 'bookedDate', 'booking_date', 'reservation_date', 'created_at', 'created', 'booked_at']),
  );

  const rentalRevenue = parseNum(
    pick(row, ['rental_revenue', 'rentalRevenue', 'accommodation_revenue', 'base_revenue', 'fare_accommodation']),
  );
  const totalRevenue = parseNum(
    pick(row, ['total_revenue', 'totalRevenue', 'total_price', 'total', 'revenue', 'amount', 'payout']),
  );

  let nights = parseInt(String(pick(row, ['nights', 'los', 'length_of_stay', 'lengthOfStay', 'num_nights']) ?? ''), 10);
  if (!Number.isFinite(nights) || nights <= 0) nights = diffDays(checkinDate, checkoutDate);

  let adr = parseNum(pick(row, ['adr', 'average_daily_rate', 'averageDailyRate', 'nightly_rate', 'price_per_night']));
  if (!adr && nights > 0 && rentalRevenue) adr = rentalRevenue / nights;

  let bookingWindow = parseInt(String(pick(row, ['booking_window', 'bookingWindow', 'lead_time']) ?? ''), 10);
  if (!Number.isFinite(bookingWindow)) bookingWindow = diffDays(bookedDate, checkinDate);

  return {
    reservationId,
    listingId: String(pick(row, ['listing_id', 'listingId', 'pms_listing_id']) ?? listingId),
    listingName: String(pick(row, ['listing_name', 'listingName', 'name']) ?? '').trim(),
    pms: String(pick(row, ['pms']) ?? pms).trim().toLowerCase(),
    status: String(pick(row, ['status', 'state', 'reservation_status']) ?? 'booked').trim().toLowerCase(),
    checkinDate,
    checkoutDate,
    bookedDate,
    nights: nights > 0 ? nights : 0,
    adr,
    rentalRevenue,
    totalRevenue,
    bookingWindow: Number.isFinite(bookingWindow) && bookingWindow >= 0 ? bookingWindow : 0,
    bookingSource: String(pick(row, ['booking_source', 'bookingSource', 'source', 'channel', 'platform']) ?? '').trim(),
    currency: String(pick(row, ['currency', 'currency_code']) ?? 'USD').trim().toUpperCase() || 'USD',
    raw: row,
  };
}

function normaliseDate(val: unknown): string {
  if (val === undefined || val === null) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

function parseNum(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val === undefined || val === null) return 0;
  return parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
}

function diffDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}
