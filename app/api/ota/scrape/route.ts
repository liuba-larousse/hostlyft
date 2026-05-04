import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

// Simple score extraction using fetch + regex (no Playwright needed for public pages)
async function scrapeAirbnb(url: string): Promise<{ score: number; reviewCount: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    const html = await res.text();
    // Airbnb embeds rating in meta or structured data
    const scoreMatch = html.match(/(\d\.\d{1,2})\s*·\s*(\d+)\s*reviews?/i)
      ?? html.match(/"ratingValue"\s*:\s*(\d\.\d{1,2}).*?"reviewCount"\s*:\s*(\d+)/);
    if (scoreMatch) {
      return { score: parseFloat(scoreMatch[1]), reviewCount: parseInt(scoreMatch[2]) };
    }
    // Try alternate patterns
    const altScore = html.match(/"starRating"\s*:\s*(\d\.\d{1,2})/);
    const altCount = html.match(/"reviewsCount"\s*:\s*(\d+)/);
    if (altScore) {
      return { score: parseFloat(altScore[1]), reviewCount: altCount ? parseInt(altCount[1]) : 0 };
    }
    return null;
  } catch { return null; }
}

async function scrapeVrbo(url: string): Promise<{ score: number; reviewCount: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    const html = await res.text();
    const match = html.match(/"ratingValue"\s*:\s*(\d\.\d{1,2}).*?"reviewCount"\s*:\s*(\d+)/)
      ?? html.match(/(\d\.\d)\s*\/\s*5\s*.*?(\d+)\s*reviews?/i);
    if (match) {
      return { score: parseFloat(match[1]), reviewCount: parseInt(match[2]) };
    }
    return null;
  } catch { return null; }
}

async function scrapeBooking(url: string): Promise<{ score: number; reviewCount: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    const html = await res.text();
    // Booking.com uses a 1-10 scale
    const match = html.match(/"ratingValue"\s*:\s*(\d\.?\d?).*?"reviewCount"\s*:\s*(\d+)/)
      ?? html.match(/(\d\.\d)\s*<.*?(\d+)\s*reviews?/i);
    if (match) {
      return { score: parseFloat(match[1]), reviewCount: parseInt(match[2]) };
    }
    return null;
  } catch { return null; }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = body.clientId ?? null;
  const supabase = createSupabaseAdmin();

  // Get listings to scrape
  let query = supabase.from('ota_listings').select('*, pricelabs_clients(client_name)');
  if (clientId) query = query.eq('client_id', clientId);

  const { data: listings, error: listErr } = await query;
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  if (!listings?.length) return NextResponse.json({ scraped: 0, message: 'No listings found' });

  let scraped = 0;
  let failed = 0;
  const results: Array<{ listing_id: string; url: string; score: number | null; error?: string }> = [];

  for (const listing of listings) {
    let result: { score: number; reviewCount: number } | null = null;

    try {
      if (listing.ota_name === 'airbnb') result = await scrapeAirbnb(listing.listing_url);
      else if (listing.ota_name === 'vrbo') result = await scrapeVrbo(listing.listing_url);
      else if (listing.ota_name === 'booking_com') result = await scrapeBooking(listing.listing_url);

      if (result) {
        await supabase
          .from('ota_scores')
          .upsert({
            listing_id: listing.id,
            overall_score: result.score,
            review_count: result.reviewCount,
            scraped_at: new Date().toISOString(),
            raw_data: { url: listing.listing_url, ota: listing.ota_name, ...result },
          }, { onConflict: 'listing_id' });
        scraped++;
        results.push({ listing_id: listing.id, url: listing.listing_url, score: result.score });
      } else {
        failed++;
        results.push({ listing_id: listing.id, url: listing.listing_url, score: null, error: 'Could not extract score' });
      }
    } catch (e) {
      failed++;
      results.push({ listing_id: listing.id, url: listing.listing_url, score: null, error: String(e) });
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
  }

  return NextResponse.json({ scraped, failed, total: listings.length, results });
}
