import { createSupabaseAdmin } from '@/lib/supabase';
import { Star } from 'lucide-react';
import OtaScoresView from '@/components/dashboard/OtaScoresView';

async function getScores() {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('ota_scores')
    .select('*, ota_listings(*, pricelabs_clients(client_name))')
    .order('scraped_at', { ascending: false });
  return data ?? [];
}

export default async function OtaScoresPage() {
  const scores = await getScores();
  return <OtaScoresView initialScores={scores} />;
}
