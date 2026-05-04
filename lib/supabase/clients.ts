import { createSupabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto/encrypt';

export interface PriceLabsClient {
  id: string;
  client_name: string;
  email: string;
  password: string; // decrypted at read time
  connection_type: 'direct' | 'rm_portal';
}

export interface RmPortalCredentials {
  email: string;
  password: string;
}

export async function getActiveClients(): Promise<PriceLabsClient[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name, email, password_encrypted, connection_type')
    .eq('active', true)
    .order('client_name');

  if (error) throw new Error(`Failed to fetch PriceLabs clients: ${error.message}`);

  return (data ?? []).map(row => ({
    id: row.id,
    client_name: row.client_name,
    email: row.email,
    password: row.password_encrypted ? decrypt(row.password_encrypted) : '',
    connection_type: row.connection_type ?? 'direct',
  }));
}

export async function getRmPortalCredentials(): Promise<RmPortalCredentials | null> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('rm_portal_credentials')
    .select('email, password_encrypted')
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    email: data.email,
    password: decrypt(data.password_encrypted),
  };
}
