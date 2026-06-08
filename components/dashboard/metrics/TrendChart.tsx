'use client';

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export interface TrendSeries {
  key: string;
  name: string;
  color: string;
}

interface TrendChartProps {
  data: readonly object[];
  xKey: string;
  series: TrendSeries[];
  height?: number;
  /** String key (not a function) so this stays usable from server components. */
  yFormat?: 'percent' | 'currency' | 'number';
}

const Y_FORMATTERS: Record<string, (value: number) => string> = {
  percent: (v) => `${Math.round(v)}%`,
  currency: (v) => `$${Math.round(v)}`,
  number: (v) => `${Math.round(v)}`,
};

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  xKey,
  series,
  height = 240,
  yFormat = 'number',
}) => {
  const yTickFormatter = Y_FORMATTERS[yFormat];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
        />
        <YAxis
          width={44}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            boxShadow: 'none',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            strokeDasharray={s.key.endsWith('LY') ? '4 3' : undefined}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default TrendChart;
