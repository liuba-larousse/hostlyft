import type { DateRange, RangePreset, Scope } from './types';

const PRESETS: readonly RangePreset[] = ['7d', '30d', 'mtd', 'qtd', 'ytd'];

const PRESET_LABELS: Record<RangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  mtd: 'Month to date',
  qtd: 'Quarter to date',
  ytd: 'Year to date',
};

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

  return { from, to: today, preset, label: PRESET_LABELS[preset] };
}

/** Equal-length window immediately preceding the given range — used for deltas. */
export function priorRange(range: DateRange): { from: string; to: string } {
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
