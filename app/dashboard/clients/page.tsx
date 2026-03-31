import ClientsView, { type Contact } from '@/components/dashboard/ClientsView';

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

    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 300 },
      }
    );
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
