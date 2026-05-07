// @ts-nocheck
"use client";

import { useState, useMemo } from "react";

// ============ CONFIG ============
const SEASONS = [
  { name: "NewYearTail",       startMonth: 1,  startDay: 1,  endMonth: 1,  endDay: 5,  tier: "peak" },
  { name: "DeepWinterSoft",    startMonth: 1,  startDay: 6,  endMonth: 2,  endDay: 12, tier: "soft" },
  { name: "ValentinePresDay",  startMonth: 2,  startDay: 13, endMonth: 2,  endDay: 17, tier: "shoulder" },
  { name: "LateWinterSoft",    startMonth: 2,  startDay: 18, endMonth: 3,  endDay: 6,  tier: "soft" },
  { name: "SpringBreakEarly",  startMonth: 3,  startDay: 7,  endMonth: 3,  endDay: 15, tier: "shoulder" },
  { name: "SpringBreakPeak",   startMonth: 3,  startDay: 16, endMonth: 4,  endDay: 5,  tier: "peak" },
  { name: "SpringShoulder",    startMonth: 4,  startDay: 6,  endMonth: 4,  endDay: 20, tier: "shoulder" },
  { name: "Wildflower",        startMonth: 4,  startDay: 21, endMonth: 4,  endDay: 26, tier: "shoulder" },
  { name: "MaySoft",           startMonth: 4,  startDay: 27, endMonth: 5,  endDay: 7,  tier: "soft" },
  { name: "MothersDay",        startMonth: 5,  startDay: 8,  endMonth: 5,  endDay: 11, tier: "soft" },
  { name: "MayMid",            startMonth: 5,  startDay: 12, endMonth: 5,  endDay: 22, tier: "soft" },
  { name: "MemorialDay",       startMonth: 5,  startDay: 23, endMonth: 5,  endDay: 26, tier: "shoulder" },
  { name: "EarlySummer",       startMonth: 5,  startDay: 27, endMonth: 6,  endDay: 26, tier: "peak" },
  { name: "IndependenceWeek",  startMonth: 6,  startDay: 27, endMonth: 7,  endDay: 6,  tier: "peak" },
  { name: "MidSummer",         startMonth: 7,  startDay: 7,  endMonth: 8,  endDay: 3,  tier: "peak" },
  { name: "LateSummerSoft",    startMonth: 8,  startDay: 4,  endMonth: 9,  endDay: 3,  tier: "shoulder" },
  { name: "LaborDay",          startMonth: 9,  startDay: 4,  endMonth: 9,  endDay: 7,  tier: "peak" },
  { name: "SeptemberLull",     startMonth: 9,  startDay: 8,  endMonth: 9,  endDay: 28, tier: "shoulder" },
  { name: "LeafSeasonEarly",   startMonth: 9,  startDay: 29, endMonth: 10, endDay: 14, tier: "peak" },
  { name: "LeafSeasonPeak",    startMonth: 10, startDay: 15, endMonth: 10, endDay: 25, tier: "peak" },
  { name: "LeafTailVeterans",  startMonth: 10, startDay: 26, endMonth: 11, endDay: 9,  tier: "shoulder" },
  { name: "NovemberMid",       startMonth: 11, startDay: 10, endMonth: 11, endDay: 21, tier: "shoulder" },
  { name: "ThanksgivingWeek",  startMonth: 11, startDay: 22, endMonth: 11, endDay: 30, tier: "superpeak" },
  { name: "EarlyDecember",     startMonth: 12, startDay: 1,  endMonth: 12, endDay: 19, tier: "shoulder" },
  { name: "ChristmasNYE",      startMonth: 12, startDay: 20, endMonth: 12, endDay: 31, tier: "superpeak" },
];

const GUARDRAILS = {
  soft:      { min: -10, max: 10 },
  shoulder:  { min: -10, max: 15 },
  peak:      { min: -10, max: 25 },
  superpeak: { min: -15, max: 35 },
};

const PRINCIPLES = [
  { label: "Anchor", value: "2n at parity" },
  { label: "Channel markup", value: "Baked into BAR" },
  { label: "5-night discount", value: "Adjustable below" },
  { label: "7-night discount", value: "Adjustable below" },
  { label: "Cleaning amortisation", value: "CF / LOS" },
];

// ============ HELPERS ============
const inSeason = (month, day, season) => {
  const md = month * 100 + day;
  const start = season.startMonth * 100 + season.startDay;
  const end = season.endMonth * 100 + season.endDay;
  if (start <= end) return md >= start && md <= end;
  return md >= start || md <= end;
};

const parseCSV = (text) => {
  // Replicates the structure of the LOS CSV files: row 0 = listing names (3-col groups),
  // row 1 = "prices,available,min_stay" header, row 2 = "Date,,,..." sentinel, row 3+ = data.
  // Result: { dates: [...], prices: [{listingName: [prices...]}, ...] }
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 4) throw new Error("CSV has too few rows");

  const splitCSV = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };

  // Row 0: listing names appear in groups of 3 columns (price, available, min_stay)
  const headerRow = splitCSV(lines[0]);
  const listings = [];
  for (let i = 1; i < headerRow.length; i += 3) {
    const name = headerRow[i].trim();
    if (name) listings.push({ name, priceCol: i });
  }

  // Data starts at row 3
  const dates = [];
  const priceData = listings.map(() => []);
  for (let r = 3; r < lines.length; r++) {
    const cols = splitCSV(lines[r]);
    if (!cols[0] || !cols[0].trim()) continue;
    dates.push(cols[0].trim());
    listings.forEach((listing, idx) => {
      const raw = cols[listing.priceCol];
      const num = parseFloat(raw);
      priceData[idx].push(isNaN(num) || num < 0 ? null : num);
    });
  }

  return { listings: listings.map((l) => l.name), dates, priceData };
};

const parseDate = (s) => {
  // ISO "YYYY-MM-DD"
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, month: m, day: d };
};

const median = (arr) => {
  const clean = arr.filter((v) => v != null && !isNaN(v));
  if (!clean.length) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const mean = (arr) => {
  const clean = arr.filter((v) => v != null && !isNaN(v));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
};

// ============ COMPONENTS ============
const FileDrop = ({ label, file, onFile, hint }) => {
  const [drag, setDrag] = useState(false);

  const handleFiles = (files) => {
    if (!files || !files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => onFile(files[0].name, e.target.result);
    reader.readAsText(files[0]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`relative border border-dashed rounded p-3 transition-all ${
        file ? "border-stone-700 bg-stone-50" : drag ? "border-amber-700 bg-amber-50" : "border-stone-300 bg-white hover:border-stone-500"
      }`}
    >
      <input
        type="file"
        accept=".csv"
        onChange={(e) => handleFiles(e.target.files)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
      <div className="text-xs uppercase tracking-widest text-stone-500 mb-1">{label}</div>
      <div className="font-mono text-sm text-stone-900 truncate">
        {file ? file : "Drop CSV or click"}
      </div>
      {hint && <div className="text-[11px] text-stone-400 mt-1">{hint}</div>}
    </div>
  );
};

const ImageDrop = ({ onExtract, extracting, extractError, listingNames }) => {
  const [drag, setDrag] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);

  const handleFiles = async (files) => {
    if (!files || !files[0]) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      alert("Please drop an image file (PNG, JPG)");
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(",")[1];
      const mediaType = file.type;
      setImgPreview(e.target.result);
      onExtract(base64, mediaType);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`relative border border-dashed rounded p-4 transition-all ${
        drag ? "border-amber-700 bg-amber-50" :
        imgPreview ? "border-stone-700 bg-stone-50" :
        "border-stone-300 bg-white hover:border-stone-500"
      }`}
    >
      <input
        type="file"
        accept="image/*"
        onChange={(e) => handleFiles(e.target.files)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        disabled={extracting}
      />
      <div className="flex items-center gap-4">
        {imgPreview && (
          <img
            src={imgPreview}
            alt="cleaning fees screenshot"
            className="w-16 h-16 object-cover rounded border border-stone-300 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">
            Cleaning fees screenshot {!listingNames?.length && <span className="normal-case tracking-normal text-stone-400">(upload 3n CSV first)</span>}
          </div>
          <div className="font-mono text-sm text-stone-900">
            {extracting ? "Reading image…" : imgPreview ? "Image loaded" : "Drop PriceLabs screenshot or click"}
          </div>
          {extractError && (
            <div className="text-[11px] text-red-700 mt-1">{extractError}</div>
          )}
          {!extractError && !extracting && (
            <div className="text-[11px] text-stone-400 mt-1">
              Auto-fills the compset cleaning fee fields below
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


const Stat = ({ label, value, hint }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
    <div className="font-serif text-2xl text-stone-900 leading-tight mt-1">{value}</div>
    {hint && <div className="text-[11px] text-stone-500 mt-0.5">{hint}</div>}
  </div>
);

const tierColors = {
  soft:      { bg: "bg-blue-50",   text: "text-blue-900",   accent: "border-l-blue-700" },
  shoulder:  { bg: "bg-stone-50",  text: "text-stone-900",  accent: "border-l-stone-500" },
  peak:      { bg: "bg-amber-50",  text: "text-amber-900",  accent: "border-l-amber-700" },
  superpeak: { bg: "bg-red-50",    text: "text-red-900",    accent: "border-l-red-800" },
};

// Parser for the user's existing PriceLabs Custom Seasonal Profile CSV
// Returns { headers: [...], rows: [{header: value, ...}] }
const parsePriceLabsProfile = (text) => {
  const splitCSV = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV is empty");

  const headers = splitCSV(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitCSV(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
};

// Serialize back to PriceLabs CSV format with quoted values (matches their export format)
const serializePriceLabsProfile = ({ headers, rows }) => {
  const escapeField = (v) => {
    const s = String(v ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(",")]; // headers unquoted (matches example)
  rows.forEach((row) => {
    const vals = headers.map((h) => escapeField(row[h]));
    lines.push(vals.join(","));
  });
  return lines.join("\n");
};

// ============ MAIN ============
export default function SeasonalityRecalibrator() {
  const [files, setFiles] = useState({});
  const [yourCleaningFee, setYourCleaningFee] = useState(160);
  const [yourMarkup, setYourMarkup] = useState(18);
  const [currentBase, setCurrentBase] = useState(200);
  const [currentMin, setCurrentMin] = useState(130);
  const [currentMax, setCurrentMax] = useState(400);
  const [yourListing, setYourListing] = useState("");
  const [compsetCleaningFees, setCompsetCleaningFees] = useState({});
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);

  // Adjustable LOS discount percentages
  const [losDiscount5n, setLosDiscount5n] = useState(8);
  const [losDiscount7n, setLosDiscount7n] = useState(12);
  // Adjustable 2n target premium (0 = parity)
  const [target2nPremium, setTarget2nPremium] = useState(0);

  // Current PriceLabs profile uploaded by user (will be edited and re-downloaded)
  const [currentProfile, setCurrentProfile] = useState(null); // { headers: [], rows: [{...}] }
  // Per-season approval state — which seasons should get updated values
  const [approved, setApproved] = useState({});

  const extractCleaningFees = async (base64, mediaType) => {
    if (!files[3]) {
      setExtractError("Upload the 3-night CSV first so we know the listing names");
      return;
    }
    setExtracting(true);
    setExtractError(null);

    const listings = files[3].parsed.listings;
    const listingsForPrompt = listings.map((l, i) => `${i + 1}. ${l}`).join("\n");

    const prompt = `You are looking at a screenshot from PriceLabs showing competitor cleaning fees. Extract the cleaning fee for each of these listings:

${listingsForPrompt}

The screenshot shows listing names with truncation (e.g. "Enjoy something SWEET..stay at 'Chocolate Moo..." for "Chocolate Moose"). Match each listing in the screenshot to one in my list above using fuzzy matching on visible keywords.

Return ONLY a JSON object with no other text, no markdown, no code fences. Format:
{"listing_name_1": fee_number, "listing_name_2": fee_number, ...}

Use the EXACT listing names from my list above as keys. Use numeric values (no $ sign, no quotes around numbers). If you can't find a fee for a listing, omit it from the JSON.`;

    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
                { type: "text", text: prompt },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API returned ${response.status}`);
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      // Strip any markdown fences just in case
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      // Update fees, but separate "yours" from "compset"
      const newCompsetFees = { ...compsetCleaningFees };
      let yourFeeFound = null;
      let foundCount = 0;

      Object.entries(parsed).forEach(([listing, fee]) => {
        const numFee = parseFloat(fee);
        if (isNaN(numFee)) return;
        if (listing === yourListing) {
          yourFeeFound = numFee;
        } else if (listings.includes(listing)) {
          newCompsetFees[listing] = numFee;
          foundCount++;
        }
      });

      if (yourFeeFound != null) setYourCleaningFee(yourFeeFound);
      setCompsetCleaningFees(newCompsetFees);

      if (foundCount === 0 && yourFeeFound == null) {
        setExtractError("Couldn't match any listings — check that screenshot matches the CSV listings");
      }
    } catch (e) {
      setExtractError(`Extraction failed: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  // ============ Profile upload / approval / download ============
  const handleProfileUpload = (filename, content) => {
    try {
      const parsed = parsePriceLabsProfile(content);
      setCurrentProfile({ filename, ...parsed });
      // Reset approvals
      setApproved({});
    } catch (e) {
      alert(`Failed to parse profile: ${e.message}`);
    }
  };

  const toggleApproval = (seasonName) => {
    setApproved((a) => ({ ...a, [seasonName]: !a[seasonName] }));
  };

  const setAllApproved = (value) => {
    if (!currentProfile) return;
    const next = {};
    currentProfile.rows.forEach((row) => {
      next[row["SEASON NAME"]] = value;
    });
    setApproved(next);
  };

  const downloadUpdatedProfile = () => {
    if (!currentProfile || !analysis) return;

    // Build a lookup from analysis: seasonName → calculated values
    const calcLookup = {};
    analysis.seasonResults.forEach((s) => {
      if (s.deltaRounded == null || analysis.suggestedBASE == null) return;
      const minPct = s.seasonMin != null ? Math.round((s.seasonMin / analysis.suggestedBASE - 1) * 100) : null;
      const maxPct = s.seasonMax != null ? Math.round((s.seasonMax / analysis.suggestedBASE - 1) * 100) : null;
      calcLookup[s.name] = {
        base: Math.round(s.deltaRounded), // delta rounded to int %
        min: minPct,
        max: maxPct,
      };
    });

    // Apply updates only to APPROVED seasons
    const updatedRows = currentProfile.rows.map((row) => {
      const seasonName = row["SEASON NAME"];
      if (!approved[seasonName]) return row; // unchanged
      const calc = calcLookup[seasonName];
      if (!calc) return row; // no calculated value available — keep original
      return {
        ...row,
        "MIN PRICE": calc.min != null ? String(calc.min) : row["MIN PRICE"],
        "BASE PRICE": calc.base != null ? String(calc.base) : row["BASE PRICE"],
        "MAX PRICE": calc.max != null ? String(calc.max) : row["MAX PRICE"],
      };
    });

    const csv = serializePriceLabsProfile({
      headers: currentProfile.headers,
      rows: updatedRows,
    });

    // Trigger browser download
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().split("T")[0];
    a.download = `PriceLabs_Seasonal_Profile_Updated_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (los) => (filename, content) => {
    try {
      const parsed = parseCSV(content);
      setFiles((f) => ({ ...f, [los]: { filename, parsed } }));
      // Auto-detect listings on first upload
      if (!yourListing && parsed.listings.length > 0) {
        const yourGuess = parsed.listings.find((l) => /your|moonshine|mine/i.test(l));
        setYourListing(yourGuess || parsed.listings[parsed.listings.length - 1]);
        // Default cleaning fees for compset
        const fees = {};
        parsed.listings.forEach((l) => {
          if (l !== (yourGuess || parsed.listings[parsed.listings.length - 1])) {
            fees[l] = 150; // default
          }
        });
        setCompsetCleaningFees(fees);
      }
    } catch (e) {
      alert(`Failed to parse ${filename}: ${e.message}`);
    }
  };

  // ============ ANALYSIS ============
  const analysis = useMemo(() => {
    if (!files[3] || !yourListing) return null;

    const f3 = files[3].parsed;
    const f5 = files[5]?.parsed;
    const f7 = files[7]?.parsed;
    const f2 = files[2]?.parsed;

    const yourIdx = f3.listings.indexOf(yourListing);
    if (yourIdx < 0) return null;

    // === Compute true nightly rate for YOUR listing per day, derived from 3n LOS ===
    // true_nightly = displayed_3n - cf/3
    const yourTrue3n = f3.priceData[yourIdx].map((p) =>
      p == null ? null : p - yourCleaningFee / 3
    );

    // === Annual mean = personal annual base ===
    const annualMean = mean(yourTrue3n);

    // === Per-season delta% (3n primary, fall back to 5n then 7n for super-peaks) ===
    const seasonResults = SEASONS.map((season) => {
      const values3n = [];
      f3.dates.forEach((dStr, i) => {
        const { month, day } = parseDate(dStr);
        if (inSeason(month, day, season)) {
          if (yourTrue3n[i] != null) values3n.push(yourTrue3n[i]);
        }
      });

      // Primary: 3n
      let seasonMean = mean(values3n);
      let dataSource = "3n";
      let daysWithData = values3n.length;

      // Fallback 1: 5n if no 3n data
      if (seasonMean == null && f5) {
        const yourIdx5 = f5.listings.indexOf(yourListing);
        if (yourIdx5 >= 0) {
          const yourTrue5n = f5.priceData[yourIdx5].map((p) =>
            p == null ? null : p - yourCleaningFee / 5
          );
          const values5n = [];
          f5.dates.forEach((dStr, i) => {
            const { month, day } = parseDate(dStr);
            if (inSeason(month, day, season)) {
              if (yourTrue5n[i] != null) values5n.push(yourTrue5n[i]);
            }
          });
          if (values5n.length > 0) {
            seasonMean = mean(values5n);
            dataSource = "5n";
            daysWithData = values5n.length;
          }
        }
      }

      // Fallback 2: 7n if still no data
      if (seasonMean == null && f7) {
        const yourIdx7 = f7.listings.indexOf(yourListing);
        if (yourIdx7 >= 0) {
          const yourTrue7n = f7.priceData[yourIdx7].map((p) =>
            p == null ? null : p - yourCleaningFee / 7
          );
          const values7n = [];
          f7.dates.forEach((dStr, i) => {
            const { month, day } = parseDate(dStr);
            if (inSeason(month, day, season)) {
              if (yourTrue7n[i] != null) values7n.push(yourTrue7n[i]);
            }
          });
          if (values7n.length > 0) {
            seasonMean = mean(values7n);
            dataSource = "7n";
            daysWithData = values7n.length;
          }
        }
      }

      const dataAvailable = seasonMean != null;
      const deltaRaw = dataAvailable ? ((seasonMean / annualMean) - 1) * 100 : null;
      // Round to 1 decimal place for clean display, but keep precision (no 5% bucketing)
      const deltaRounded = deltaRaw == null ? null : Math.round(deltaRaw * 10) / 10;
      return { ...season, seasonMean, deltaRaw, deltaRounded, daysWithData, dataSource };
    });

    // === Compute compset 3n median (for benchmark) ===
    // Use only listings that aren't yours
    const compIdxs = f3.listings.map((l, i) => (l === yourListing ? -1 : i)).filter((i) => i >= 0);
    const compset3nMedians = f3.dates.map((_, dayIdx) => {
      const dayPrices = compIdxs.map((ci) => f3.priceData[ci][dayIdx]).filter((v) => v != null);
      return median(dayPrices);
    });
    const compset3nAnnual = median(compset3nMedians);

    // 2n compset median — THIS IS THE NEW ANCHOR
    let compset2nAnnual = null;
    if (f2) {
      const compIdxs2 = f2.listings.map((l, i) => (l === yourListing ? -1 : i)).filter((i) => i >= 0);
      const compset2nMedians = f2.dates.map((_, dayIdx) => {
        const dp = compIdxs2.map((ci) => f2.priceData[ci][dayIdx]).filter((v) => v != null);
        return median(dp);
      });
      compset2nAnnual = median(compset2nMedians);
    }

    // 5n and 7n compset medians (for cross-checking LOS strategy)
    let compset5nAnnual = null, compset7nAnnual = null;
    let compsetTrue3nAnnual = null, compsetTrue5nAnnual = null, compsetTrue7nAnnual = null;
    if (f5) {
      const compIdxs5 = f5.listings.map((l, i) => (l === yourListing ? -1 : i)).filter((i) => i >= 0);
      const compset5nMedians = f5.dates.map((_, dayIdx) => {
        const dp = compIdxs5.map((ci) => f5.priceData[ci][dayIdx]).filter((v) => v != null);
        return median(dp);
      });
      compset5nAnnual = median(compset5nMedians);

      // True 5n nightly = displayed - avg(cf)/5
      const avgCompCF = mean(Object.values(compsetCleaningFees));
      compsetTrue5nAnnual = compset5nAnnual != null && avgCompCF != null
        ? compset5nAnnual - avgCompCF / 5
        : null;
    }
    if (f7) {
      const compIdxs7 = f7.listings.map((l, i) => (l === yourListing ? -1 : i)).filter((i) => i >= 0);
      const compset7nMedians = f7.dates.map((_, dayIdx) => {
        const dp = compIdxs7.map((ci) => f7.priceData[ci][dayIdx]).filter((v) => v != null);
        return median(dp);
      });
      compset7nAnnual = median(compset7nMedians);
      const avgCompCF = mean(Object.values(compsetCleaningFees));
      compsetTrue7nAnnual = compset7nAnnual != null && avgCompCF != null
        ? compset7nAnnual - avgCompCF / 7
        : null;
    }
    const avgCompCF = mean(Object.values(compsetCleaningFees));
    compsetTrue3nAnnual = compset3nAnnual != null && avgCompCF != null
      ? compset3nAnnual - avgCompCF / 3
      : null;

    // === Suggested BAR (2n parity, with adjustable premium) ===
    // Goal: Your 2n displayed = compset 2n displayed × (1 + target2nPremium/100)
    // Your 2n displayed = (BAR × 2 + your_cf) / 2 = BAR + your_cf/2
    // Solve: BAR + your_cf/2 = compset_2n_median × (1 + target2nPremium/100)
    //        BAR = compset_2n_median × (1 + target2nPremium/100) - your_cf/2
    //
    // Fallback: if 2n CSV not uploaded, derive from 3n median (less accurate)
    const targetDisplayed2n = compset2nAnnual != null
      ? compset2nAnnual * (1 + target2nPremium / 100)
      : null;
    let suggestedBASE_raw = null;
    let basisUsed = null;
    if (compset2nAnnual != null) {
      suggestedBASE_raw = compset2nAnnual * (1 + target2nPremium / 100) - yourCleaningFee / 2;
      basisUsed = "2n";
    } else if (compset3nAnnual != null) {
      suggestedBASE_raw = compset3nAnnual * (1 + target2nPremium / 100) - yourCleaningFee / 3;
      basisUsed = "3n (fallback — upload 2n CSV for accurate anchor)";
    }
    const suggestedBASE = suggestedBASE_raw != null ? Math.round(suggestedBASE_raw / 5) * 5 : null;

    // Track deepest/hottest seasonal Δ% for the reasoning blurb
    const validDeltas = seasonResults.filter(s => s.deltaRounded != null).map(s => s.deltaRounded);
    const minSeasonDelta = validDeltas.length ? Math.min(...validDeltas) : null;
    const maxSeasonDelta = validDeltas.length ? Math.max(...validDeltas) : null;

    // === Per-season MIN/MAX (NEW POLICY) ===
    // The user's spec: MIN range = BASE × 0.60 to BASE × 0.70 (30–40% below BASE)
    //                  MAX range = BASE × 1.75 to BASE × 2.50 (75–150% above BASE)
    //
    // Logic: each season gets its OWN MIN and MAX, derived from its effective rate.
    // - In LOW seasons (deep negative Δ%): MIN drops further to allow last-minute discounting
    // - In HIGH seasons (large positive Δ%): MIN rises to protect ADR (don't undercut peak premium)
    // - MAX scales with the season's effective rate too: peaks get higher MAX to allow surge
    //
    // Implementation:
    //   season_min = effective × 0.85   (15% below the season's effective)
    //   season_max = effective × 1.40   (40% above the season's effective)
    //
    // Then the global MIN/MAX shown in the headline are the floor of all season MINs
    // and the ceiling of all season MAXs (which PriceLabs will use as hard limits).
    //
    // Compute per-season MIN/MAX
    const seasonMinMax = seasonResults.map((s) => {
      if (suggestedBASE == null || s.deltaRounded == null) {
        return { ...s, effective: null, seasonMin: null, seasonMax: null };
      }
      const effective = suggestedBASE * (1 + s.deltaRounded / 100);
      // Tier-aware bands: tighter on peaks (protect ADR), looser on soft (allow discounts)
      let minMultiplier, maxMultiplier;
      if (s.tier === "soft") {
        minMultiplier = 0.80;   // 20% below — last-minute discounts allowed
        maxMultiplier = 1.30;   // 30% above — soft seasons rarely need surge
      } else if (s.tier === "shoulder") {
        minMultiplier = 0.85;   // 15% below
        maxMultiplier = 1.40;   // 40% above
      } else if (s.tier === "peak") {
        minMultiplier = 0.90;   // 10% below — protect peak ADR more strictly
        maxMultiplier = 1.55;   // 55% above — allow surge during peak demand
      } else if (s.tier === "superpeak") {
        minMultiplier = 0.92;   // 8% below — strongest ADR protection
        maxMultiplier = 1.75;   // 75% above — biggest surge headroom
      }
      const seasonMin = Math.round(effective * minMultiplier / 5) * 5;
      const seasonMax = Math.round(effective * maxMultiplier / 5) * 5;
      return { ...s, effective, seasonMin, seasonMax };
    });

    // Global MIN/MAX = floor and ceiling across all seasons
    // These get applied as PriceLabs hard guardrails (per-season MIN/MAX live in the seasonal CSV rows)
    const validSeasons = seasonMinMax.filter((s) => s.seasonMin != null);
    const globalMIN = validSeasons.length
      ? Math.min(...validSeasons.map((s) => s.seasonMin))
      : null;
    const globalMAX = validSeasons.length
      ? Math.max(...validSeasons.map((s) => s.seasonMax))
      : null;

    // Apply user's specified absolute bands as outer clamp:
    //   global MIN must sit between BASE × 0.60 and BASE × 0.70
    //   global MAX must sit between BASE × 1.75 and BASE × 2.50
    const minBandLow = suggestedBASE != null ? suggestedBASE * 0.60 : null;
    const minBandHigh = suggestedBASE != null ? suggestedBASE * 0.70 : null;
    const maxBandLow = suggestedBASE != null ? suggestedBASE * 1.75 : null;
    const maxBandHigh = suggestedBASE != null ? suggestedBASE * 2.50 : null;

    const suggestedMIN = globalMIN != null && minBandLow != null && minBandHigh != null
      ? Math.round(Math.max(minBandLow, Math.min(minBandHigh, globalMIN)) / 5) * 5
      : null;
    const suggestedMAX = globalMAX != null && maxBandLow != null && maxBandHigh != null
      ? Math.round(Math.max(maxBandLow, Math.min(maxBandHigh, globalMAX)) / 5) * 5
      : null;

    return {
      yourTrue3n,
      annualMean,
      seasonResults: seasonMinMax,
      compset2nAnnual,
      compset3nAnnual,
      compset5nAnnual,
      compset7nAnnual,
      compsetTrue3nAnnual,
      compsetTrue5nAnnual,
      compsetTrue7nAnnual,
      targetDisplayed2n,
      suggestedBASE,
      suggestedMIN,
      suggestedMAX,
      minSeasonDelta,
      maxSeasonDelta,
      basisUsed,
    };
  }, [files, yourListing, yourCleaningFee, yourMarkup, compsetCleaningFees, target2nPremium, losDiscount5n, losDiscount7n]);

  const allLOSReady = files[2] && files[3] && files[5] && files[7];

  return (
    <div className="min-h-screen bg-stone-100" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        body { background: #f5f4f0; }
        .font-serif { font-family: 'Cormorant Garamond', serif; letter-spacing: -0.01em; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <header className="mb-12 pb-6 border-b border-stone-300">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-3">
            Revenue Management · Seasonality Calibration
          </div>
          <h1 className="font-serif text-5xl text-stone-900 leading-none">
            Recalibrator
          </h1>
          <p className="text-stone-600 mt-3 max-w-2xl text-sm leading-relaxed">
            Drop your compset LOS calendars, set your markup and current pricing,
            and get a recalibrated seasonality profile derived from real 3-night booking experience.
          </p>
        </header>

        {/* Principles */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-3">
            Principles applied
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-stone-300 border border-stone-300 rounded overflow-hidden">
            {PRINCIPLES.map((p) => (
              <div key={p.label} className="bg-stone-50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-stone-500">{p.label}</div>
                <div className="font-mono text-sm text-stone-900 mt-1">{p.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Inputs */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-4">
            01 — Compset LOS Calendars
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[2, 3, 5, 7].map((los) => (
              <FileDrop
                key={los}
                label={`${los}-night calendar`}
                file={files[los]?.filename}
                onFile={handleFile(los)}
                hint={los === 3 ? "Required" : "Optional"}
              />
            ))}
          </div>
        </section>

        {/* Section 02 — Your fees & current pricing (always visible) */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-4">
            02 — Your listing & fees
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 block mb-1">
                Your listing in compset {!files[3] && <span className="text-stone-400 normal-case tracking-normal">(populates after CSV upload)</span>}
              </label>
              {files[3] ? (
                <select
                  value={yourListing}
                  onChange={(e) => setYourListing(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-amber-700"
                >
                  {files[3].parsed.listings.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-stone-100 border border-stone-200 rounded px-3 py-2 font-mono text-sm text-stone-400">
                  Upload 3-night CSV first
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 block mb-1">
                Your cleaning fee ($)
              </label>
              <input
                type="number"
                value={yourCleaningFee}
                onChange={(e) => setYourCleaningFee(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-stone-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-amber-700"
              />
            </div>
          </div>

          {/* Compset cleaning fees — only show after CSV upload (need listing names) */}
          {files[3] && (
            <>
              <div className="mb-4">
                <ImageDrop
                  onExtract={extractCleaningFees}
                  extracting={extracting}
                  extractError={extractError}
                  listingNames={files[3].parsed.listings}
                />
              </div>
              <div className="bg-white border border-stone-300 rounded p-4 mb-4">
                <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-3">
                  Compset cleaning fees
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {files[3].parsed.listings
                    .filter((l) => l !== yourListing)
                    .map((l) => (
                      <div key={l}>
                        <div className="text-[11px] text-stone-600 truncate mb-1" title={l}>
                          {l}
                        </div>
                        <input
                          type="number"
                          value={compsetCleaningFees[l] ?? 150}
                          onChange={(e) =>
                            setCompsetCleaningFees((c) => ({ ...c, [l]: parseFloat(e.target.value) || 0 }))
                          }
                          className="w-full bg-stone-50 border border-stone-200 rounded px-2 py-1 font-mono text-sm focus:outline-none focus:border-amber-700"
                        />
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Section 03 — Markup + current pricing (always visible) */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-4">
            03 — Markup & current pricing
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 block mb-1">
                Channel markup (%)
              </label>
              <input
                type="number"
                value={yourMarkup}
                onChange={(e) => setYourMarkup(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-stone-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-amber-700"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 block mb-1">
                Current BASE ($)
              </label>
              <input
                type="number"
                value={currentBase}
                onChange={(e) => setCurrentBase(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-stone-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-amber-700"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 block mb-1">
                Current MIN ($)
              </label>
              <input
                type="number"
                value={currentMin}
                onChange={(e) => setCurrentMin(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-stone-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-amber-700"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-stone-500 block mb-1">
                Current MAX ($)
              </label>
              <input
                type="number"
                value={currentMax}
                onChange={(e) => setCurrentMax(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-stone-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-amber-700"
              />
            </div>
          </div>
        </section>

        {/* OUTPUT */}
        {analysis && (
          <>
            {/* Headline metrics */}
            <section className="mb-10">
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-4">
                04 — Recalibrated anchors
              </div>
              <div className="bg-white border border-stone-300 rounded">
                <div className="grid grid-cols-3 gap-px bg-stone-300">
                  <div className="bg-white p-5">
                    <div className="text-[10px] uppercase tracking-widest text-stone-500">
                      BASE
                    </div>
                    <div className="font-serif text-4xl text-stone-900 mt-2">
                      ${analysis.suggestedBASE ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-stone-500 mt-1">
                      Current ${currentBase}{" "}
                      {analysis.suggestedBASE && (
                        <span
                          className={analysis.suggestedBASE > currentBase ? "text-green-700" : "text-red-700"}
                        >
                          ({analysis.suggestedBASE > currentBase ? "+" : ""}
                          {analysis.suggestedBASE - currentBase})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-5">
                    <div className="text-[10px] uppercase tracking-widest text-stone-500">
                      MIN
                    </div>
                    <div className="font-serif text-4xl text-stone-900 mt-2">
                      ${analysis.suggestedMIN ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-stone-500 mt-1">
                      Current ${currentMin}{" "}
                      {analysis.suggestedMIN && (
                        <span
                          className={analysis.suggestedMIN > currentMin ? "text-green-700" : "text-red-700"}
                        >
                          ({analysis.suggestedMIN > currentMin ? "+" : ""}
                          {analysis.suggestedMIN - currentMin})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-5">
                    <div className="text-[10px] uppercase tracking-widest text-stone-500">
                      MAX
                    </div>
                    <div className="font-serif text-4xl text-stone-900 mt-2">
                      ${analysis.suggestedMAX ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-stone-500 mt-1">
                      Current ${currentMax}{" "}
                      {analysis.suggestedMAX && (
                        <span
                          className={analysis.suggestedMAX > currentMax ? "text-green-700" : "text-red-700"}
                        >
                          ({analysis.suggestedMAX > currentMax ? "+" : ""}
                          {analysis.suggestedMAX - currentMax})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="mt-4 p-4 bg-amber-50 border-l-4 border-amber-700 text-sm text-stone-800 leading-relaxed">
                <div className="font-mono text-[10px] uppercase tracking-widest text-amber-900 mb-2">
                  Reasoning
                </div>
                BASE = compset 2n median (${analysis.compset2nAnnual?.toFixed(0) ?? "—"})
                {target2nPremium !== 0 && <> × {(1 + target2nPremium/100).toFixed(3)}</>}
                {" "}− cleaning_fee/2 (${(yourCleaningFee / 2).toFixed(0)}) =
                {" "}<span className="font-mono">${analysis.suggestedBASE}</span>.
                This puts your displayed 2n price at{" "}
                {target2nPremium === 0 ? "parity with" : `${target2nPremium > 0 ? "+" : ""}${target2nPremium}% vs`} compset.
                The {yourMarkup}% channel markup is baked into BAR (vs. your direct rate of
                {" "}${analysis.suggestedBASE != null ? Math.round(analysis.suggestedBASE / (1 + yourMarkup/100)) : "—"}).
                LOS discounts ({losDiscount5n}% at 5n, {losDiscount7n}% at 7n) modulate longer-stay positioning.
                <br /><br />
                <span className="font-mono uppercase tracking-widest text-[10px] text-amber-900">Per-season MIN/MAX:</span>{" "}
                Each season has its own MIN and MAX (see column 06 below) — soft seasons get a wider band to allow last-minute discounts,
                peaks get a tighter MIN to protect ADR (don't undercut your premium) and a looser MAX to allow demand surge.
                <br />
                Tier bands: soft {-20}%/{30}% · shoulder {-15}%/{40}% · peak {-10}%/{55}% · super-peak {-8}%/{75}% off the season's effective rate.
                The headline MIN/MAX (${analysis.suggestedMIN} / ${analysis.suggestedMAX}) are the global floor and ceiling across all seasons,
                clamped within your specified absolute bands (BASE × 0.60–0.70 for MIN, BASE × 1.75–2.50 for MAX).
              </div>
            </section>

            {/* Compset position check */}
            {(files[2] || files[5] || files[7]) && (
              <section className="mb-10">
                <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-4">
                  05 — Guest-facing position check
                </div>

                {/* Adjustment controls */}
                <div className="bg-stone-50 border border-stone-300 rounded p-4 mb-4">
                  <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-3">
                    Tune the premium
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[11px] text-stone-600 block mb-1.5">
                        2n target premium vs compset (%)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="-10"
                          max="25"
                          step="0.5"
                          value={target2nPremium}
                          onChange={(e) => setTarget2nPremium(parseFloat(e.target.value))}
                          className="flex-1 accent-amber-700"
                        />
                        <input
                          type="number"
                          step="0.5"
                          value={target2nPremium}
                          onChange={(e) => setTarget2nPremium(parseFloat(e.target.value) || 0)}
                          className="w-16 bg-white border border-stone-300 rounded px-2 py-1 font-mono text-sm text-right focus:outline-none focus:border-amber-700"
                        />
                      </div>
                      <div className="text-[10px] text-stone-400 mt-1 font-mono">
                        0% = parity · positive = above compset · negative = under
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-600 block mb-1.5">
                        5-night LOS discount (%)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="20"
                          step="0.5"
                          value={losDiscount5n}
                          onChange={(e) => setLosDiscount5n(parseFloat(e.target.value))}
                          className="flex-1 accent-amber-700"
                        />
                        <input
                          type="number"
                          step="0.5"
                          value={losDiscount5n}
                          onChange={(e) => setLosDiscount5n(parseFloat(e.target.value) || 0)}
                          className="w-16 bg-white border border-stone-300 rounded px-2 py-1 font-mono text-sm text-right focus:outline-none focus:border-amber-700"
                        />
                      </div>
                      <div className="text-[10px] text-stone-400 mt-1 font-mono">
                        Applied to 5-6 night bookings
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-600 block mb-1.5">
                        7-night LOS discount (%)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="25"
                          step="0.5"
                          value={losDiscount7n}
                          onChange={(e) => setLosDiscount7n(parseFloat(e.target.value))}
                          className="flex-1 accent-amber-700"
                        />
                        <input
                          type="number"
                          step="0.5"
                          value={losDiscount7n}
                          onChange={(e) => setLosDiscount7n(parseFloat(e.target.value) || 0)}
                          className="w-16 bg-white border border-stone-300 rounded px-2 py-1 font-mono text-sm text-right focus:outline-none focus:border-amber-700"
                        />
                      </div>
                      <div className="text-[10px] text-stone-400 mt-1 font-mono">
                        Applied to 7+ night bookings
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-stone-300 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-100 text-[10px] uppercase tracking-widest text-stone-600">
                      <tr>
                        <th className="text-left py-2.5 px-4 font-medium">Stay length</th>
                        <th className="text-right py-2.5 px-4 font-medium">Compset displayed</th>
                        <th className="text-right py-2.5 px-4 font-medium">Your displayed (proposed)</th>
                        <th className="text-right py-2.5 px-4 font-medium">Premium</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {[
                        { los: 2, discount: 0, compsetDisplayed: analysis.compset2nAnnual, label: "2-night stay (anchor)" },
                        { los: 3, discount: 0, compsetDisplayed: analysis.compset3nAnnual, label: "3-night stay" },
                        { los: 5, discount: losDiscount5n, compsetDisplayed: analysis.compset5nAnnual, label: "5-night stay" },
                        { los: 7, discount: losDiscount7n, compsetDisplayed: analysis.compset7nAnnual, label: "7-night stay" },
                      ].map(({ los, discount, compsetDisplayed, label }) => {
                        if (compsetDisplayed == null || analysis.suggestedBASE == null) return null;
                        const yourDisplayed =
                          (analysis.suggestedBASE * los * (1 - discount / 100) + yourCleaningFee) / los;
                        const premPct = (yourDisplayed / compsetDisplayed - 1) * 100;
                        return (
                          <tr key={los} className="border-t border-stone-200">
                            <td className="py-2.5 px-4 font-sans text-stone-700">{label}</td>
                            <td className="text-right py-2.5 px-4 text-stone-700">
                              ${compsetDisplayed.toFixed(0)}
                            </td>
                            <td className="text-right py-2.5 px-4 text-stone-900">
                              ${yourDisplayed.toFixed(0)}
                              {discount > 0 && (
                                <span className="text-stone-400 text-xs ml-1">({discount}% off)</span>
                              )}
                            </td>
                            <td className={`text-right py-2.5 px-4 ${premPct > 5 ? "text-amber-800" : premPct > -5 ? "text-stone-600" : "text-green-800"}`}>
                              {premPct >= 0 ? "+" : ""}{premPct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Per-season suggestions */}
            <section className="mb-10">
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-4">
                06 — Per-season Δ% (3n-derived)
              </div>
              <div className="bg-white border border-stone-300 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-stone-100 text-[10px] uppercase tracking-widest text-stone-600">
                    <tr>
                      <th className="text-left py-2.5 px-4 font-medium">Season</th>
                      <th className="text-left py-2.5 px-4 font-medium">Tier</th>
                      <th className="text-right py-2.5 px-4 font-medium">Source rate</th>
                      <th className="text-right py-2.5 px-4 font-medium">Δ% (base)</th>
                      <th className="text-right py-2.5 px-4 font-medium">Effective</th>
                      <th className="text-right py-2.5 px-4 font-medium">Min %</th>
                      <th className="text-right py-2.5 px-4 font-medium">Max %</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {analysis.seasonResults.map((s, idx) => {
                      const colors = tierColors[s.tier];
                      return (
                        <tr key={s.name} className={`border-t border-stone-200 border-l-4 ${colors.accent}`}>
                          <td className="py-2 px-4 font-sans text-stone-900">
                            {s.name}
                            {s.daysWithData === 0 && (
                              <span className="ml-2 text-[10px] text-red-700 font-mono">no data</span>
                            )}
                            {s.dataSource && s.dataSource !== "3n" && (
                              <span className="ml-2 text-[10px] text-amber-800 font-mono uppercase tracking-wider">
                                via {s.dataSource}
                              </span>
                            )}
                          </td>
                          <td className={`py-2 px-4 text-[10px] uppercase tracking-widest ${colors.text}`}>
                            {s.tier}
                          </td>
                          <td className="text-right py-2 px-4 text-stone-700">
                            {s.seasonMean ? `$${s.seasonMean.toFixed(0)}` : "—"}
                          </td>
                          <td className={`text-right py-2 px-4 font-medium ${
                            s.deltaRounded == null ? "text-stone-400" :
                            s.deltaRounded > 0 ? "text-amber-900" :
                            s.deltaRounded < 0 ? "text-blue-900" : "text-stone-700"
                          }`}>
                            {s.deltaRounded == null ? "—" : `${s.deltaRounded > 0 ? "+" : ""}${s.deltaRounded.toFixed(1)}%`}
                          </td>
                          <td className="text-right py-2 px-4 text-stone-900">
                            {s.effective ? `$${s.effective.toFixed(0)}` : "—"}
                          </td>
                          <td className="text-right py-2 px-4 text-blue-900">
                            {s.seasonMin != null && analysis.suggestedBASE != null
                              ? (() => {
                                  const minPct = (s.seasonMin / analysis.suggestedBASE - 1) * 100;
                                  return `${minPct > 0 ? "+" : ""}${minPct.toFixed(0)}%`;
                                })()
                              : "—"}
                          </td>
                          <td className="text-right py-2 px-4 text-amber-900">
                            {s.seasonMax != null && analysis.suggestedBASE != null
                              ? (() => {
                                  const maxPct = (s.seasonMax / analysis.suggestedBASE - 1) * 100;
                                  return `${maxPct > 0 ? "+" : ""}${maxPct.toFixed(0)}%`;
                                })()
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notes for missing data */}
              {analysis.seasonResults.some(s => s.daysWithData === 0) && (
                <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-700 text-xs text-stone-800 leading-relaxed">
                  <span className="font-mono uppercase tracking-widest text-red-900">No data:</span>{" "}
                  Seasons marked "no data" had no quotes available in any uploaded LOS calendar. Keep your existing Δ% values for those seasons.
                </div>
              )}
              {analysis.seasonResults.some(s => s.dataSource && s.dataSource !== "3n") && (
                <div className="mt-4 p-3 bg-amber-50 border-l-4 border-amber-700 text-xs text-stone-800 leading-relaxed">
                  <span className="font-mono uppercase tracking-widest text-amber-900">Fallback used:</span>{" "}
                  Seasons tagged <code className="bg-white px-1 rounded">via 5n</code> or <code className="bg-white px-1 rounded">via 7n</code> derive their Δ% from longer-LOS quotes
                  because no 3n quotes were available (typically due to 4n+ minimum-stay restrictions during super-peaks).
                  This is expected for Thanksgiving and Christmas/NYE.
                </div>
              )}
            </section>

            {/* SECTION 07 — Upload current profile, approve changes, download */}
            <section className="mb-10">
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-4">
                07 — Apply changes to your existing profile
              </div>

              {!currentProfile && (
                <FileDrop
                  label="Current PriceLabs seasonal profile"
                  file={null}
                  onFile={handleProfileUpload}
                  hint="Drop your PriceLabs Custom Seasonal Profile CSV. We'll show current vs suggested side-by-side."
                />
              )}

              {currentProfile && (
                <>
                  <div className="bg-white border border-stone-300 rounded p-3 mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-stone-500">Loaded profile</div>
                      <div className="font-mono text-sm text-stone-900">{currentProfile.filename}</div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        {currentProfile.rows.length} seasons · {currentProfile.headers.length} columns
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAllApproved(true)}
                        className="px-3 py-1.5 text-xs font-mono uppercase tracking-widest border border-stone-300 rounded hover:bg-stone-50"
                      >
                        Approve all
                      </button>
                      <button
                        onClick={() => setAllApproved(false)}
                        className="px-3 py-1.5 text-xs font-mono uppercase tracking-widest border border-stone-300 rounded hover:bg-stone-50"
                      >
                        Reject all
                      </button>
                      <button
                        onClick={() => setCurrentProfile(null)}
                        className="px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-stone-500 hover:text-stone-900"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Diff table */}
                  <div className="bg-white border border-stone-300 rounded overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-100 text-[10px] uppercase tracking-widest text-stone-600">
                        <tr>
                          <th className="text-left py-2.5 px-3 font-medium">Season</th>
                          <th className="text-center py-2.5 px-3 font-medium" colSpan="3">Current MIN / BASE / MAX</th>
                          <th className="text-center py-2.5 px-3 font-medium border-l border-stone-300" colSpan="3">Suggested MIN / BASE / MAX</th>
                          <th className="text-center py-2.5 px-3 font-medium border-l border-stone-300">Apply</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {currentProfile.rows.map((row) => {
                          const seasonName = row["SEASON NAME"];
                          // Look up calculated values
                          const seasonCalc = analysis.seasonResults.find((s) => s.name === seasonName);
                          let calc = null;
                          if (seasonCalc && seasonCalc.deltaRounded != null && analysis.suggestedBASE != null) {
                            const minPct = seasonCalc.seasonMin != null
                              ? Math.round((seasonCalc.seasonMin / analysis.suggestedBASE - 1) * 100)
                              : null;
                            const maxPct = seasonCalc.seasonMax != null
                              ? Math.round((seasonCalc.seasonMax / analysis.suggestedBASE - 1) * 100)
                              : null;
                            calc = {
                              base: Math.round(seasonCalc.deltaRounded),
                              min: minPct,
                              max: maxPct,
                            };
                          }

                          const currentMin = row["MIN PRICE"]?.trim();
                          const currentBase = row["BASE PRICE"]?.trim();
                          const currentMax = row["MAX PRICE"]?.trim();

                          const isApproved = !!approved[seasonName];
                          const hasCalc = calc != null;

                          return (
                            <tr
                              key={seasonName}
                              className={`border-t border-stone-200 ${isApproved ? "bg-green-50" : ""}`}
                            >
                              <td className="py-2 px-3 font-sans text-stone-900">{seasonName}</td>
                              {/* Current values */}
                              <td className="text-right py-2 px-3 text-stone-500">{currentMin}%</td>
                              <td className="text-right py-2 px-3 text-stone-700 font-medium">{currentBase}%</td>
                              <td className="text-right py-2 px-3 text-stone-500">{currentMax}%</td>
                              {/* Suggested values */}
                              <td className="text-right py-2 px-3 border-l border-stone-300 text-blue-900">
                                {hasCalc ? `${calc.min > 0 ? "+" : ""}${calc.min}%` : "—"}
                              </td>
                              <td className={`text-right py-2 px-3 font-medium ${
                                !hasCalc ? "text-stone-400" :
                                calc.base > 0 ? "text-amber-900" :
                                calc.base < 0 ? "text-blue-900" : "text-stone-700"
                              }`}>
                                {hasCalc ? `${calc.base > 0 ? "+" : ""}${calc.base}%` : "—"}
                              </td>
                              <td className="text-right py-2 px-3 text-amber-900">
                                {hasCalc ? `${calc.max > 0 ? "+" : ""}${calc.max}%` : "—"}
                              </td>
                              {/* Approve toggle */}
                              <td className="text-center py-2 px-3 border-l border-stone-300">
                                {hasCalc ? (
                                  <button
                                    onClick={() => toggleApproval(seasonName)}
                                    className={`w-10 h-5 rounded-full relative transition-colors ${
                                      isApproved ? "bg-green-700" : "bg-stone-300"
                                    }`}
                                    aria-label={`Toggle approval for ${seasonName}`}
                                  >
                                    <div
                                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                        isApproved ? "translate-x-5" : "translate-x-0.5"
                                      }`}
                                    />
                                  </button>
                                ) : (
                                  <span className="text-stone-400 text-xs">no data</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Download button */}
                  <div className="flex items-center justify-between p-4 bg-stone-900 text-white rounded">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                        Ready to export
                      </div>
                      <div className="text-sm mt-1">
                        {Object.values(approved).filter(Boolean).length} season(s) approved for update ·
                        {" "}{currentProfile.rows.length - Object.values(approved).filter(Boolean).length} unchanged
                      </div>
                    </div>
                    <button
                      onClick={downloadUpdatedProfile}
                      disabled={Object.values(approved).filter(Boolean).length === 0}
                      className="px-5 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:bg-stone-700 disabled:text-stone-500 disabled:cursor-not-allowed text-white font-mono text-sm uppercase tracking-widest rounded transition-colors"
                    >
                      Download updated CSV
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Export hint */}
            <section className="mb-10 p-4 bg-stone-100 border border-stone-300 rounded text-xs text-stone-600 leading-relaxed">
              <span className="font-mono uppercase tracking-widest text-stone-700">Tip:</span>{" "}
              When PriceLabs is set to "percentage" mode, the seasonal CSV expects all three columns
              (<code className="bg-white px-1.5 py-0.5 rounded">MIN PRICE</code>,{" "}
              <code className="bg-white px-1.5 py-0.5 rounded">BASE PRICE</code>,{" "}
              <code className="bg-white px-1.5 py-0.5 rounded">MAX PRICE</code>) as percentage offsets
              from your account-level base price — not absolute dollar values. Copy the Δ%, Min %, and Max % columns
              directly into the CSV. The dollar BASE/MIN/MAX shown in the headline cards are calculated
              equivalents for reference.
            </section>
          </>
        )}

        {!analysis && !files[3] && (
          <div className="border border-dashed border-stone-300 rounded-lg p-12 text-center">
            <div className="font-serif text-2xl text-stone-400 mb-2">Awaiting input</div>
            <div className="text-sm text-stone-500">
              Drop the 3-night calendar at minimum to begin analysis.
            </div>
          </div>
        )}

        <footer className="mt-16 pt-6 border-t border-stone-300 text-[10px] uppercase tracking-widest text-stone-400 font-mono">
          Calibration anchor: 3-night LOS · Markup: channel-side · Cleaning fee amortised per LOS
        </footer>

      </div>
    </div>
  );
}
