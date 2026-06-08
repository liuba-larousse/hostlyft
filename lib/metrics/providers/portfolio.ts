import { createSupabaseAdmin } from '@/lib/supabase';

export interface PortfolioMonth {
  ym: string; // "2026-01"
  label: string; // "Jan"
  occupancy: number;
  occupancyLY: number;
  occupancySTLY: number;
  revpar: number;
  revparLY: number;
  revparSTLY: number;
  adr: number;
  adrLY: number;
  adrSTLY: number;
  revenue: number;
}

export interface PortfolioDetail {
  reportDate: string;
  segment: string;
  current: PortfolioMonth | null;
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
    occupancyLY: num(row['Occupancy % LY']),
    occupancySTLY: num(row['Occupancy % STLY']),
    revpar: num(row['Rental RevPAR']),
    revparLY: num(row['Rental RevPAR LY']),
    revparSTLY: num(row['Rental RevPAR STLY']),
    adr: num(row['Rental ADR']),
    adrLY: num(row['Rental ADR LY']),
    adrSTLY: num(row['Rental ADR STLY']),
    revenue: num(row['Rental Revenue']),
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

  return { reportDate: chosen.report_date, segment: chosen.segment, current, months };
}
