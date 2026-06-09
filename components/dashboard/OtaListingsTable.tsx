"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

const OTA_COLS = [
  { key: "airbnb", label: "Airbnb" },
  { key: "booking_com", label: "Booking.com" },
  { key: "vrbo", label: "VRBO" },
  { key: "expedia", label: "Expedia" },
] as const;

interface Listing {
  id: string;
  name: string;
}

interface OtaListing {
  id: string;
  ota_name: string;
  listing_url: string;
  listing_label: string;
  pl_listing_id: string | null;
}

type CellStatus = "idle" | "saving" | "saved" | "error";
interface Cell {
  id?: string;
  url: string;
  saved: string;
  status: CellStatus;
  error?: string;
}

const keyOf = (listingId: string, ota: string) => `${listingId}|||${ota}`;

export default function OtaListingsTable({ clientId }: { clientId: string; clientName: string }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);

  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/pricelabs/listing-names?clientId=${clientId}`).then((r) => r.json()).catch(() => ({ listings: [] })),
      fetch(`/api/ota/listings?clientId=${clientId}`).then((r) => r.json()).catch(() => []),
    ]).then(([names, existing]) => {
      if (!active) return;
      const list: Listing[] = Array.isArray(names?.listings) ? names.listings : [];
      const byName = new Map(list.map((l) => [l.name, l.id]));
      const map: Record<string, Cell> = {};
      for (const l of list) for (const c of OTA_COLS) map[keyOf(l.id, c.key)] = { url: "", saved: "", status: "idle" };

      for (const row of (Array.isArray(existing) ? existing : []) as OtaListing[]) {
        // Match by listing id; legacy rows (no pl_listing_id) fall back to name.
        const lid = row.pl_listing_id ?? byName.get(row.listing_label);
        if (!lid) continue;
        const k = keyOf(lid, row.ota_name);
        if (map[k] !== undefined) map[k] = { id: row.id, url: row.listing_url, saved: row.listing_url, status: "idle" };
      }
      setListings(list);
      setCells(map);
      setLoading(false);
    });
    return () => { active = false; };
  }, [clientId]);

  const setUrl = useCallback((k: string, url: string) => {
    setCells((prev) => ({ ...prev, [k]: { ...prev[k], url, status: "idle" } }));
  }, []);

  const saveCell = useCallback(
    async (listingId: string, listingName: string, ota: string) => {
      const k = keyOf(listingId, ota);
      const cell = cellsRef.current[k];
      if (!cell || cell.url.trim() === cell.saved) return; // unchanged
      const url = cell.url.trim();
      setCells((p) => ({ ...p, [k]: { ...p[k], status: "saving" } }));
      try {
        const res = await fetch("/api/ota/listings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, otaName: ota, plListingId: listingId, listingLabel: listingName, listingUrl: url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "save failed");
        setCells((p) => ({ ...p, [k]: { id: data?.id, url, saved: url, status: "saved" } }));
        setTimeout(() => setCells((p) => (p[k] ? { ...p, [k]: { ...p[k], status: "idle" } } : p)), 1500);
      } catch (e) {
        setCells((p) => ({ ...p, [k]: { ...p[k], status: "error", error: e instanceof Error ? e.message : "save failed" } }));
      }
    },
    [clientId]
  );

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

  if (loading) return <div className="mt-4 py-2 text-xs text-gray-400">Loading listings…</div>;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">OTA Listing Links</h4>
        {listings.length > 0 && (
          <button
            onClick={scrapeClient}
            disabled={scraping}
            className="cursor-pointer rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
          >
            {scraping ? (
              <><Loader2 size={12} className="mr-1 inline animate-spin" />Scraping…</>
            ) : (
              "Scrape Scores"
            )}
          </button>
        )}
      </div>

      {scrapeResult && (
        <div className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-600">{scrapeResult}</div>
      )}

      {listings.length === 0 ? (
        <p className="py-2 text-xs text-gray-400">
          No listings found for this client yet — run a sync to load them, then add OTA URLs here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold text-gray-500">Listing</th>
                {OTA_COLS.map((c) => (
                  <th key={c.key} className="min-w-[180px] px-3 py-2 font-semibold text-gray-500">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 max-w-[200px] truncate bg-white px-3 py-2 font-medium text-gray-800" title={listing.name}>
                    {listing.name}
                  </td>
                  {OTA_COLS.map((c) => {
                    const k = keyOf(listing.id, c.key);
                    const cell = cells[k] ?? { url: "", saved: "", status: "idle" as CellStatus };
                    return (
                      <td key={c.key} className="px-2 py-1.5">
                        <div className="relative">
                          <input
                            value={cell.url}
                            onChange={(e) => setUrl(k, e.target.value)}
                            onBlur={() => saveCell(listing.id, listing.name, c.key)}
                            placeholder={`${c.label} URL`}
                            className={clsx(
                              "w-full rounded-md border px-2 py-1.5 pr-6 text-xs text-gray-700 outline-none transition-colors placeholder:text-gray-300",
                              cell.status === "error" ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-yellow-400"
                            )}
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
                            {cell.status === "saving" && <Loader2 size={12} className="animate-spin text-gray-400" />}
                            {cell.status === "saved" && <Check size={12} className="text-green-500" />}
                            {cell.status === "error" && <AlertCircle size={12} className="text-red-500" aria-label={cell.error} />}
                          </span>
                        </div>
                        {cell.status === "error" && cell.error && (
                          <p className="mt-0.5 max-w-[180px] text-[10px] leading-tight text-red-500">{cell.error}</p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-400">
        Paste each listing&apos;s OTA URL; it saves on blur. Expedia is stored but not yet scraped.
      </p>
    </div>
  );
}
