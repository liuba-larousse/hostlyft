import { createSupabaseAdmin } from '@/lib/supabase';
import type { ParsedBooking } from '@/lib/pricelabs/parse';

export async function upsertBookings(
  clientId: string,
  reportDate: string,
  bookings: ParsedBooking[]
): Promise<void> {
  if (!bookings.length) return;
  const supabase = createSupabaseAdmin();

  const rows = bookings.map(b => ({
    client_id: clientId,
    report_date: reportDate,
    reservation_id: b.reservationId,
    listing_name: b.listingName,
    checkin_date: b.checkinDate,
    checkout_date: b.checkoutDate,
    booked_date: b.bookedDate,
    adr: b.adr,
    rental_revenue: b.rentalRevenue,
    total_revenue: b.totalRevenue,
    los: b.los,
    booking_window: b.bookingWindow,
    booking_source: b.bookingSource,
    currency: b.currency,
  }));

  const { error } = await supabase
    .from('booking_reports')
    .upsert(rows, { onConflict: 'client_id,reservation_id,report_date' });

  if (error) throw new Error(`Failed to upsert bookings: ${error.message}`);
}

export interface BookingRow {
  id: string;
  client_id: string;
  report_date: string;
  reservation_id: string;
  listing_name: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  booked_date: string | null;
  adr: number | null;
  rental_revenue: number | null;
  total_revenue: number | null;
  los: number | null;
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

export async function getReportsByDate(reportDate: string): Promise<ClientSummary[]> {
  const supabase = createSupabaseAdmin();

  // Fetch all active clients
  const { data: clients } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name')
    .eq('active', true)
    .order('client_name');

  if (!clients?.length) return [];

  // Fetch today's bookings
  const { data: todayRows, error } = await supabase
    .from('booking_reports')
    .select('*')
    .eq('report_date', reportDate)
    .order('listing_name');

  if (error) throw new Error(`Failed to fetch reports: ${error.message}`);

  // Group today's bookings by client
  const byClient = new Map<string, BookingRow[]>();
  for (const row of todayRows ?? []) {
    if (!byClient.has(row.client_id)) byClient.set(row.client_id, []);
    byClient.get(row.client_id)!.push(row as BookingRow);
  }

  // For clients with no bookings today, fetch their last booking
  const missingIds = clients.filter(c => !byClient.has(c.id)).map(c => c.id);
  const lastBookingMap = new Map<string, BookingRow>();

  if (missingIds.length) {
    const { data: allRecent } = await supabase
      .from('booking_reports')
      .select('*')
      .in('client_id', missingIds)
      .order('booked_date', { ascending: false });

    // Keep only the most recent booking per client
    for (const row of allRecent ?? []) {
      if (!lastBookingMap.has(row.client_id)) {
        lastBookingMap.set(row.client_id, row as BookingRow);
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
