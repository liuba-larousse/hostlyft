import type { MetricDef, MetricId } from './types';
import { METRIC_IDS } from './types';

// Metrics are declared here as data. Adding a new metric = one entry (plus a
// provider that can fill its value). The dashboard renders every entry generically.
export const METRICS: Record<MetricId, MetricDef> = {
  revenue: {
    id: 'revenue',
    label: 'Rental Revenue',
    short: 'Rev',
    category: 'finance',
    unit: 'currency',
    aggregate: 'sum',
    better: 'higher',
    viz: 'line',
  },
  bookings: {
    id: 'bookings',
    label: 'Bookings',
    short: 'Bk',
    category: 'pace',
    unit: 'number',
    aggregate: 'sum',
    better: 'higher',
    viz: 'line',
  },
  adr: {
    id: 'adr',
    label: 'ADR',
    short: 'ADR',
    category: 'finance',
    unit: 'currency',
    aggregate: 'weightedAvg',
    better: 'higher',
    viz: 'line',
  },
  booking_window: {
    id: 'booking_window',
    label: 'Booking window',
    short: 'Window',
    category: 'pace',
    unit: 'days',
    aggregate: 'weightedAvg',
    better: 'neutral',
    viz: 'line',
  },
};

export const METRIC_LIST: MetricDef[] = METRIC_IDS.map((id) => METRICS[id]);
