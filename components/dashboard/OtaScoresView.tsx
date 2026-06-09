"use client";

import { useState } from "react";
import { Star, Loader2, RefreshCw } from "lucide-react";
import { scoreTone } from "@/lib/metrics/ota-score";

interface ScoreData {
  overall_score: number;
  review_count: number;
  scraped_at: string;
}

type ClientRel = { client_name: string } | { client_name: string }[] | null;

type ScoreRel = ScoreData | ScoreData[] | null;

interface ListingRow {
  id: string;
  ota_name: string;
  listing_url: string;
  listing_label: string;
  pl_listing_id: string | null;
  // Supabase returns a to-one relation as either a single object or an array
  // (ota_scores is unique per listing, so it's typically a single object/null).
  pricelabs_clients: ClientRel;
  ota_scores: ScoreRel;
}

function clientName(rel: ClientRel): string {
  const c = Array.isArray(rel) ? rel[0] : rel;
  return c?.client_name ?? "Unknown";
}

function scoreOf(rel: ScoreRel): ScoreData | undefined {
  return (Array.isArray(rel) ? rel[0] : rel) ?? undefined;
}

const OTA_COLS = [
  { key: "airbnb", label: "Airbnb", scale: 5 },
  { key: "booking_com", label: "Booking.com", scale: 10 },
  { key: "vrbo", label: "VRBO", scale: 10 },
  { key: "expedia", label: "Expedia", scale: 10 },
] as const;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function ScoreCell({ listing, scale }: { listing: ListingRow | undefined; scale: number }) {
  if (!listing) return <span className="text-gray-300">—</span>; // no URL for this OTA
  const score = scoreOf(listing.ota_scores);
  if (!score) {
    return (
      <a href={listing.listing_url} target="_blank" rel="noopener" className="text-xs text-gray-400 hover:text-gray-600">
        Not scraped
      </a>
    );
  }
  if (score.overall_score === 0 && score.review_count === 0) {
    return (
      <a href={listing.listing_url} target="_blank" rel="noopener" className="text-xs text-gray-400 hover:text-gray-600">
        No reviews
      </a>
    );
  }
  const color = scoreTone(scale, score.overall_score);
  return (
    <a href={listing.listing_url} target="_blank" rel="noopener" className="inline-flex flex-col items-center gap-0.5">
      <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${color.bg} ${color.text}`}>
        {score.overall_score.toFixed(2)}
        <span className="ml-0.5 text-xs font-normal opacity-60">/{scale}</span>
      </span>
      <span className="text-[10px] tabular-nums text-gray-400">{score.review_count} reviews</span>
    </a>
  );
}

export default function OtaScoresView({ initialListings }: { initialListings: ListingRow[] }) {
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);

  async function scrapeAll() {
    setScraping(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/ota/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setScrapeResult(`Scraped ${data.scraped}/${data.total} listings${data.failed ? `, ${data.failed} failed` : ""}`);
      window.location.reload(); // re-fetch listings + fresh scores
    } catch {
      setScrapeResult("Scrape failed");
      setScraping(false);
    }
  }

  // Pivot: client → listing (by id) → ota → row. Keyed by pl_listing_id so
  // same-named listings stay distinct; legacy rows fall back to name.
  const byClient: Record<string, Record<string, { name: string; otas: Record<string, ListingRow> }>> = {};
  initialListings.forEach((l) => {
    if (!l.ota_name) return;
    const client = clientName(l.pricelabs_clients);
    const name = (l.listing_label || "").trim() || "Unnamed listing";
    const listingKey = l.pl_listing_id || `name:${name}`;
    (byClient[client] ??= {});
    (byClient[client][listingKey] ??= { name, otas: {} });
    byClient[client][listingKey].otas[l.ota_name] = l;
  });

  const scrapedAts = initialListings.flatMap((l) => {
    const s = scoreOf(l.ota_scores);
    return s ? [new Date(s.scraped_at).getTime()] : [];
  });
  const lastScrape =
    scrapedAts.length > 0
      ? new Date(Math.max(...scrapedAts)).toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
        })
      : null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <div className="rounded-xl bg-yellow-50 p-2">
              <Star size={20} className="text-yellow-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">OTA Scores</h1>
          </div>
          {lastScrape && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-400">
              <RefreshCw size={12} />
              Last scraped {lastScrape}
            </p>
          )}
        </div>
        <button
          onClick={scrapeAll}
          disabled={scraping}
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
        >
          {scraping ? <><Loader2 size={14} className="animate-spin" />Scraping…</> : <><RefreshCw size={14} />Scrape All</>}
        </button>
      </div>

      {scrapeResult && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
          {scrapeResult}
        </div>
      )}

      {initialListings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
          <Star size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="mb-1 text-base font-semibold text-gray-900">No OTA listings yet</p>
          <p className="text-sm text-gray-500">Add listing URLs under Manage Clients, then click Scrape All.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byClient)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([client, listingMap]) => {
              const rows = Object.entries(listingMap).sort(([, a], [, b]) => a.name.localeCompare(b.name));
              return (
                <div key={client} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-50">
                      <span className="text-sm font-bold text-yellow-600">{client.charAt(0).toUpperCase()}</span>
                    </div>
                    <h2 className="font-semibold text-gray-900">{client}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="sticky left-0 z-10 bg-gray-50 px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Listing
                          </th>
                          {OTA_COLS.map((c) => (
                            <th key={c.key} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rows.map(([lk, g]) => (
                          <tr key={lk} className="hover:bg-gray-50">
                            <td className="sticky left-0 z-10 max-w-[260px] truncate bg-white px-6 py-3 font-medium text-gray-900" title={decodeHtml(g.name)}>
                              {decodeHtml(g.name)}
                            </td>
                            {OTA_COLS.map((c) => (
                              <td key={c.key} className="px-4 py-3 text-center">
                                <ScoreCell listing={g.otas[c.key]} scale={c.scale} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </>
  );
}
