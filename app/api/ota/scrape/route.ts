import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { launchBrowser } from '@/lib/pricelabs/browser';

export const maxDuration = 300;

// ── Airbnb: fetch + regex (structured data in server-rendered HTML) ──────────
async function scrapeAirbnb(url: string): Promise<{ score: number; reviewCount: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    const html = await res.text();
    const scoreMatch = html.match(/"ratingValue"\s*:\s*(\d\.\d{1,2})/);
    const countMatch = html.match(/"reviewCount"\s*:\s*(\d+)/);
    if (scoreMatch) {
      return { score: parseFloat(scoreMatch[1]), reviewCount: countMatch ? parseInt(countMatch[1]) : 0 };
    }
    const altMatch = html.match(/(\d\.\d{1,2})\s*·\s*(\d+)\s*reviews?/i);
    if (altMatch) {
      return { score: parseFloat(altMatch[1]), reviewCount: parseInt(altMatch[2]) };
    }
    return null;
  } catch { return null; }
}

// ── VRBO: Apify actor (client-side rendered, can't scrape directly) ─────────
async function scrapeVrbo(url: string): Promise<{ score: number; reviewCount: number } | null> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.error('APIFY_API_TOKEN not set — cannot scrape VRBO');
    return null;
  }

  try {
    // Run the Apify VRBO reviews scraper actor
    const runRes = await fetch(
      'https://api.apify.com/v2/acts/w6lNm5DeDKCs6byfP/runs?waitForFinish=120',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxReviews: 1, // We only need the score, not all reviews
        }),
      }
    );

    if (!runRes.ok) {
      console.error('Apify run failed:', await runRes.text());
      return null;
    }

    const runData = await runRes.json();
    const datasetId = runData?.data?.defaultDatasetId;
    if (!datasetId) return null;

    // Fetch results from the dataset
    const dataRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );

    if (!dataRes.ok) return null;
    const items = await dataRes.json();

    if (!items || items.length === 0) return null;

    // Extract score from the first item — Apify actor returns review data
    // Look for aggregated rating info
    const first = items[0];
    const score = first.rating ?? first.overallRating ?? first.averageRating ?? first.score ?? null;
    const reviewCount = first.reviewCount ?? first.totalReviews ?? items.length ?? 0;

    if (score !== null && score !== undefined) {
      return { score: parseFloat(String(score)), reviewCount: parseInt(String(reviewCount)) };
    }

    // If actor returns individual reviews, calculate average
    if (items.length > 0 && items[0].rating !== undefined) {
      const ratings = items.map((r: { rating?: number }) => r.rating).filter((r: number | undefined): r is number => r !== undefined);
      if (ratings.length > 0) {
        const avg = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
        return { score: Math.round(avg * 10) / 10, reviewCount: ratings.length };
      }
    }

    return null;
  } catch (e) {
    console.error('VRBO Apify scrape error:', e);
    return null;
  }
}

// ── Booking.com: Playwright (client-side rendered) ──────────────────────────
async function scrapeBooking(url: string): Promise<{ score: number; reviewCount: number } | null> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const html = await page.content();
    await context.close();

    // Check for no reviews
    if (html.match(/No reviews yet|No review score yet/i)) {
      return { score: 0, reviewCount: 0 };
    }

    const scoreMatch = html.match(/"ratingValue"\s*:\s*"?(\d\.?\d?)"?/)
      ?? html.match(/data-testid="review-score-component"[^>]*>[^<]*?(\d\.\d)/)
      ?? html.match(/(\d\.\d)\s*(?:\/\s*10)?\s*(?:Superb|Exceptional|Wonderful|Very [Gg]ood|Good|Pleasant|Passable|Review score)/i);
    const countMatch = html.match(/(\d[\d,]*)\s*reviews?/i)
      ?? html.match(/"reviewCount"\s*:\s*"?(\d+)"?/);

    if (scoreMatch) {
      return {
        score: parseFloat(scoreMatch[1]),
        reviewCount: countMatch ? parseInt(countMatch[1].replace(/,/g, '')) : 0,
      };
    }
    return null;
  } catch { return null; }
  finally { await browser.close(); }
}

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = body.clientId ?? null;
  const supabase = createSupabaseAdmin();

  let query = supabase.from('ota_listings').select('*, pricelabs_clients(client_name)');
  if (clientId) query = query.eq('client_id', clientId);

  const { data: listings, error: listErr } = await query;
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  if (!listings?.length) return NextResponse.json({ scraped: 0, message: 'No listings found' });

  let scraped = 0;
  let failed = 0;
  const results: Array<{ listing_id: string; url: string; ota: string; score: number | null; reviewCount: number | null; error?: string }> = [];

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
        results.push({ listing_id: listing.id, url: listing.listing_url, ota: listing.ota_name, score: result.score, reviewCount: result.reviewCount });
      } else {
        failed++;
        results.push({ listing_id: listing.id, url: listing.listing_url, ota: listing.ota_name, score: null, reviewCount: null, error: 'Could not extract score' });
      }
    } catch (e) {
      failed++;
      results.push({ listing_id: listing.id, url: listing.listing_url, ota: listing.ota_name, score: null, reviewCount: null, error: String(e) });
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  return NextResponse.json({ scraped, failed, total: listings.length, results });
}
