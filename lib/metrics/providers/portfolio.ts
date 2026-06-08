import { createSupabaseAdmin } from '@/lib/supabase';

export interface PortfolioMonth {
  ym: string; // "2026-01"
  label: string; // "Jan"
  occupancy: number;
  revpar: number;
  adr: number;
  revenue: number;
  bookedNights: number;
  availableNights: number;
}

export interface YearSummary {
  year: string;
  occupancy: number; // Σ booked nights ÷ Σ available nights (listings × calendar days)
  revpar: number;
  adr: number;
  revenue: number;
  bookedNights: number;
  availableNights: number;
}

export interface PortfolioDetail {
  reportDate: string;
  segment: string;
  current: PortfolioMonth | null;
  currentYear: YearSummary | null;
  months: PortfolioMonth[];
}

interface PortfolioReportRow {
  report_date: string;
  segment: string;
  report_data: { rawRows?: Record<string, unknown>[] } | null;
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? (n as number) : 0;
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toMonth(row: Record<string, unknown>): PortfolioMonth | null {
  // "Year & Month" looks like "2026-01 (Jan)"
  const raw = String(row['Year & Month'] ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const ym = `${match[1]}-${match[2]}`;
  const monthIdx = Number(match[2]) - 1;

  return {
    ym,
    label: MONTH_ABBR[monthIdx] ?? ym,
    occupancy: num(row['Occupancy %']),
    revpar: num(row['Rental RevPAR']),
    adr: num(row['Rental ADR']),
    revenue: num(row['Rental Revenue']),
    bookedNights: num(row['Booked Nights']),
    availableNights: num(row['Available Nights']),
  };
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/**
 * Current-year occupancy from reservations: booked nights ÷ (listings × calendar
 * days of the year). Available nights must span the FULL year, not just months
 * that happened to have a booking — otherwise sparse clients look over-occupied.
 */
function summarizeYear(months: PortfolioMonth[], year: string): YearSummary | null {
  const yearMonths = months.filter((m) => m.ym.startsWith(year));
  if (!yearMonths.length) return null;

  // Listing count is constant across months (availableNights = listings × days),
  // so recover it from any populated month.
  const ref = yearMonths.find((m) => m.availableNights > 0);
  const listingCount = ref ? Math.round(ref.availableNights / daysInMonth(ref.ym)) : 0;
  const available = listingCount * daysInYear(Number(year));

  const booked = yearMonths.reduce((s, m) => s + m.bookedNights, 0);
  const revenue = yearMonths.reduce((s, m) => s + m.revenue, 0);

  return {
    year,
    occupancy: available > 0 ? Math.round((booked / available) * 1000) / 10 : 0,
    revpar: available > 0 ? Math.round((revenue / available) * 100) / 100 : 0,
    adr: booked > 0 ? Math.round((revenue / booked) * 100) / 100 : 0,
    revenue: Math.round(revenue * 100) / 100,
    bookedNights: booked,
    availableNights: available,
  };
}

/**
 * Latest portfolio report for a client as a monthly series with LY/STLY
 * benchmarks. Prefers the whole-portfolio "all" segment. Returns null when the
 * client has no portfolio data (only Marcus has it today).
 */
export async function getPortfolioDetail(
  clientId: string,
  currentYM: string
): Promise<PortfolioDetail | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('portfolio_reports')
    .select('report_date, segment, report_data')
    .eq('client_id', clientId)
    .order('report_date', { ascending: false });

  if (error) throw new Error(`Failed to fetch portfolio report: ${error.message}`);
  const rows = (data ?? []) as PortfolioReportRow[];
  if (!rows.length) return null;

  // Not every segment is a monthly series (e.g. "building" is per-building).
  // Pick the most recent report that yields monthly rows, preferring "all".
  const parseMonths = (r: PortfolioReportRow): PortfolioMonth[] =>
    (r.report_data?.rawRows ?? [])
      .map(toMonth)
      .filter((m): m is PortfolioMonth => m !== null)
      .sort((a, b) => a.ym.localeCompare(b.ym));

  let chosen: PortfolioReportRow | null = null;
  let months: PortfolioMonth[] = [];
  for (const r of rows) {
    // rows are date-desc; first monthly-yielding report wins
    const parsed = parseMonths(r);
    if (!parsed.length) continue;
    if (!chosen) {
      chosen = r;
      months = parsed;
    }
    if (r.segment === 'all' && r.report_date === rows[0].report_date) {
      chosen = r;
      months = parsed;
      break;
    }
  }

  if (!chosen || !months.length) return null;

  const current =
    months.find((m) => m.ym === currentYM) ?? months[months.length - 1] ?? null;
  const currentYear = summarizeYear(months, currentYM.slice(0, 4));

  return { reportDate: chosen.report_date, segment: chosen.segment, current, currentYear, months };
}
