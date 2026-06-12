import React from 'react';
import type { ClientDetail } from '@/lib/metrics/client-detail';
import type { DateRange } from '@/lib/metrics/types';
import { METRIC_LIST } from '@/lib/metrics/registry';
import { clientColor } from '@/lib/metrics/colors';
import { formatValue } from '@/lib/metrics/format';
import { KpiCard } from './KpiCard';
import { BulletRow } from './BulletRow';
import { TrendChart } from './TrendChart';
import { ReviewScores } from './ReviewScores';

interface ClientViewProps {
  detail: ClientDetail;
  range: DateRange;
}

const SectionTitle: React.FC<{ children: React.ReactNode; note?: string }> = ({
  children,
  note,
}) => (
  <div className="mb-2 flex items-baseline justify-between">
    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">{children}</h2>
    {note ? <span className="text-xs text-gray-400">{note}</span> : null}
  </div>
);

export const ClientView: React.FC<ClientViewProps> = ({ detail, range }) => {
  const { client, bookings, portfolio, ota } = detail;
  const color = clientColor(client.id);
  const months = portfolio?.months ?? [];
  const vsLabel = bookings.comparedToPreviousPeriod ? 'vs prev period' : `vs ${range.compareLabel}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <h1 className="text-lg font-bold text-gray-900">{client.name}</h1>
      </div>

      {/* Bookings KPIs — range-driven */}
      <section>
        <SectionTitle note={range.label}>Bookings</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {METRIC_LIST.map((def) => (
            <KpiCard
              key={def.id}
              def={def}
              metric={bookings.metrics[def.id]}
              currency={bookings.currency}
              vsLabel={vsLabel}
            />
          ))}
        </div>
      </section>

      {/* Performance computed from reservations: occupancy = booked nights ÷
          (listings × calendar days). Headline is the current calendar year. */}
      {portfolio && portfolio.currentYear ? (
        <section>
          <SectionTitle
            note={`${portfolio.currentYear.year} · booked nights ÷ listings × calendar days`}
          >
            Performance
          </SectionTitle>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <BulletRow label="Occupancy" value={portfolio.currentYear.occupancy} unit="percent" />
            <BulletRow label="RevPAR" value={portfolio.currentYear.revpar} unit="currency" />
            <BulletRow label="ADR" value={portfolio.currentYear.adr} unit="currency" />
            {portfolio.cancellations && portfolio.cancellations.count > 0 ? (
              <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{portfolio.cancellations.count}</span>{' '}
                cancellations in {portfolio.cancellations.year} ·{' '}
                {formatValue('currency', portfolio.cancellations.rentalAmount, bookings.currency)} rental
                value (excluded from revenue)
              </p>
            ) : null}
          </div>

          {months.length > 1 ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="mb-2 text-sm font-semibold text-gray-700">Occupancy %</p>
                <TrendChart
                  data={months}
                  xKey="label"
                  yFormat="percent"
                  series={[{ key: 'occupancy', name: 'Occupancy', color }]}
                />
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="mb-2 text-sm font-semibold text-gray-700">RevPAR</p>
                <TrendChart
                  data={months}
                  xKey="label"
                  yFormat="currency"
                  series={[{ key: 'revpar', name: 'RevPAR', color }]}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Per-listing occupancy — reserved dates ÷ calendar days of the year */}
      {portfolio && portfolio.byListing.length > 0 ? (
        <section>
          <SectionTitle note={`${portfolio.currentYear?.year ?? ''} · occupancy per listing`}>
            By listing
          </SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-400">Listing</th>
                  <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Occupancy</th>
                  <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Nights</th>
                  <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.byListing.map((l, i) => (
                  <tr key={`${l.listing}-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="max-w-xs truncate px-4 py-2.5 text-gray-900">{l.listing}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">{l.occupancy.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{l.bookedNights}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{formatValue('currency', l.revenue, bookings.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Reviews — ota_scores */}
      {ota.length > 0 ? (
        <section>
          <SectionTitle>Reviews</SectionTitle>
          <ReviewScores ota={ota} />
        </section>
      ) : null}

      {!portfolio && ota.length === 0 ? (
        <p className="text-sm text-gray-500">
          No portfolio or review data synced for this client yet — showing bookings only.
        </p>
      ) : null}
    </div>
  );
};

export default ClientView;
