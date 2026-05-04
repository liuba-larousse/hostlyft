import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { launchBrowser } from '@/lib/pricelabs/browser';

export const maxDuration = 300;

// ── Airbnb: fetch + regex (works server-side, structured data in HTML) ──────
async function scrapeAirbnb(url: string): Promise<{ score: number; reviewCount: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    const html = await res.text();
    // Look for structured data first
    const scoreMatch = html.match(/"ratingValue"\s*:\s*(\d\.\d{1,2})/);
    const countMatch = html.match(/"reviewCount"\s*:\s*(\d+)/);
    if (scoreMatch) {
      return { score: parseFloat(scoreMatch[1]), reviewCount: countMatch ? parseInt(countMatch[1]) : 0 };
    }
    // Fallback: text pattern
    const altMatch = html.match(/(\d\.\d{1,2})\s*·\s*(\d+)\s*reviews?/i);
    if (altMatch) {
      return { score: parseFloat(altMatch[1]), reviewCount: parseInt(altMatch[2]) };
    }
    return null;
  } catch { return null; }
}

// ── VRBO & Booking.com: need Playwright (client-side rendered) ──────────────
async function scrapeWithBrowser(url: string, ota: 'vrbo' | 'booking_com'): Promise<{ score: number; reviewCount: number } | null> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000); // Let SPA render

    const html = await page.content();
    await context.close();

    if (ota === 'vrbo') {
      // Check for no reviews
      if (html.match(/No reviews yet|Be the first to review/i)) {
        return { score: 0, reviewCount: 0 };
      }
      // VRBO uses 1-10 scale. DOM has itemprop="aggregateRating" and data-stid="content-hotel-reviewsummary"
      // The score badge shows "10" with text like "Exceptional"
      const scoreMatch = html.match(/itemprop="ratingValue"[^>]*content="(\d{1,2}\.?\d?)"/i)
        ?? html.match(/data-stid="content-hotel-reviewsummary"[\s\S]*?(\d{1,2}(?:\.\d)?)\s*</)
        ?? html.match(/(\d{1,2}(?:\.\d)?)\s*(?:\/\s*10\s*)?(?:Exceptional|Wonderful|Superb|Very good|Good|Pleasant)/i)
        ?? html.match(/"ratingValue"\s*:\s*"?(\d{1,2}\.?\d?)"?/);
      const countMatch = html.match(/itemprop="reviewCount"[^>]*content="(\d+)"/i)
        ?? html.match(/See\s+all\s+(\d+)\s*reviews?/i)
        ?? html.match(/aria-label="See\s+all\s+(\d+)\s*reviews?"/i)
        ?? html.match(/"reviewCount"\s*:\s*"?(\d+)"?/);

      if (scoreMatch) {
        return { score: parseFloat(scoreMatch[1]), reviewCount: countMatch ? parseInt(countMatch[1]) : 0 };
      }
    }

    if (ota === 'booking_com') {
      // Check for "No reviews yet" first
      if (html.match(/No reviews yet|No review score yet/i)) {
        return { score: 0, reviewCount: 0 };
      }
      // Booking.com: score out of 10 like "9.4" + "X reviews"
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
    }

    return null;
  } catch { return null; }
  finally { await browser.close(); }
}

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
      if (listing.ota_name === 'airbnb') {
        result = await scrapeAirbnb(listing.listing_url);
      } else if (listing.ota_name === 'vrbo' || listing.ota_name === 'booking_com') {
        result = await scrapeWithBrowser(listing.listing_url, listing.ota_name);
      }

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
        results.push({ listing_id: listing.id, url: listing.listing_url, ota: listing.ota_name, score: null, reviewCount: null, error: 'Could not extract score from page' });
      }
    } catch (e) {
      failed++;
      results.push({ listing_id: listing.id, url: listing.listing_url, ota: listing.ota_name, score: null, reviewCount: null, error: String(e) });
    }

    // Delay between requests
    await new Promise((r) => setTimeout(r, 1500));
  }

  return NextResponse.json({ scraped, failed, total: listings.length, results });
}
