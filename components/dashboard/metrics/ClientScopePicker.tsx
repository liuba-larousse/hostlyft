'use client';

import React, { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import type { ClientListItem, RangePreset } from '@/lib/metrics/types';
import { clientColor } from '@/lib/metrics/colors';

interface ClientScopePickerProps {
  clients: ClientListItem[];
  selected: 'all' | string[];
  preset: RangePreset;
}

const RANGE_OPTIONS: { value: RangePreset; label: string; title: string }[] = [
  { value: '7d', label: '7d', title: 'Bookings made in the last 7 days — vs the previous 7 days' },
  { value: '30d', label: '30d', title: 'Bookings made in the last 30 days — vs the previous 30 days' },
  { value: 'mtd', label: 'Month', title: 'Full-month revenue incl. upcoming booked stays — vs all of last year’s month' },
  { value: 'qtd', label: 'Q', title: 'Full-quarter revenue incl. upcoming booked stays — vs all of last year’s quarter' },
  { value: 'ytd', label: 'Year', title: 'Full-year revenue incl. upcoming booked stays — vs all of last year' },
];

export const ClientScopePicker: React.FC<ClientScopePickerProps> = ({
  clients,
  selected,
  preset,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedSet = useMemo(
    () => (selected === 'all' ? null : new Set(selected)),
    [selected]
  );

  const push = useCallback(
    (clientsParam: string, rangeParam: RangePreset) => {
      const params = new URLSearchParams(searchParams.toString());
      if (clientsParam === 'all') params.delete('clients');
      else params.set('clients', clientsParam);
      params.set('range', rangeParam);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const toggleClient = useCallback(
    (id: string) => {
      const next = new Set(selectedSet ?? clients.map((c) => c.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const allSelected = next.size === 0 || next.size === clients.length;
      push(allSelected ? 'all' : [...next].join(','), preset);
    },
    [selectedSet, clients, push, preset]
  );

  const selectAll = useCallback(() => push('all', preset), [push, preset]);

  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-gray-200 pb-4 print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={selected === 'all'} onClick={selectAll}>
          All clients
        </Chip>
        {clients.map((c) => {
          const active = selectedSet?.has(c.id) ?? false;
          return (
            <Chip key={c.id} active={active} onClick={() => toggleClient(c.id)}>
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: clientColor(c.id) }}
                aria-hidden="true"
              />
              {c.name}
            </Chip>
          );
        })}
      </div>

      <div className="flex items-center gap-1 self-start rounded-lg bg-gray-100 p-0.5">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() =>
              push(selected === 'all' ? 'all' : selected.join(','), opt.value)
            }
            className={clsx(
              'rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer',
              opt.value === preset
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const Chip: React.FC<ChipProps> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
      active
        ? 'border-yellow-400 bg-yellow-50 text-gray-900'
        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
    )}
  >
    {children}
  </button>
);

export default ClientScopePicker;
