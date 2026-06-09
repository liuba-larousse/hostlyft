import type {
  AttentionFlag,
  ClientMetrics,
  MetricId,
  MetricValue,
} from './types';
import { METRIC_IDS } from './types';
import { deltaPct, formatValue } from './format';
import type { BookingAgg, ClientBookingData } from './providers/bookings';

function deriveValue(metricId: MetricId, agg: BookingAgg): number {
  switch (metricId) {
    case 'revenue':
      // Rental revenue (sum of rental totals), net of cancellations.
      return agg.rentalRevenue;
    case 'bookings':
      return agg.bookings;
    case 'adr':
      // ADR = rental (room) revenue per night, excluding fees/taxes in total_revenue.
      return agg.nights > 0 ? agg.rentalRevenue / agg.nights : 0;
    case 'booking_window':
      return agg.windowCount > 0 ? agg.windowSum / agg.windowCount : 0;
  }
}

function metricsFromAggs(
  current: BookingAgg,
  prior: BookingAgg,
  days: { date: string; agg: BookingAgg }[]
): Record<MetricId, MetricValue> {
  const out = {} as Record<MetricId, MetricValue>;
  for (const id of METRIC_IDS) {
    out[id] = {
      metricId: id,
      value: deriveValue(id, current),
      prior: deriveValue(id, prior),
      series: days.map((d) => ({ date: d.date, value: deriveValue(id, d.agg) })),
    };
  }
  return out;
}

export function buildClientMetrics(data: ClientBookingData): ClientMetrics {
  return {
    clientId: data.clientId,
    clientName: data.clientName,
    currency: data.currency,
    metrics: metricsFromAggs(data.current, data.prior, data.days),
  };
}

// Note: no cross-client aggregate — clients have different currencies, so a
// summed "portfolio" total would be meaningless. Metrics stay per client.

const ATTENTION_THRESHOLD = -0.15; // flag a client when a metric drops 15%+ vs prior
const ATTENTION_METRICS: MetricId[] = ['revenue', 'bookings'];

export function computeAttention(clients: ClientMetrics[]): AttentionFlag[] {
  const flags: AttentionFlag[] = [];

  for (const client of clients) {
    let worst: AttentionFlag | null = null;
    for (const metricId of ATTENTION_METRICS) {
      const m = client.metrics[metricId];
      const pct = deltaPct(m.value, m.prior);
      if (pct === null || pct > ATTENTION_THRESHOLD) continue;
      if (worst && pct >= worst.deltaPct) continue;

      const unit = metricId === 'revenue' ? 'currency' : 'number';
      worst = {
        clientId: client.clientId,
        clientName: client.clientName,
        metricId,
        deltaPct: pct,
        detail: `${formatValue(unit, m.value, client.currency)} vs ${formatValue(
          unit,
          m.prior ?? 0,
          client.currency
        )} prior`,
      };
    }
    if (worst) flags.push(worst);
  }

  return flags.sort((a, b) => a.deltaPct - b.deltaPct);
}
