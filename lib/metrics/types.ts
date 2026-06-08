// Core metric type vocabulary for the Client Reports metrics dashboard.
// Metrics are declared as data in registry.ts; providers fill these shapes.

export const METRIC_IDS = ['revenue', 'bookings', 'adr', 'booking_window'] as const;
export type MetricId = (typeof METRIC_IDS)[number];

export type RangePreset = '7d' | '30d' | 'mtd' | 'qtd' | 'ytd';

export interface DateRange {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  preset: RangePreset;
  label: string;
}

export type MetricUnit = 'currency' | 'percent' | 'number' | 'score' | 'days';
export type AggregateRule = 'sum' | 'avg' | 'weightedAvg';
export type Direction = 'higher' | 'lower';
export type MetricCategory = 'finance' | 'performance' | 'reputation' | 'pace';
export type MetricViz = 'kpi' | 'line';

export interface MetricDef {
  id: MetricId;
  label: string;
  short: string;
  category: MetricCategory;
  unit: MetricUnit;
  aggregate: AggregateRule;
  /** Which direction is "good" — colors deltas correctly (RevPAR up = good, booking window is neutral-ish). */
  better: Direction | 'neutral';
  viz: MetricViz;
}

export interface MetricPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface MetricValue {
  metricId: MetricId;
  value: number; // current-period value
  prior: number | null; // equal-length window immediately before the current range
  series: MetricPoint[]; // daily series across the current range
}

export interface ClientMetrics {
  clientId: string;
  clientName: string;
  currency: string;
  metrics: Record<MetricId, MetricValue>;
}

export interface AttentionFlag {
  clientId: string;
  clientName: string;
  metricId: MetricId;
  deltaPct: number; // negative fractional change vs prior period
  detail: string; // human-readable context, e.g. "Revenue $24.0k vs $31.2k"
}

export interface MetricsOverview {
  range: DateRange;
  clients: ClientMetrics[];
  portfolio: ClientMetrics; // aggregate across the selected scope (clientId = "portfolio")
  attention: AttentionFlag[];
}

export interface ClientListItem {
  id: string;
  name: string;
}

/** 'all' = every active client; otherwise an explicit id list. */
export type Scope = 'all' | string[];
