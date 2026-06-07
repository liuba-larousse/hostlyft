import { createSupabaseAdmin } from '@/lib/supabase';
import type { ParsedReservation } from '@/lib/pricelabs/reservations';

export interface ReservationRow {
  id: string;
  client_id: string;
  listing_id: string;
  pms: string | null;
  reservation_id: string;
  listing_name: string | null;
  status: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  booked_date: string | null;
  nights: number | null;
  adr: number | null;
  rental_revenue: number | null;
  total_revenue: number | null;
  booking_window: number | null;
  booking_source: string | null;
  currency: string | null;
}

/** Upsert reservations for a client. Stored per listing_id (the API is fetched per listing). */
export async function upsertReservations(
  clientId: string,
  reservations: ParsedReservation[],
): Promise<number> {
  if (!reservations.length) return 0;
  const supabase = createSupabaseAdmin();

  const rows = reservations.map(r => ({
    client_id: clientId,
    listing_id: r.listingId,
    pms: r.pms || null,
    reservation_id: r.reservationId,
    listing_name: r.listingName || null,
    status: r.status || null,
    checkin_date: r.checkinDate || null,
    checkout_date: r.checkoutDate || null,
    booked_date: r.bookedDate || null,
    nights: r.nights || null,
    adr: r.adr || null,
    rental_revenue: r.rentalRevenue || null,
    total_revenue: r.totalRevenue || null,
    booking_window: r.bookingWindow || null,
    booking_source: r.bookingSource || null,
    currency: r.currency || 'USD',
    raw: r.raw,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('reservations')
    .upsert(rows, { onConflict: 'client_id,listing_id,reservation_id' });

  if (error) throw new Error(`Failed to upsert reservations: ${error.message}`);
  return rows.length;
}

export interface ReservationQuery {
  clientId?: string;
  listingId?: string;
  /** Filter on checkin_date overlapping [from, to] when provided. */
  from?: string;
  to?: string;
  /** Exclude cancelled reservations (default true). */
  excludeCancelled?: boolean;
}

/** Fetch reservation rows, optionally scoped by client/listing/date window. */
export async function getReservations(q: ReservationQuery = {}): Promise<ReservationRow[]> {
  const supabase = createSupabaseAdmin();
  let query = supabase.from('reservations').select('*');

  if (q.clientId) query = query.eq('client_id', q.clientId);
  if (q.listingId) query = query.eq('listing_id', q.listingId);
  // Reservation is active in the window if its stay overlaps [from, to].
  if (q.to) query = query.lte('checkin_date', q.to);
  if (q.from) query = query.gte('checkout_date', q.from);
  if (q.excludeCancelled !== false) query = query.neq('status', 'cancelled');

  const { data, error } = await query.order('checkin_date', { ascending: true });
  if (error) throw new Error(`Failed to fetch reservations: ${error.message}`);
  return (data ?? []) as ReservationRow[];
}
