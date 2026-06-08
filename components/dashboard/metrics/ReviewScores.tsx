import React from 'react';
import { clsx } from 'clsx';
import type { OtaListingScore } from '@/lib/metrics/providers/ota';

const OTA_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  vrbo: 'VRBO',
  booking_com: 'Booking.com',
};

// Airbnb is on a 5-point scale; VRBO / Booking.com on 10.
function scaleFor(otaName: string): number {
  return otaName === 'airbnb' ? 5 : 10;
}

function toneFor(score: number, scale: number): string {
  const pct = score / scale;
  if (pct >= 0.96) return 'text-green-600';
  if (pct >= 0.84) return 'text-yellow-600';
  return 'text-red-600';
}

interface ReviewScoresProps {
  ota: OtaListingScore[];
}

export const ReviewScores: React.FC<ReviewScoresProps> = ({ ota }) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {ota.map((listing, i) => {
        const scale = scaleFor(listing.otaName);
        return (
          <div
            key={`${listing.otaName}-${listing.label}-${i}`}
            className="rounded-xl border border-gray-200 bg-white p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {OTA_LABELS[listing.otaName] ?? listing.otaName}
              </span>
              {listing.label ? (
                <span className="max-w-[7rem] truncate text-xs text-gray-400">
                  {listing.label}
                </span>
              ) : null}
            </div>
            {listing.scraped ? (
              <>
                <p className={clsx('mt-1 text-2xl font-bold tabular-nums', toneFor(listing.score, scale))}>
                  {listing.score.toFixed(2)}
                  <span className="text-sm font-medium text-gray-400">/{scale}</span>
                </p>
                <p className="text-xs text-gray-500 tabular-nums">
                  {listing.reviews} reviews
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-400">Not scraped yet</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReviewScores;
