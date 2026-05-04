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

const OTA_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking_com: "Booking.com",
};

function getScoreColor(ota: string, score: number): { bg: string; text: string } {
  if (ota === "booking_com") {
    // Booking.com uses 1-10 scale
    if (score < 7.0) return { bg: "bg-red-100", text: "text-red-700" };
    if (score < 8.5) return { bg: "bg-yellow-100", text: "text-yellow-700" };
    return { bg: "bg-emerald-100", text: "text-emerald-700" };
  }
  // Airbnb and VRBO use 1-5 scale
  if (score < 4.2) return { bg: "bg-red-100", text: "text-red-700" };
  if (score < 4.8) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-emerald-100", text: "text-emerald-700" };
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
      // Reload scores
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

  // Group by client
  const byClient: Record<string, ScoreRow[]> = {};
  scores.forEach((s) => {
    const client = s.ota_listings?.pricelabs_clients?.client_name ?? "Unknown";
    if (!byClient[client]) byClient[client] = [];
    byClient[client].push(s);
  });

  const lastScrape = scores.length > 0
    ? new Date(Math.max(...scores.map((s) => new Date(s.scraped_at).getTime()))).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
      })
    : null;

  return (
    <>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-yellow-50">
              <Star size={20} className="text-yellow-600" strokeWidth={1.8} />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">OTA Scores</h1>
          </div>
          {lastScrape && (
            <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
              <RefreshCw size={12} />
              Last scraped {lastScrape}
            </p>
          )}
        </div>
        <button
          onClick={scrapeAll}
          disabled={scraping}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50 text-sm"
        >
          {scraping ? <><Loader2 size={14} className="animate-spin" />Scraping...</> : <><RefreshCw size={14} />Scrape All</>}
        </button>
      </div>

      {scrapeResult && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
          {scrapeResult}
        </div>
      )}

      {scores.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
          <Star size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-900 font-semibold text-base mb-1">No OTA scores yet</p>
          <p className="text-gray-500 text-sm">Add listing URLs in the Clients page, then click Scrape All.</p>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(byClient).sort(([a], [b]) => a.localeCompare(b)).map(([client, clientScores]) => (
          <div key={client} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
                <span className="text-yellow-600 font-bold text-sm">{client.charAt(0).toUpperCase()}</span>
              </div>
              <h2 className="font-semibold text-gray-900">{client}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">OTA</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reviews</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scraped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clientScores
                    .sort((a, b) => a.ota_listings.ota_name.localeCompare(b.ota_listings.ota_name))
                    .map((s) => {
                      const color = getScoreColor(s.ota_listings.ota_name, s.overall_score);
                      return (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3">
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                              {OTA_LABELS[s.ota_listings.ota_name] ?? s.ota_listings.ota_name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <a href={s.ota_listings.listing_url} target="_blank" rel="noopener"
                              className="text-sm text-gray-900 font-medium hover:text-blue-600 flex items-center gap-1">
                              {s.ota_listings.listing_label || "—"}
                              <ExternalLink size={10} className="opacity-40" />
                            </a>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${color.bg} ${color.text}`}>
                              {s.overall_score.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{s.review_count}</td>
                          <td className="px-6 py-3 text-right text-xs text-gray-400">
                            {new Date(s.scraped_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
