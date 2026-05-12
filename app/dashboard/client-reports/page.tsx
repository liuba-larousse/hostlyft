import { createSupabaseAdmin } from '@/lib/supabase';
import { getReportsByDate } from '@/lib/supabase/reports';
import { FileText, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import SyncButton from '@/components/dashboard/SyncButton';

function formatCurrency(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function getLastSyncedAt(): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('booking_reports')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}

async function getLatestBookedDate(): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('booking_reports')
    .select('booked_date')
    .order('booked_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.booked_date ?? null;
}

export default async function BookingsPage() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Try yesterday first; if no bookings, fall back to the latest available booked_date
  let summaries = await getReportsByDate(yesterdayStr);
  let reportDate = yesterdayStr;
  const hasBookings = summaries.some(s => s.bookings.length > 0);
  if (!hasBookings) {
    const latest = await getLatestBookedDate();
    if (latest && latest !== yesterdayStr) {
      reportDate = latest;
      summaries = await getReportsByDate(latest);
    }
  }

  const reportDateObj = new Date(reportDate + 'T00:00:00');
  const displayDate = reportDateObj.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const lastSyncedAt = await getLastSyncedAt();

  const lastSynced = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-indigo-50">
              <FileText size={20} className="text-indigo-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Booking Reports</h1>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" strokeWidth={1.8} />
              <p className="text-gray-500 text-sm">Bookings from {displayDate}</p>
            </div>
            {lastSynced && (
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-gray-400" strokeWidth={1.8} />
                <p className="text-gray-400 text-sm">Last synced {lastSynced}</p>
              </div>
            )}
          </div>
        </div>
        <SyncButton />
      </div>

      {summaries.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-gray-400" strokeWidth={1.8} />
          </div>
          <p className="text-gray-900 font-semibold text-base mb-1">No clients synced yet</p>
          <p className="text-gray-500 text-sm mb-6">Add clients in the Clients page, then click Sync Now.</p>
          <SyncButton />
        </div>
      )}

      <div className="space-y-8">
        {summaries.map(({ clientId, clientName, bookings, totalBookings, totalRevenue, lastBooking }) => (
          <div key={clientId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <span className="text-indigo-600 font-bold text-sm">{clientName.charAt(0).toUpperCase()}</span>
                </div>
                <h2 className="font-semibold text-gray-900 text-base">{clientName}</h2>
              </div>
              {bookings.length > 0 && (
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Bookings</p>
                    <p className="text-gray-900 font-bold text-lg">{totalBookings}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Total Revenue</p>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={14} className="text-emerald-500" strokeWidth={2} />
                      <p className="text-emerald-600 font-bold text-lg">{formatCurrency(totalRevenue, bookings[0]?.currency ?? 'USD')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {bookings.length === 0 && (
              <div className="px-6 py-5">
                <p className="text-sm font-medium text-gray-500 mb-4">No new bookings today</p>
                {lastBooking ? (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Last booking received</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 rounded-lg">
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Listing</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Booked</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check-in</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check-out</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-4 py-3 font-medium text-gray-900 max-w-48 truncate">{lastBooking.listing_name || '—'}</td>
                            <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(lastBooking.booked_date)}</td>
                            <td className="px-4 py-3 text-gray-600">{formatDate(lastBooking.checkin_date)}</td>
                            <td className="px-4 py-3 text-gray-600">{formatDate(lastBooking.checkout_date)}</td>
                            <td className="px-4 py-3 text-gray-900 font-semibold text-right">
                              {lastBooking.total_revenue ? formatCurrency(lastBooking.total_revenue, lastBooking.currency ?? 'USD') : '—'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No historical bookings found for this client.</p>
                )}
              </div>
            )}

            {bookings.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Listing</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check-in</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check-out</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LOS</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">BW</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ADR</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bookings.map(b => (
                      <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-gray-900 max-w-48 truncate">{b.listing_name || '—'}</td>
                        <td className="px-4 py-3.5 text-gray-600">{formatDate(b.checkin_date)}</td>
                        <td className="px-4 py-3.5 text-gray-600">{formatDate(b.checkout_date)}</td>
                        <td className="px-4 py-3.5 text-gray-600 text-right">{b.los ?? '—'}</td>
                        <td className="px-4 py-3.5 text-gray-600 text-right">{b.booking_window ?? '—'}</td>
                        <td className="px-4 py-3.5 text-gray-600 text-right">{b.adr ? formatCurrency(b.adr, b.currency ?? 'USD') : '—'}</td>
                        <td className="px-6 py-3.5 text-gray-900 font-semibold text-right">
                          {b.total_revenue ? formatCurrency(b.total_revenue, b.currency ?? 'USD') : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          {b.booking_source ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                              {b.booking_source}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
