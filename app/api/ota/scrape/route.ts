import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { isHiddenClientName, joinedClientName } from '@/lib/clients/exclusions';
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

// ── VRBO: BrightData Web Unlocker (pay-per-use; bypasses Cloudflare). 0–10 scale.
async function scrapeVrbo(url: string): Promise<{ score: number; reviewCount: number } | null> {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  const zone = process.env.BRIGHTDATA_ZONE;
  if (!token || !zone) {
    console.error('BRIGHTDATA_API_TOKEN / BRIGHTDATA_ZONE not set — cannot scrape VRBO');
    return null;
  }

  // Use the plain listing URL — vrbo.com/{id}. Date params make VRBO time out
  // through the unlocker. Falls back to the given URL if no id is found.
  const idMatch =
    url.match(/\/p?(\d{5,})(?:vb)?(?:\?|$|\/)/i) ?? url.match(/vrbo\.com\/(?:[a-z-]+\/)?p?(\d{5,})/i);
  const listingUrl = idMatch ? `https://www.vrbo.com/${idMatch[1]}` : url;

  // Web Unlocker is flaky (transient empty responses); retry a few times.
  let html = '';
  for (let attempt = 0; attempt < 3 && html.length < 5000; attempt++) {
    try {
      const res = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone, url: listingUrl, format: 'raw' }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) html = await res.text();
      else console.error('VRBO Web Unlocker', res.status, (await res.text()).slice(0, 150));
    } catch (e) {
      console.error('VRBO Web Unlocker attempt error:', e);
    }
  }
  if (html.length < 5000) {
    console.error('VRBO: no usable page after retries for', listingUrl);
    return null;
  }

  // The rating is in (multi-)escaped JSON-LD: \\\"ratingValue\\\":\\\"8.8\\\",
  // \\\"reviewCount\\\":\\\"23\\\" (bestRating 10). There are also 0.0/null
  // placeholders, so allow any backslash run and take the max real value.
  const maxNum = (re: RegExp): number | null => {
    const ns = [...html.matchAll(re)]
      .map((m) => parseFloat(m[1].replace(/,/g, '')))
      .filter((n) => !Number.isNaN(n));
    return ns.length ? Math.max(...ns) : null;
  };
  const score =
    maxNum(/ratingValue\\*"\s*:\s*\\*"?(\d(?:\.\d{1,2})?)/gi) ??
    maxNum(/"average"\s*:\s*(\d(?:\.\d{1,2})?)/gi);
  const reviewCount =
    maxNum(/reviewCount\\*"\s*:\s*\\*"?(\d[\d,]*)/gi) ?? maxNum(/(\d[\d,]*)\s*reviews?/gi) ?? 0;

  // No reviews → score 0 (don't report a placeholder 0.0 as a failure).
  if (!score || reviewCount === 0) return { score: 0, reviewCount: 0 };
  if (score > 0 && score <= 10) return { score, reviewCount };
  console.error('VRBO: could not extract score from', listingUrl);
  return null;
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

  const { data: rawListings, error: listErr } = await query;
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  // Skip listings belonging to hidden clients (managed in a separate app).
  const listings = (rawListings ?? []).filter(
    (l) => !isHiddenClientName(joinedClientName(l.pricelabs_clients))
  );
  if (!listings.length) return NextResponse.json({ scraped: 0, message: 'No listings found' });

  let scraped = 0;
  let failed = 0;
  const results: Array<{ listing_id: string; url: string; ota: string; score: number | null; reviewCount: number | null; error?: string }> = [];

  // Only OTAs we have a scraper for — Expedia URLs are stored but not scraped,
  // so exclude them rather than counting them as failures.
  const SCRAPEABLE = new Set(['airbnb', 'vrbo', 'booking_com']);
  const scrapeable = listings.filter((l) => SCRAPEABLE.has(l.ota_name));
  if (!scrapeable.length) return NextResponse.json({ scraped: 0, failed: 0, total: 0, results });

  for (const listing of scrapeable) {
    let result: { score: number; reviewCount: number } | null = null;

    // URLs may be saved without a scheme (e.g. "airbnb.com/h/..."); fetch needs a full URL.
    const url = /^https?:\/\//i.test(listing.listing_url)
      ? listing.listing_url
      : `https://${listing.listing_url}`;

    try {
      if (listing.ota_name === 'airbnb') result = await scrapeAirbnb(url);
      else if (listing.ota_name === 'vrbo') result = await scrapeVrbo(url);
      else if (listing.ota_name === 'booking_com') result = await scrapeBooking(url);

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

  return NextResponse.json({ scraped, failed, total: scrapeable.length, results });
}
