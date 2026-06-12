import React from 'react';
import type { MetricDef, MetricValue } from '@/lib/metrics/types';
import { deltaPct, formatValue } from '@/lib/metrics/format';
import { DeltaChip } from './DeltaChip';
import { Sparkline } from './Sparkline';

interface KpiCardProps {
  def: MetricDef;
  metric: MetricValue;
  currency: string;
  vsLabel?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ def, metric, currency, vsLabel = 'vs prior' }) => {
  const pct = deltaPct(metric.value, metric.prior);
  const values = metric.series.map((p) => p.value);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {def.label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums text-gray-900">
          {formatValue(def.unit, metric.value, currency)}
        </p>
        <Sparkline values={values} />
      </div>
      <div className="mt-1">
        <DeltaChip pct={pct} better={def.better} vsLabel={vsLabel} />
      </div>
    </div>
  );
};

export default KpiCard;
