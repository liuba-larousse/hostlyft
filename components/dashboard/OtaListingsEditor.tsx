"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";

interface OtaListing {
  id: string;
  client_id: string;
  ota_name: string;
  listing_url: string;
  listing_label: string;
}

const OTA_TYPES = [
  { key: "airbnb", label: "Airbnb", placeholder: "https://airbnb.com/rooms/..." },
  { key: "vrbo", label: "VRBO", placeholder: "https://vrbo.com/..." },
  { key: "booking_com", label: "Booking.com", placeholder: "https://booking.com/hotel/..." },
];

export default function OtaListingsEditor({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [listings, setListings] = useState<OtaListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<{ ota: string; url: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ota/listings?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => setListings(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  async function addListing(ota: string, url: string, label: string) {
    if (!url.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ota/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, otaName: ota, listingUrl: url.trim(), listingLabel: label.trim() }),
      });
      if (res.ok) {
        const item = await res.json();
        setListings((prev) => [...prev, item]);
        setAdding(null);
      }
    } catch {}
    setSaving(false);
  }

  async function removeListing(id: string) {
    setListings((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/ota/listings?id=${id}`, { method: "DELETE" });
  }

  async function scrapeClient() {
    setScraping(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/ota/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      setScrapeResult(`Scraped ${data.scraped}/${data.total} listings${data.failed ? `, ${data.failed} failed` : ""}`);
    } catch {
      setScrapeResult("Scrape failed");
    }
    setScraping(false);
  }

  if (loading) return <div className="text-xs text-gray-400 py-2">Loading listings...</div>;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">OTA Listing Links</h4>
        <div className="flex items-center gap-2">
          {listings.length > 0 && (
            <button
              onClick={scrapeClient}
              disabled={scraping}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer transition-colors disabled:opacity-50 font-medium"
            >
              {scraping ? <><Loader2 size={12} className="inline animate-spin mr-1" />Scraping...</> : "Scrape Scores"}
            </button>
          )}
        </div>
      </div>

      {scrapeResult && (
        <div className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 mb-3">{scrapeResult}</div>
      )}

      {OTA_TYPES.map(({ key, label, placeholder }) => {
        const otaListings = listings.filter((l) => l.ota_name === key);
        return (
          <div key={key} className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-gray-600">{label}</span>
              <button
                onClick={() => setAdding({ ota: key, url: "", label: "" })}
                className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors"
                title={`Add ${label} listing`}
              >
                <Plus size={12} />
              </button>
            </div>

            {otaListings.map((l) => (
              <div key={l.id} className="flex items-center gap-2 mb-1 group">
                <a href={l.listing_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline truncate flex-1 flex items-center gap-1">
                  {l.listing_label || l.listing_url}
                  <ExternalLink size={10} className="shrink-0 opacity-50" />
                </a>
                <button onClick={() => removeListing(l.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer transition-all">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {otaListings.length === 0 && adding?.ota !== key && (
              <p className="text-xs text-gray-300 mb-1">No {label} listings</p>
            )}

            {adding?.ota === key && (
              <div className="flex flex-col gap-1.5 mb-2">
                <input
                  value={adding.label}
                  onChange={(e) => setAdding({ ...adding, label: e.target.value })}
                  placeholder="Unit name (optional)"
                  className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700 placeholder-gray-400"
                />
                <div className="flex gap-1.5">
                  <input
                    value={adding.url}
                    onChange={(e) => setAdding({ ...adding, url: e.target.value })}
                    placeholder={placeholder}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-yellow-400 text-gray-700 placeholder-gray-400"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") addListing(key, adding.url, adding.label); if (e.key === "Escape") setAdding(null); }}
                  />
                  <button
                    onClick={() => addListing(key, adding.url, adding.label)}
                    disabled={saving || !adding.url.trim()}
                    className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-40 font-medium"
                  >
                    {saving ? "..." : "Add"}
                  </button>
                  <button onClick={() => setAdding(null)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
