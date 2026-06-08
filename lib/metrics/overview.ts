import { createSupabaseAdmin } from '@/lib/supabase';
import type { ClientListItem, DateRange, MetricsOverview, Scope } from './types';
import { getBookingData } from './providers/bookings';
import { aggregatePortfolio, buildClientMetrics, computeAttention } from './compute';

export async function getClientList(): Promise<ClientListItem[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name')
    .eq('active', true)
    .order('client_name');

  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.client_name as string }));
}

export async function getMetricsOverview(
  scope: Scope,
  range: DateRange,
  clientList?: ClientListItem[]
): Promise<MetricsOverview> {
  const allClients = clientList ?? (await getClientList());
  const selected =
    scope === 'all' ? allClients : allClients.filter((c) => scope.includes(c.id));

  const bookingData = await getBookingData(selected, range);
  const clients = bookingData.map(buildClientMetrics);

  return {
    range,
    clients,
    portfolio: aggregatePortfolio(bookingData),
    attention: computeAttention(clients),
  };
}
