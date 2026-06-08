'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import type { ClientMetrics, MetricId } from '@/lib/metrics/types';
import { METRIC_LIST } from '@/lib/metrics/registry';
import { clientColor } from '@/lib/metrics/colors';
import { deltaPct, formatValue } from '@/lib/metrics/format';
import { DeltaChip } from './DeltaChip';

interface ClientMatrixProps {
  clients: ClientMetrics[];
}

type SortKey = MetricId | 'name';

export const ClientMatrix: React.FC<ClientMatrixProps> = ({ clients }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [asc, setAsc] = useState(false);

  const columnMax = useMemo(() => {
    const max = {} as Record<MetricId, number>;
    for (const def of METRIC_LIST) {
      max[def.id] = Math.max(0, ...clients.map((c) => c.metrics[def.id].value));
    }
    return max;
  }, [clients]);

  const sorted = useMemo(() => {
    const rows = [...clients];
    rows.sort((a, b) => {
      if (sortKey === 'name') return a.clientName.localeCompare(b.clientName);
      return a.metrics[sortKey].value - b.metrics[sortKey].value;
    });
    return asc ? rows : rows.reverse();
  }, [clients, sortKey, asc]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) setAsc((v) => !v);
      else {
        setSortKey(key);
        setAsc(key === 'name');
      }
    },
    [sortKey]
  );

  const focusClient = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('clients', id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  if (!clients.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No clients in scope.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <Th active={sortKey === 'name'} asc={asc} onClick={() => toggleSort('name')}>
              Client
            </Th>
            {METRIC_LIST.map((def) => (
              <Th
                key={def.id}
                align="right"
                active={sortKey === def.id}
                asc={asc}
                onClick={() => toggleSort(def.id)}
              >
                {def.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((client) => (
            <tr key={client.clientId} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => focusClient(client.clientId)}
                  className="flex items-center gap-2 text-left font-semibold text-gray-900 hover:text-yellow-700 cursor-pointer"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: clientColor(client.clientId) }}
                    aria-hidden="true"
                  />
                  {client.clientName}
                </button>
              </td>
              {METRIC_LIST.map((def) => {
                const m = client.metrics[def.id];
                const max = columnMax[def.id] || 1;
                const fill = Math.max(0, Math.min(1, m.value / max));
                return (
                  <td key={def.id} className="px-4 py-3 align-top">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums text-gray-900">
                        {formatValue(def.unit, m.value, client.currency)}
                      </span>
                      <DeltaChip pct={deltaPct(m.value, m.prior)} better={def.better} />
                      <span className="mt-0.5 h-1 w-16 overflow-hidden rounded-full bg-gray-100">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${fill * 100}%`,
                            backgroundColor: clientColor(client.clientId),
                            opacity: 0.55,
                          }}
                        />
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface ThProps {
  children: React.ReactNode;
  active: boolean;
  asc: boolean;
  onClick: () => void;
  align?: 'left' | 'right';
}

const Th: React.FC<ThProps> = ({ children, active, asc, onClick, align = 'left' }) => (
  <th
    className={clsx(
      'px-4 py-2.5 text-xs font-bold uppercase tracking-wide',
      align === 'right' ? 'text-right' : 'text-left'
    )}
  >
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1 cursor-pointer transition-colors',
        active ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
      )}
    >
      {children}
      {active ? <span aria-hidden="true">{asc ? '▲' : '▼'}</span> : null}
    </button>
  </th>
);

export default ClientMatrix;
