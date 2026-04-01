import ClientsView, { type Contact } from '@/components/dashboard/ClientsView';

const HS = 'https://api.hubapi.com';

interface DealProps {
  amount?: string;
  deal_currency_code?: string;
  closedate?: string;
  hs_is_closed_won?: string;
}

async function fetchLastDeals(
  contactIds: string[],
  token: string
): Promise<Record<string, Contact['lastDeal']>> {
  if (!contactIds.length) return {};
  try {
    // 1. batch contact→deal associations (max 100 per call)
    const assocRes = await fetch(`${HS}/crm/v4/associations/contacts/deals/batch/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: contactIds.slice(0, 100).map(id => ({ id })) }),
      next: { revalidate: 300 },
    });
    if (!assocRes.ok) return {};
    const assocData = await assocRes.json();

    const contactDealMap: Record<string, string[]> = {};
    for (const r of assocData.results ?? []) {
      if (r.to?.length) contactDealMap[r.from.id] = r.to.map((t: { toObjectId: string }) => t.toObjectId);
    }

    const allDealIds = [...new Set(Object.values(contactDealMap).flat())];
    if (!allDealIds.length) return {};

    // 2. batch read deal details
    const dealsRes = await fetch(`${HS}/crm/v3/objects/deals/batch/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: ['amount', 'deal_currency_code', 'closedate', 'hs_is_closed_won'],
        inputs: allDealIds.map(id => ({ id })),
      }),
      next: { revalidate: 300 },
    });
    if (!dealsRes.ok) return {};
    const dealsData = await dealsRes.json();

    const dealsById: Record<string, DealProps> = {};
    for (const d of dealsData.results ?? []) {
      dealsById[d.id] = d.properties as DealProps;
    }

    // 3. pick latest deal per contact (sort by closedate desc)
    const result: Record<string, Contact['lastDeal']> = {};
    for (const [contactId, dealIds] of Object.entries(contactDealMap)) {
      const deals = dealIds.map(id => dealsById[id]).filter((d): d is DealProps => !!d);
      if (!deals.length) continue;
      deals.sort((a, b) =>
        new Date(b.closedate || 0).getTime() - new Date(a.closedate || 0).getTime()
      );
      const d = deals[0];
      result[contactId] = {
        amount: d.amount || '',
        currency: d.deal_currency_code || 'USD',
        closeDate: d.closedate ? d.closedate.split('T')[0] : '',
        paid: d.hs_is_closed_won === 'true',
      };
    }
    return result;
  } catch {
    return {};
  }
}

async function fetchHubSpotContacts(): Promise<Contact[]> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return [];

  const contacts: Contact[] = [];
  let after: string | undefined;

  do {
    const params = new URLSearchParams({
      properties: 'firstname,lastname,email,company,createdate,lifecyclestage',
      limit: '100',
      ...(after ? { after } : {}),
    });

    const res = await fetch(`${HS}/crm/v3/objects/contacts?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) break;

    const data = await res.json();

    for (const c of data.results ?? []) {
      const p = c.properties as Record<string, string>;
      const firstName = p.firstname ?? '';
      const lastName = p.lastname ?? '';
      const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
      const stage = p.lifecyclestage ?? '';

      let status: Contact['status'] = 'lead';
      if (stage === 'customer') status = 'customer';
      else if (!stage || stage === 'other' || stage === 'evangelist') status = 'inactive';

      contacts.push({
        id: c.id as string,
        name,
        firstName,
        lastName,
        company: p.company || '—',
        email: p.email || '',
        status,
        added: p.createdate ? p.createdate.split('T')[0] : '',
      });
    }

    after = data.paging?.next?.after;
  } while (after);

  // Attach last deal to each contact
  if (contacts.length) {
    const deals = await fetchLastDeals(contacts.map(c => c.id), token);
    for (const c of contacts) {
      if (deals[c.id]) c.lastDeal = deals[c.id];
    }
  }

  return contacts;
}

export default async function ClientsPage() {
  const contacts = await fetchHubSpotContacts();
  return (
    <ClientsView
      initialContacts={contacts}
      hubspotConnected={!!process.env.HUBSPOT_ACCESS_TOKEN}
    />
  );
}
