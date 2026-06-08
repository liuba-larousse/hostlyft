import type { MetricUnit } from './types';

function safeCurrency(value: number, currency: string, compact: boolean): string {
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : value >= 1000 ? 0 : 2,
    }).format(value);
  } catch {
    return `${code} ${Math.round(value).toLocaleString('en-US')}`;
  }
}

export function formatValue(unit: MetricUnit, value: number, currency = 'USD'): string {
  switch (unit) {
    case 'currency':
      return safeCurrency(value, currency, value >= 10_000);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'number':
      return new Intl.NumberFormat('en-US').format(Math.round(value));
    case 'score':
      return value.toFixed(2);
    case 'days':
      return `${Math.round(value)}d`;
  }
}

/** Fractional delta vs prior, or null when there's no comparable prior value. */
export function deltaPct(value: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return (value - prior) / prior;
}

export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
