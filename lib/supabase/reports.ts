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
}

export async function getReportsByDate(reportDate: string): Promise<ClientSummary[]> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('booking_reports')
    .select(`
      *,
      pricelabs_clients ( client_name )
    `)
    .eq('report_date', reportDate)
    .order('listing_name');

  if (error) throw new Error(`Failed to fetch reports: ${error.message}`);

  // Group by client
  const byClient = new Map<string, { clientName: string; bookings: BookingRow[] }>();
  for (const row of data ?? []) {
    const name = (row.pricelabs_clients as { client_name: string } | null)?.client_name ?? 'Unknown';
    if (!byClient.has(row.client_id)) {
      byClient.set(row.client_id, { clientName: name, bookings: [] });
    }
    byClient.get(row.client_id)!.bookings.push(row as BookingRow);
  }

  return Array.from(byClient.entries()).map(([clientId, { clientName, bookings }]) => ({
    clientId,
    clientName,
    bookings,
    totalBookings: bookings.length,
    totalRevenue: bookings.reduce((sum, b) => sum + (b.total_revenue ?? 0), 0),
  }));
}
