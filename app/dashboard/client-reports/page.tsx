import { createSupabaseAdmin } from '@/lib/supabase';
import { getReportsByDate } from '@/lib/supabase/reports';
import { FileText, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';
import SyncButton from '@/components/dashboard/SyncButton';
import PriceLabsClients from '@/components/dashboard/PriceLabsClients';

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function getLastSyncedAt(reportDate: string): Promise<string | null> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('booking_reports')
    .select('created_at')
    .eq('report_date', reportDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}

async function getPriceLabsClients() {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name, email, active, hubspot_contact_id, created_at')
    .order('client_name');
  return data ?? [];
}

async function getHubSpotContacts() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts?properties=firstname,lastname,email,company,lifecyclestage&limit=100',
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? [])
      .filter((c: { properties: Record<string, string> }) => c.properties.lifecyclestage === 'customer')
      .map((c: { id: string; properties: Record<string, string> }) => {
        const p = c.properties;
        const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || 'Unknown';
        return { id: c.id, name, company: p.company || '', email: p.email || '' };
      }).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
  } catch { return []; }
}

export default async function ClientReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === 'clients' ? 'clients' : 'reports';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const reportDate = yesterday.toISOString().split('T')[0];

  const displayDate = yesterday.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const [summaries, lastSyncedAt, clients, contacts] = await Promise.all([
    activeTab === 'reports' ? getReportsByDate(reportDate) : Promise.resolve([]),
    activeTab === 'reports' ? getLastSyncedAt(reportDate) : Promise.resolve(null),
    activeTab === 'clients' ? getPriceLabsClients() : Promise.resolve([]),
    activeTab === 'clients' ? getHubSpotContacts() : Promise.resolve([]),
  ]);

  const lastSynced = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <div className="p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-indigo-50">
              <FileText size={20} className="text-indigo-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Client Reports</h1>
          </div>
          {activeTab === 'reports' && (
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
          )}
        </div>
        {activeTab === 'reports' && <SyncButton />}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <Link
          href="/dashboard/client-reports"
          className={clsx(
            'px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors -mb-px',
            activeTab === 'reports'
              ? 'text-gray-900 border-b-2 border-yellow-400'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Daily Reports
        </Link>
        <Link
          href="/dashboard/client-reports?tab=clients"
          className={clsx(
            'px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors -mb-px',
            activeTab === 'clients'
              ? 'text-gray-900 border-b-2 border-yellow-400'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Manage Clients
        </Link>
      </div>

      {/* ── Reports tab ── */}
      {activeTab === 'reports' && (
        <>
          {summaries.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <FileText size={24} className="text-gray-400" strokeWidth={1.8} />
              </div>
              <p className="text-gray-900 font-semibold text-base mb-1">No report data yet</p>
              <p className="text-gray-500 text-sm mb-6">
                The daily sync runs at 8 AM UTC. You can also trigger it manually.
              </p>
              <SyncButton />
            </div>
          )}

          <div className="space-y-8">
            {summaries.map(({ clientId, clientName, bookings, totalBookings, totalRevenue }) => (
              <div key={clientId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <span className="text-indigo-600 font-bold text-sm">
                        {clientName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <h2 className="font-semibold text-gray-900 text-base">{clientName}</h2>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Bookings</p>
                      <p className="text-gray-900 font-bold text-lg">{totalBookings}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Total Revenue</p>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-emerald-500" strokeWidth={2} />
                        <p className="text-emerald-600 font-bold text-lg">{formatCurrency(totalRevenue)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {bookings.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-400 text-sm">No bookings for this date</div>
                ) : (
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
                            <td className="px-4 py-3.5 text-gray-600 text-right">{b.adr ? formatCurrency(b.adr) : '—'}</td>
                            <td className="px-6 py-3.5 text-gray-900 font-semibold text-right">
                              {b.total_revenue ? formatCurrency(b.total_revenue) : '—'}
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
      )}

      {/* ── Clients tab ── */}
      {activeTab === 'clients' && (
        <PriceLabsClients contacts={contacts} initialClients={clients} />
      )}
    </div>
  );
}
