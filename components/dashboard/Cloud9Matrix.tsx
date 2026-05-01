// @ts-nocheck
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Upload, FileSpreadsheet, Download, AlertTriangle } from 'lucide-react';

/* ---------- Helpers ---------- */

// Strip the "-- nickname" tail. Returns the prefix only.
const getPrefix = (name) => {
  if (!name) return null;
  const cleaned = String(name).replace(/&amp;/g, '&');
  const m = cleaned.match(/^(.+?)\s*--\s*/);
  return m ? m[1].trim() : null;
};

// "05/01/2026 | 03:26:58 PM"  ->  "2026-05-01"
const parseLogDate = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
};

// Various date forms -> YYYY-MM-DD
const toISO = (d) => {
  if (!d) return null;
  if (d instanceof Date) {
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(d).trim();
  // Excel may give "2026-05-01 00:00:00" or ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // "May 06 2026" or "Jun 26, 2026"
  m = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                     Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const mm = months[m[1]];
    if (mm) return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
  }
  // "05/01/2026" US style
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().slice(0, 10);
  return null;
};

const fmtShort = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}`;
};

const fmtWeekday = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
};

// Parse "Dates: Jun 26 2026 -- Jun 27 2026" or "Jun 21, 2026 -- Jun 21, 2026"
const parseAffectedDates = (newValue) => {
  if (!newValue) return null;
  const m = String(newValue).match(/Dates:\s*([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\s*--\s*([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/);
  if (!m) return null;
  return { start: toISO(m[1]), end: toISO(m[2]) };
};

const parseOverridePct = (newValue) => {
  if (!newValue) return null;
  const m = String(newValue).match(/Price:\s*(-?\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
};

// Date range expansion (inclusive)
const expandRange = (startISO, endISO) => {
  if (!startISO || !endISO) return [];
  const out = [];
  const d = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
};

// Stay nights = check-in (incl) to check-out (excl)
const expandStay = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return [];
  const out = [];
  const d = new Date(checkIn + 'T00:00:00');
  const end = new Date(checkOut + 'T00:00:00');
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
};

const ACTION_LABELS = {
  'Listing Customization Updated': 'Customization',
  'Bulk Listing Customization Updated': 'Bulk Customization',
  'Added Date Specific Override': 'Override Added',
  'Removed Date Specific Override': 'Override Removed',
  'Mapped Listing - Parent': 'Mapped (Parent)',
  'Mapped Listing': 'Mapped (Child)',
  'Listing Sub Group Updated': 'Sub-Group Updated',
  'Listing Group Updated': 'Group Updated',
};

const ACTION_COLORS = {
  'Customization':       { bg: '#FEF3E7', fg: '#92590B', dot: '#D97706' },
  'Bulk Customization':  { bg: '#FEF3E7', fg: '#92590B', dot: '#D97706' },
  'Override Added':      { bg: '#E8F0E5', fg: '#365A2C', dot: '#5C7F4F' },
  'Override Removed':    { bg: '#F0E5E5', fg: '#7A2C2C', dot: '#9B4444' },
  'Mapped (Parent)':     { bg: '#E5EBF0', fg: '#2C3F5A', dot: '#4F6B8F' },
  'Mapped (Child)':      { bg: '#E5EBF0', fg: '#2C3F5A', dot: '#4F6B8F' },
  'Sub-Group Updated':   { bg: '#EDE5F0', fg: '#4D2C5A', dot: '#7F4F8F' },
  'Group Updated':       { bg: '#EDE5F0', fg: '#4D2C5A', dot: '#7F4F8F' },
};

/* ---------- File parsing ---------- */

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target.result);
  reader.onerror = reject;
  if (file.name.endsWith('.csv')) reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
});

const parseCSV = (text) => Papa.parse(text, { header: true, skipEmptyLines: true }).data;

const parseXLSX = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
};

/* ---------- Build matrix ---------- */

const buildMatrix = ({ listings, actions, bookings }) => {
  // Listings master: prefix -> {prefix, listingName, building, bedrooms}
  const listingMap = new Map();
  listings.forEach(r => {
    const p = getPrefix(r['Listing Name']);
    if (!p) return;
    if (!listingMap.has(p)) {
      listingMap.set(p, {
        prefix: p,
        listingName: r['Listing Name'],
        building: p.split('.')[0],
        bedrooms: r['Bedroom Count'] || '',
        basePrice: r['Base Price'] || '',
        minPrice: r['Min Price'] || '',
        group: r['Customization Group'] || '',
        subGroup: r['Customization Sub Group'] || '',
      });
    }
  });

  // Action log -> grouped by prefix + actionDate
  const actionRows = actions
    .filter(r => r['Action'] !== 'Manual User Sync') // per spec: don't log
    .map(r => {
      const prefix = getPrefix(r['Action Performed On']);
      const actionDate = parseLogDate(r['Local Time']);
      const action = r['Action'];
      const label = ACTION_LABELS[action] || action;
      const newVal = r['New Value'];
      const oldVal = r['Old Value'];
      const range = parseAffectedDates(newVal);
      const pctStr = parseOverridePct(newVal);
      const pctNum = pctStr !== null ? parseFloat(pctStr) : null;

      // Compute the EFFECTIVE percentage for grouping.
      // Added Override:   uses the stored sign as-is.   +20 markup; -10 discount
      // Removed Override: inverts the stored sign.       removing +20 markup = effective -20 (discount);
      //                                                  removing -10 discount = effective +10 (markup)
      let effectivePct = null;
      if (pctNum !== null) {
        if (action === 'Added Date Specific Override') effectivePct = pctNum;
        else if (action === 'Removed Date Specific Override') effectivePct = -pctNum;
      }

      // groupKey for analytics
      let groupKey = null;
      let direction = null; // 'markup' | 'discount' | 'flat' | 'neutral'
      if (effectivePct !== null) {
        if (effectivePct === 0) {
          groupKey = 'Override 0%';
          direction = 'flat';
        } else {
          const sign = effectivePct > 0 ? '+' : '';
          // Use whole number format if integer; else 1 decimal
          const display = Number.isInteger(effectivePct) ? effectivePct : effectivePct.toFixed(1);
          groupKey = `Override ${sign}${display}%`;
          direction = effectivePct > 0 ? 'markup' : 'discount';
        }
      } else if (action === 'Added Date Specific Override' || action === 'Removed Date Specific Override') {
        // Override without parseable percent
        groupKey = action === 'Added Date Specific Override' ? 'Override Added (no %)' : 'Override Removed (no %)';
        direction = 'neutral';
      } else if (action === 'Listing Customization Updated' || action === 'Bulk Listing Customization Updated') {
        groupKey = 'Customization';
        direction = 'neutral';
      } else if (action === 'Mapped Listing - Parent' || action === 'Mapped Listing') {
        groupKey = 'Mapping';
        direction = 'neutral';
      } else if (action === 'Listing Sub Group Updated' || action === 'Listing Group Updated') {
        groupKey = 'Group/Sub-group';
        direction = 'neutral';
      } else {
        groupKey = action;
        direction = 'neutral';
      }

      let affected = 'All future dates';
      let affectedDates = [];
      if (range) {
        affected = range.start === range.end
          ? fmtShort(range.start) + ', ' + range.start.slice(0,4)
          : `${fmtShort(range.start)} – ${fmtShort(range.end)}, ${range.end.slice(0,4)}`;
        affectedDates = expandRange(range.start, range.end);
        if (pctStr !== null) {
          // Show effective pct in the cell (so removed overrides display their effective sign)
          const showSign = effectivePct > 0 ? '+' : '';
          affected += `  •  ${showSign}${effectivePct}%`;
        }
      }
      return { prefix, actionDate, action, label, affected, affectedDates, oldVal, newVal,
               groupKey, direction, effectivePct };
    })
    .filter(r => r.prefix && r.actionDate);

  // Action log dates (columns)
  const dates = Array.from(new Set(actionRows.map(r => r.actionDate))).sort();
  // Also include any booking dates that fall inside the same window? No — per spec, columns = action log dates.
  // But include booking-only dates in case bookings exist on dates not in action log.
  const bookingRows = bookings.map(r => {
    const prefix = getPrefix(r['Listing Name'] || r['Property Name']);
    const bookedDate = toISO(r['Booked Date']);
    const checkIn = toISO(r['Check-in Date']);
    const checkOut = toISO(r['Check-out Date']);
    return {
      prefix,
      bookedDate,
      checkIn,
      checkOut,
      los: r['Length of Stay (Days)'],
      adr: r['Average Daily Rate'],
      revenue: r['Total Revenue'] || r['Rental Revenue'],
      source: r['Booking Source'],
      stayDates: expandStay(checkIn, checkOut),
    };
  }).filter(r => r.prefix && r.bookedDate);

  bookingRows.forEach(b => { if (!dates.includes(b.bookedDate)) dates.push(b.bookedDate); });
  dates.sort();

  // Build cell data
  // actionsCells: prefix -> date -> [actionItems]
  // bookingsCells: prefix -> date -> [bookingItems]
  const actionsCells = new Map();
  const bookingsCells = new Map();

  // Index action affected-date set by prefix (for overlap)
  const affectedByPrefix = new Map();
  actionRows.forEach(a => {
    if (!a.affectedDates.length) return;
    if (!affectedByPrefix.has(a.prefix)) affectedByPrefix.set(a.prefix, new Map());
    const m = affectedByPrefix.get(a.prefix);
    a.affectedDates.forEach(d => {
      if (!m.has(d)) m.set(d, []);
      m.get(d).push({
        label: a.label,
        actionDate: a.actionDate,
        affected: a.affected,
        groupKey: a.groupKey,
        direction: a.direction,
        effectivePct: a.effectivePct,
        building: a.prefix.split('.')[0],
      });
    });
  });

  actionRows.forEach(a => {
    if (!actionsCells.has(a.prefix)) actionsCells.set(a.prefix, new Map());
    const row = actionsCells.get(a.prefix);
    if (!row.has(a.actionDate)) row.set(a.actionDate, []);
    row.get(a.actionDate).push(a);
  });

  bookingRows.forEach(b => {
    if (!bookingsCells.has(b.prefix)) bookingsCells.set(b.prefix, new Map());
    const row = bookingsCells.get(b.prefix);
    if (!row.has(b.bookedDate)) row.set(b.bookedDate, []);
    // Compute overlaps with this listing's affected dates.
    // A flag fires only if BOTH conditions are met:
    //   (1) booking was created on or after the action's action-date
    //   (2) any night of the stay falls on a date the action affected
    const affMap = affectedByPrefix.get(b.prefix);
    const overlaps = [];
    const seen = new Set(); // de-dupe identical overlap rows
    if (affMap) {
      b.stayDates.forEach(sd => {
        if (!affMap.has(sd)) return;
        affMap.get(sd).forEach(a => {
          // Condition (1): booking created on or after the action date
          if (b.bookedDate < a.actionDate) return;
          const key = `${a.label}|${a.actionDate}|${sd}`;
          if (seen.has(key)) return;
          seen.add(key);
          overlaps.push({ ...a, on: sd });
        });
      });
    }
    row.get(b.bookedDate).push({ ...b, overlaps });
  });

  // Reattach the post-action overlap data onto bookingRows (for analytics)
  const bookingRowsWithOverlaps = [];
  bookingsCells.forEach(row => row.forEach(items => items.forEach(b => bookingRowsWithOverlaps.push(b))));

  return {
    listings: Array.from(listingMap.values()).sort((a, b) => a.prefix.localeCompare(b.prefix, undefined, { numeric: true })),
    dates,
    actionsCells,
    bookingsCells,
    actionRows,
    bookingRows: bookingRowsWithOverlaps,
  };
};

/* ---------- Excel export ---------- */

const exportToExcel = (matrix) => {
  const { listings, dates, actionsCells, bookingsCells } = matrix;
  const aoa = [];
  const header = ['Listing', 'Type', ...dates.map(d => `${fmtWeekday(d)} ${fmtShort(d)}`)];
  aoa.push(header);

  listings.forEach(l => {
    const aRow = actionsCells.get(l.prefix) || new Map();
    const bRow = bookingsCells.get(l.prefix) || new Map();
    const hasAny = aRow.size > 0 || bRow.size > 0;
    let hasPostActionBooking = false;
    bRow.forEach(items => items.forEach(b => { if (b.overlaps.length > 0) hasPostActionBooking = true; }));
    const bookingLabel = hasPostActionBooking ? `Bookings created after action — ${l.prefix}` : `Bookings — ${l.prefix}`;
    if (!hasAny) {
      aoa.push([l.prefix, 'Actions', ...dates.map(() => '')]);
      aoa.push([bookingLabel, 'Bookings', ...dates.map(() => '')]);
      return;
    }
    aoa.push([l.prefix, 'Actions', ...dates.map(d => {
      const items = aRow.get(d) || [];
      return items.map(a => `${a.label}\n${a.affected}`).join('\n---\n');
    })]);
    aoa.push([bookingLabel, 'Bookings', ...dates.map(d => {
      const items = bRow.get(d) || [];
      return items.map(b => {
        const stay = `${fmtShort(b.checkIn)}–${fmtShort(b.checkOut)}`;
        const flag = b.overlaps.length ? '⚠ post-action overlap ' : '';
        return `${flag}LOS ${b.los}n | ADR $${b.adr} | Rev $${b.revenue}\nStay ${stay}${b.source ? ' • ' + b.source : ''}`;
      }).join('\n---\n');
    })]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, { wch: 10 }, ...dates.map(() => ({ wch: 32 }))];
  ws['!freeze'] = { xSplit: 2, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Action & Booking Matrix');
  XLSX.writeFile(wb, `PriceLabs_Weekly_Matrix_${new Date().toISOString().slice(0,10)}.xlsx`);
};

/* ---------- UI ---------- */

const FileSlot = ({ label, hint, file, onFile, accept }) => (
  <label className="group cursor-pointer">
    <div className={`relative border transition-all ${file ? 'border-stone-800 bg-stone-50' : 'border-stone-300 bg-white hover:border-stone-500'} px-5 py-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-medium">{label}</div>
          <div className="mt-1 text-sm text-stone-900 truncate font-mono">
            {file ? file.name : <span className="text-stone-400 font-sans italic">{hint}</span>}
          </div>
        </div>
        {file
          ? <FileSpreadsheet className="w-4 h-4 text-stone-700 shrink-0" />
          : <Upload className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition-colors shrink-0" />}
      </div>
    </div>
    <input type="file" className="hidden" accept={accept} onChange={(e) => onFile(e.target.files[0])} />
  </label>
);

/* ---------- Analytics View ---------- */

const directionColor = (d) => {
  // Markup = warm terracotta. Discount = cool teal. Flat/neutral = stone.
  if (d === 'markup') return { bg: '#FBE9E0', fg: '#9C3D1F', dot: '#C2410C', light: '#FEF3EE' };
  if (d === 'discount') return { bg: '#DBEAE6', fg: '#1F4F44', dot: '#0F766E', light: '#ECF5F1' };
  if (d === 'flat') return { bg: '#EDEAE2', fg: '#57534E', dot: '#A8A29E', light: '#F5F2EA' };
  return { bg: '#E7E5E4', fg: '#44403C', dot: '#78716C', light: '#F5F5F4' };
};

const SectionHeader = ({ kicker, title, subtitle }) => (
  <div className="mb-5">
    <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1.5">{kicker}</div>
    <h2 className="display text-2xl font-light leading-tight">{title}</h2>
    {subtitle && <p className="text-xs text-stone-600 mt-1.5 max-w-xl leading-relaxed">{subtitle}</p>}
  </div>
);

function AnalyticsView({ analytics, totalStats, matrix }) {
  const { groups, buildings, leadStats, adrComparison, sources } = analytics;

  // Order groups: by direction (markup → discount → flat → neutral), then by magnitude
  const order = (g) => {
    const dirRank = { markup: 1, discount: 2, flat: 3, neutral: 4 }[g.direction] || 5;
    // Within markups, sort by ascending pct; within discounts, by ascending magnitude (closest to 0 first)
    const m = (g.key.match(/-?\d+(?:\.\d+)?/) || [0])[0];
    return [dirRank, parseFloat(m) || 0];
  };
  const groupsSorted = [...groups].sort((a, b) => {
    const oa = order(a), ob = order(b);
    if (oa[0] !== ob[0]) return oa[0] - ob[0];
    if (a.direction === 'markup') return oa[1] - ob[1];
    if (a.direction === 'discount') return Math.abs(oa[1]) - Math.abs(ob[1]);
    return b.actionCount - a.actionCount;
  });

  // Champions
  const overrideGroups = groups.filter(g => g.direction === 'markup' || g.direction === 'discount' || g.direction === 'flat');
  const byRevenue = [...overrideGroups].filter(g => g.bookingCount > 0).sort((a, b) => b.revenue - a.revenue)[0];
  const byRevPerAction = [...overrideGroups].filter(g => g.bookingCount > 0).sort((a, b) => b.revenuePerAction - a.revenuePerAction)[0];
  const byConversion = [...overrideGroups].filter(g => g.actionCount >= 5 && g.bookingCount > 0).sort((a, b) => b.conversionRate - a.conversionRate)[0];

  // Building order: most actions first
  const buildingsSorted = [...buildings].sort((a, b) => b.actionCount - a.actionCount);
  const maxBldgActions = Math.max(...buildingsSorted.map(b => b.actionCount), 1);
  const maxBldgRev = Math.max(...buildingsSorted.map(b => b.flaggedRevenue), 1);

  const maxGroupRev = Math.max(...groupsSorted.map(g => g.revenue), 1);
  const maxGroupActions = Math.max(...groupsSorted.map(g => g.actionCount), 1);

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-8">
      <div className="mb-10 flex items-start justify-between gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1">Performance · Week of {matrix.dates[0]} → {matrix.dates[matrix.dates.length - 1]}</div>
          <h1 className="display text-4xl font-light leading-tight max-w-3xl">
            Which pricing actions <em className="italic font-normal">actually</em> drove revenue this week?
          </h1>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print shrink-0 px-5 py-2 text-[11px] uppercase tracking-[0.2em] font-medium bg-stone-900 hover:bg-stone-800 transition-colors cursor-pointer flex items-center gap-2"
          style={{ color: '#FFFFFF' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Save as PDF
        </button>
      </div>

      {/* CHAMPIONS — three side-by-side */}
      <div className="mb-12">
        <SectionHeader
          kicker="Top performers"
          title="Three readings of efficient."
          subtitle="The same action group can win on different metrics. Total revenue rewards volume; revenue-per-action rewards precision; conversion rate rewards reliability."
        />
        <div className="grid md:grid-cols-3 gap-px bg-stone-300 border border-stone-300">
          {[
            { label: 'Highest total revenue', g: byRevenue, metric: g => `$${g.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, sub: g => `${g.bookingCount} bookings · from ${g.actionCount} actions` },
            { label: 'Highest revenue per action', g: byRevPerAction, metric: g => `$${g.revenuePerAction.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, sub: g => `per action · ${g.actionCount} actions` },
            { label: 'Highest conversion rate', g: byConversion, metric: g => `${(g.conversionRate * 100).toFixed(1)}%`, sub: g => `${g.bookingCount} of ${g.actionCount} actions` },
          ].map((champ, i) => {
            if (!champ.g) {
              return (
                <div key={i} className="bg-[#FAF8F4] px-6 py-5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">{champ.label}</div>
                  <div className="display text-xl text-stone-400 italic">No qualifying group</div>
                </div>
              );
            }
            const c = directionColor(champ.g.direction);
            return (
              <div key={i} className="bg-[#FAF8F4] px-6 py-5 relative">
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3">{champ.label}</div>
                <div
                  className="inline-block px-2 py-0.5 mono text-[11px] font-medium mb-2"
                  style={{ background: c.bg, color: c.fg, borderLeft: `3px solid ${c.dot}` }}
                >
                  {champ.g.key}
                </div>
                <div className="display text-3xl font-light" style={{ color: c.fg }}>
                  {champ.metric(champ.g)}
                </div>
                <div className="text-[11px] mono text-stone-500 mt-1">{champ.sub(champ.g)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ACTION GROUP LEADERBOARD */}
      <div className="mb-12">
        <SectionHeader
          kicker="① Actions that led to bookings"
          title="Grouped by action type and effective percentage."
          subtitle="A booking counts toward a group when its stay falls on a date that group's action affected, AND the booking arrived after the action. Removed overrides are inverted — removing a +20% markup is treated as an effective −20%."
        />

        {/* Direction-key legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-[11px] text-stone-600">
          <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Direction</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: directionColor('markup').dot }} /> Markup (price up)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: directionColor('discount').dot }} /> Discount (price down)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: directionColor('flat').dot }} /> Flat (0%)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: directionColor('neutral').dot }} /> Other
          </span>
        </div>

        <div className="border border-stone-300 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-300 bg-stone-100">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Action group</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Actions</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Bookings</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Conv. rate</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Revenue</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">$ / action</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Avg ADR</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Listings</th>
              </tr>
            </thead>
            <tbody>
              {groupsSorted.map((g, i) => {
                const c = directionColor(g.direction);
                const revBar = (g.revenue / maxGroupRev) * 100;
                return (
                  <tr key={i} className="border-b border-stone-200 hover:bg-stone-50/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
                        <span className="mono text-[12px] font-medium" style={{ color: c.fg }}>{g.key}</span>
                      </div>
                    </td>
                    <td className="text-right px-4 py-2.5 mono text-[12px]">{g.actionCount}</td>
                    <td className="text-right px-4 py-2.5 mono text-[12px]">
                      {g.bookingCount > 0 ? <span className="font-medium">{g.bookingCount}</span> : <span className="text-stone-300">0</span>}
                    </td>
                    <td className="text-right px-4 py-2.5 mono text-[12px]">
                      {g.actionCount > 0 ? (
                        <span className={g.conversionRate > 0.05 ? 'font-medium' : 'text-stone-400'}>
                          {(g.conversionRate * 100).toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right px-4 py-2.5 mono text-[12px] relative">
                      <div className="absolute inset-0 flex items-center pl-4 pr-2 pointer-events-none">
                        <div className="w-full h-1 bg-stone-100">
                          <div className="h-full opacity-30" style={{ width: `${revBar}%`, background: c.dot }} />
                        </div>
                      </div>
                      <span className="relative z-10 bg-[#FAF8F4] px-1.5">
                        {g.revenue > 0 ? `$${g.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : <span className="text-stone-300">—</span>}
                      </span>
                    </td>
                    <td className="text-right px-4 py-2.5 mono text-[12px]">
                      {g.revenuePerAction > 0 ? `$${g.revenuePerAction.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-right px-4 py-2.5 mono text-[12px]">
                      {g.avgADR > 0 ? `$${g.avgADR.toFixed(0)}` : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="text-right px-4 py-2.5 mono text-[12px] text-stone-500">{g.listingCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] mono text-stone-500 mt-2 text-right">
          Sorted: markups (ascending), discounts (closest to 0 first), then flat, then non-percentage actions.
        </div>
      </div>

      {/* BUILDINGS */}
      <div className="mb-12">
        <SectionHeader
          kicker="② Buildings"
          title="Where the pricing attention landed."
          subtitle="The first numeric segment of each listing prefix identifies the building (e.g. 1125, 365, 160). Bars compare action volume against post-action revenue to surface buildings where heavy management is — or isn't — paying off."
        />

        <div className="border border-stone-300 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-300 bg-stone-100">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Building</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium" style={{ width: '24%' }}>Actions taken</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Overrides</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Listings</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Post-action bkgs</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium" style={{ width: '24%' }}>Post-action revenue</th>
                <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium">Share of bldg rev</th>
              </tr>
            </thead>
            <tbody>
              {buildingsSorted.map((b, i) => {
                const actionPct = (b.actionCount / maxBldgActions) * 100;
                const revPct = (b.flaggedRevenue / maxBldgRev) * 100;
                return (
                  <tr key={i} className="border-b border-stone-200 hover:bg-stone-50/50">
                    <td className="px-4 py-3 mono text-[13px] font-medium">Bldg {b.building}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-stone-100">
                          <div className="h-full bg-stone-700" style={{ width: `${actionPct}%` }} />
                        </div>
                        <span className="mono text-[11px] text-stone-700 w-8 text-right shrink-0">{b.actionCount}</span>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 mono text-[12px]">{b.overrideCount}</td>
                    <td className="text-right px-4 py-3 mono text-[12px] text-stone-500">{b.listingCount}</td>
                    <td className="text-right px-4 py-3 mono text-[12px]">
                      {b.flaggedBookingCount > 0
                        ? <span className="font-medium text-amber-900">{b.flaggedBookingCount}</span>
                        : <span className="text-stone-300">0</span>}
                    </td>
                    <td className="px-4 py-3">
                      {b.flaggedRevenue > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-amber-50">
                            <div className="h-full bg-amber-600" style={{ width: `${revPct}%` }} />
                          </div>
                          <span className="mono text-[11px] text-amber-900 font-medium w-20 text-right shrink-0">
                            ${b.flaggedRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-stone-300 text-[11px] mono">No post-action bookings</span>
                      )}
                    </td>
                    <td className="text-right px-4 py-3 mono text-[12px] text-stone-600">
                      {b.totalRevenue > 0 ? `${(b.flaggedRevenueShare * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* LEAD TIME + ADR DELTA + SOURCE — three columns */}
      <div className="grid lg:grid-cols-3 gap-px bg-stone-300 border border-stone-300 mb-12">
        {/* Lead time */}
        <div className="bg-[#FAF8F4] p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-2">③ Lead time</div>
          <div className="display text-xl font-light mb-1 leading-tight">How fast pricing changes show up in bookings.</div>
          <p className="text-[11px] text-stone-600 mb-4 leading-relaxed">Days between the most recent influential action and the booking arrival.</p>
          {leadStats ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500">Median</div>
                  <div className="display text-2xl font-light">{leadStats.median}<span className="text-stone-400 text-base"> d</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500">Average</div>
                  <div className="display text-2xl font-light">{leadStats.avg.toFixed(1)}<span className="text-stone-400 text-base"> d</span></div>
                </div>
              </div>
              <div className="space-y-1.5">
                {Object.entries(leadStats.buckets).map(([bucket, count]) => {
                  const total = Object.values(leadStats.buckets).reduce((s, x) => s + x, 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={bucket} className="flex items-center gap-2 text-[11px]">
                      <div className="mono text-stone-500 w-12">{bucket}</div>
                      <div className="flex-1 h-3 bg-stone-200">
                        <div className="h-full bg-stone-700" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mono text-stone-700 w-14 text-right">{count} <span className="text-stone-400">· {pct.toFixed(0)}%</span></div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] mono text-stone-400 mt-3">Range {leadStats.min}–{leadStats.max} days</div>
            </>
          ) : (
            <div className="text-stone-400 italic text-sm">No post-action bookings.</div>
          )}
        </div>

        {/* ADR Delta */}
        <div className="bg-[#FAF8F4] p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-2">④ ADR delta</div>
          <div className="display text-xl font-light mb-1 leading-tight">Are post-action bookings priced differently?</div>
          <p className="text-[11px] text-stone-600 mb-4 leading-relaxed">Average daily rate of bookings flagged as post-action vs everything else this week.</p>
          {adrComparison.postCount > 0 && adrComparison.otherCount > 0 ? (
            <>
              <div className="space-y-3">
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-amber-800">Post-action</span>
                    <span className="mono text-[10px] text-stone-400">n={adrComparison.postCount}</span>
                  </div>
                  <div className="display text-2xl font-light text-amber-900">
                    ${adrComparison.postAvg.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-stone-600">Other bookings</span>
                    <span className="mono text-[10px] text-stone-400">n={adrComparison.otherCount}</span>
                  </div>
                  <div className="display text-2xl font-light text-stone-700">
                    ${adrComparison.otherAvg.toFixed(0)}
                  </div>
                </div>
              </div>
              <div className={`mt-4 pt-3 border-t border-stone-200 ${adrComparison.delta >= 0 ? '' : 'text-rose-700'}`}>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">Delta</div>
                <div className={`display text-3xl font-light ${adrComparison.delta >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                  {adrComparison.delta >= 0 ? '+' : ''}${adrComparison.delta.toFixed(0)}
                  <span className="text-base text-stone-400 ml-2">({adrComparison.deltaPct >= 0 ? '+' : ''}{adrComparison.deltaPct.toFixed(1)}%)</span>
                </div>
                <div className="text-[10px] text-stone-500 mt-1.5 leading-snug">
                  {adrComparison.delta >= 0
                    ? 'Post-action bookings are converting at a higher rate per night — pricing actions appear to capture premium.'
                    : 'Post-action bookings are converting below baseline — pricing actions may be discounting unnecessarily.'}
                </div>
              </div>
            </>
          ) : (
            <div className="text-stone-400 italic text-sm">Insufficient data for comparison.</div>
          )}
        </div>

        {/* Booking source */}
        <div className="bg-[#FAF8F4] p-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-2">⑤ Source mix</div>
          <div className="display text-xl font-light mb-1 leading-tight">Which channels respond to your pricing changes.</div>
          <p className="text-[11px] text-stone-600 mb-4 leading-relaxed">Booking source breakdown for post-action bookings only.</p>
          {sources.length > 0 ? (
            <div className="space-y-2.5">
              {sources.map((s, i) => {
                const totalRev = sources.reduce((sum, x) => sum + x.revenue, 0);
                const pct = totalRev > 0 ? (s.revenue / totalRev) * 100 : 0;
                return (
                  <div key={i}>
                    <div className="flex items-baseline justify-between text-[11px] mb-1">
                      <span className="font-medium text-stone-800">{s.source}</span>
                      <span className="mono text-stone-500">${s.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-stone-200">
                        <div className="h-full bg-stone-700" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="mono text-[10px] text-stone-500 w-16 text-right shrink-0">
                        {s.count} bkg{s.count !== 1 ? 's' : ''} · {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-stone-400 italic text-sm">No post-action bookings.</div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-8 pt-6 border-t border-stone-300 text-[11px] text-stone-500 leading-relaxed max-w-3xl">
        <span className="text-stone-700 font-medium">Reading the analytics.</span> Attribution here is correlative, not causal.
        A booking attributed to "Override +20%" arrived after such an override was set on a date the booking covers — the override
        may have helped land the booking, may have arrived too late to matter, or may have been irrelevant. Use these tables as the prioritized
        list of actions worth verifying in PriceLabs, in revenue-impact order.
      </div>
    </div>
  );
}

export default function Cloud9Matrix() {
  const [files, setFiles] = useState({ listings: null, actions: null, bookings: null });
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('matrix'); // 'matrix' | 'analytics'

  const ready = files.listings && files.actions && files.bookings;

  const handleProcess = async () => {
    setLoading(true);
    setError(null);
    try {
      const [lBuf, aBuf, bBuf] = await Promise.all([
        readFile(files.listings),
        readFile(files.actions),
        readFile(files.bookings),
      ]);
      const listings = files.listings.name.endsWith('.csv') ? parseCSV(lBuf) : parseXLSX(lBuf);
      const actions = files.actions.name.endsWith('.csv') ? parseCSV(aBuf) : parseXLSX(aBuf);
      const bookings = files.bookings.name.endsWith('.csv') ? parseCSV(bBuf) : parseXLSX(bBuf);
      const m = buildMatrix({ listings, actions, bookings });
      setMatrix(m);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to parse files');
    }
    setLoading(false);
  };

  const filteredListings = useMemo(() => {
    if (!matrix) return [];
    if (filter === 'all') return matrix.listings;
    return matrix.listings.filter(l => {
      const a = matrix.actionsCells.get(l.prefix);
      const b = matrix.bookingsCells.get(l.prefix);
      if (filter === 'activity') return (a && a.size > 0) || (b && b.size > 0);
      if (filter === 'overlaps') {
        if (!b) return false;
        for (const items of b.values()) {
          if (items.some(i => i.overlaps.length > 0)) return true;
        }
        return false;
      }
      return true;
    });
  }, [matrix, filter]);

  const totalStats = useMemo(() => {
    if (!matrix) return null;
    let totalActions = 0, totalBookings = 0, totalRevenue = 0, overlapCount = 0, postActionRevenue = 0;
    matrix.actionsCells.forEach(row => row.forEach(items => { totalActions += items.length; }));
    matrix.bookingsCells.forEach(row => row.forEach(items => {
      items.forEach(b => {
        totalBookings++;
        const rev = parseFloat(b.revenue) || 0;
        totalRevenue += rev;
        if (b.overlaps.length) {
          overlapCount++;
          postActionRevenue += rev;
        }
      });
    }));
    const activeListings = new Set();
    matrix.actionsCells.forEach((_, p) => activeListings.add(p));
    matrix.bookingsCells.forEach((_, p) => activeListings.add(p));
    return { totalActions, totalBookings, totalRevenue, overlapCount, postActionRevenue, activeListings: activeListings.size };
  }, [matrix]);

  /* ---------- Analytics ---------- */
  const analytics = useMemo(() => {
    if (!matrix) return null;
    const { actionRows, bookingRows } = matrix;

    // 1. Action group statistics: { groupKey -> { count, direction, bookings, revenue, listings:Set } }
    // Each action's "count" is total times that action was performed.
    // bookings/revenue come from bookings whose overlap set contains an action of that group.
    const groupStats = new Map();
    const ensureGroup = (key, direction) => {
      if (!groupStats.has(key)) {
        groupStats.set(key, {
          key, direction,
          actionCount: 0,
          bookingCount: 0,
          revenue: 0,
          adrSum: 0,
          losSum: 0,
          listings: new Set(),
          flaggedBookingIds: new Set(),
        });
      }
      return groupStats.get(key);
    };

    actionRows.forEach(a => {
      const g = ensureGroup(a.groupKey, a.direction);
      g.actionCount++;
      g.listings.add(a.prefix);
    });

    // For each post-action booking, attribute to ALL groups that overlap with it
    bookingRows.forEach((b, bi) => {
      if (!b.overlaps || b.overlaps.length === 0) return;
      const rev = parseFloat(b.revenue) || 0;
      const adr = parseFloat(b.adr) || 0;
      const los = parseFloat(b.los) || 0;
      // De-dupe: a booking might overlap the same group multiple times — count it once per group
      const seenGroups = new Set();
      b.overlaps.forEach(o => {
        if (seenGroups.has(o.groupKey)) return;
        seenGroups.add(o.groupKey);
        const g = ensureGroup(o.groupKey, o.direction);
        g.bookingCount++;
        g.revenue += rev;
        g.adrSum += adr;
        g.losSum += los;
        g.flaggedBookingIds.add(bi);
      });
    });

    const groupArr = Array.from(groupStats.values()).map(g => ({
      ...g,
      revenuePerAction: g.actionCount > 0 ? g.revenue / g.actionCount : 0,
      conversionRate: g.actionCount > 0 ? g.bookingCount / g.actionCount : 0,
      avgADR: g.bookingCount > 0 ? g.adrSum / g.bookingCount : 0,
      avgLOS: g.bookingCount > 0 ? g.losSum / g.bookingCount : 0,
      listingCount: g.listings.size,
    }));

    // 2. Building stats: { building -> {actions, bookings, revenue, listings:Set} }
    const buildingStats = new Map();
    const ensureBldg = (b) => {
      if (!buildingStats.has(b)) {
        buildingStats.set(b, {
          building: b,
          actionCount: 0,
          overrideCount: 0,
          flaggedBookingCount: 0,
          flaggedRevenue: 0,
          totalBookings: 0,
          totalRevenue: 0,
          listings: new Set(),
        });
      }
      return buildingStats.get(b);
    };
    actionRows.forEach(a => {
      const b = ensureBldg(a.prefix.split('.')[0]);
      b.actionCount++;
      if (a.effectivePct !== null) b.overrideCount++;
      b.listings.add(a.prefix);
    });
    bookingRows.forEach(b => {
      const bld = ensureBldg(b.prefix.split('.')[0]);
      const rev = parseFloat(b.revenue) || 0;
      bld.totalBookings++;
      bld.totalRevenue += rev;
      bld.listings.add(b.prefix);
      if (b.overlaps && b.overlaps.length > 0) {
        bld.flaggedBookingCount++;
        bld.flaggedRevenue += rev;
      }
    });
    const buildingArr = Array.from(buildingStats.values()).map(b => ({
      ...b,
      conversionRate: b.actionCount > 0 ? b.flaggedBookingCount / b.actionCount : 0,
      flaggedRevenueShare: b.totalRevenue > 0 ? b.flaggedRevenue / b.totalRevenue : 0,
      listingCount: b.listings.size,
    }));

    // 3. Lead time distribution (days between action_date and bookedDate)
    const leadTimes = [];
    bookingRows.forEach(b => {
      if (!b.overlaps || b.overlaps.length === 0) return;
      // Use the most recent (closest) action that influenced this booking
      const latestActionDate = b.overlaps.reduce((m, o) => o.actionDate > m ? o.actionDate : m, b.overlaps[0].actionDate);
      const d1 = new Date(latestActionDate + 'T00:00:00');
      const d2 = new Date(b.bookedDate + 'T00:00:00');
      const days = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      leadTimes.push(days);
    });
    leadTimes.sort((a, b) => a - b);
    const leadStats = leadTimes.length > 0 ? {
      min: leadTimes[0],
      max: leadTimes[leadTimes.length - 1],
      median: leadTimes[Math.floor(leadTimes.length / 2)],
      avg: leadTimes.reduce((s, x) => s + x, 0) / leadTimes.length,
      buckets: (() => {
        const b = { '0d': 0, '1-2d': 0, '3-5d': 0, '6+d': 0 };
        leadTimes.forEach(t => {
          if (t === 0) b['0d']++;
          else if (t <= 2) b['1-2d']++;
          else if (t <= 5) b['3-5d']++;
          else b['6+d']++;
        });
        return b;
      })(),
    } : null;

    // 4. ADR delta: post-action vs other bookings
    let postADRSum = 0, postCount = 0, otherADRSum = 0, otherCount = 0;
    let postRevSum = 0, otherRevSum = 0;
    bookingRows.forEach(b => {
      const adr = parseFloat(b.adr) || 0;
      const rev = parseFloat(b.revenue) || 0;
      if (b.overlaps && b.overlaps.length > 0) { postADRSum += adr; postCount++; postRevSum += rev; }
      else { otherADRSum += adr; otherCount++; otherRevSum += rev; }
    });
    const adrComparison = {
      postAvg: postCount > 0 ? postADRSum / postCount : 0,
      otherAvg: otherCount > 0 ? otherADRSum / otherCount : 0,
      postCount, otherCount,
      postRevSum, otherRevSum,
    };
    adrComparison.delta = adrComparison.postAvg - adrComparison.otherAvg;
    adrComparison.deltaPct = adrComparison.otherAvg > 0
      ? (adrComparison.delta / adrComparison.otherAvg) * 100 : 0;

    // 5. Booking source split for post-action bookings
    const sourceStats = new Map();
    bookingRows.forEach(b => {
      if (!b.overlaps || b.overlaps.length === 0) return;
      const src = b.source || 'Unknown';
      if (!sourceStats.has(src)) sourceStats.set(src, { source: src, count: 0, revenue: 0 });
      const s = sourceStats.get(src);
      s.count++;
      s.revenue += parseFloat(b.revenue) || 0;
    });
    const sourceArr = Array.from(sourceStats.values()).sort((a, b) => b.revenue - a.revenue);

    return {
      groups: groupArr,
      buildings: buildingArr,
      leadStats,
      adrComparison,
      sources: sourceArr,
    };
  }, [matrix]);

  const showHover = useCallback((e, payload) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({ ...payload, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-stone-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        .display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; letter-spacing: -0.02em; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grid-bg {
          background-image:
            linear-gradient(to right, rgba(120,113,108,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(120,113,108,0.06) 1px, transparent 1px);
          background-size: 32px 32px;
        }
        .matrix-wrap::-webkit-scrollbar { height: 10px; width: 10px; }
        .matrix-wrap::-webkit-scrollbar-track { background: #F0EBE2; }
        .matrix-wrap::-webkit-scrollbar-thumb { background: #A8A29E; border-radius: 0; }
        .matrix-wrap::-webkit-scrollbar-thumb:hover { background: #78716C; }

        @media print {
          /* Hide non-printable UI */
          .no-print, .no-print * { display: none !important; }
          /* Reset layout */
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .min-h-screen { min-height: auto !important; }
          /* Remove sticky positioning */
          .sticky { position: static !important; }
          /* Full width, no overflow hiding */
          .overflow-x-auto { overflow: visible !important; }
          .max-w-\\[1600px\\] { max-width: 100% !important; }
          /* Ensure tables don't break mid-row */
          tr { break-inside: avoid; }
          /* Section breaks */
          .mb-12 { break-inside: avoid; page-break-inside: avoid; }
          /* Show grid columns fully */
          .grid { break-inside: avoid; }
          /* Reasonable page margins */
          @page { margin: 0.6in 0.5in; size: landscape; }
          /* Hide backdrop blur header */
          .backdrop-blur { backdrop-filter: none !important; background: white !important; }
        }
      `}</style>

      {/* Header */}
      <div className="border-b border-stone-300 bg-[#FAF8F4]/95 backdrop-blur sticky top-0 z-30 no-print">
        <div className="max-w-[1600px] mx-auto px-8 py-5 flex items-baseline justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1">Cloud9 Revenue Operations</div>
            <h1 className="display text-3xl font-light leading-none">
              Weekly <em className="italic font-normal">PriceLabs</em> Matrix
            </h1>
          </div>
          {matrix && (
            <div className="flex items-center gap-px bg-stone-300 border border-stone-300">
              {[
                { id: 'matrix', label: 'Matrix' },
                { id: 'analytics', label: 'Analytics' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={`px-5 py-2 text-[11px] uppercase tracking-[0.2em] font-medium transition-colors ${
                    view === tab.id ? 'bg-stone-900' : 'bg-[#FAF8F4] text-stone-700 hover:bg-stone-100'
                  }`}
                  style={view === tab.id ? { color: '#FFFFFF' } : undefined}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <div className="text-right text-[11px] mono text-stone-500 hidden lg:block">
            <div>Chicago Downtown · Luxury STR</div>
            <div>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>
      </div>

      {/* Upload zone */}
      {!matrix && (
        <div className="max-w-[1600px] mx-auto px-8 py-12">
          <div className="grid-bg border border-stone-300 bg-white p-10 relative">
            <div className="absolute top-0 right-0 mono text-[10px] text-stone-400 px-3 py-1 border-l border-b border-stone-300">STEP 01</div>

            <div className="max-w-2xl">
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-3">Drop weekly reports</div>
              <h2 className="display text-2xl font-light mb-2 leading-tight">
                Three files. One source of truth.
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed mb-8 max-w-xl">
                Each Friday, drop the latest exports below. The matrix cross-references pricing actions against booking activity, and flags stays that overlap with date-specific overrides.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <FileSlot
                label="① Manage Listings"
                hint="PriceLabs_ManageListings_*.csv / .xlsx"
                file={files.listings}
                onFile={(f) => setFiles({ ...files, listings: f })}
                accept=".csv,.xlsx,.xls"
              />
              <FileSlot
                label="② Action Log"
                hint="PriceLabs_Log_*.csv / .xlsx"
                file={files.actions}
                onFile={(f) => setFiles({ ...files, actions: f })}
                accept=".csv,.xlsx,.xls"
              />
              <FileSlot
                label="③ Bookings Report"
                hint="bookings_report_*.xlsx / .csv"
                file={files.bookings}
                onFile={(f) => setFiles({ ...files, bookings: f })}
                accept=".csv,.xlsx,.xls"
              />
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-stone-200">
              <div className="text-xs text-stone-500 max-w-md leading-relaxed">
                Files are processed entirely in your browser. Nothing is uploaded.
              </div>
              <button
                onClick={handleProcess}
                disabled={!ready || loading}
                className={`px-8 py-3 text-xs uppercase tracking-[0.25em] font-medium transition-all ${
                  ready && !loading
                    ? 'bg-stone-900 hover:bg-stone-800 cursor-pointer'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
                style={ready && !loading ? { color: '#FFFFFF' } : undefined}
              >
                {loading ? 'Building matrix…' : 'Build Matrix →'}
              </button>
            </div>
            {error && (
              <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mt-10 grid md:grid-cols-3 gap-8 text-sm">
            <div>
              <div className="display italic text-lg mb-1">What goes in.</div>
              <p className="text-stone-600 leading-relaxed">All three weekly exports from PriceLabs and your PMS booking report. The tool reads <span className="mono text-xs">.csv</span> and <span className="mono text-xs">.xlsx</span>.</p>
            </div>
            <div>
              <div className="display italic text-lg mb-1">What it builds.</div>
              <p className="text-stone-600 leading-relaxed">A listing × date matrix. Each listing has two rows — pricing actions and bookings created. Cells show what changed and what was reserved.</p>
            </div>
            <div>
              <div className="display italic text-lg mb-1">What to look for.</div>
              <p className="text-stone-600 leading-relaxed">Bookings flagged with <AlertTriangle className="w-3 h-3 inline text-amber-600" /> arrived <em>after</em> a pricing action that affected their stay dates — the action plausibly influenced the booking. Worth opening in PriceLabs to verify.</p>
            </div>
          </div>
        </div>
      )}

      {/* Matrix view */}
      {matrix && view === 'matrix' && (
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-stone-300 border border-stone-300 mb-8">
            <div className="bg-[#FAF8F4] px-5 py-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">Active listings</div>
              <div className="display text-2xl font-light">{totalStats.activeListings} / {matrix.listings.length}</div>
              <div className="text-[10px] mono text-stone-400 mt-0.5">with activity</div>
            </div>
            <div className="bg-[#FAF8F4] px-5 py-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">Pricing actions</div>
              <div className="display text-2xl font-light">{totalStats.totalActions}</div>
              <div className="text-[10px] mono text-stone-400 mt-0.5">logged</div>
            </div>
            <div className="bg-[#FAF8F4] px-5 py-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">New bookings</div>
              <div className="display text-2xl font-light">{totalStats.totalBookings}</div>
              <div className="text-[10px] mono text-stone-400 mt-0.5">this period</div>
            </div>
            {/* Booked Revenue with post-action subset */}
            <div className="bg-[#FAF8F4] px-5 py-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">Booked revenue</div>
              <div className="display text-2xl font-light">
                ${totalStats.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-stone-200">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-amber-800">Post-action</span>
                  <span className="mono text-[10px] text-amber-700">
                    {totalStats.totalRevenue > 0
                      ? `${Math.round((totalStats.postActionRevenue / totalStats.totalRevenue) * 100)}%`
                      : '—'}
                  </span>
                </div>
                <div className="display text-base font-light text-amber-900">
                  ${totalStats.postActionRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                {/* Mini bar showing share */}
                <div className="mt-1 h-1 bg-stone-200 overflow-hidden">
                  <div
                    className="h-full bg-amber-600"
                    style={{
                      width: totalStats.totalRevenue > 0
                        ? `${(totalStats.postActionRevenue / totalStats.totalRevenue) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
            </div>
            <div className={`px-5 py-4 ${totalStats.overlapCount > 0 ? 'bg-amber-50' : 'bg-[#FAF8F4]'}`}>
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-1">Post-action bookings</div>
              <div className={`display text-2xl font-light ${totalStats.overlapCount > 0 ? 'text-amber-900' : ''}`}>
                {totalStats.overlapCount}
              </div>
              <div className="text-[10px] mono text-stone-400 mt-0.5">flagged stays</div>
              {totalStats.overlapCount > 0 && (
                <div className="text-[10px] mono text-amber-700 mt-1">
                  Avg ${Math.round(totalStats.postActionRevenue / totalStats.overlapCount).toLocaleString('en-US')} / booking
                </div>
              )}
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap no-print">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mr-2">View</span>
              {[
                { id: 'all', label: 'All listings' },
                { id: 'activity', label: 'With activity' },
                { id: 'overlaps', label: 'Overlaps only' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFilter(opt.id)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${
                    filter === opt.id
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'
                  }`}
                  style={filter === opt.id ? { color: '#FAF8F4' } : undefined}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setMatrix(null); setFiles({ listings: null, actions: null, bookings: null }); }}
                className="text-xs text-stone-500 hover:text-stone-900 px-3 py-1.5 border border-stone-300 hover:border-stone-500 transition-colors"
              >
                Start over
              </button>
              <button
                onClick={() => exportToExcel(matrix)}
                className="px-4 py-1.5 text-xs uppercase tracking-[0.2em] font-medium bg-stone-900 hover:bg-stone-800 transition-colors flex items-center gap-2"
                style={{ color: '#FFFFFF' }}
              >
                <Download className="w-3 h-3" /> Export .xlsx
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-[11px] text-stone-600">
            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Action types</span>
            {Object.entries({
              'Override Added': ACTION_COLORS['Override Added'],
              'Override Removed': ACTION_COLORS['Override Removed'],
              'Customization': ACTION_COLORS['Customization'],
              'Mapped': ACTION_COLORS['Mapped (Parent)'],
              'Group/Sub-Group': ACTION_COLORS['Group Updated'],
            }).map(([k, c]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                {k}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 ml-2">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              Booking created after an action that affects its stay dates
            </span>
          </div>

          {/* The matrix */}
          <div className="border border-stone-300 bg-white matrix-wrap overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: '100%' }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-stone-100 border-b border-r border-stone-300 px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-stone-700 font-medium" style={{ minWidth: 180 }}>
                    Listing
                  </th>
                  {matrix.dates.map(d => (
                    <th key={d} className="border-b border-r border-stone-300 px-3 py-3 text-left bg-stone-100" style={{ minWidth: 200 }}>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{fmtWeekday(d)}</div>
                      <div className="display text-base text-stone-900">{fmtShort(d)}</div>
                      <div className="mono text-[10px] text-stone-400">{d}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredListings.map((l, idx) => {
                  const aRow = matrix.actionsCells.get(l.prefix) || new Map();
                  const bRow = matrix.bookingsCells.get(l.prefix) || new Map();
                  const hasAny = aRow.size > 0 || bRow.size > 0;
                  // Determine if any booking on this listing has an overlap (post-action booking)
                  let hasPostActionBooking = false;
                  bRow.forEach(items => {
                    items.forEach(b => { if (b.overlaps.length > 0) hasPostActionBooking = true; });
                  });
                  const bookingRowLabel = hasPostActionBooking ? 'Bookings created after action' : 'Bookings';
                  return (
                    <React.Fragment key={l.prefix}>
                      {/* Actions row */}
                      <tr className={hasAny ? '' : 'opacity-50'}>
                        <td
                          className="sticky left-0 z-10 bg-[#FAF8F4] border-b border-r border-stone-300 px-4 pt-3 pb-2 align-top"
                          style={{ minWidth: 200 }}
                        >
                          <div className="mono text-sm font-medium text-stone-900">{l.prefix}</div>
                          <div className="text-[10px] text-stone-500 mt-0.5 truncate" style={{ maxWidth: 180 }} title={l.listingName}>
                            {l.listingName.replace(/^.+--\s*/, '').replace(/&amp;/g, '&').slice(0, 30)}
                            {l.listingName.length > 35 ? '…' : ''}
                          </div>
                          <div className="text-[10px] mono text-stone-400 mt-0.5">
                            Bldg {l.building}{l.bedrooms ? ` · ${l.bedrooms}BR` : ''}
                          </div>
                          <div className="mt-1.5 inline-block px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] bg-stone-200 text-stone-700 font-medium">
                            Actions
                          </div>
                        </td>
                        {matrix.dates.map(d => {
                          const items = aRow.get(d) || [];
                          if (items.length === 0) {
                            return <td key={d} className="border-b border-r border-stone-200 px-2 py-1 align-top" style={{ minWidth: 200, height: 56 }}></td>;
                          }
                          // Group identical (same label + same affected date string) actions
                          const groupedMap = new Map();
                          items.forEach(a => {
                            const key = a.label + '|' + a.affected;
                            if (!groupedMap.has(key)) groupedMap.set(key, { ...a, count: 1, allItems: [a] });
                            else { const g = groupedMap.get(key); g.count++; g.allItems.push(a); }
                          });
                          const grouped = Array.from(groupedMap.values());
                          return (
                            <td key={d} className="border-b border-r border-stone-200 px-1.5 py-1.5 align-top" style={{ minWidth: 200, maxWidth: 240 }}>
                              <div className="space-y-1" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                {grouped.map((a, i) => {
                                  const c = ACTION_COLORS[a.label] || { bg: '#F0EBE2', fg: '#44403C', dot: '#78716C' };
                                  return (
                                    <div
                                      key={i}
                                      className="px-2 py-1.5 text-[11px] leading-tight border-l-2 cursor-default"
                                      style={{ background: c.bg, borderLeftColor: c.dot, color: c.fg }}
                                      onMouseEnter={(e) => showHover(e, { kind: 'action', item: a })}
                                      onMouseLeave={() => setHover(null)}
                                    >
                                      <div className="font-medium flex items-center justify-between gap-2">
                                        <span className="truncate">{a.label}</span>
                                        {a.count > 1 && <span className="mono text-[10px] opacity-70 shrink-0">×{a.count}</span>}
                                      </div>
                                      <div className="mono text-[10px] mt-0.5 opacity-80">{a.affected}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      {/* Bookings row */}
                      <tr className={hasAny ? '' : 'opacity-50'}>
                        <td
                          className="sticky left-0 z-10 bg-[#FAF8F4] border-b-2 border-r border-stone-300 px-4 pt-1 pb-3 align-top"
                          style={{ minWidth: 200 }}
                        >
                          <div className={`inline-block px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] font-medium ${
                            hasPostActionBooking ? 'bg-amber-200 text-amber-900' : 'bg-stone-200 text-stone-700'
                          }`}>
                            {bookingRowLabel}
                          </div>
                          <div className="text-[10px] mono text-stone-400 mt-1">
                            for {l.prefix}
                          </div>
                        </td>
                        {matrix.dates.map(d => {
                          const items = bRow.get(d) || [];
                          if (items.length === 0) {
                            return <td key={d} className="border-b-2 border-r border-stone-200 px-2 py-1 align-top bg-stone-50/40" style={{ minWidth: 200, height: 56 }}></td>;
                          }
                          return (
                            <td key={d} className="border-b-2 border-r border-stone-200 px-1.5 py-1.5 align-top bg-stone-50/40" style={{ minWidth: 200 }}>
                              <div className="space-y-1">
                                {items.map((b, i) => {
                                  const flagged = b.overlaps.length > 0;
                                  return (
                                    <div
                                      key={i}
                                      className={`px-2 py-1.5 text-[11px] leading-tight border-l-2 cursor-default ${
                                        flagged ? 'bg-amber-100 border-amber-600 text-amber-950' : 'bg-emerald-50 border-emerald-700 text-emerald-950'
                                      }`}
                                      onMouseEnter={(e) => showHover(e, { kind: 'booking', item: b })}
                                      onMouseLeave={() => setHover(null)}
                                    >
                                      <div className="flex items-center gap-1 font-medium">
                                        {flagged && <AlertTriangle className="w-3 h-3 shrink-0" />}
                                        LOS {b.los}n
                                        <span className="opacity-50">·</span>
                                        ADR ${parseFloat(b.adr).toFixed(0)}
                                      </div>
                                      <div className="mono text-[10px] mt-0.5">
                                        Rev ${parseFloat(b.revenue).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                      </div>
                                      <div className="text-[10px] mt-0.5 opacity-75">
                                        {fmtShort(b.checkIn)}–{fmtShort(b.checkOut)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-stone-300 flex items-start justify-between gap-8 text-[11px] text-stone-500">
            <div className="max-w-md">
              <span className="text-stone-700 font-medium">A note on overlaps.</span> A booking is flagged only when <em>both</em> are true: it was created on or after a pricing action on its listing, <em>and</em> at least one of its stay nights falls on a date that action affects. These are causal candidates — the action plausibly influenced the booking. Verify each in PriceLabs.
            </div>
            <div className="mono text-right shrink-0">
              <div>{matrix.dates.length} action dates · {matrix.listings.length} listings</div>
              <div className="text-stone-400">Built {new Date().toLocaleDateString('en-US')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics view */}
      {matrix && view === 'analytics' && analytics && (
        <AnalyticsView analytics={analytics} totalStats={totalStats} matrix={matrix} />
      )}

      {/* Hover detail */}
      {hover && hover.kind === 'action' && (
        <div
          className="fixed z-40 pointer-events-none px-4 py-3 bg-stone-900 text-stone-100 text-[11px] max-w-sm shadow-2xl"
          style={{
            left: Math.min(hover.x, window.innerWidth - 380),
            top: hover.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 mb-1">{hover.item.action}</div>
          <div className="display text-base mb-2">{hover.item.label}</div>
          <div className="mono text-[10px] text-stone-300 mb-2">Affects: {hover.item.affected}</div>
          {hover.item.oldVal && hover.item.oldVal !== '-' && (
            <div className="border-t border-stone-700 pt-2 mt-2">
              <div className="text-[9px] uppercase tracking-wider text-stone-500 mb-1">Was</div>
              <div className="text-stone-300 leading-snug whitespace-pre-wrap">{String(hover.item.oldVal).slice(0, 200)}</div>
            </div>
          )}
          {hover.item.newVal && (
            <div className="border-t border-stone-700 pt-2 mt-2">
              <div className="text-[9px] uppercase tracking-wider text-stone-500 mb-1">Now</div>
              <div className="text-stone-100 leading-snug whitespace-pre-wrap">{String(hover.item.newVal).slice(0, 250)}</div>
            </div>
          )}
        </div>
      )}
      {hover && hover.kind === 'booking' && (
        <div
          className="fixed z-40 pointer-events-none px-4 py-3 bg-stone-900 text-stone-100 text-[11px] max-w-sm shadow-2xl"
          style={{
            left: Math.min(hover.x, window.innerWidth - 380),
            top: hover.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 mb-1">Booking · {hover.item.source}</div>
          <div className="display text-base mb-2">{hover.item.los} nights · ADR ${parseFloat(hover.item.adr).toFixed(0)}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mono text-[10px]">
            <div className="text-stone-400">Check-in</div><div>{hover.item.checkIn}</div>
            <div className="text-stone-400">Check-out</div><div>{hover.item.checkOut}</div>
            <div className="text-stone-400">Total revenue</div><div>${parseFloat(hover.item.revenue).toLocaleString('en-US')}</div>
          </div>
          {hover.item.overlaps.length > 0 && (
            <div className="border-t border-amber-700/50 pt-2 mt-2">
              <div className="text-[9px] uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Booking arrived after action{hover.item.overlaps.length > 1 ? 's' : ''}
              </div>
              {hover.item.overlaps.slice(0, 5).map((o, i) => (
                <div key={i} className="mono text-[10px] text-amber-200 leading-snug">
                  · {o.label} on {fmtShort(o.on)} (set {fmtShort(o.actionDate)})
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
