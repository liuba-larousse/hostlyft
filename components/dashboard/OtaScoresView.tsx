"use client";

import { useState } from "react";
import { Star, Loader2, RefreshCw, ExternalLink } from "lucide-react";

interface ScoreRow {
  id: string;
  overall_score: number;
  review_count: number;
  scraped_at: string;
  ota_listings: {
    id: string;
    ota_name: string;
    listing_url: string;
    listing_label: string;
    pricelabs_clients: {
      client_name: string;
    };
  };
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

function scoreColor(ota: string, score: number): { bg: string; text: string } {
  if (ota === "airbnb") {
    if (score < 4.2) return { bg: "bg-red-100", text: "text-red-700" };
    if (score < 4.8) return { bg: "bg-yellow-100", text: "text-yellow-700" };
    return { bg: "bg-emerald-100", text: "text-emerald-700" };
  }
  if (score < 7.0) return { bg: "bg-red-100", text: "text-red-700" };
  if (score < 8.5) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-emerald-100", text: "text-emerald-700" };
}

function ScoreCell({ row, scale }: { row: ScoreRow | undefined; scale: number }) {
  if (!row) return <span className="text-gray-300">—</span>;
  if (row.overall_score === 0 && row.review_count === 0) {
    return (
      <a href={row.ota_listings.listing_url} target="_blank" rel="noopener" className="text-xs text-gray-400 hover:text-gray-600">
        No reviews
      </a>
    );
  }
  const color = scoreColor(row.ota_listings.ota_name, row.overall_score);
  return (
    <a href={row.ota_listings.listing_url} target="_blank" rel="noopener" className="inline-flex flex-col items-center gap-0.5">
      <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${color.bg} ${color.text}`}>
        {row.overall_score.toFixed(2)}
        <span className="ml-0.5 text-xs font-normal opacity-60">/{scale}</span>
      </span>
      <span className="text-[10px] tabular-nums text-gray-400">{row.review_count} reviews</span>
    </a>
  );
}

export default function OtaScoresView({ initialScores }: { initialScores: ScoreRow[] }) {
  const [scores, setScores] = useState(initialScores);
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
      const r2 = await fetch("/api/ota/scores");
      if (r2.ok) {
        const newScores = await r2.json();
        setScores(Array.isArray(newScores) ? newScores : []);
      } else {
        window.location.reload();
      }
    } catch {
      setScrapeResult("Scrape failed");
    }
    setScraping(false);
  }

  // Pivot: client → listing label → ota → score row.
  const byClient: Record<string, Record<string, Record<string, ScoreRow>>> = {};
  scores.forEach((s) => {
    const client = s.ota_listings?.pricelabs_clients?.client_name ?? "Unknown";
    const label = s.ota_listings?.listing_label || s.ota_listings?.listing_url || "—";
    const ota = s.ota_listings?.ota_name;
    if (!ota) return;
    (byClient[client] ??= {});
    (byClient[client][label] ??= {});
    byClient[client][label][ota] = s;
  });

  const lastScrape =
    scores.length > 0
      ? new Date(Math.max(...scores.map((s) => new Date(s.scraped_at).getTime()))).toLocaleString("en-US", {
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

      {scores.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
          <Star size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="mb-1 text-base font-semibold text-gray-900">No OTA scores yet</p>
          <p className="text-sm text-gray-500">Add listing URLs under Manage Clients, then click Scrape All.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byClient)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([client, listingMap]) => {
              const labels = Object.keys(listingMap).sort((a, b) => a.localeCompare(b));
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
                        {labels.map((label) => (
                          <tr key={label} className="hover:bg-gray-50">
                            <td
                              className="sticky left-0 z-10 max-w-[260px] truncate bg-white px-6 py-3 font-medium text-gray-900"
                              title={decodeHtml(label)}
                            >
                              <span className="inline-flex items-center gap-1">
                                {decodeHtml(label)}
                                <ExternalLink size={10} className="shrink-0 opacity-30" />
                              </span>
                            </td>
                            {OTA_COLS.map((c) => (
                              <td key={c.key} className="px-4 py-3 text-center">
                                <ScoreCell row={listingMap[label][c.key]} scale={c.scale} />
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
