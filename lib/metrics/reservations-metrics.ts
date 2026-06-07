// Metric calculations executed on top of reservation data + per-listing data.
//
// Given reservations (from the `reservations` table) and listings (from
// `listing_groups`), compute occupancy, ADR, RevPAR, revenue and reservation
// counts for a date window — per listing, rolled up to building group and client.
//
// Stays that straddle the window boundary are prorated by the number of nights
// that actually fall inside [from, to).

import type { ReservationRow } from '@/lib/supabase/reservations';

export interface ListingInfo {
  listing_id: string;
  listing_name: string | null;
  building_group: string | null;
  bedroom_count: number | null;
}

export interface Metrics {
  availableNights: number;
  bookedNights: number;
  occupancy: number;      // 0..1
  rentalRevenue: number;
  totalRevenue: number;
  adr: number;            // rentalRevenue / bookedNights
  revpar: number;         // rentalRevenue / availableNights
  reservations: number;
}

export interface ListingMetrics extends Metrics {
  listingId: string;
  listingName: string | null;
  buildingGroup: string | null;
}

export interface MetricsBreakdown {
  range: { from: string; to: string; nights: number };
  listings: ListingMetrics[];
  byBuilding: (Metrics & { buildingGroup: string; listings: number })[];
  total: Metrics & { listings: number };
}

const MS_PER_DAY = 86_400_000;

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

function nightsBetween(from: string, to: string): number {
  const days = Math.round((toDate(to).getTime() - toDate(from).getTime()) / MS_PER_DAY);
  return days > 0 ? days : 0;
}

/** Nights of a reservation's stay that fall within [windowFrom, windowTo). */
function overlapNights(
  checkin: string | null,
  checkout: string | null,
  windowFrom: string,
  windowTo: string,
): number {
  if (!checkin || !checkout) return 0;
  const start = Math.max(toDate(checkin).getTime(), toDate(windowFrom).getTime());
  const end = Math.min(toDate(checkout).getTime(), toDate(windowTo).getTime());
  const nights = Math.round((end - start) / MS_PER_DAY);
  return nights > 0 ? nights : 0;
}

function emptyMetrics(availableNights: number): Metrics {
  return {
    availableNights,
    bookedNights: 0,
    occupancy: 0,
    rentalRevenue: 0,
    totalRevenue: 0,
    adr: 0,
    revpar: 0,
    reservations: 0,
  };
}

function finalize(m: Metrics): Metrics {
  m.occupancy = m.availableNights > 0 ? m.bookedNights / m.availableNights : 0;
  m.adr = m.bookedNights > 0 ? m.rentalRevenue / m.bookedNights : 0;
  m.revpar = m.availableNights > 0 ? m.rentalRevenue / m.availableNights : 0;
  return m;
}

/**
 * Compute metrics for a date window.
 * @param from inclusive window start (YYYY-MM-DD)
 * @param to   exclusive window end   (YYYY-MM-DD)
 */
export function computeMetrics(
  reservations: ReservationRow[],
  listings: ListingInfo[],
  from: string,
  to: string,
): MetricsBreakdown {
  const windowNights = nightsBetween(from, to);

  // Seed a metric bucket for every known listing so zero-occupancy listings show up.
  const byListing = new Map<string, ListingMetrics>();
  for (const l of listings) {
    byListing.set(l.listing_id, {
      listingId: l.listing_id,
      listingName: l.listing_name,
      buildingGroup: l.building_group,
      ...emptyMetrics(windowNights),
    });
  }

  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const nights = overlapNights(r.checkin_date, r.checkout_date, from, to);
    if (nights <= 0) continue;

    let bucket = byListing.get(r.listing_id);
    if (!bucket) {
      // Reservation for a listing we don't have metadata for — still count it.
      bucket = {
        listingId: r.listing_id,
        listingName: r.listing_name,
        buildingGroup: null,
        ...emptyMetrics(windowNights),
      };
      byListing.set(r.listing_id, bucket);
    }

    const stayNights = r.nights && r.nights > 0 ? r.nights : nights;
    const adr = r.adr && r.adr > 0
      ? r.adr
      : r.rental_revenue && stayNights > 0
        ? r.rental_revenue / stayNights
        : 0;
    // Prorate revenue to the nights inside the window.
    const rentalRevenue = adr * nights;
    const totalRevenue = r.total_revenue && stayNights > 0
      ? (r.total_revenue / stayNights) * nights
      : rentalRevenue;

    bucket.bookedNights += nights;
    bucket.rentalRevenue += rentalRevenue;
    bucket.totalRevenue += totalRevenue;
    bucket.reservations += 1;
  }

  const listingMetrics = [...byListing.values()].map(m => {
    finalize(m);
    return m;
  });

  // Roll up by building group.
  const buildingMap = new Map<string, Metrics & { buildingGroup: string; listings: number }>();
  for (const m of listingMetrics) {
    const key = m.buildingGroup || 'Unknown';
    let b = buildingMap.get(key);
    if (!b) {
      b = { buildingGroup: key, listings: 0, ...emptyMetrics(0) };
      buildingMap.set(key, b);
    }
    b.listings += 1;
    b.availableNights += m.availableNights;
    b.bookedNights += m.bookedNights;
    b.rentalRevenue += m.rentalRevenue;
    b.totalRevenue += m.totalRevenue;
    b.reservations += m.reservations;
  }
  const byBuilding = [...buildingMap.values()].map(b => {
    finalize(b);
    return b;
  });

  // Portfolio total.
  const total = { listings: 0, ...emptyMetrics(0) };
  for (const m of listingMetrics) {
    total.listings += 1;
    total.availableNights += m.availableNights;
    total.bookedNights += m.bookedNights;
    total.rentalRevenue += m.rentalRevenue;
    total.totalRevenue += m.totalRevenue;
    total.reservations += m.reservations;
  }
  finalize(total);

  return {
    range: { from, to, nights: windowNights },
    listings: listingMetrics.sort((a, b) => b.rentalRevenue - a.rentalRevenue),
    byBuilding: byBuilding.sort((a, b) => b.rentalRevenue - a.rentalRevenue),
    total,
  };
}
