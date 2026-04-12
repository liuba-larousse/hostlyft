import { createSupabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto/encrypt';

export interface PriceLabsClient {
  id: string;
  client_name: string;
  email: string;
  password: string; // decrypted at read time
}

export async function getActiveClients(): Promise<PriceLabsClient[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name, email, password_encrypted')
    .eq('active', true)
    .order('client_name');

  if (error) throw new Error(`Failed to fetch PriceLabs clients: ${error.message}`);

  return (data ?? []).map(row => ({
    id: row.id,
    client_name: row.client_name,
    email: row.email,
    password: decrypt(row.password_encrypted),
  }));
}
