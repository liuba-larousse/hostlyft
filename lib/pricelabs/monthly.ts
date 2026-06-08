import { parseMoney, type ApiReservation } from './api';

// Computes monthly performance from reservations by allocating each booking's
// nights/revenue to the calendar months they span (occupancy "by stay date").
// Output rows match the keys lib/metrics/providers/portfolio.ts already parses,
// so this transparently replaces the scraped portfolio report.

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

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type MonthlyRow = Record<string, string | number>;

export function computeMonthlyPerformance(
  reservations: ApiReservation[],
  listingCount: number
): MonthlyRow[] {
  const months = new Map<string, { nights: number; rental: number }>();

  for (const r of reservations) {
    if (r.booking_status !== 'booked') continue;
    const ci = (r.check_in ?? '').slice(0, 10);
    const co = (r.check_out ?? '').slice(0, 10);
    const nights = r.no_of_days ?? 0;
    if (!ci || !co || nights <= 0) continue;

    const perNight = parseMoney(r.rental_revenue) / nights;
    let d = ci;
    // Allocate one room-night (and its share of revenue) to each stayed night.
    for (let guard = 0; d < co && guard < 400; guard++) {
      const ym = d.slice(0, 7);
      const agg = months.get(ym) ?? { nights: 0, rental: 0 };
      agg.nights += 1;
      agg.rental += perNight;
      months.set(ym, agg);
      d = addDayUTC(d);
    }
  }

  const cap = Math.max(0, listingCount);
  return [...months.keys()].sort().map((ym) => {
    const a = months.get(ym)!;
    const avail = cap * daysInMonth(ym); // capacity proxy: current listing count
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
