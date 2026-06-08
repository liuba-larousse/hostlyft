import React from 'react';
import { clsx } from 'clsx';
import type { Direction } from '@/lib/metrics/types';
import { formatPct } from '@/lib/metrics/format';

interface DeltaChipProps {
  /** Fractional change vs prior (0.083 = +8.3%). null renders a muted dash. */
  pct: number | null;
  better?: Direction | 'neutral';
  vsLabel?: string;
  size?: 'sm' | 'md';
}

const NEUTRAL_BAND = 0.005; // treat |Δ| < 0.5% as flat

/** Single shared delta vocabulary: ▲ good / ▼ bad / ═ flat. Used everywhere. */
export const DeltaChip: React.FC<DeltaChipProps> = ({
  pct,
  better = 'higher',
  vsLabel,
  size = 'sm',
}) => {
  const text = size === 'sm' ? 'text-xs' : 'text-sm';

  if (pct === null) {
    return <span className={clsx(text, 'text-gray-300 tabular-nums')}>—</span>;
  }

  const flat = Math.abs(pct) < NEUTRAL_BAND;
  const up = pct > 0;
  const good =
    better === 'neutral' ? null : better === 'higher' ? up : !up;

  const tone = flat || good === null
    ? 'text-gray-500'
    : good
      ? 'text-green-600'
      : 'text-red-600';
  const arrow = flat ? '═' : up ? '▲' : '▼';

  return (
    <span className={clsx(text, tone, 'tabular-nums whitespace-nowrap font-medium')}>
      {arrow} {formatPct(Math.abs(pct))}
      {vsLabel ? <span className="text-gray-400 font-normal"> {vsLabel}</span> : null}
    </span>
  );
};

export default DeltaChip;
