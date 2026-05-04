import { createSupabaseAdmin } from '@/lib/supabase';
import PriceLabsClients from '@/components/dashboard/PriceLabsClients';

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

export default async function ManageClientsPage() {
  const [clients, contacts] = await Promise.all([
    getPriceLabsClients(),
    getHubSpotContacts(),
  ]);

  return <PriceLabsClients contacts={contacts} initialClients={clients} />;
}
