import Papa from 'papaparse';

export interface ParsedBooking {
  reservationId: string;
  listingName: string;
  checkinDate: string;
  checkoutDate: string;
  bookedDate: string;
  adr: number;
  rentalRevenue: number;
  totalRevenue: number;
  los: number;
  bookingWindow: number;
  bookingSource: string;
}

// Normalise header names from PriceLabs CSV (case-insensitive, strip spaces)
function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, '');
}

const HEADER_MAP: Record<string, keyof ParsedBooking> = {
  // Reservation ID variants
  reservationid: 'reservationId',
  reservation: 'reservationId',
  confirmationcode: 'reservationId',
  confirmation: 'reservationId',
  bookingid: 'reservationId',
  id: 'reservationId',
  // Listing
  listingname: 'listingName',
  listing: 'listingName',
  property: 'listingName',
  propertyname: 'listingName',
  unit: 'listingName',
  // Check-in
  checkin: 'checkinDate',
  checkindate: 'checkinDate',
  'check-in': 'checkinDate',
  arrivaldate: 'checkinDate',
  arrival: 'checkinDate',
  // Check-out
  checkout: 'checkoutDate',
  checkoutdate: 'checkoutDate',
  'check-out': 'checkoutDate',
  departuredate: 'checkoutDate',
  departure: 'checkoutDate',
  // Booked date
  bookeddate: 'bookedDate',
  bookingdate: 'bookedDate',
  datebooked: 'bookedDate',
  created: 'bookedDate',
  createddate: 'bookedDate',
  // Revenue
  adr: 'adr',
  averagedailyrate: 'adr',
  avgdailyrate: 'adr',
  rentalrevenue: 'rentalRevenue',
  netrevenue: 'rentalRevenue',
  totalrevenue: 'totalRevenue',
  grossrevenue: 'totalRevenue',
  revenue: 'totalRevenue',
  // LOS
  los: 'los',
  lengthofstay: 'los',
  nights: 'los',
  // Booking window
  bookingwindow: 'bookingWindow',
  bw: 'bookingWindow',
  leadtime: 'bookingWindow',
  // Source
  bookingsource: 'bookingSource',
  source: 'bookingSource',
  channel: 'bookingSource',
  platform: 'bookingSource',
};

function parseDate(val: string): string {
  if (!val) return '';
  // Handle MM/DD/YYYY and YYYY-MM-DD
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toISOString().split('T')[0];
}

function parseNum(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[^0-9.-]/g, '')) || 0;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function parseBookingsCsv(csv: string, filterDate?: string): ParsedBooking[] {
  const targetDate = filterDate ?? yesterday();

  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length) {
    console.warn('CSV parse warnings:', result.errors.slice(0, 3));
  }

  const headers = result.meta.fields ?? [];
  // Build mapping: original header → ParsedBooking key
  const colMap = new Map<string, keyof ParsedBooking>();
  for (const h of headers) {
    const key = HEADER_MAP[normalise(h)];
    if (key) colMap.set(h, key);
  }

  const bookings: ParsedBooking[] = [];

  for (const row of result.data) {
    const mapped: Partial<ParsedBooking> = {};
    for (const [col, field] of colMap) {
      const val = (row[col] ?? '').trim();
      if (['adr', 'rentalRevenue', 'totalRevenue'].includes(field)) {
        (mapped as Record<string, unknown>)[field] = parseNum(val);
      } else if (['los', 'bookingWindow'].includes(field)) {
        (mapped as Record<string, unknown>)[field] = parseInt(val) || 0;
      } else if (['checkinDate', 'checkoutDate', 'bookedDate'].includes(field)) {
        (mapped as Record<string, unknown>)[field] = parseDate(val);
      } else {
        (mapped as Record<string, unknown>)[field] = val;
      }
    }

    // Filter to target date
    if (mapped.bookedDate && mapped.bookedDate !== targetDate) continue;

    // Fallback reservation ID: use first column value if not mapped
    if (!mapped.reservationId) {
      const firstVal = Object.values(row)[0]?.trim();
      if (firstVal) mapped.reservationId = firstVal;
    }

    // Skip rows without any reservation ID
    if (!mapped.reservationId) continue;

    bookings.push({
      reservationId: mapped.reservationId ?? '',
      listingName: mapped.listingName ?? '',
      checkinDate: mapped.checkinDate ?? '',
      checkoutDate: mapped.checkoutDate ?? '',
      bookedDate: mapped.bookedDate ?? targetDate,
      adr: mapped.adr ?? 0,
      rentalRevenue: mapped.rentalRevenue ?? 0,
      totalRevenue: mapped.totalRevenue ?? 0,
      los: mapped.los ?? 0,
      bookingWindow: mapped.bookingWindow ?? 0,
      bookingSource: mapped.bookingSource ?? '',
    });
  }

  return bookings;
}
