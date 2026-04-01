import ClientsView, { type Contact } from '@/components/dashboard/ClientsView';

const HS = 'https://api.hubapi.com';

interface DealProps {
  amount?: string;
  deal_currency_code?: string;
  closedate?: string;
  hs_is_closed_won?: string;
}

interface InvoiceProps {
  hs_amount_billed?: string;
  hs_currency_code?: string;
  hs_invoice_date?: string;
  hs_due_date?: string;
  hs_payment_status?: string;   // some plans use this
  hs_invoice_status?: string;   // Commerce Hub uses this
  hs_invoice_id?: string;
  hs_scheduled_date?: string;   // recurring / scheduled invoices
}

async function batchAssociations(
  fromType: string,
  toType: string,
  ids: string[],
  token: string
): Promise<Record<string, string[]>> {
  const res = await fetch(`${HS}/crm/v4/associations/${fromType}/${toType}/batch/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: ids.slice(0, 100).map(id => ({ id })) }),
    next: { revalidate: 300 },
  });
  if (!res.ok) return {};
  const data = await res.json();
  const map: Record<string, string[]> = {};
  for (const r of data.results ?? []) {
    if (r.to?.length) map[r.from.id] = r.to.map((t: { toObjectId: string }) => t.toObjectId);
  }
  return map;
}

async function fetchLastDeals(
  contactIds: string[],
  token: string
): Promise<Record<string, Contact['lastDeal']>> {
  if (!contactIds.length) return {};
  try {
    const contactDealMap = await batchAssociations('contacts', 'deals', contactIds, token);
    const allIds = [...new Set(Object.values(contactDealMap).flat())];
    if (!allIds.length) return {};

    const res = await fetch(`${HS}/crm/v3/objects/deals/batch/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: ['amount', 'deal_currency_code', 'closedate', 'hs_is_closed_won'],
        inputs: allIds.map(id => ({ id })),
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const data = await res.json();

    const byId: Record<string, DealProps> = {};
    for (const d of data.results ?? []) byId[d.id] = d.properties;

    const result: Record<string, Contact['lastDeal']> = {};
    for (const [cid, ids] of Object.entries(contactDealMap)) {
      const deals = ids.map(id => byId[id]).filter((d): d is DealProps => !!d);
      if (!deals.length) continue;
      deals.sort((a, b) => new Date(b.closedate || 0).getTime() - new Date(a.closedate || 0).getTime());
      const d = deals[0];
      result[cid] = {
        amount: d.amount || '',
        currency: d.deal_currency_code || 'USD',
        closeDate: d.closedate ? d.closedate.split('T')[0] : '',
        paid: d.hs_is_closed_won === 'true',
      };
    }
    return result;
  } catch { return {}; }
}

async function fetchLastInvoices(
  contactIds: string[],
  token: string
): Promise<Record<string, Contact['lastInvoice']>> {
  if (!contactIds.length) return {};
  try {
    const contactInvoiceMap = await batchAssociations('contacts', 'invoices', contactIds, token);
    const allIds = [...new Set(Object.values(contactInvoiceMap).flat())];
    if (!allIds.length) return {};

    const res = await fetch(`${HS}/crm/v3/objects/invoices/batch/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: ['hs_amount_billed', 'hs_currency_code', 'hs_invoice_date', 'hs_due_date', 'hs_payment_status', 'hs_invoice_status', 'hs_invoice_id', 'hs_scheduled_date'],
        inputs: allIds.map(id => ({ id })),
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const data = await res.json();

    const byId: Record<string, InvoiceProps> = {};
    for (const inv of data.results ?? []) byId[inv.id] = inv.properties;

    const result: Record<string, Contact['lastInvoice']> = {};
    for (const [cid, ids] of Object.entries(contactInvoiceMap)) {
      const invoices = ids.map(id => byId[id]).filter((i): i is InvoiceProps => !!i);
      if (!invoices.length) continue;
      invoices.sort((a, b) => new Date(b.hs_invoice_date || 0).getTime() - new Date(a.hs_invoice_date || 0).getTime());
      const inv = invoices[0];
      result[cid] = {
        amount: inv.hs_amount_billed || '',
        currency: inv.hs_currency_code || 'USD',
        invoiceDate: inv.hs_invoice_date ? inv.hs_invoice_date.split('T')[0] : '',
        dueDate: inv.hs_due_date
          ? inv.hs_due_date.split('T')[0]
          : (inv.hs_scheduled_date ? inv.hs_scheduled_date.split('T')[0] : ''),
        // prefer hs_invoice_status (Commerce Hub), fall back to hs_payment_status
        status: inv.hs_invoice_status || inv.hs_payment_status || (inv.hs_scheduled_date ? 'SCHEDULED' : ''),
        invoiceNumber: inv.hs_invoice_id || '',
      };
    }
    return result;
  } catch { return {}; }
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
        name, firstName, lastName,
        company: p.company || '—',
        email: p.email || '',
        status,
        added: p.createdate ? p.createdate.split('T')[0] : '',
      });
    }
    after = data.paging?.next?.after;
  } while (after);

  if (contacts.length) {
    const ids = contacts.map(c => c.id);
    const [deals, invoices] = await Promise.all([
      fetchLastDeals(ids, token),
      fetchLastInvoices(ids, token),
    ]);
    for (const c of contacts) {
      if (deals[c.id])   c.lastDeal    = deals[c.id];
      if (invoices[c.id]) c.lastInvoice = invoices[c.id];
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
