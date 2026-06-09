import { createSupabaseAdmin } from '@/lib/supabase';
import OtaScoresView from '@/components/dashboard/OtaScoresView';

// Listing-centric: every OTA URL added under Manage Clients shows here, with its
// scraped score attached if one exists (otherwise "Not scraped").
async function getListings() {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from('ota_listings')
    .select(
      'id, ota_name, listing_url, listing_label, pricelabs_clients(client_name), ota_scores(overall_score, review_count, scraped_at)'
    )
    .order('listing_label');
  return data ?? [];
}

export default async function OtaScoresPage() {
  const listings = await getListings();
  return <OtaScoresView initialListings={listings} />;
}
