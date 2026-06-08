// Occupancy/performance computed from reservations by allocating each booking's
// nights to the calendar months they span. Occupancy = reserved dates ÷ days,
// per listing (then rolled up). Works on any stay shape, so it can run off the
// durable booking_reports table (past retained) rather than a single API pull.

export interface Stay {
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD (exclusive — checkout night isn't occupied)
  rentalRevenue: number;
  listing: string;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function addDayUTC(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Walk a stay's nights, invoking cb(ym) for each occupied date's month. */
function eachNightMonth(stay: Stay, cb: (ym: string, perNight: number) => void): void {
  const ci = stay.checkIn;
  const co = stay.checkOut;
  const nights = Math.max(0, Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86_400_000));
  if (!ci || !co || nights <= 0) return;
  const perNight = stay.rentalRevenue / nights;
  let d = ci;
  for (let guard = 0; d < co && guard < 800; guard++) {
    cb(d.slice(0, 7), perNight);
    d = addDayUTC(d);
  }
}

export type MonthlyRow = Record<string, string | number>;

/** Client-level monthly rows (capacity = listingCount × days in month). */
export function computeMonthly(stays: Stay[], listingCount: number): MonthlyRow[] {
  const months = new Map<string, { nights: number; rental: number }>();
  for (const s of stays) {
    eachNightMonth(s, (ym, perNight) => {
      const agg = months.get(ym) ?? { nights: 0, rental: 0 };
      agg.nights += 1;
      agg.rental += perNight;
      months.set(ym, agg);
    });
  }

  const cap = Math.max(0, listingCount);
  return [...months.keys()].sort().map((ym) => {
    const a = months.get(ym)!;
    const avail = cap * daysInMonth(ym);
    const mm = Number(ym.slice(5, 7));
    return {
      'Year & Month': `${ym} (${MONTH_ABBR[mm - 1]})`,
      'Occupancy %': avail > 0 ? r1((a.nights / avail) * 100) : 0,
      'Rental RevPAR': avail > 0 ? r2(a.rental / avail) : 0,
      'Rental ADR': a.nights > 0 ? r2(a.rental / a.nights) : 0,
      'Rental Revenue': r2(a.rental),
      'Available Nights': avail,
      'Booked Nights': a.nights,
    };
  });
}

export interface ListingYearPerf {
  listing: string;
  occupancy: number; // reserved dates in year ÷ calendar days of year
  bookedNights: number;
  revenue: number;
}

/**
 * Per-listing occupancy for a calendar year (capacity = 1 listing × days in
 * year). `roster` adds listings with zero bookings so the breakdown is complete.
 */
export function computePerListingYear(
  stays: Stay[],
  year: string,
  roster: string[] = []
): ListingYearPerf[] {
  const byListing = new Map<string, { nights: number; rental: number }>();
  for (const name of roster) byListing.set(name, { nights: 0, rental: 0 });

  for (const s of stays) {
    eachNightMonth(s, (ym, perNight) => {
      if (!ym.startsWith(year)) return;
      const agg = byListing.get(s.listing) ?? { nights: 0, rental: 0 };
      agg.nights += 1;
      agg.rental += perNight;
      byListing.set(s.listing, agg);
    });
  }

  const cap = daysInYear(Number(year));
  return [...byListing.entries()]
    .map(([listing, a]) => ({
      listing,
      occupancy: r1((a.nights / cap) * 100),
      bookedNights: a.nights,
      revenue: r2(a.rental),
    }))
    .sort((a, b) => b.occupancy - a.occupancy);
}
