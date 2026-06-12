import type { ClientListItem, ClientMetrics, DateRange } from './types';
import { getBookingData } from './providers/bookings';
import { buildClientMetrics } from './compute';
import { getClientList } from './overview';
import { getPortfolioDetail, type PortfolioDetail } from './providers/portfolio';
import { getOtaByClient, type OtaListingScore } from './providers/ota';

export interface ClientDetail {
  client: ClientListItem;
  bookings: ClientMetrics;
  portfolio: PortfolioDetail | null;
  ota: OtaListingScore[];
}

export async function getClientDetail(
  clientId: string,
  range: DateRange,
  clientList?: ClientListItem[]
): Promise<ClientDetail | null> {
  const list = clientList ?? (await getClientList());
  const client = list.find((c) => c.id === clientId);
  if (!client) return null;

  // Portfolio headline is always the current calendar month. range.to can be a
  // future period-end (e.g. Dec 31 for the Year preset), so derive it from today.
  const currentYM = new Date().toISOString().slice(0, 7);
  const [bookingData, portfolio, ota] = await Promise.all([
    getBookingData([client], range),
    getPortfolioDetail(clientId, currentYM),
    getOtaByClient(clientId),
  ]);

  return {
    client,
    bookings: buildClientMetrics(bookingData[0]),
    portfolio,
    ota,
  };
}
