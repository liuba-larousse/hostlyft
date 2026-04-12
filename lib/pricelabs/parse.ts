import * as XLSX from 'xlsx';

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
  currency: string;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function parseBookingsXlsx(buffer: Buffer, filterDate?: string): ParsedBooking[] {
  const targetDate = filterDate ?? yesterday();

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Parse with dates as JS Date objects
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  const bookings: ParsedBooking[] = [];

  for (const row of rows) {
    const bookedRaw = String(row['Booked Date'] ?? '').trim();
    if (!bookedRaw) continue;

    // Normalise to YYYY-MM-DD
    const bookedDate = normaliseDate(bookedRaw);
    if (bookedDate !== targetDate) continue;

    const reservationId = String(row['Reservation ID'] ?? '').trim();
    if (!reservationId) continue;

    bookings.push({
      reservationId,
      listingName: String(row['Listing Name'] ?? '').trim(),
      checkinDate: normaliseDate(String(row['Check-in Date'] ?? '')),
      checkoutDate: normaliseDate(String(row['Check-out Date'] ?? '')),
      bookedDate,
      adr: parseNum(String(row['Average Daily Rate'] ?? '')),
      rentalRevenue: parseNum(String(row['Rental Revenue'] ?? '')),
      totalRevenue: parseNum(String(row['Total Revenue'] ?? '')),
      los: parseInt(String(row['Length of Stay (Days)'] ?? '')) || 0,
      bookingWindow: parseInt(String(row['Booking Window (Days)'] ?? '')) || 0,
      bookingSource: String(row['Booking Source'] ?? '').trim(),
      currency: String(row['Currency'] ?? 'USD').trim().toUpperCase() || 'USD',
    });
  }

  return bookings;
}

// Accept YYYY-MM-DD, MM/DD/YYYY, or DD/MM/YYYY
function normaliseDate(val: string): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return val;
}

function parseNum(val: string): number {
  return parseFloat(val.replace(/[^0-9.-]/g, '')) || 0;
}
