import type { DateRange, RangePreset, Scope } from './types';

const PRESETS: readonly RangePreset[] = ['7d', '30d', 'mtd', 'qtd', 'ytd'];

const PRESET_LABELS: Record<RangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  mtd: 'This month',
  qtd: 'This quarter',
  ytd: 'This year',
};

// What the prior window represents. 7d/30d look back an equal-length window;
// month/quarter/year compare against the same period a year earlier (YoY), which
// is the meaningful baseline for seasonal booking data.
const COMPARE_LABELS: Record<RangePreset, string> = {
  '7d': 'previous 7 days',
  '30d': 'previous 30 days',
  mtd: 'same month last year',
  qtd: 'same quarter last year',
  ytd: 'last year',
};

const YOY_PRESETS: ReadonlySet<RangePreset> = new Set(['mtd', 'qtd', 'ytd']);

/** Shift an ISO date back/forward whole years, clamping the day (e.g. Feb 29 → Feb 28). */
function shiftYear(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Inclusive day count between two ISO dates. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function resolveRange(preset: RangePreset, todayISO?: string): DateRange {
  const today = todayISO ?? toISO(new Date());
  const [y, m] = today.split('-').map(Number);
  let from: string;

  switch (preset) {
    case '7d':
      from = addDays(today, -6);
      break;
    case '30d':
      from = addDays(today, -29);
      break;
    case 'mtd':
      from = `${y}-${String(m).padStart(2, '0')}-01`;
      break;
    case 'qtd': {
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      from = `${y}-${String(qStartMonth).padStart(2, '0')}-01`;
      break;
    }
    case 'ytd':
      from = `${y}-01-01`;
      break;
  }

  return {
    from,
    to: today,
    preset,
    label: PRESET_LABELS[preset],
    compareLabel: COMPARE_LABELS[preset],
  };
}

/**
 * The prior window used for deltas. For month/quarter/year this is the same
 * calendar window one year earlier (year-over-year); for 7d/30d it's the
 * equal-length window immediately preceding the current range.
 */
export function priorRange(range: DateRange): { from: string; to: string } {
  if (YOY_PRESETS.has(range.preset)) {
    return { from: shiftYear(range.from, -1), to: shiftYear(range.to, -1) };
  }
  const len = daysBetween(range.from, range.to);
  const to = addDays(range.from, -1);
  const from = addDays(to, -(len - 1));
  return { from, to };
}

export function parseRange(raw: string | string[] | undefined): RangePreset {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && (PRESETS as readonly string[]).includes(value)
    ? (value as RangePreset)
    : '30d';
}

export function parseScope(raw: string | string[] | undefined): Scope {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value === 'all') return 'all';
  const ids = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : 'all';
}
