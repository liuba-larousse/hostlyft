import React from 'react';
import type { Direction, MetricUnit } from '@/lib/metrics/types';
import { deltaPct, formatValue } from '@/lib/metrics/format';
import { DeltaChip } from './DeltaChip';

export interface Benchmark {
  label: string; // "LY", "STLY"
  value: number;
}

interface BulletRowProps {
  label: string;
  value: number;
  unit: MetricUnit;
  currency?: string;
  benchmarks?: Benchmark[];
  better?: Direction | 'neutral';
}

/**
 * Tufte-style bullet: a value bar against benchmark markers (LY/STLY). The dense
 * canonical revenue-management visualization — an actual is meaningless without
 * its benchmark beside it.
 */
export const BulletRow: React.FC<BulletRowProps> = ({
  label,
  value,
  unit,
  currency = 'USD',
  benchmarks = [],
  better = 'higher',
}) => {
  const scaleMax = Math.max(value, ...benchmarks.map((b) => b.value), 1) * 1.1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;
  const primary = benchmarks[0];

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-28 shrink-0 text-sm font-medium text-gray-600">{label}</span>

      <div className="relative h-5 flex-1 rounded bg-gray-100">
        <span
          className="absolute inset-y-0 left-0 rounded bg-gray-800/85"
          style={{ width: pct(value) }}
          aria-hidden="true"
        />
        {benchmarks.map((b) => (
          <span
            key={b.label}
            title={`${b.label}: ${formatValue(unit, b.value, currency)}`}
            className="absolute inset-y-0 w-0.5 bg-gray-900"
            style={{ left: pct(b.value) }}
            aria-hidden="true"
          />
        ))}
      </div>

      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">
        {formatValue(unit, value, currency)}
      </span>
      <span className="w-24 shrink-0 text-right">
        {primary ? (
          <DeltaChip
            pct={deltaPct(value, primary.value)}
            better={better}
            vsLabel={`vs ${primary.label}`}
          />
        ) : null}
      </span>
    </div>
  );
};

export default BulletRow;
