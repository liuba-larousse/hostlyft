import { createSupabaseAdmin } from '@/lib/supabase';

// Reservations are now stored in the `reservations` table (pulled from the
// PriceLabs API per listing). This module keeps the BookingRow/ClientSummary
// shape the Booking Reports page expects, mapping over reservation rows.

export interface BookingRow {
  id: string;
  client_id: string;
  reservation_id: string;
  listing_name: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  booked_date: string | null;
  adr: number | null;
  rental_revenue: number | null;
  total_revenue: number | null;
  los: number | null;            // length of stay (reservations.nights)
  booking_window: number | null;
  booking_source: string | null;
  currency: string | null;
}

export interface ClientSummary {
  clientId: string;
  clientName: string;
  bookings: BookingRow[];
  totalBookings: number;
  totalRevenue: number;
  lastBooking?: BookingRow; // most recent booking from any date, when today has none
}

type ReservationRecord = {
  id: string;
  client_id: string;
  reservation_id: string;
  listing_name: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  booked_date: string | null;
  adr: number | null;
  rental_revenue: number | null;
  total_revenue: number | null;
  nights: number | null;
  booking_window: number | null;
  booking_source: string | null;
  currency: string | null;
};

const SELECT =
  'id, client_id, reservation_id, listing_name, checkin_date, checkout_date, ' +
  'booked_date, adr, rental_revenue, total_revenue, nights, booking_window, booking_source, currency';

function toBookingRow(r: ReservationRecord): BookingRow {
  return {
    id: r.id,
    client_id: r.client_id,
    reservation_id: r.reservation_id,
    listing_name: r.listing_name,
    checkin_date: r.checkin_date,
    checkout_date: r.checkout_date,
    booked_date: r.booked_date,
    adr: r.adr,
    rental_revenue: r.rental_revenue,
    total_revenue: r.total_revenue,
    los: r.nights,
    booking_window: r.booking_window,
    booking_source: r.booking_source,
    currency: r.currency,
  };
}

export async function getReportsByDate(reportDate: string): Promise<ClientSummary[]> {
  const supabase = createSupabaseAdmin();

  // Fetch all active clients
  const { data: clients } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name')
    .eq('active', true)
    .order('client_name');

  if (!clients?.length) return [];

  // Reservations booked on the target date.
  const { data: todayRows, error } = await supabase
    .from('reservations')
    .select(SELECT)
    .eq('booked_date', reportDate)
    .neq('status', 'cancelled')
    .order('listing_name');

  if (error) throw new Error(`Failed to fetch reservations: ${error.message}`);

  // Group today's reservations by client
  const byClient = new Map<string, BookingRow[]>();
  for (const row of (todayRows ?? []) as unknown as ReservationRecord[]) {
    const mapped = toBookingRow(row);
    if (!byClient.has(row.client_id)) byClient.set(row.client_id, []);
    byClient.get(row.client_id)!.push(mapped);
  }

  // For clients with no bookings today, fetch their last booking
  const missingIds = clients.filter(c => !byClient.has(c.id)).map(c => c.id);
  const lastBookingMap = new Map<string, BookingRow>();

  if (missingIds.length) {
    const { data: allRecent } = await supabase
      .from('reservations')
      .select(SELECT)
      .in('client_id', missingIds)
      .neq('status', 'cancelled')
      .order('booked_date', { ascending: false });

    // Keep only the most recent booking per client
    for (const row of (allRecent ?? []) as unknown as ReservationRecord[]) {
      if (!lastBookingMap.has(row.client_id)) {
        lastBookingMap.set(row.client_id, toBookingRow(row));
      }
    }
  }

  return clients.map(client => {
    const bookings = byClient.get(client.id) ?? [];
    return {
      clientId: client.id,
      clientName: client.client_name,
      bookings,
      totalBookings: bookings.length,
      totalRevenue: bookings.reduce((sum, b) => sum + (b.total_revenue ?? 0), 0),
      lastBooking: bookings.length === 0 ? lastBookingMap.get(client.id) : undefined,
    };
  });
}
