// PriceLabs Customer API client (X-API-Key per client). Replaces the Playwright
// login/report scrape — all data is pulled directly from the API.
const BASE = 'https://api.pricelabs.co';

export interface ApiReservation {
  listing_id: string;
  listing_name: string;
  reservation_id: string;
  check_in: string;
  check_out: string;
  booking_status: 'booked' | 'cancelled' | string;
  booked_date: string; // ISO datetime
  rental_revenue: string;
  total_cost: string;
  no_of_days: number;
  currency: string;
  cancelled_on?: string;
  booking_channel?: string;
}

export interface ApiListing {
  id: string;
  pms: string;
  name: string;
  group?: string;
  no_of_bedrooms?: number;
  occupancy_next_7?: string | number;
  occupancy_next_30?: string | number;
  market_occupancy_next_7?: string | number;
  market_occupancy_next_30?: string | number;
}

interface ReservationPage {
  pms_name?: string;
  next_page?: boolean;
  data?: ApiReservation[];
}

function headers(apiKey: string): HeadersInit {
  return { 'X-API-Key': apiKey, Accept: 'application/json' };
}

/** Parse PriceLabs percent values like "54 %" or 54 into a number. */
export function parsePercent(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Parse money strings, tolerating thousands separators/currency symbols ("1,234.50" → 1234.5). */
export function parseMoney(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchListings(apiKey: string): Promise<ApiListing[]> {
  const res = await fetch(`${BASE}/v1/listings`, { headers: headers(apiKey) });
  if (!res.ok) {
    throw new Error(`PriceLabs /v1/listings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { listings?: ApiListing[] };
  return json.listings ?? [];
}

/** Most common PMS across a client's listings (reservation_data requires `pms`). */
export function dominantPms(listings: ApiListing[]): string | null {
  const counts = new Map<string, number>();
  for (const l of listings) {
    if (!l.pms) continue;
    counts.set(l.pms, (counts.get(l.pms) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [pms, count] of counts) {
    if (count > max) {
      max = count;
      best = pms;
    }
  }
  return best;
}

/**
 * All reservations for a client in [startDate, endDate], following pagination.
 * `pms` is required by the API.
 */
export async function fetchReservations(
  apiKey: string,
  pms: string,
  startDate: string,
  endDate: string
): Promise<ApiReservation[]> {
  const all: ApiReservation[] = [];
  let offset = 0;
  const limit = 100;

  // Hard cap to avoid runaway loops (200 pages = 20k reservations).
  for (let page = 0; page < 200; page++) {
    const url = `${BASE}/v1/reservation_data?pms=${encodeURIComponent(pms)}&start_date=${startDate}&end_date=${endDate}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: headers(apiKey) });
    if (!res.ok) {
      throw new Error(`PriceLabs /v1/reservation_data ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as ReservationPage;
    const rows = json.data ?? [];
    all.push(...rows);
    // Stop only when there's clearly no more: empty page, or a partial page with
    // no next_page flag. A full page is treated as "more" even if next_page is
    // absent, so a missing flag can't silently drop trailing pages.
    if (rows.length === 0) break;
    const morePossible = json.next_page === true || rows.length === limit;
    if (!morePossible) break;
    offset += limit;
  }

  return all;
}
