import React from 'react';
import type { AttentionFlag } from '@/lib/metrics/types';
import { METRICS } from '@/lib/metrics/registry';
import { clientColor } from '@/lib/metrics/colors';
import { DeltaChip } from './DeltaChip';

interface AttentionStripProps {
  flags: AttentionFlag[];
}

/** Triage-first: surfaces clients with the sharpest drops before any KPI grid. */
export const AttentionStrip: React.FC<AttentionStripProps> = ({ flags }) => {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
          Needs attention
        </h2>
        <span className="text-xs font-medium text-gray-500 tabular-nums">
          {flags.length} flagged
        </span>
      </header>

      {flags.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">
          No clients down 15%+ vs the prior period. All steady.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {flags.map((flag) => (
            <li
              key={`${flag.clientId}-${flag.metricId}`}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: clientColor(flag.clientId) }}
                aria-hidden="true"
              />
              <span className="w-32 shrink-0 truncate text-sm font-semibold text-gray-900">
                {flag.clientName}
              </span>
              <span className="shrink-0 text-sm text-gray-600">
                {METRICS[flag.metricId].label}
              </span>
              <DeltaChip pct={flag.deltaPct} better="higher" />
              <span className="ml-auto truncate text-xs text-gray-400 tabular-nums">
                {flag.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AttentionStrip;
