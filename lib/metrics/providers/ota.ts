import { createSupabaseAdmin } from '@/lib/supabase';

export interface OtaListingScore {
  otaName: string; // 'airbnb' | 'vrbo' | 'booking_com'
  label: string;
  score: number;
  reviews: number;
  scrapedAt: string | null;
  scraped: boolean; // false when score is 0 / never successfully scraped
}

interface OtaScoreRow {
  overall_score: number | null;
  review_count: number | null;
  scraped_at: string | null;
  ota_listings: { ota_name: string; listing_label: string | null } | null;
}

/** Latest review score per listing for one client. Score 0 = not yet scraped. */
export async function getOtaByClient(clientId: string): Promise<OtaListingScore[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('ota_scores')
    .select('overall_score, review_count, scraped_at, ota_listings!inner(ota_name, listing_label, client_id)')
    .eq('ota_listings.client_id', clientId);

  if (error) throw new Error(`Failed to fetch OTA scores: ${error.message}`);

  const rows = (data ?? []) as unknown as OtaScoreRow[];
  return rows
    .map((r) => {
      const score = r.overall_score ?? 0;
      return {
        otaName: r.ota_listings?.ota_name ?? 'unknown',
        label: r.ota_listings?.listing_label || (r.ota_listings?.ota_name ?? 'Listing'),
        score,
        reviews: r.review_count ?? 0,
        scrapedAt: r.scraped_at,
        scraped: score > 0,
      };
    })
    .sort((a, b) => Number(b.scraped) - Number(a.scraped) || b.score - a.score);
}
