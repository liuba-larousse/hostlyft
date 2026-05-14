// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, Download, Copy, Trash2, Check, AlertCircle, FileText, Sparkles, X, StickyNote, ImagePlus, ZoomIn, FileSpreadsheet, Loader2, Camera, Filter, ChevronRight, History, Flag, CheckCircle2, AlertTriangle, Calendar, Upload, RefreshCw, BookOpen, TrendingUp, Pencil, Clock, Undo2, ChevronDown, EyeOff, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import ResultsTab from './ResultsTab';

/* ---------- Constants ---------- */

const COLUMNS = [
  { key: 'date',          label: 'Date',           width: 110, type: 'date',     placeholder: 'MM/DD/YYYY' },
  { key: 'owner',         label: 'Action Owner',   width: 130, type: 'text',     placeholder: 'Liuba' },
  { key: 'reason',        label: 'Reason',         width: 280, type: 'textarea', placeholder: 'Why this action?' },
  { key: 'affectedGroup', label: 'Affected Group', width: 130, type: 'text',     placeholder: 'Account / 833 / 1000M' },
  { key: 'affectedDates', label: 'Affected Dates', width: 140, type: 'text',     placeholder: 'All / Jun 1–30' },
  { key: 'action',        label: 'Action',         width: 240, type: 'textarea', placeholder: 'e.g. Demand Factor chng' },
  { key: 'valueBefore',   label: 'Value Before',   width: 130, type: 'text',     placeholder: 'Mod Aggressive' },
  { key: 'valueAfter',    label: 'Value After',    width: 130, type: 'text',     placeholder: 'Recommended' },
  { key: 'notes',         label: 'Notes',          width: 260, type: 'textarea', placeholder: 'Optional follow-up' },
];

const STORAGE_KEY = 'pricelabs:action_log:rows:v1';
const SCRATCHPAD_KEY = 'pricelabs:action_log:scratchpad:v1';
const NOTES_KEY = 'pricelabs:action_log:notes:v1';
const SCREENSHOTS_KEY = 'pricelabs:action_log:screenshots:v1';
const STATES_KEY = 'pricelabs:action_log:states:v1';
const FUNNEL_KEY = 'pricelabs:action_log:funnel:v1';
// Portfolio reports stored separately, keyed by calendar date (YYYY-MM-DD):
//   { '2026-05-07': { all: ParsedReport, ph: ParsedReport, exclPh: ParsedReport },
//     '2026-05-06': { ... } }
// WHY separate from funnel day-state: reports are a continuous archive — today's
// upload is automatically tomorrow's "yesterday." Coupling reports to funnel
// day-state would force re-upload daily, which is exactly what we're avoiding.
const PORTFOLIO_REPORTS_KEY = 'pricelabs:action_log:portfolio_reports:v1';
// Weeks report is a single document (most-recent upload wins) — no per-date
// archive because the weekly view doesn't have a day-over-day comparison.
const WEEKS_REPORT_KEY = 'pricelabs:action_log:weeks_report:v1';
const DISMISSED_FLAGS_KEY = 'pricelabs:action_log:dismissed_flags:v1';

/* ---------- Storage shim (Supabase-backed via /api/action-log) ---------- */

// Maps storage keys → API field names
const KEY_TO_FIELD: Record<string, string> = {
  [STORAGE_KEY]: 'rows',
  [SCRATCHPAD_KEY]: 'scratchpad',
  [NOTES_KEY]: 'notes',
  [SCREENSHOTS_KEY]: 'screenshots',
  [FUNNEL_KEY]: 'funnel',
  [STATES_KEY]: 'states',
  [PORTFOLIO_REPORTS_KEY]: 'portfolio_reports',
  [WEEKS_REPORT_KEY]: 'weeks_report',
  [DISMISSED_FLAGS_KEY]: 'dismissed_flags',
};

// In-memory cache so reads are instant after first load
const _cache: Record<string, string> = {};
let _cacheLoaded = false;

async function _ensureCache() {
  if (_cacheLoaded) return;
  try {
    const res = await fetch('/api/action-log');
    if (res.ok) {
      const data = await res.json();
      // Populate cache with API data
      if (data.rows) _cache[STORAGE_KEY] = JSON.stringify(data.rows);
      if (data.scratchpad !== undefined) _cache[SCRATCHPAD_KEY] = data.scratchpad;
      if (data.notes) _cache[NOTES_KEY] = JSON.stringify(data.notes);
      if (data.screenshots) _cache[SCREENSHOTS_KEY] = JSON.stringify(data.screenshots);
      if (data.funnel) _cache[FUNNEL_KEY] = JSON.stringify(data.funnel);
      if (data.states) _cache[STATES_KEY] = JSON.stringify(data.states);
      if (data.portfolio_reports) _cache[PORTFOLIO_REPORTS_KEY] = JSON.stringify(data.portfolio_reports);
      if (data.weeks_report) _cache[WEEKS_REPORT_KEY] = JSON.stringify(data.weeks_report);
      if (data.dismissed_flags) _cache[DISMISSED_FLAGS_KEY] = JSON.stringify(data.dismissed_flags);
    }
  } catch (e) {
    console.error('Failed to load action log from API:', e);
  }
  _cacheLoaded = true;
}

// Debounced save to API
let _saveTimeout: ReturnType<typeof setTimeout> | null = null;
const _pendingFields: Record<string, unknown> = {};

function _flushToAPI() {
  if (Object.keys(_pendingFields).length === 0) return;
  const body = { ..._pendingFields };
  Object.keys(body).forEach(k => delete _pendingFields[k]);
  fetch('/api/action-log', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(e => console.error('Failed to save action log:', e));
}

if (typeof window !== 'undefined' && !(window as any).storage) {
  (window as any).storage = {
    get: async (key: string) => {
      await _ensureCache();
      const value = _cache[key] ?? null;
      return value !== null ? { value } : null;
    },
    set: async (key: string, value: string) => {
      _cache[key] = value;
      const field = KEY_TO_FIELD[key];
      if (field) {
        try {
          _pendingFields[field] = field === 'scratchpad' ? value : JSON.parse(value);
        } catch {
          _pendingFields[field] = value;
        }
        if (_saveTimeout) clearTimeout(_saveTimeout);
        _saveTimeout = setTimeout(_flushToAPI, 1500);
      }
    },
    delete: async (key: string) => {
      delete _cache[key];
      const field = KEY_TO_FIELD[key];
      if (field) {
        const defaults: Record<string, unknown> = { scratchpad: '', screenshots: { scratchpad: [], byNote: {} }, portfolio_reports: {}, weeks_report: null };
        _pendingFields[field] = defaults[field] ?? [];
        if (_saveTimeout) clearTimeout(_saveTimeout);
        _saveTimeout = setTimeout(_flushToAPI, 1500);
      }
    },
  };
}

// All data is backed by Supabase via /api/action-log — no localStorage.

/* ---------- Storage helpers ---------- */

const loadRows = async () => {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    // key doesn't exist yet — that's fine, return empty
  }
  return [];
};

const saveRows = async (rows) => {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(rows));
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
};

const loadScratchpad = async () => {
  try {
    const result = await window.storage.get(SCRATCHPAD_KEY);
    if (result && result.value) return result.value;
  } catch (e) { /* not set yet */ }
  return '';
};

const saveScratchpad = async (text) => {
  try {
    await window.storage.set(SCRATCHPAD_KEY, text);
    return true;
  } catch (e) { return false; }
};

const loadNotes = async () => {
  try {
    const result = await window.storage.get(NOTES_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) { /* not set yet */ }
  return [];
};

const saveNotes = async (notes) => {
  try {
    await window.storage.set(NOTES_KEY, JSON.stringify(notes));
    return true;
  } catch (e) { return false; }
};

/* ---------- Screenshot helpers ---------- */

const loadScreenshots = async () => {
  try {
    const result = await window.storage.get(SCREENSHOTS_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) { /* not set yet */ }
  // Shape: { scratchpad: [shot...], byNote: { noteId: [shot...] } }
  // shot: { id, name, mediaType, data, addedAt, w, h }
  return { scratchpad: [], byNote: {} };
};

const saveScreenshots = async (screenshots) => {
  try {
    await window.storage.set(SCREENSHOTS_KEY, JSON.stringify(screenshots));
    return true;
  } catch (e) {
    console.error('Screenshot save failed:', e);
    return false;
  }
};

// Resize an image File to fit within MAX_W x MAX_H (jpeg, ~0.85 quality).
// Returns { mediaType, dataUrl, base64, width, height }.
// PriceLabs screenshots tend to be 2000–3000px wide; 1280 keeps detail readable
// while keeping single-image base64 payloads under ~400KB so the storage limit
// (5MB per key) holds many shots.
const MAX_W = 1280;
const MAX_H = 1280;

const resizeImageFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read file'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not decode image'));
    img.onload = () => {
      let { width, height } = img;
      const ratio = Math.min(MAX_W / width, MAX_H / height, 1);
      const w = Math.round(width * ratio);
      const h = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      // JPEG keeps payloads small; PriceLabs UI is fine as JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      resolve({ mediaType: 'image/jpeg', dataUrl, base64, width: w, height: h });
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const newScreenshot = ({ name, mediaType, dataUrl, base64, width, height }) => ({
  id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: name || 'screenshot',
  mediaType,
  dataUrl,
  base64,
  width,
  height,
  addedAt: new Date().toISOString(),
});

/* ---------- Daily Workflow Funnel ---------- */

// Five levels of the daily review, top-down.
// At each level we ask: "Does today's data look healthy here, or does this need
// attention at the next level down?" — the funnel narrows from portfolio-wide
// observation to listing-level intervention. WHY a funnel: it forces you to
// rule out higher-level explanations before drilling into building/listing
// noise. A weak listing inside a weak segment may not need listing-level work
// — the segment fix may resolve it.
const FUNNEL_LEVELS = [
  {
    id: 'portfolio',
    num: 1,
    title: 'Portfolio',
    subtitle: 'Total pickup, ADR, season, DBA',
    purpose: 'Understand total movement and quality of pickup.',
    reviewDaily: true,
    color: 'emerald-deep',
    isReportDriven: true, // Portfolio uses uploaded reports, not manual fields
    fields: [],
  },
  {
    id: 'segment',
    num: 2,
    title: 'Segment',
    subtitle: 'PH vs. Excl PH',
    purpose: 'Identify segment-level issue or opportunity.',
    reviewDaily: true,
    color: 'emerald-deep',
    fields: [
      { key: 'phPickup',     label: 'PH Pickup ($)',       placeholder: 'Penthouse pickup', type: 'text' },
      { key: 'phADR',        label: 'PH ADR',              placeholder: '$', type: 'text' },
      { key: 'exclPHPickup', label: 'Excl PH Pickup ($)',  placeholder: '2BR/3BR pickup', type: 'text' },
      { key: 'exclPHADR',    label: 'Excl PH ADR',         placeholder: '$', type: 'text' },
      { key: 'segmentVerdict', label: 'Verdict',           placeholder: 'Both healthy / PH soft / Excl PH soft', type: 'text' },
    ],
  },
  // Season level removed — was an experimental seasonal-grouping level that
  // didn't earn its place in the daily workflow. Existing season data in
  // storage is preserved (not deleted), it just doesn't render.
  {
    id: 'building',
    num: 3,
    title: 'Building',
    subtitle: 'Only if flagged',
    purpose: 'Find location/building-specific issue.',
    reviewDaily: false,
    color: 'navy',
    acceptsReport: true,
    reportHint: 'Filter PriceLabs to a specific building (or use Group filter), then export and drop here.',
    fields: [
      { key: 'buildingsFlagged', label: 'Buildings flagged today', placeholder: 'e.g. 833, 1000M', type: 'text' },
      { key: 'rationale',        label: 'Why these buildings',     placeholder: 'what triggered the drill-down', type: 'textarea' },
      { key: 'comparator',       label: 'Compared against',        placeholder: 'LY same period / portfolio avg / ...', type: 'text' },
      { key: 'observation',      label: 'Observation',             placeholder: 'what you found at building level', type: 'textarea' },
    ],
  },
  {
    id: 'listing',
    num: 4,
    title: 'Listing',
    subtitle: 'Only if action needed',
    purpose: 'Take action on specific inventory.',
    reviewDaily: false,
    color: 'navy',
    acceptsReport: true,
    reportHint: 'Filter PriceLabs to a specific listing, then export and drop here.',
    fields: [
      { key: 'listingsFlagged', label: 'Listings flagged today',  placeholder: 'e.g. 215.1403, 833.1102', type: 'text' },
      { key: 'issue',           label: 'Specific issue',          placeholder: 'low pickup / open dates / sync off', type: 'textarea' },
      { key: 'actionPlan',      label: 'Action plan',             placeholder: 'what you will / did do', type: 'textarea' },
      { key: 'loggedAsAction',  label: 'Logged as action row?',   placeholder: 'Yes/No · row reference', type: 'text' },
    ],
  },
];

// Funnel snapshot schema: keyed by date (YYYY-MM-DD)
//   { 'YYYY-MM-DD': {
//       portfolio: { status: 'reviewed'|'flagged'|'action'|null, fields: {...}, notes: '' },
//       segment:   { ... },
//       ...
//     }
//   }
//
// "status" semantics:
//   - 'reviewed' = looked at, nothing actionable
//   - 'flagged'  = something off, needs deeper drill
//   - 'action'   = action being taken (drill into next level OR log to action log)
//   - null       = not yet touched today

const FUNNEL_STATUSES = [
  { value: 'reviewed', label: 'Reviewed · OK', icon: CheckCircle2, bg: '#ECFDF5', fg: '#065F46', dot: '#059669' },
  { value: 'flagged',  label: 'Flagged · drill down', icon: Flag,  bg: '#FEF3C7', fg: '#854D0E', dot: '#D97706' },
  { value: 'action',   label: 'Action taken',         icon: AlertTriangle, bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
];

// MM/DD/YYYY → YYYY-MM-DD (for storage keying — chronological sort works)
const mdyToISO = (mdy) => {
  const m = String(mdy || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
};

const isoToMDY = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[2]}/${m[3]}/${m[1]}`;
};

const todayISO = () => mdyToISO(todayMDY());

const blankDayData = () => {
  const out = {};
  FUNNEL_LEVELS.forEach(L => {
    out[L.id] = { status: null, fields: {}, notes: '' };
  });
  return out;
};

const loadFunnel = async () => {
  try {
    const result = await window.storage.get(FUNNEL_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) { /* not set yet */ }
  return {};
};

const saveFunnel = async (funnel) => {
  try {
    await window.storage.set(FUNNEL_KEY, JSON.stringify(funnel));
    return true;
  } catch (e) {
    console.error('Funnel save failed:', e);
    return false;
  }
};

const loadPortfolioReports = async () => {
  try {
    const result = await window.storage.get(PORTFOLIO_REPORTS_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) { /* not set yet */ }
  return {};
};

const savePortfolioReports = async (reports) => {
  try {
    await window.storage.set(PORTFOLIO_REPORTS_KEY, JSON.stringify(reports));
    return true;
  } catch (e) {
    console.error('Portfolio reports save failed:', e);
    return false;
  }
};

const loadWeeksReport = async () => {
  try {
    const result = await window.storage.get(WEEKS_REPORT_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) { /* not set yet */ }
  return null;
};

const saveWeeksReport = async (report) => {
  try {
    if (report == null) {
      await window.storage.delete(WEEKS_REPORT_KEY);
    } else {
      await window.storage.set(WEEKS_REPORT_KEY, JSON.stringify(report));
    }
    return true;
  } catch (e) {
    console.error('Weeks report save failed:', e);
    return false;
  }
};

const loadDismissedFlags = async () => {
  try {
    const result = await window.storage.get(DISMISSED_FLAGS_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) { /* not set yet */ }
  return { snoozed: {}, removed: {} };
};

const saveDismissedFlags = async (flags) => {
  try {
    await window.storage.set(DISMISSED_FLAGS_KEY, JSON.stringify(flags));
    return true;
  } catch (e) {
    console.error('Dismissed flags save failed:', e);
    return false;
  }
};

// Build a unique key for a dismissed flag: segment:monthIso:flagId
const dismissedFlagKey = (segment, monthIso, flagId) => `${segment}:${monthIso}:${flagId}`;

// Check if a flag is currently dismissed (snoozed and not expired, or removed)
const isFlagDismissed = (dismissedFlags, segment, monthIso, flagId) => {
  const key = dismissedFlagKey(segment, monthIso, flagId);
  if (dismissedFlags.removed?.[key]) return 'removed';
  const snoozed = dismissedFlags.snoozed?.[key];
  if (snoozed) {
    // Snooze expires after 24 hours
    const expiresAt = new Date(snoozed.at).getTime() + 24 * 60 * 60 * 1000;
    if (Date.now() < expiresAt) return 'snoozed';
  }
  return false;
};

// Find the most recent date BEFORE the given ISO that has a report for the
// given segment. Used to look up "yesterday's" report — which may not actually
// be yesterday if the user skipped a day.
// WHY "most recent before" instead of "exactly yesterday": if you skip a day
// (vacation, weekend), the most recent prior upload is the right comparator
// for cumulative pickup since then. A 3-day pickup against a 1-day-old snapshot
// would understate; against a 4-day-old snapshot it would overstate. Net per-day
// pickup is approximate either way; using "most recent prior" is the conventional
// approach in revenue management.
const findPriorReportDate = (reports, currentISO, segment) => {
  const dates = Object.keys(reports).filter(d => d < currentISO && reports[d]?.[segment]).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
};

/* ---------- PriceLabs Report Parsing (Portfolio level) ---------- */

// The PriceLabs "Total Revenue On The Books" export has one row per month
// with these columns (case-sensitive). We pull the ones we need; rest ignored.
// WHY: The report structure is fixed — same export, different filters give us
// All / PH / Excl PH. We don't transform; we just match column names.
const PL_REPORT_COLUMNS = {
  yearMonth:       'Year & Month',
  // Use Rental Revenue (room rate × nights) for pricing decisions.
  // WHY not Total Revenue: total includes cleaning fees and ancillary charges
  // which aren't pricing-driven. Rental Revenue ties cleanly to ADR × Sold Nights
  // per AHLA standards, so RevPAR/ADR derivations reconcile.
  rentalRevenue:   'Rental Revenue',
  // Pickup columns are only published by PriceLabs as Total Revenue versions
  // (no Rental Revenue equivalents in the export). Keep these as-is — the
  // delta between snapshots is dominated by rental anyway, so the noise is small.
  pickup3d:        'Total Revenue Pickup (3 Days)',
  pickup7d:        'Total Revenue Pickup (7 Days)',
  rentalADR:       'Rental ADR',
  occupancy:       'Occupancy %',
  rentalRevPAR:    'Rental RevPAR',
  // Goal is only published as Total Revenue Goal; treat it as informational.
  goal:            'Total Revenue Goal',
  goalPct:         'Total Revenue Goal Completion %',
  bookableNights:  'Available Nights',
  // Same Time Last Year (STLY) — used for flag rules.
  // Use Rental Revenue STLY for the headline revenue figure to match this-year choice.
  rentalRevenueSTLY: 'Rental Revenue STLY',
  pickup3dSTLY:    'Total Revenue Pickup STLY (3 Days)',
  pickup7dSTLY:    'Total Revenue Pickup STLY (7 Days)',
  rentalADRSTLY:   'Rental ADR STLY',
  occupancySTLY:   'Occupancy % STLY',
  rentalRevPARSTLY: 'Rental RevPAR STLY',
};

// Parse "2026-05 (May)" → { iso: '2026-05', label: 'May 2026', y: 2026, m: 5 }
const parseYearMonth = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return { iso: `${m[1]}-${m[2]}`, label: `${months[mo - 1]} ${y}`, y, m: mo };
};

// Days from today to the last day of the given month, inclusive.
// Formula: (lastDayOfMonth − today) + 1
// Example: today = May 7, 2026; June last day = June 30, 2026
//   → June 30 minus May 7 = 54 days, +1 inclusive = 55 days
// Applied uniformly to every month — current and future. Past months → 0.
// WHY inclusive: a revenue manager working "today" still has today to influence
// today's bookings, so today counts as 1 day of remaining DBA.
const daysToEndOfMonth = (y, m) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(y, m, 0); // day 0 of next month = last day of this month
  lastDay.setHours(0, 0, 0, 0);
  if (lastDay < today) return 0;
  const diff = Math.round((lastDay - today) / (1000 * 60 * 60 * 24));
  return diff + 1;
};

// Identify which segment a building/group belongs to.
// In Cloud9's PriceLabs setup, all penthouses are bundled under a single
// Group named exactly "PH" (or possibly a building-prefixed variant like
// "1000.PH"). Every other Group is a non-PH building → Excl PH segment.
//
// Match rule: case-insensitive, trimmed, group is "PH" exactly OR ends with
// ".PH" or " PH" or "/PH". This avoids false positives for building names
// that happen to contain the letters "PH" elsewhere (e.g. "1234.Sapphire"
// would NOT match because "PH" doesn't appear as a token boundary).
// WHY tighter than substring: substring match would mis-classify any
// building whose name happens to contain the letters PH anywhere — too
// fragile against new building additions.
const buildingToSegment = (group) => {
  if (!group) return null;
  const s = String(group).trim().toUpperCase();
  if (s === 'PH') return 'ph';
  if (/[.\s\/-]PH$/.test(s)) return 'ph'; // e.g. "1000.PH", "1000 PH", "1000-PH"
  // Listing name format: "730.2304 -- Scenic 3BR PH for To..."
  // Check the description part (after --) for PH or Penthouse
  if (/--.*\bPH\b/i.test(s) || /penthouse/i.test(s)) return 'ph';
  return 'exclPh';
};

// Find first matching column value from a list of candidate column names.
// Tries exact match first, then case-insensitive trimmed match.
// Used for pickup columns since PriceLabs Report Builder uses different
// column names depending on the template ("Total Revenue Pickup (3 Days)"
// in some exports, "Pickup (3 Days)" or "Revenue Pickup (3 Days)" in others).
const fuzzyGet = (row, candidates) => {
  // Try exact match first (cheapest)
  for (const c of candidates) {
    if (c in row && row[c] != null) return row[c];
  }
  // Fall back to fuzzy: build lowercase-trimmed lookup once, then check each candidate
  const norm = {};
  Object.keys(row).forEach(k => { norm[String(k).trim().toLowerCase()] = row[k]; });
  for (const c of candidates) {
    const v = norm[c.toLowerCase()];
    if (v != null) return v;
  }
  return null;
};

// Column-name candidates per metric. PriceLabs Report Builder uses different
// names depending on which template/dataset you start from; multi-building
// exports often drop the "Total Revenue" prefix from pickup column names.
const COL_CANDIDATES = {
  pickup3d: [
    'Total Revenue Pickup (3 Days)',
    'Revenue Pickup (3 Days)',
    'Rental Revenue Pickup (3 Days)',
    'Pickup (3 Days)',
    '3-Day Pickup',
    '3d Pickup',
  ],
  pickup7d: [
    'Total Revenue Pickup (7 Days)',
    'Revenue Pickup (7 Days)',
    'Rental Revenue Pickup (7 Days)',
    'Pickup (7 Days)',
    '7-Day Pickup',
    '7d Pickup',
  ],
  pickup3dSTLY: [
    'Total Revenue Pickup STLY (3 Days)',
    'Revenue Pickup STLY (3 Days)',
    'Rental Revenue Pickup STLY (3 Days)',
    'Pickup STLY (3 Days)',
    'STLY 3-Day Pickup',
  ],
  pickup7dSTLY: [
    'Total Revenue Pickup STLY (7 Days)',
    'Revenue Pickup STLY (7 Days)',
    'Rental Revenue Pickup STLY (7 Days)',
    'Pickup STLY (7 Days)',
    'STLY 7-Day Pickup',
  ],
};

// Map a single row into our internal month object. Pulled out so we can
// reuse it both for portfolio-wide rows and for per-building rows.
const rowToMonth = (row, ym) => ({
  iso: ym.iso,
  label: ym.label,
  y: ym.y,
  m: ym.m,
  rentalRevenue: row[PL_REPORT_COLUMNS.rentalRevenue] ?? null,
  pickup3d:     fuzzyGet(row, COL_CANDIDATES.pickup3d),
  pickup7d:     fuzzyGet(row, COL_CANDIDATES.pickup7d),
  rentalADR:    row[PL_REPORT_COLUMNS.rentalADR] ?? null,
  occupancy:    row[PL_REPORT_COLUMNS.occupancy] ?? null,
  rentalRevPAR: row[PL_REPORT_COLUMNS.rentalRevPAR] ?? null,
  goal:         row[PL_REPORT_COLUMNS.goal] ?? null,
  goalPct:      row[PL_REPORT_COLUMNS.goalPct] ?? null,
  bookableNights: row[PL_REPORT_COLUMNS.bookableNights] ?? null,
  rentalRevenueSTLY: row[PL_REPORT_COLUMNS.rentalRevenueSTLY] ?? null,
  pickup3dSTLY:    fuzzyGet(row, COL_CANDIDATES.pickup3dSTLY),
  pickup7dSTLY:    fuzzyGet(row, COL_CANDIDATES.pickup7dSTLY),
  rentalADRSTLY:   row[PL_REPORT_COLUMNS.rentalADRSTLY] ?? null,
  occupancySTLY:   row[PL_REPORT_COLUMNS.occupancySTLY] ?? null,
  rentalRevPARSTLY: row[PL_REPORT_COLUMNS.rentalRevPARSTLY] ?? null,
});

// Parse an xlsx ArrayBuffer; return either a portfolio-wide report
// ({ months: [...] }) or a multi-building report
// ({ months: [...aggregate], byBuilding: { [group]: [...months] } }).
//
// When a "Group" column is present and populated, the parser:
//   - groups rows by Group → produces byBuilding map
//   - aggregates across all Groups for the top-level months[] (so the
//     existing portfolio-display code keeps working unchanged)
// When no Group column exists, the rows are treated as portfolio-wide totals.
const parseReportFile = (arrayBuffer, fileName) => {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Workbook has no sheets');
  const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (json.length === 0) throw new Error('Report is empty');

  const sample = json[0];
  if (!(PL_REPORT_COLUMNS.yearMonth in sample)) {
    throw new Error(`Report missing "${PL_REPORT_COLUMNS.yearMonth}" column. Is this the right export?`);
  }
  if (!(PL_REPORT_COLUMNS.rentalRevenue in sample)) {
    throw new Error(`Report missing "${PL_REPORT_COLUMNS.rentalRevenue}" column.`);
  }

  // Detect a building/group column. PriceLabs Report Builder uses different
  // names depending on the template — "Group name", "Group", "Sub Group",
  // "Listing Group", etc. Detection is fuzzy: case-insensitive, ignores
  // surrounding whitespace, also handles common typos/variations.
  // WHY fuzzy match: PriceLabs column headers vary slightly between exports
  // (capitalization, spacing). Strict matching breaks easily; fuzzy matching
  // is robust to those variations without losing safety — we still only
  // accept columns that LOOK like a building/group dimension by name.
  const BUILDING_COL_PATTERNS = [
    /^group\s*name$/i,
    /^group$/i,
    /^sub\s*group(\s*name)?$/i,
    /^customization\s*group$/i,
    /^customization\s*sub\s*group$/i,
    /^listing\s*group$/i,
    /^listing\s*sub\s*group$/i,
    /^listing\s*name$/i,
    /^building(\s*name)?$/i,
    /^property\s*group$/i,
  ];
  const allCols = Object.keys(sample);
  let buildingCol = allCols.find(c => {
    // Normalize: strip non-printable chars, collapse whitespace, trim
    const trimmed = String(c).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
    return BUILDING_COL_PATTERNS.some(rx => rx.test(trimmed));
  }) || null;
  // Fallback: if no pattern matched, check for column containing "listing" and "name"
  if (!buildingCol) {
    buildingCol = allCols.find(c => /listing/i.test(c) && /name/i.test(c)) || null;
  }
  const groupValues = buildingCol
    ? json.map(r => r[buildingCol]).filter(g => g != null && String(g).trim() !== '')
    : [];
  const isMultiBuilding = !!buildingCol && groupValues.length > 0;

  if (!isMultiBuilding) {
    // Portfolio-wide single-row-per-month layout (legacy behavior unchanged)
    const months = [];
    for (const row of json) {
      const ym = parseYearMonth(row[PL_REPORT_COLUMNS.yearMonth]);
      if (!ym) continue;
      months.push(rowToMonth(row, ym));
    }
    return {
      fileName,
      uploadedAt: new Date().toISOString(),
      months,
      // Debug hint surfaced on the report — helps diagnose detection issues.
      // _detectionInfo is read by the UI when isMultiBuilding === false but
      // the row count looks suspiciously like multi-building data.
      _detectionInfo: {
        detectedBuildingCol: buildingCol,
        availableColumns: allCols,
        rowCount: json.length,
      },
    };
  }

  // Multi-building report. Build byBuilding map AND an aggregated months[]
  // (sum of metrics per month across all buildings).
  const byBuilding = {};
  const aggregateMap = new Map(); // iso -> aggregated month object

  for (const row of json) {
    const group = row[buildingCol];
    if (group == null || String(group).trim() === '') continue;
    const ym = parseYearMonth(row[PL_REPORT_COLUMNS.yearMonth]);
    if (!ym) continue;

    const groupKey = String(group).trim();
    if (!byBuilding[groupKey]) byBuilding[groupKey] = [];
    const monthObj = rowToMonth(row, ym);
    byBuilding[groupKey].push(monthObj);

    // Aggregate (sum additive metrics; recompute weighted averages later)
    if (!aggregateMap.has(ym.iso)) {
      aggregateMap.set(ym.iso, {
        iso: ym.iso, label: ym.label, y: ym.y, m: ym.m,
        rentalRevenue: 0, pickup3d: 0, pickup7d: 0,
        rentalRevenueSTLY: 0, pickup3dSTLY: 0, pickup7dSTLY: 0,
        bookableNights: 0,
        // For weighted avgs we accumulate weighted sums and total nights
        _adrWeightedSum: 0, _adrSTLYWeightedSum: 0, _adrNights: 0, _adrSTLYNights: 0,
        _occWeightedSum: 0, _occSTLYWeightedSum: 0, _occNights: 0,
        _revparWeightedSum: 0, _revparSTLYWeightedSum: 0,
        goal: 0, goalPct: null, // Goal % shown only at All segment anyway
      });
    }
    const agg = aggregateMap.get(ym.iso);
    const addNum = (v) => (v == null ? 0 : Number(v) || 0);
    agg.rentalRevenue   += addNum(monthObj.rentalRevenue);
    agg.pickup3d        += addNum(monthObj.pickup3d);
    agg.pickup7d        += addNum(monthObj.pickup7d);
    agg.rentalRevenueSTLY += addNum(monthObj.rentalRevenueSTLY);
    agg.pickup3dSTLY    += addNum(monthObj.pickup3dSTLY);
    agg.pickup7dSTLY    += addNum(monthObj.pickup7dSTLY);
    agg.bookableNights  += addNum(monthObj.bookableNights);
    agg.goal            += addNum(monthObj.goal);
    // Weighted ADR: nights = bookableNights × occupancy ÷ 100 (approximation —
    // we don't have a dedicated "sold nights" column in the export).
    const nights = (addNum(monthObj.bookableNights) * addNum(monthObj.occupancy)) / 100;
    if (nights > 0 && monthObj.rentalADR != null) {
      agg._adrWeightedSum += monthObj.rentalADR * nights;
      agg._adrNights += nights;
    }
    if (monthObj.bookableNights != null && monthObj.occupancy != null) {
      agg._occWeightedSum += monthObj.occupancy * addNum(monthObj.bookableNights);
      agg._occNights += addNum(monthObj.bookableNights);
    }
    if (monthObj.rentalRevPAR != null && monthObj.bookableNights != null) {
      agg._revparWeightedSum += monthObj.rentalRevPAR * addNum(monthObj.bookableNights);
    }
    // STLY weighted avgs — same approximation
    if (monthObj.rentalADRSTLY != null && monthObj.bookableNights != null) {
      agg._adrSTLYWeightedSum += monthObj.rentalADRSTLY * addNum(monthObj.bookableNights);
      agg._adrSTLYNights += addNum(monthObj.bookableNights);
    }
    if (monthObj.occupancySTLY != null && monthObj.bookableNights != null) {
      agg._occSTLYWeightedSum += monthObj.occupancySTLY * addNum(monthObj.bookableNights);
    }
    if (monthObj.rentalRevPARSTLY != null && monthObj.bookableNights != null) {
      agg._revparSTLYWeightedSum += monthObj.rentalRevPARSTLY * addNum(monthObj.bookableNights);
    }
  }

  // Finalize aggregates: compute weighted averages
  const months = [];
  Array.from(aggregateMap.values())
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .forEach(agg => {
      const finalized = {
        iso: agg.iso, label: agg.label, y: agg.y, m: agg.m,
        rentalRevenue: agg.rentalRevenue,
        pickup3d: agg.pickup3d,
        pickup7d: agg.pickup7d,
        rentalADR: agg._adrNights > 0 ? agg._adrWeightedSum / agg._adrNights : null,
        occupancy: agg._occNights > 0 ? agg._occWeightedSum / agg._occNights : null,
        rentalRevPAR: agg._occNights > 0 ? agg._revparWeightedSum / agg._occNights : null,
        rentalRevenueSTLY: agg.rentalRevenueSTLY,
        pickup3dSTLY: agg.pickup3dSTLY,
        pickup7dSTLY: agg.pickup7dSTLY,
        rentalADRSTLY: agg._adrSTLYNights > 0 ? agg._adrSTLYWeightedSum / agg._adrSTLYNights : null,
        occupancySTLY: agg._occNights > 0 ? agg._occSTLYWeightedSum / agg._occNights : null,
        rentalRevPARSTLY: agg._occNights > 0 ? agg._revparSTLYWeightedSum / agg._occNights : null,
        bookableNights: agg.bookableNights,
        goal: agg.goal,
        goalPct: null,
      };
      months.push(finalized);
    });

  return {
    fileName,
    uploadedAt: new Date().toISOString(),
    months,
    byBuilding,
    _detectionInfo: {
      detectedBuildingCol: buildingCol,
      availableColumns: allCols,
      rowCount: json.length,
    },
  };
};

// Compute 1-day pickup by comparing today's report to yesterday's:
//   pickup1d[month] = today.rentalRevenue[month] - prior.rentalRevenue[month]
// WHY: PriceLabs doesn't expose 1-day pickup directly, but Rental Revenue
// (on-the-books) is a snapshot — so the difference between two snapshots
// taken 1 day apart is the net revenue picked up in that day.
// CAVEAT: this is NET pickup (new bookings minus cancellations), not gross
// new bookings. For most decision-making this is the more useful number,
// but worth knowing if reconciling against a "new bookings" report.
//
// BACKWARD COMPATIBILITY: reports parsed before we switched the headline
// field from totalRevenue to rentalRevenue have m.totalRevenue but no
// m.rentalRevenue. We fall back to whichever exists, so prior uploads that
// were saved under the old schema still produce a usable diff.
// The values are close enough (rental ~= total minus ~10% cleaning fees)
// that the resulting 1-day pickup is still meaningful, and once a fresh
// report is uploaded under the new schema the comparison becomes apples-to-apples.
const revenueValue = (monthRow) => {
  if (!monthRow) return null;
  if (monthRow.rentalRevenue != null) return monthRow.rentalRevenue;
  if (monthRow.totalRevenue != null) return monthRow.totalRevenue;
  return null;
};

// Detect which revenue field a parsed report uses. Older reports parsed before
// the Total→Rental Revenue switch only have totalRevenue; newer reports have
// rentalRevenue. Returns 'rental' | 'total' | null.
// WHY: 1-day pickup compares today vs prior. If one side is Rental Revenue
// (excludes cleaning fees) and the other is Total Revenue (includes them),
// the diff is meaningless and produces wildly negative numbers. Better to
// detect the mismatch and surface N/A than show garbage.
const reportRevenueSchema = (report) => {
  if (!report?.months || report.months.length === 0) return null;
  // Sample first 3 months to determine which field is consistently populated
  const sample = report.months.slice(0, 3);
  const hasRental = sample.some(m => m.rentalRevenue != null);
  const hasTotal  = sample.some(m => m.totalRevenue  != null && m.rentalRevenue == null);
  if (hasRental) return 'rental';
  if (hasTotal)  return 'total';
  return null;
};

// True only when priorISO is exactly 1 calendar day before todayISO.
// WHY: the "1-day pickup" name implies a 1-day delta. If the prior report
// is from 3 days ago, the difference is a 3-day pickup — labeling it as
// 1-day would mislead. Better to show N/A than a misleading number.
const isExactlyYesterday = (todayISO, priorISO) => {
  if (!todayISO || !priorISO) return false;
  const t = new Date(todayISO + 'T00:00:00');
  const p = new Date(priorISO + 'T00:00:00');
  const diffDays = Math.round((t - p) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
};

const computeOneDayPickup = (todayReport, priorReport, todayISO, priorISO) => {
  if (!todayReport || !priorReport) return {};
  // Schema check: refuse to diff when today and prior use different revenue
  // definitions. Returns empty so the UI shows N/A instead of garbage.
  const todaySchema = reportRevenueSchema(todayReport);
  const priorSchema = reportRevenueSchema(priorReport);
  if (todaySchema && priorSchema && todaySchema !== priorSchema) return {};

  // Use whichever field today's report uses, then read the same field from prior
  const field = todaySchema === 'total' ? 'totalRevenue' : 'rentalRevenue';
  const priorMap = new Map(priorReport.months.map(m => [m.iso, m[field]]));
  const out = {};
  for (const month of todayReport.months) {
    const prior = priorMap.get(month.iso);
    const today = month[field];
    if (prior == null || today == null) continue;
    out[month.iso] = today - prior;
  }
  return out;
};

// Per-building 1-day pickup — keyed by `${group}|${iso}`.
// WHY a flat keyed map: easier lookups in the per-building table render
// than a nested {group: {iso: value}} structure.
// Same yesterday-only and schema-mismatch protection as computeOneDayPickup.
const computeOneDayPickupByBuilding = (todayReport, priorReport, todayISO, priorISO) => {
  if (!todayReport?.byBuilding || !priorReport?.byBuilding) return {};
  const todaySchema = reportRevenueSchema(todayReport);
  const priorSchema = reportRevenueSchema(priorReport);
  if (todaySchema && priorSchema && todaySchema !== priorSchema) return {};
  const field = todaySchema === 'total' ? 'totalRevenue' : 'rentalRevenue';

  const out = {};
  Object.entries(todayReport.byBuilding).forEach(([group, monthsArr]) => {
    const priorMonths = priorReport.byBuilding[group];
    if (!priorMonths) return;
    const priorMap = new Map(priorMonths.map(m => [m.iso, m[field]]));
    monthsArr.forEach(m => {
      const today = m[field];
      const prior = priorMap.get(m.iso);
      if (today == null || prior == null) return;
      out[`${group}|${m.iso}`] = today - prior;
    });
  });
  return out;
};

/* ---------- Weeks Report parser ----------
   The PriceLabs "Overview by Weeks" export has one row per ISO week with
   competitive-set indices (MPI, ADR Index, RevPAR Index), event names, and
   pacing metrics. Different shape from the monthly Total Revenue On The Books
   export — primary key is "Year & Week" (e.g. "2026-01") not "Year & Month".

   Note on LY field naming: monthly reports use "STLY" (Same Time Last Year)
   suffix; weekly reports use "LY" suffix. The parser maps both into the same
   internal field names (rentalADRSTLY etc.) so the existing flag rules can run
   without modification.
*/

const WEEK_COLUMN_MAP = {
  yearWeek:        'Year & Week',
  mpi:             'Market Penetration Index %',
  adrIndex:        'ADR Index',
  revparIndex:     'RevPAR Index',
  pickup3d:        'Rental Revenue Pickup (3 Days)',
  pickup3dSTLY:    'Rental Revenue Pickup STLY (3 Days)',
  pickup7d:        'Rental Revenue Pickup (7 Days)',
  pickup7dSTLY:    'Rental Revenue Pickup STLY (7 Days)',
  occupancyPickup7d: 'Occupancy Pickup (7 Days)',
  occupancyPickup7dSTLY: 'Occupancy Pickup STLY (7 Days)',
  marketOccupancyPickup7d: 'Market Occupancy Pickup (7 Days)',
  eventsName:      'Events Name',
  eventsNameLY:    'Events Name LY',
  // Headline metrics — DIRECT STLY columns. STLY = Same Time Last Year
  // (snapshot at this same DBA last year). LY = full-year-final value.
  // Flag rules compare against STLY because that's the apples-to-apples comparison.
  rentalRevPAR:     'Rental RevPAR',
  rentalRevPARSTLY: 'Rental RevPAR STLY',
  rentalRevPARLY:   'Rental RevPAR LY',         // kept for reference / hover only
  occupancy:        'Occupancy %',
  occupancySTLY:    'Occupancy % STLY',
  occupancyLY:      'Occupancy % LY',           // kept for reference / hover only
  rentalADR:        'Rental ADR',
  rentalADRSTLY:    'Rental ADR STLY',
  rentalADRLY:      'Rental ADR LY',            // kept for reference / hover only
  rentalRevenueSTLY: 'Rental Revenue STLY',
  // Market data — for hover tooltips, not flag logic
  marketOccupancy:     'Market Occupancy %',
  marketOccupancySTLY: 'Market Occupancy % STLY',
  marketOccupancyLY:   'Market Occupancy % LY',
  marketADR:           'Market ADR',
  marketADRLY:         'Market ADR LY',
  // Weekday/weekend split — direct STLY columns
  weekdayOcc:      'Weekday Occupancy %',
  weekdayOccSTLY:  'Weekday Occupancy % STLY',
  weekdayOccLY:    'Weekday Occupancy % LY',
  weekendOcc:      'Weekend Occupancy %',
  weekendOccSTLY:  'Weekend Occupancy % STLY',
  weekendOccLY:    'Weekend Occupancy % LY',
};

// Parse "2026-01" or "2026-W01" into { iso, label, y, w }
const parseYearWeek = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-W?(\d{1,2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const w = parseInt(m[2], 10);
  if (isNaN(y) || isNaN(w) || w < 1 || w > 53) return null;
  // ISO week label: "Week 1 · 2026" — short and unambiguous
  return {
    iso: `${y}-W${String(w).padStart(2, '0')}`,
    label: `Week ${w} · ${y}`,
    y, w,
  };
};

// Compute the Monday-of-ISO-week date — used for "is this week in the past?"
// and for the DBA-equivalent (days until the week ends).
const isoWeekStartDate = (year, week) => {
  // Per ISO 8601: week 1 is the week containing the first Thursday of the year.
  // Equivalently, week 1 contains January 4. Monday of that week is the start.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow + 1);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
};

// Days until the end of this week from today (positive = future, 0 = current week)
const daysToEndOfWeek = (year, week) => {
  const monday = isoWeekStartDate(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const diff = Math.floor((sunday - today) / (86400 * 1000));
  return Math.max(0, diff + 1);
};

// Format an ISO week as a calendar-date range: "Jun 1–7, 2026" (or "May 30–Jun 5, 2026"
// when the week straddles a month boundary). Year always shown for clarity across
// years. Used everywhere week labels appear (Weeks tab table, flag cards, Summary).
// WHY include the year explicitly: revenue managers often look at the same week
// across multiple years; abbreviating to just "Jun 1–7" creates ambiguity.
const formatWeekDateRange = (year, week) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monday = isoWeekStartDate(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const mMonth = months[monday.getUTCMonth()];
  const mDay   = monday.getUTCDate();
  const sMonth = months[sunday.getUTCMonth()];
  const sDay   = sunday.getUTCDate();
  const sYear  = sunday.getUTCFullYear();
  if (mMonth === sMonth) {
    // Same month: "Jun 1–7, 2026"
    return `${mMonth} ${mDay}–${sDay}, ${sYear}`;
  }
  // Cross-month: "May 30–Jun 5, 2026"
  return `${mMonth} ${mDay}–${sMonth} ${sDay}, ${sYear}`;
};

const parseWeeksReportFile = (arrayBuffer, fileName) => {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Workbook has no sheets');
  const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (json.length === 0) throw new Error('Report is empty');

  const sample = json[0];
  if (!(WEEK_COLUMN_MAP.yearWeek in sample)) {
    throw new Error(`Report missing "${WEEK_COLUMN_MAP.yearWeek}" column. Is this the Overview by Weeks export?`);
  }

  // Detect whether this export has direct STLY columns (newer template) or
  // only YoY-difference columns (older template — needs back-calculation).
  // WHY check: the difference is critical for flag logic. STLY is the
  // apples-to-apples comparison point at this same DBA last year, while LY
  // is the full closed-week value. Flagging "ADR < LY" against the closed-week
  // LY produces wrong signal for forward weeks — it would say a week building
  // up at $957 ADR is "below LY $668" only if compared to STLY ($1,037 STLY),
  // but compared to closed-week LY ($668), the same week looks ahead.
  const hasDirectSTLY = (
    WEEK_COLUMN_MAP.occupancySTLY in sample &&
    WEEK_COLUMN_MAP.rentalADRSTLY in sample &&
    WEEK_COLUMN_MAP.rentalRevPARSTLY in sample
  );
  // Older legacy column names — these indicate we need to back-calculate STLY
  const legacyYoYCols = {
    occYoY:     'Occupancy STLY YoY Difference',
    adrYoYPct:  'Rental ADR STLY YoY %',
    revparYoYPct: 'Rental RevPAR STLY YoY %',
  };
  const hasLegacyYoY = (
    legacyYoYCols.occYoY in sample &&
    legacyYoYCols.adrYoYPct in sample &&
    legacyYoYCols.revparYoYPct in sample
  );

  const weeks = [];
  for (const row of json) {
    const yw = parseYearWeek(row[WEEK_COLUMN_MAP.yearWeek]);
    if (!yw) continue;

    // Read TY values
    const ty_occ    = row[WEEK_COLUMN_MAP.occupancy] ?? null;
    const ty_adr    = row[WEEK_COLUMN_MAP.rentalADR] ?? null;
    const ty_revpar = row[WEEK_COLUMN_MAP.rentalRevPAR] ?? null;

    // Read STLY values — direct columns first, fall back to back-calculation
    let stly_occ    = hasDirectSTLY ? (row[WEEK_COLUMN_MAP.occupancySTLY] ?? null) : null;
    let stly_adr    = hasDirectSTLY ? (row[WEEK_COLUMN_MAP.rentalADRSTLY] ?? null) : null;
    let stly_revpar = hasDirectSTLY ? (row[WEEK_COLUMN_MAP.rentalRevPARSTLY] ?? null) : null;

    if (!hasDirectSTLY && hasLegacyYoY) {
      // Back-calc from YoY columns
      // STLY occupancy: TY% − YoY-diff (in pp)
      const occYoY = row[legacyYoYCols.occYoY];
      if (ty_occ != null && occYoY != null) stly_occ = ty_occ - occYoY;
      // STLY ADR: TY ÷ (1 + YoYpct/100)
      const adrYoYPct = row[legacyYoYCols.adrYoYPct];
      if (ty_adr != null && adrYoYPct != null && Math.abs(adrYoYPct + 100) > 0.01) {
        stly_adr = ty_adr / (1 + adrYoYPct / 100);
      }
      // STLY RevPAR: TY ÷ (1 + YoYpct/100)
      const revparYoYPct = row[legacyYoYCols.revparYoYPct];
      if (ty_revpar != null && revparYoYPct != null && Math.abs(revparYoYPct + 100) > 0.01) {
        stly_revpar = ty_revpar / (1 + revparYoYPct / 100);
      }
    }

    // Market STLY — direct column if present, otherwise null (no fallback needed,
    // market data is hover-only and not in flag logic)
    const market_stly_occ = WEEK_COLUMN_MAP.marketOccupancySTLY in sample
      ? (row[WEEK_COLUMN_MAP.marketOccupancySTLY] ?? null) : null;

    weeks.push({
      iso: yw.iso,
      label: yw.label,
      y: yw.y,
      w: yw.w,
      // Index metrics
      mpi:         row[WEEK_COLUMN_MAP.mpi] ?? null,
      adrIndex:    row[WEEK_COLUMN_MAP.adrIndex] ?? null,
      revparIndex: row[WEEK_COLUMN_MAP.revparIndex] ?? null,
      // Events
      eventsName:   row[WEEK_COLUMN_MAP.eventsName] ?? null,
      eventsNameLY: row[WEEK_COLUMN_MAP.eventsNameLY] ?? null,
      // Pickup (already STLY-suffixed in this export)
      pickup3d:     row[WEEK_COLUMN_MAP.pickup3d] ?? null,
      pickup3dSTLY: row[WEEK_COLUMN_MAP.pickup3dSTLY] ?? null,
      pickup7d:     row[WEEK_COLUMN_MAP.pickup7d] ?? null,
      pickup7dSTLY: row[WEEK_COLUMN_MAP.pickup7dSTLY] ?? null,
      // Headline rate metrics — TY + STLY (used by flag rules)
      rentalADR:        ty_adr,
      rentalADRSTLY:    stly_adr,
      rentalADRLY:      row[WEEK_COLUMN_MAP.rentalADRLY] ?? null,
      occupancy:        ty_occ,
      occupancySTLY:    stly_occ,
      occupancyLY:      row[WEEK_COLUMN_MAP.occupancyLY] ?? null,
      rentalRevPAR:     ty_revpar,
      rentalRevPARSTLY: stly_revpar,
      rentalRevPARLY:   row[WEEK_COLUMN_MAP.rentalRevPARLY] ?? null,
      rentalRevenueSTLY: row[WEEK_COLUMN_MAP.rentalRevenueSTLY] ?? null,
      // Market data — for hover tooltips, not flag logic
      marketOccupancy:     row[WEEK_COLUMN_MAP.marketOccupancy] ?? null,
      marketOccupancySTLY: market_stly_occ,
      marketOccupancyLY:   row[WEEK_COLUMN_MAP.marketOccupancyLY] ?? null,
      marketADR:           row[WEEK_COLUMN_MAP.marketADR] ?? null,
      marketADRLY:         row[WEEK_COLUMN_MAP.marketADRLY] ?? null,
      // Weekday/weekend split — STLY versions for accurate forward comparison
      weekdayOcc:    row[WEEK_COLUMN_MAP.weekdayOcc] ?? null,
      weekdayOccSTLY: row[WEEK_COLUMN_MAP.weekdayOccSTLY] ?? null,
      weekdayOccLY:  row[WEEK_COLUMN_MAP.weekdayOccLY] ?? null,
      weekendOcc:    row[WEEK_COLUMN_MAP.weekendOcc] ?? null,
      weekendOccSTLY: row[WEEK_COLUMN_MAP.weekendOccSTLY] ?? null,
      weekendOccLY:  row[WEEK_COLUMN_MAP.weekendOccLY] ?? null,
    });
  }
  return {
    fileName,
    uploadedAt: new Date().toISOString(),
    weeks,
    // Diagnostic info — surfaced in the Weeks tab UI so the user knows
    // whether direct STLY columns were used or if back-calculation was needed
    _stlySource: hasDirectSTLY ? 'direct' : (hasLegacyYoY ? 'back-calc' : 'missing'),
  };
};

// Three segments at portfolio level
const PORTFOLIO_SEGMENTS = [
  { id: 'all',    label: 'All',     subtitle: 'Whole portfolio' },
  { id: 'ph',     label: 'PH',      subtitle: 'Penthouses only' },
  { id: 'exclPh', label: 'Excl PH', subtitle: '2BR + 3BR (no Penthouses)' },
];

// Drill-down tabs: render alongside segment tabs at Portfolio level but use
// SimpleReportPanel (per-row rendering, no cascade). These are scope drill-downs
// rather than segment slices, so they live separately from PORTFOLIO_SEGMENTS.
const PORTFOLIO_DRILLDOWNS = [
  { id: 'building', label: 'Building', subtitle: 'Per-building breakdown', hint: 'Filter PriceLabs to a specific building (or use Group filter), then export and drop here.' },
  { id: 'listing',  label: 'Listing',  subtitle: 'Per-listing breakdown', hint: 'Filter PriceLabs to specific listings, then export and drop here.' },
  { id: 'weeks',    label: 'Weeks',    subtitle: 'Weekly competitive indices & pickup', hint: 'Upload the PriceLabs Overview by Weeks export.' },
];

/* ---------- Auto-flag rules (vs. Same Time Last Year) ---------- */

// Threshold for the "occupancy outpacing LY" opportunity flag.
// WHY 10 percentage points: matches the user-defined rule. Anything within
// ±10pp of LY is the "tracking normal" range; a 10pp positive surge often
// signals demand we should test pricing into.
const OCCUPANCY_OUTPACE_THRESHOLD = 10;
// Pickup flag thresholds (percent of last-year pickup at the same time)
//   TY pickup < (1 - PICKUP_BEHIND_THRESHOLD) × LY pickup → problem
//   TY pickup > (1 + PICKUP_AHEAD_THRESHOLD)  × LY pickup → opportunity
// WHY 10%: a tighter threshold like 5% catches normal week-to-week noise;
// a looser one like 20% would miss real signal until it's already too late
// to course-correct. 10% is the conventional choice in pickup pacing models.
const PICKUP_BEHIND_THRESHOLD = 0.10;
const PICKUP_AHEAD_THRESHOLD = 0.10;

// ADR / RevPAR / Occupancy problem thresholds vs STLY.
// ADR and RevPAR are dollar metrics — flag when TY < STLY × (1 - 5%).
// Occupancy is already a percentage, so a percentage-of-STLY comparison is
// confusing — instead we use a percentage-point gap: flag when TY is more
// than 5pp below STLY (e.g., 50% TY vs 56% STLY = -6pp = problem).
// WHY 5%: small variations vs STLY are normal noise. A 5% miss on ADR or
// RevPAR is the conventional "real signal" threshold in revenue management;
// 5pp on occupancy is its analog. Tighter would over-trigger on routine
// fluctuations; looser would miss problems too late to fix.
const ADR_PROBLEM_THRESHOLD = 0.05;       // relative — 5% below STLY
const REVPAR_PROBLEM_THRESHOLD = 0.05;    // relative — 5% below STLY
const OCC_PROBLEM_THRESHOLD = 5;          // pp — 5 percentage points below STLY
// Revenue gap threshold — fires when TY Rental Revenue is more than 5% below STLY.
// WHY a separate rule from ADR/Occ/RevPAR: those are rate/density indicators that
// mostly explain WHY revenue is off; the revenue gap is the bottom-line outcome
// itself. A month can have small ADR/Occ misses that compound into a meaningful
// revenue gap, or have conflicting indicators where the cumulative revenue is
// the cleaner read. 5% mirrors the ADR/RevPAR convention so the rules are
// internally consistent.
const REV_PROBLEM_THRESHOLD = 0.05;       // relative — 5% below STLY

// Numeric coercion that treats null/undefined/non-numeric as missing
const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return isNaN(n) ? null : n;
};

// Pickup vs STLY rule:
//   - LY > 0 (the normal case): use the percentage thresholds above.
//   - LY ≤ 0 (last year saw cancellations net out new bookings): the percent
//     comparison breaks down (e.g., LY −$100, TY −$50 — TY is *better*, not 50% lower).
//     Fall back to a simple direction check: TY < LY = problem, TY > LY = opportunity
//     when the gap is meaningfully positive ($1k absolute), otherwise no flag.
// Returns 'problem' | 'opportunity' | null
const classifyPickup = (ty, ly) => {
  if (ty == null || ly == null) return null;
  if (ly > 0) {
    if (ty < ly * (1 - PICKUP_BEHIND_THRESHOLD)) return 'problem';
    if (ty > ly * (1 + PICKUP_AHEAD_THRESHOLD))  return 'opportunity';
    return null;
  }
  // LY ≤ 0 — direction-only fallback, with a min-gap to avoid noise on tiny values
  const ABSOLUTE_GAP = 1000;
  if (ty < ly - ABSOLUTE_GAP) return 'problem';
  if (ty > ly + ABSOLUTE_GAP) return 'opportunity';
  return null;
};

// Returns an array of flags for a given month row.
// Each flag: { id, severity: 'problem'|'opportunity', label, detail }
// "problem" = underperforming LY; "opportunity" = outperforming materially
// (worth a pricing review for yield). Flags only fire when both this-year
// and STLY values are present and non-zero where division would be needed.
const computeMonthFlags = (m) => {
  const flags = [];
  if (!m) return flags;

  const p3 = num(m.pickup3d), p3LY = num(m.pickup3dSTLY);
  const p7 = num(m.pickup7d), p7LY = num(m.pickup7dSTLY);
  const adr = num(m.rentalADR), adrLY = num(m.rentalADRSTLY);
  const occ = num(m.occupancy), occLY = num(m.occupancySTLY);
  const rp  = num(m.rentalRevPAR), rpLY = num(m.rentalRevPARSTLY);

  const fmtPctOfLY = (ty, ly) => {
    if (ly === 0) return '∞';
    return `${((ty / ly) * 100).toFixed(0)}% of LY`;
  };

  // Rule: zero-pickup regression — we used to pick up at this DBA, now we don't.
  // Fires independently for 3-day and 7-day. WHY independently: a building
  // can have legitimate $0 in one window (e.g., 3-day) while still picking up
  // at 7-day; we want a flag per affected metric so the user knows which.
  if (p3 === 0 && p3LY != null && p3LY > 0) {
    flags.push({
      id: 'pickup3d-zero',
      severity: 'problem',
      label: '3d pickup zeroed out',
      detail: `$0 this year vs STLY ${fmtSignedMoney(p3LY)}`,
    });
  }
  if (p7 === 0 && p7LY != null && p7LY > 0) {
    flags.push({
      id: 'pickup7d-zero',
      severity: 'problem',
      label: '7d pickup zeroed out',
      detail: `$0 this year vs STLY ${fmtSignedMoney(p7LY)}`,
    });
  }

  // Rule: 3-day pickup vs STLY using ±10% threshold
  // Skip if either zero-flag already fired (to avoid redundant flag for same metric)
  if (!(p3 === 0 && p3LY != null && p3LY > 0)) {
    const cls = classifyPickup(p3, p3LY);
    if (cls === 'problem') {
      flags.push({
        id: 'pickup3d-behind',
        severity: 'problem',
        label: '3d pickup behind LY',
        detail: `${fmtSignedMoney(p3)} vs STLY ${fmtSignedMoney(p3LY)} · ${fmtPctOfLY(p3, p3LY)}`,
      });
    } else if (cls === 'opportunity') {
      flags.push({
        id: 'pickup3d-ahead',
        severity: 'opportunity',
        label: '3d pickup ahead of LY',
        detail: `${fmtSignedMoney(p3)} vs STLY ${fmtSignedMoney(p3LY)} · ${fmtPctOfLY(p3, p3LY)}`,
      });
    }
  }
  // Rule: 7-day pickup vs STLY using ±10% threshold
  if (!(p7 === 0 && p7LY != null && p7LY > 0)) {
    const cls = classifyPickup(p7, p7LY);
    if (cls === 'problem') {
      flags.push({
        id: 'pickup7d-behind',
        severity: 'problem',
        label: '7d pickup behind LY',
        detail: `${fmtSignedMoney(p7)} vs STLY ${fmtSignedMoney(p7LY)} · ${fmtPctOfLY(p7, p7LY)}`,
      });
    } else if (cls === 'opportunity') {
      flags.push({
        id: 'pickup7d-ahead',
        severity: 'opportunity',
        label: '7d pickup ahead of LY',
        detail: `${fmtSignedMoney(p7)} vs STLY ${fmtSignedMoney(p7LY)} · ${fmtPctOfLY(p7, p7LY)}`,
      });
    }
  }
  // Rule — ADR vs STLY (problem only if more than 5% below)
  if (adr != null && adrLY != null && adrLY > 0 && adr < adrLY * (1 - ADR_PROBLEM_THRESHOLD)) {
    const pctBelow = ((adrLY - adr) / adrLY) * 100;
    flags.push({
      id: 'adr-low',
      severity: 'problem',
      label: 'ADR < STLY',
      detail: `$${Math.round(adr)} vs STLY $${Math.round(adrLY)} (−${pctBelow.toFixed(1)}%)`,
    });
  }
  // Rule — Occupancy vs STLY (problem only if more than 5pp below)
  if (occ != null && occLY != null && occ < occLY - OCC_PROBLEM_THRESHOLD) {
    flags.push({
      id: 'occ-low',
      severity: 'problem',
      label: 'Occupancy < STLY',
      detail: `${occ.toFixed(1)}% vs STLY ${occLY.toFixed(1)}% (${(occ - occLY).toFixed(1)}pp)`,
    });
  }
  // Rule — RevPAR vs STLY (problem only if more than 5% below)
  if (rp != null && rpLY != null && rpLY > 0 && rp < rpLY * (1 - REVPAR_PROBLEM_THRESHOLD)) {
    const pctBelow = ((rpLY - rp) / rpLY) * 100;
    flags.push({
      id: 'revpar-low',
      severity: 'problem',
      label: 'RevPAR < STLY',
      detail: `$${Math.round(rp)} vs STLY $${Math.round(rpLY)} (−${pctBelow.toFixed(1)}%)`,
    });
  }
  // Rule — Rental Revenue vs STLY (problem only if more than 5% below).
  // Uses the same 5% relative threshold as ADR / RevPAR for consistency.
  // This flag is the bottom-line companion to the rate/density rules above —
  // a revenue gap can fire when small misses on ADR + Occ compound into a real
  // dollar gap, OR when STLY had abnormal upside that we're not matching.
  const rev   = num(m.rentalRevenue);
  const revLY = num(m.rentalRevenueSTLY);
  if (rev != null && revLY != null && revLY > 0 && rev < revLY * (1 - REV_PROBLEM_THRESHOLD)) {
    const pctBelow = ((revLY - rev) / revLY) * 100;
    flags.push({
      id: 'rev-low',
      severity: 'problem',
      label: 'Revenue < STLY',
      detail: `$${Math.round(rev).toLocaleString('en-US')} vs STLY $${Math.round(revLY).toLocaleString('en-US')} (−${pctBelow.toFixed(1)}%)`,
    });
  }
  // Rule — Occupancy outpacing STLY by >10pp (opportunity)
  if (occ != null && occLY != null && occ > occLY + OCCUPANCY_OUTPACE_THRESHOLD) {
    flags.push({
      id: 'occ-high',
      severity: 'opportunity',
      label: `Occ > STLY +${OCCUPANCY_OUTPACE_THRESHOLD}pp`,
      detail: `${occ.toFixed(1)}% vs STLY ${occLY.toFixed(1)}% (+${(occ - occLY).toFixed(1)}pp)`,
    });
  }

  return flags;
};

// Weekly index thresholds — Market Penetration Index (MPI), ADR Index, RevPAR Index.
// These compare us against market data (the comp set in PriceLabs).
//   MPI > 80 → we are capturing meaningful market share (opportunity worth pricing test)
//   MPI < 40 → we are materially underperforming the market (problem)
//   ADR Index < 120 → underpriced vs market (problem)
//   RevPAR Index < 120 → yield below 120% of market (problem)
// WHY 80/40/120/120 specifically: per Liuba's rules. The 120% bar on ADR and
// RevPAR Index reflects that as a luxury portfolio we should expect to clear
// at least 20% above market parity.
const WEEK_MPI_OPPORTUNITY_THRESHOLD = 80;
const WEEK_MPI_PROBLEM_THRESHOLD = 40;
const WEEK_ADR_INDEX_THRESHOLD = 120;
const WEEK_REVPAR_INDEX_THRESHOLD = 120;

// Compute weekly flags. Reuses the standard month-level rules (pickup vs LY,
// ADR/Occ/RevPAR vs STLY (with thresholds), occupancy outpace) AND adds three competitive-index
// rules for MPI / ADR Index / RevPAR Index.
const computeWeekFlags = (w) => {
  if (!w) return [];
  // Standard rules — same shape as month-level. Pass through computeMonthFlags
  // by aliasing field names. The standard rules read: pickup3d/STLY, pickup7d/STLY,
  // rentalADR/STLY, occupancy/STLY, rentalRevPAR/STLY. Weekly data already uses
  // these exact field names (see parseWeeksReportFile), so direct reuse works.
  // Important nuance: weekly LY field names use "LY" not "STLY" suffix in the
  // PriceLabs export. The parser maps them to STLY-named fields for compatibility.
  const flags = computeMonthFlags(w);

  // Index rules
  const mpi      = num(w.mpi);
  const adrIdx   = num(w.adrIndex);
  const revparIdx = num(w.revparIndex);

  // Skip ALL index flags when all three indices read 0 — that means no
  // reservations yet for this week, not actual underperformance. The MPI=0,
  // ADR Idx=0, RevPAR Idx=0 trio is a "data not yet present" signal, not
  // a "we're failing" signal. Common for far-out weeks before bookings start.
  // Use a small epsilon (0.01) to absorb rounding noise from the export.
  const allIndicesEmpty = (
    mpi != null && Math.abs(mpi) < 0.01 &&
    adrIdx != null && Math.abs(adrIdx) < 0.01 &&
    revparIdx != null && Math.abs(revparIdx) < 0.01
  );

  if (!allIndicesEmpty) {
    if (mpi != null && mpi > WEEK_MPI_OPPORTUNITY_THRESHOLD) {
      flags.push({
        id: 'mpi-high',
        severity: 'opportunity',
        label: `MPI > ${WEEK_MPI_OPPORTUNITY_THRESHOLD}%`,
        detail: `MPI ${mpi.toFixed(1)}% — capturing meaningful market share`,
      });
    }
    if (mpi != null && mpi < WEEK_MPI_PROBLEM_THRESHOLD) {
      flags.push({
        id: 'mpi-low',
        severity: 'problem',
        label: `MPI < ${WEEK_MPI_PROBLEM_THRESHOLD}%`,
        detail: `MPI ${mpi.toFixed(1)}% — materially below market`,
      });
    }
    if (adrIdx != null && adrIdx < WEEK_ADR_INDEX_THRESHOLD) {
      flags.push({
        id: 'adr-index-low',
        severity: 'problem',
        label: `ADR Index < ${WEEK_ADR_INDEX_THRESHOLD}%`,
        detail: `ADR Index ${adrIdx.toFixed(1)}% — underpriced vs market`,
      });
    }
    if (revparIdx != null && revparIdx < WEEK_REVPAR_INDEX_THRESHOLD) {
      flags.push({
        id: 'revpar-index-low',
        severity: 'problem',
        label: `RevPAR Index < ${WEEK_REVPAR_INDEX_THRESHOLD}%`,
        detail: `RevPAR Index ${revparIdx.toFixed(1)}% — yield below 120% of market`,
      });
    }
  }
  return flags;
};

// Helper for signed money (used in flag details)
const fmtSignedMoney = (v) => {
  if (v == null) return '—';
  if (v === 0) return '$0';
  const sign = v >= 0 ? '+$' : '−$';
  return `${sign}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
};

// Format a value gap appropriate to the kind of metric the flag represents.
// WHY: chip values for occupancy flags are percentage points, not dollars —
// rendering "−$2" for an occupancy gap of −1.5pp is both wrong and confusing.
// This mapper picks the right unit based on the flag id.
const fmtFlagGap = (flagId, value) => {
  if (value == null) return '—';
  // Occupancy flags → percentage points
  if (flagId === 'occ-low' || flagId === 'occ-high') {
    if (value === 0) return '0pp';
    const sign = value > 0 ? '+' : '−';
    return `${sign}${Math.abs(value).toFixed(1)}pp`;
  }
  // ADR / RevPAR / pickup / revenue → dollars (use signed money formatter)
  return fmtSignedMoney(value);
};

const fmtFlagValue = (flagId, value) => {
  if (value == null) return '—';
  if (flagId === 'occ-low' || flagId === 'occ-high') {
    return `${value.toFixed(1)}%`;
  }
  // Money: no sign because absolute values are usually positive here
  if (value === 0) return '$0';
  return `$${Math.round(value).toLocaleString('en-US')}`;
};

// Cascade rule for portfolio-level flags across All / PH / Excl PH segments.
// When the user has uploaded today's report for ALL THREE segments, dedupe
// flags so each issue shows up at the most specific accurate level:
//   - Both PH and Excl PH flagged on same metric/month → it's portfolio-wide → keep on All only
//   - Only one of PH / Excl PH flagged → segment-specific → keep on that segment only
//   - Active segment is All but the issue isn't shared by both subs → hide on All
// WHY this matters: without dedup, the user sees the same flag echoed across all
// three sub-tabs, padding the count and making it harder to spot which segment
// actually needs intervention. The cascade collapses noise into signal.
//
// Returns the input flags array filtered. If cascade can't run (missing segment
// reports), returns the input untouched.
const cascadeFilterFlags = (flags, monthIso, activeSegment, allSegmentsData) => {
  // Cascade only runs when all three segments have a today's report
  const allReady = ['all', 'ph', 'exclPh'].every(s => allSegmentsData?.[s]?.todayReport);
  if (!allReady) return flags;

  // For each segment, build set of flag-ids active for this month
  const flagsBySeg = {};
  ['all', 'ph', 'exclPh'].forEach(s => {
    const months = allSegmentsData[s].todayReport.months || [];
    const monthRow = months.find(m => m.iso === monthIso);
    flagsBySeg[s] = new Set(monthRow ? computeMonthFlags(monthRow).map(f => f.id) : []);
  });

  return flags.filter(f => {
    const inPH    = flagsBySeg.ph.has(f.id);
    const inExclPH = flagsBySeg.exclPh.has(f.id);

    if (activeSegment === 'all') {
      // Keep on All only when BOTH sub-segments share the flag (truly portfolio-wide)
      return inPH && inExclPH;
    }
    if (activeSegment === 'ph') {
      // Keep on PH only when PH has it AND Excl PH does NOT (segment-specific to PH)
      return inPH && !inExclPH;
    }
    if (activeSegment === 'exclPh') {
      return inExclPH && !inPH;
    }
    return true;
  });
};

// Given a building-level report (with byBuilding map) + a flag + month,
// return the top N contributing buildings within the segment that the flag
// belongs to. "Contribution" is measured as the absolute revenue impact on
// the flagged metric:
//   - For pickup flags: |TY pickup − LY pickup| at this building, sorted desc
//   - For revenue/ADR/occ/RevPAR flags: |TY value − LY value| at this building
// We only consider buildings whose own metric movement is in the SAME direction
// as the segment flag (e.g. if the segment is "pickup behind LY", we only show
// buildings whose pickup is also behind LY — buildings outperforming aren't
// "contributing" to the problem; they're masking it).
//
// Map flag.id → which metric to compare on, plus the flag's own direction.
// 'down' = problem flag (TY worse than LY); 'up' = opportunity flag (TY better).
const FLAG_METRIC_MAP = {
  'pickup3d-zero':    { ty: 'pickup3d',     ly: 'pickup3dSTLY',     direction: 'down' },
  'pickup3d-behind':  { ty: 'pickup3d',     ly: 'pickup3dSTLY',     direction: 'down' },
  'pickup3d-ahead':   { ty: 'pickup3d',     ly: 'pickup3dSTLY',     direction: 'up'   },
  'pickup7d-zero':    { ty: 'pickup7d',     ly: 'pickup7dSTLY',     direction: 'down' },
  'pickup7d-behind':  { ty: 'pickup7d',     ly: 'pickup7dSTLY',     direction: 'down' },
  'pickup7d-ahead':   { ty: 'pickup7d',     ly: 'pickup7dSTLY',     direction: 'up'   },
  'adr-low':          { ty: 'rentalADR',    ly: 'rentalADRSTLY',    direction: 'down' },
  'occ-low':          { ty: 'occupancy',    ly: 'occupancySTLY',    direction: 'down' },
  'occ-high':         { ty: 'occupancy',    ly: 'occupancySTLY',    direction: 'up'   },
  'revpar-low':       { ty: 'rentalRevPAR', ly: 'rentalRevPARSTLY', direction: 'down' },
};

// Building-level contributors for a segment-scoped flag. Returns up to topN
// buildings in the SAME direction as the flag, plus up to topN in the OPPOSITE
// direction. Only buildings within the segment are considered.
//
// Returns: { sameDirection: [...], oppositeDirection: [...] }
//   sameDirection — buildings driving the flag (pulling down for problems,
//                   driving up for opportunities)
//   oppositeDirection — buildings counteracting the flag (masking the problem
//                   or dragging down the opportunity)
//
// WHY bidirectional: when investigating a flagged segment, you need to see
// both who's at fault AND who's offsetting them. Adjusting pricing on a
// building that's already outperforming would damage what's working.
const computeContributingBuildings = (buildingReport, flag, monthIso, activeSegment, topN = 0) => {
  const empty = { sameDirection: [], oppositeDirection: [] };
  if (!buildingReport?.byBuilding || !flag || !monthIso) return empty;

  const cfg = FLAG_METRIC_MAP[flag.id];
  if (!cfg) return empty;

  const candidates = [];
  Object.entries(buildingReport.byBuilding).forEach(([group, monthsArr]) => {
    // When viewing All, show all buildings; otherwise filter to active segment
    if (activeSegment !== 'all' && buildingToSegment(group) !== activeSegment) return;
    const monthRow = monthsArr.find(m => m.iso === monthIso);
    if (!monthRow) return;
    const ty = monthRow[cfg.ty];
    const ly = monthRow[cfg.ly];
    if (ty == null || ly == null) return;
    candidates.push({ group, gap: ty - ly, ty, ly });
  });

  // Bucket by direction relative to the flag
  // - Problem flag (cfg.direction === 'down'): "same direction" = gap < 0
  // - Opportunity flag (cfg.direction === 'up'):   "same direction" = gap > 0
  const flagWantsDown = cfg.direction === 'down';
  const sameDirection = candidates.filter(c => flagWantsDown ? c.gap < 0 : c.gap > 0);
  const oppositeDirection = candidates.filter(c => flagWantsDown ? c.gap > 0 : c.gap < 0);

  // Sort each by absolute gap descending — biggest movers in each direction first
  sameDirection.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  oppositeDirection.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  return {
    sameDirection: topN > 0 ? sameDirection.slice(0, topN) : sameDirection,
    oppositeDirection: topN > 0 ? oppositeDirection.slice(0, topN) : oppositeDirection,
  };
};

// Segment-level contributors for a flag on the All tab.
// Returns up to 2 segments (PH, Excl PH) that move in the same direction as
// the flag, sorted by absolute gap descending.
//
// Returns: array of { segment, gap, ty, ly }
//
// WHY only same-direction at All level: the All tab answer to "which segment
// is the cause?" — a segment moving opposite the flag isn't the cause, it's
// being averaged into the All-level number. The user is on All to figure
// out which sub-tab to drill into next.
const computeContributingSegments = (portfolioData, flag, monthIso) => {
  if (!portfolioData || !flag || !monthIso) return [];
  const cfg = FLAG_METRIC_MAP[flag.id];
  if (!cfg) return [];

  const flagWantsDown = cfg.direction === 'down';
  const candidates = [];
  ['ph', 'exclPh'].forEach(segId => {
    const segReport = portfolioData[segId]?.todayReport;
    if (!segReport?.months) return;
    const monthRow = segReport.months.find(m => m.iso === monthIso);
    if (!monthRow) return;
    const ty = monthRow[cfg.ty];
    const ly = monthRow[cfg.ly];
    if (ty == null || ly == null) return;
    const gap = ty - ly;
    // Only include segments moving the same direction as the flag
    if (flagWantsDown && gap >= 0) return;
    if (!flagWantsDown && gap <= 0) return;
    candidates.push({ segment: segId, gap, ty, ly });
  });

  candidates.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return candidates;
};

// Compute contributing weeks for a flag in a given month.
// A week "contributes" to a month if its ISO start falls in that month.
// Uses the same FLAG_METRIC_MAP direction logic — only weeks moving
// the same direction as the flag are included.
const computeContributingWeeks = (weeksReport, flag, monthIso) => {
  if (!weeksReport?.weeks || !flag || !monthIso) return [];
  const cfg = FLAG_METRIC_MAP[flag.id];
  if (!cfg) return [];

  // Weeks have the same field names as months for pickup/ADR/occ/revpar
  const flagWantsDown = cfg.direction === 'down';
  const candidates = [];

  weeksReport.weeks.forEach(w => {
    // Check if week falls in the target month
    const weekStart = isoWeekStartDate(w.y, w.w);
    const weekMonthIso = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`;
    if (weekMonthIso !== monthIso) return;

    const ty = w[cfg.ty];
    const ly = w[cfg.ly];
    if (ty == null || ly == null) return;
    const gap = Number(ty) - Number(ly);
    // Only include weeks moving the same direction as the flag
    if (flagWantsDown && gap >= 0) return;
    if (!flagWantsDown && gap <= 0) return;
    candidates.push({
      label: w.label,
      dateRange: formatWeekDateRange(w.y, w.w),
      event: w.eventsName,
      gap, ty, ly,
    });
  });

  candidates.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return candidates;
};

/* ---------- State capture (Before / After per action row) ---------- */

// Schema: states is an object keyed by rowId, each containing:
//   { before: StateCapture | null, after: StateCapture | null }
// StateCapture: {
//   id, kind: 'image' | 'csv', source, // source = filename
//   // image-only fields:
//   mediaType, dataUrl, base64, width, height,
//   // csv-only fields:
//   csvText,
//   // shared:
//   addedAt,
//   metrics: { adr, occupancy, revenue, revpar, pickup3d, pickup7d, notes } | null,
//   extractionStatus: 'pending' | 'extracting' | 'done' | 'failed',
//   extractionError: string | null,
// }
//
// METRIC DEFINITIONS (per AHLA / PriceLabs conventions):
//   ADR        = Revenue / Sold nights      (sold-only denominator)
//   Occupancy  = Sold nights / Available nights (as a percentage)
//   Revenue    = Total booked revenue for the period shown
//   RevPAR     = Revenue / Available nights (every listed night)
//   Identity:    RevPAR = ADR × Occupancy   (do not compute — extract directly)
//   3-day pickup = Revenue booked in the last 3 days (for any future stay date)
//   7-day pickup = Revenue booked in the last 7 days (same definition, longer window)

const METRIC_FIELDS = [
  { key: 'adr',        label: 'ADR',        format: 'money' },
  { key: 'occupancy',  label: 'Occupancy',  format: 'percent' },
  { key: 'revenue',    label: 'Revenue',    format: 'money' },
  { key: 'revpar',     label: 'RevPAR',     format: 'money' },
  { key: 'pickup3d',   label: '3d Pickup',  format: 'money' },
  { key: 'pickup7d',   label: '7d Pickup',  format: 'money' },
];

const formatMetric = (val, fmt) => {
  if (val === null || val === undefined || val === '') return '—';
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,%\s]/g, ''));
  if (isNaN(n)) return String(val);
  if (fmt === 'money') return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (fmt === 'percent') {
    // If the source gave us a fraction (0-1), convert; otherwise treat as already a percent
    const pct = n <= 1 && n > 0 ? n * 100 : n;
    return `${pct.toFixed(1)}%`;
  }
  return String(val);
};

const loadStates = async () => {
  try {
    const result = await window.storage.get(STATES_KEY);
    if (result && result.value) {
      const parsed = JSON.parse(result.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) { /* not set yet */ }
  return {};
};

const saveStates = async (states) => {
  try {
    await window.storage.set(STATES_KEY, JSON.stringify(states));
    return true;
  } catch (e) {
    console.error('State save failed:', e);
    return false;
  }
};

// Read a CSV file's text content (size-bounded to avoid blowing storage).
const MAX_CSV_BYTES = 256 * 1024; // 256KB — generous for PriceLabs exports
const readCSVFile = (file) => new Promise((resolve, reject) => {
  if (file.size > MAX_CSV_BYTES) {
    reject(new Error(`CSV too large (${Math.round(file.size / 1024)}KB max ${Math.round(MAX_CSV_BYTES / 1024)}KB)`));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read CSV'));
  reader.onload = () => resolve(reader.result);
  reader.readAsText(file);
});

const newStateCapture = (kind, payload) => ({
  id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  kind, // 'image' | 'csv'
  source: payload.source,
  ...payload,
  addedAt: new Date().toISOString(),
  metrics: null,
  extractionStatus: 'pending',
  extractionError: null,
});

// Call Claude API to extract metrics from a state capture.
// Returns { metrics: {...} } or throws.
const extractMetricsFromCapture = async (capture) => {
  const promptText = `You are extracting performance metrics from a PriceLabs/Guesty STR dashboard ${capture.kind === 'image' ? 'screenshot' : 'CSV export'}.

Extract these six metrics, returning ONLY valid JSON (no markdown fences, no preamble):

{
  "adr": <number or null>,
  "occupancy": <number 0-100 or null>,
  "revenue": <number or null>,
  "revpar": <number or null>,
  "pickup3d": <number or null>,
  "pickup7d": <number or null>,
  "notes": "<short note about the period covered, currency, or anything ambiguous>"
}

Rules:
- ADR = Revenue per sold night (in dollars, no $ sign in the number)
- Occupancy = percentage 0-100 (e.g. 67.5, NOT 0.675)
- Revenue = total booked revenue (in dollars)
- RevPAR = Revenue per available night (in dollars). Extract directly if labeled; do NOT compute from ADR × Occupancy unless the dashboard explicitly shows the result.
- Pickup metrics = revenue booked in the last 3 / 7 days for any future stay. If labeled differently (e.g., "next 3 days"), capture the value but mention the difference in notes.
- If a metric is not visible or unclear, return null for that field.
- "notes" should be ≤120 chars: mention the period covered ("Last 30d", "MTD"), currency if not USD, or any caveat. Empty string if nothing notable.

${capture.kind === 'csv' ? `\nCSV CONTENTS:\n${capture.csvText.slice(0, 8000)}` : ''}`;

  const userContent = capture.kind === 'image'
    ? [
        { type: 'image', source: { type: 'base64', media_type: capture.mediaType, data: capture.base64 } },
        { type: 'text', text: promptText },
      ]
    : promptText;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API ${response.status}: ${errText.slice(0, 150)}`);
  }
  const data = await response.json();
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  // Strip ```json fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Could not parse AI response as JSON: ${cleaned.slice(0, 100)}`);
  }
  return parsed;
};

/* ---------- Date helpers ---------- */

const todayMDY = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

const sortKeyForDate = (mdy) => {
  // Convert "MM/DD/YYYY" to "YYYYMMDD" for sorting; non-matches sort last
  const m = String(mdy || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '99999999';
  return `${m[3]}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}`;
};

// Parse "MM/DD/YYYY" -> Date object at local midnight (or null)
const parseMDY = (mdy) => {
  const m = String(mdy || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
  return isNaN(d) ? null : d;
};

// Format Date -> "MM/DD/YYYY"
const formatMDY = (d) => {
  if (!d || isNaN(d)) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

// Add N days to a Date
const addDays = (d, n) => {
  if (!d) return null;
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

// Whole-day diff between two Dates (b - a), local time
const dayDiff = (a, b) => {
  if (!a || !b) return null;
  const ms = b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

// Build the countdown badge for a row.
// Returns { text, tone } where tone drives styling:
//   'overdue'  — past due
//   'today'    — due today
//   'soon'     — 1–2 days
//   'upcoming' — 3+ days
//   null       — no valid date
const checkBackStatus = (row) => {
  if (row.checkDone) return { text: 'Done', tone: 'done' };
  const baseDate = parseMDY(row.date);
  if (!baseDate) return null;
  const due = addDays(baseDate, 3);
  const today = new Date();
  const diff = dayDiff(new Date(today), new Date(due));
  if (diff < 0) return { text: `Overdue ${Math.abs(diff)}d`, tone: 'overdue', dueStr: formatMDY(due) };
  if (diff === 0) return { text: 'Due today', tone: 'today', dueStr: formatMDY(due) };
  if (diff <= 2) return { text: `In ${diff}d`, tone: 'soon', dueStr: formatMDY(due) };
  return { text: `In ${diff}d`, tone: 'upcoming', dueStr: formatMDY(due) };
};

const toneStyles = {
  overdue:  { bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
  today:    { bg: '#FEF3C7', fg: '#854D0E', dot: '#D97706' },
  soon:     { bg: '#FEF9C3', fg: '#713F12', dot: '#CA8A04' },
  upcoming: { bg: '#ECFDF5', fg: '#065F46', dot: '#059669' },
  done:     { bg: '#F1F5F9', fg: '#475569', dot: '#94A3B8' },
};

/* ---------- CSV helpers ---------- */

const escapeCSV = (val) => {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const buildCSV = (rows) => {
  const header = [...COLUMNS.map(c => c.label), 'Check-Back Date', 'Done'].join(',');
  const lines = rows.map(r => {
    const status = checkBackStatus(r);
    const dueStr = status?.dueStr || '';
    const doneStr = r.checkDone ? 'Yes' : '';
    return [...COLUMNS.map(c => escapeCSV(r[c.key])), escapeCSV(dueStr), escapeCSV(doneStr)].join(',');
  });
  return [header, ...lines].join('\n');
};

const buildTSV = (rows) => {
  // Tab-separated for clean paste into Excel/Sheets (preserves multi-line cells)
  const escapeTSV = (val) => {
    const s = String(val ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' / ');
    return s;
  };
  const header = [...COLUMNS.map(c => c.label), 'Check-Back Date', 'Done'].join('\t');
  const lines = rows.map(r => {
    const status = checkBackStatus(r);
    const dueStr = status?.dueStr || '';
    const doneStr = r.checkDone ? 'Yes' : '';
    return [...COLUMNS.map(c => escapeTSV(r[c.key])), escapeTSV(dueStr), escapeTSV(doneStr)].join('\t');
  });
  return [header, ...lines].join('\n');
};

const downloadCSV = (rows) => {
  const csv = buildCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `action_log_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Robust clipboard copy. The modern navigator.clipboard.writeText API requires
// (a) a secure context and (b) a focused document — both can fail inside the
// sandboxed iframe that Claude artifacts run in. We try the modern API first
// and fall back to the legacy execCommand('copy') with a hidden textarea,
// which works in nearly all iframe contexts. Returns true on success.
// Copy rich HTML + plain text fallback to clipboard
const copyHtml = async (html, plainText) => {
  try {
    if (navigator.clipboard && window.isSecureContext && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch (e) {
    console.warn('Rich copy failed, falling back to plain text:', e);
  }
  // Fallback: copy plain text
  return copyText(plainText);
};

// Build an HTML table from action log rows
const buildHTMLTable = (rows) => {
  const cols = [...COLUMNS, { key: '_checkBack', label: 'Check-Back' }, { key: '_done', label: 'Done' }];
  const th = cols.map(c => `<th style="border:1px solid #d4d4d4;padding:4px 8px;background:#f5f5f4;font-size:11px;text-align:left;white-space:nowrap">${c.label}</th>`).join('');
  const trs = rows.map((r, i) => {
    const status = checkBackStatus(r);
    const bg = i % 2 === 1 ? '#fafaf9' : '#fff';
    const cells = COLUMNS.map(c => {
      const v = String(r[c.key] ?? '').replace(/</g, '&lt;');
      return `<td style="border:1px solid #e7e5e4;padding:3px 8px;font-size:11px;vertical-align:top">${v}</td>`;
    });
    cells.push(`<td style="border:1px solid #e7e5e4;padding:3px 8px;font-size:11px">${status?.dueStr || ''}</td>`);
    cells.push(`<td style="border:1px solid #e7e5e4;padding:3px 8px;font-size:11px">${r.checkDone ? 'Yes' : ''}</td>`);
    return `<tr style="background:${bg}">${cells.join('')}</tr>`;
  }).join('');
  return `<table style="border-collapse:collapse;font-family:ui-monospace,monospace"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
};

const copyText = async (text) => {
  // Try modern API first
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fall through to legacy method
  }
  // Legacy fallback: hidden textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Make it invisible but selectable
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '2em';
    ta.style.height = '2em';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error('Clipboard fallback failed:', e);
    return false;
  }
};

// Robust rich-content clipboard write. Tries to copy BOTH an HTML representation
// and a plain-text fallback in a single clipboard operation. Surfaces that paste
// rich content (ClickUp Docs / chat, Notion, Google Docs, Gmail, Slack rich
// compose) get the HTML; surfaces that paste plain text (terminal, plain notes)
// get the text fallback. Falls back to plain-only if the rich API is blocked.
//
// WHY this matters for ClickUp specifically: ClickUp's chat/comment fields don't
// auto-convert markdown — they render the markdown source verbatim. But they DO
// honor pasted HTML tables, because that's a standard rich-text paste action.
// Returns true on success.
const copyRich = async (html, plainText) => {
  // Try modern rich clipboard API
  try {
    if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (e) {
    // Fall through to legacy method
  }
  // Legacy fallback: select an HTML-rendered hidden div and execCommand('copy').
  // Browsers preserve the rendered HTML on copy, so this still produces a rich-
  // content paste in most surfaces.
  try {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.innerHTML = html;
    div.style.position = 'fixed';
    div.style.top = '0';
    div.style.left = '0';
    div.style.opacity = '0';
    div.style.pointerEvents = 'none';
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    document.body.removeChild(div);
    if (ok) return true;
  } catch (e) {
    // Fall through to plain-text only
  }
  // Last resort — copy the plain text version
  return copyText(plainText);
};

// Build a compact, copy-friendly plain-text table of the action log.
// Used when copying the AI report so the underlying log travels with it.
// Only includes the columns most useful in a stakeholder summary — not every
// field — to keep the email/Slack paste readable.
const buildLogTextTable = (rows) => {
  if (!rows || rows.length === 0) return 'ACTION LOG\n(No actions in this range.)';

  // Compact one-line-per-row format. A real ASCII table with dashes works in
  // monospace-rendered surfaces (Slack code blocks, plain emails) but breaks in
  // proportional-font surfaces. The dashed separator + labeled fields format
  // reads well in both.
  const lines = ['ACTION LOG', '─'.repeat(60)];
  rows.forEach((r, i) => {
    const change = (r.valueBefore || r.valueAfter)
      ? `${r.valueBefore || '?'} → ${r.valueAfter || '?'}`
      : '';
    const checkBack = r.checkDone ? ' [done]' : '';
    lines.push(`${i + 1}. ${r.date} · ${r.owner || '—'}${checkBack}`);
    if (r.action)        lines.push(`   Action: ${r.action.replace(/\n/g, ' ')}`);
    if (r.affectedGroup) lines.push(`   Group:  ${r.affectedGroup}`);
    if (r.affectedDates) lines.push(`   Dates:  ${r.affectedDates}`);
    if (change)          lines.push(`   Change: ${change}`);
    if (r.reason)        lines.push(`   Reason: ${r.reason.replace(/\n/g, ' ')}`);
    if (r.notes)         lines.push(`   Notes:  ${r.notes.replace(/\n/g, ' ')}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
};

/* ---------- Row factory ---------- */

const newRow = () => ({
  id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  date: todayMDY(),
  owner: 'Liuba',
  reason: '',
  affectedGroup: '',
  affectedDates: '',
  action: '',
  valueBefore: '',
  valueAfter: '',
  notes: '',
  checkDone: false,
});

const newNote = () => ({
  id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  date: todayMDY(),
  text: '',
});

// Filter rows whose date falls in the inclusive range [from, to] (both MM/DD/YYYY)
const inRange = (mdy, from, to) => {
  const d = parseMDY(mdy);
  if (!d) return false;
  const f = parseMDY(from);
  const t = parseMDY(to);
  if (f && d < f) return false;
  if (t && d > t) return false;
  return true;
};

/* ---------- Components ---------- */

function Cell({ value, onChange, type, placeholder, width }) {
  const ref = useRef(null);

  // Auto-resize textareas to fit content
  useEffect(() => {
    if (type === 'textarea' && ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + 'px';
    }
  }, [value, type]);

  const baseClass = "w-full px-2.5 py-1.5 text-[13px] bg-transparent border-0 focus:outline-none focus:bg-emerald-50/40 focus:ring-1 focus:ring-emerald-600/40 placeholder-stone-300 text-stone-800 resize-none";

  if (type === 'textarea') {
    return (
      <textarea
        ref={ref}
        className={baseClass}
        style={{ minHeight: '32px', fontFamily: 'inherit', lineHeight: '1.4' }}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
      />
    );
  }

  return (
    <input
      type="text"
      className={baseClass}
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------- Funnel View ---------- */

function LevelDiagramCard({ level, status, onClick, isOpen }) {
  const isPrimary = level.color === 'emerald-deep';
  // Primary (top 3) get filled emerald headers per the screenshot;
  // secondary (Building/Listing) get navy with lighter body
  const statusObj = status ? FUNNEL_STATUSES.find(s => s.value === status) : null;
  return (
    <button
      onClick={onClick}
      className={`relative text-left transition-all ${isOpen ? 'ring-2 ring-stone-900 ring-offset-2' : ''} group w-full`}
    >
      <div
        className={`px-4 py-3 rounded-sm border transition-colors ${
          isPrimary
            ? 'bg-emerald-50/70 border-emerald-700/40 hover:bg-emerald-50'
            : 'bg-stone-50 border-stone-300 hover:bg-stone-100'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold ${
              isPrimary ? 'bg-emerald-800 text-white' : 'bg-stone-700 text-white'
            }`}
          >
            {level.num}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-[14px] font-semibold ${isPrimary ? 'text-emerald-900' : 'text-stone-900'}`}>
              {level.title}
            </div>
            <div className={`text-[10px] mt-0.5 leading-snug ${isPrimary ? 'text-emerald-800/80' : 'text-stone-600'}`}>
              {level.subtitle}
            </div>
          </div>
        </div>
        {/* Status badge */}
        {statusObj && (
          <div
            className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-sm"
            style={{ background: statusObj.bg, color: statusObj.fg }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusObj.dot }} />
            {statusObj.label}
          </div>
        )}
      </div>
    </button>
  );
}

/* ---------- Portfolio Report Panel (3 segments × upload + parsed display) ---------- */

function ReportUploadSlot({ label, kind, report, onUpload, onClear, isReadOnly, accent }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);

  const handle = async (file) => {
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseReportFile(buf, file.name);
      onUpload(kind, parsed);
    } catch (e) {
      setError(e.message || 'Could not parse report');
      setTimeout(() => setError(null), 5000);
    }
    setParsing(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) handle(e.dataTransfer.files[0]);
  };

  const accentClass = accent === 'today'
    ? 'border-emerald-300 bg-emerald-50/30'
    : 'border-stone-300 bg-stone-50/40';
  const accentDot = accent === 'today' ? 'bg-emerald-700' : 'bg-stone-500';

  return (
    <div
      onDragOver={(e) => { if (!isReadOnly) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={!isReadOnly ? handleDrop : undefined}
      className={`border rounded-sm p-3 transition-colors ${accentClass} ${dragOver ? 'ring-2 ring-emerald-500' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${accentDot}`} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-stone-600 font-semibold">{label}</span>
        </div>
        {report && !isReadOnly && (
          <button
            onClick={() => onClear(kind)}
            className="text-[10px] text-stone-400 hover:text-rose-700 transition-colors"
            title="Remove report"
          >
            Clear
          </button>
        )}
      </div>

      {!report ? (
        <button
          onClick={() => !isReadOnly && inputRef.current?.click()}
          disabled={isReadOnly || parsing}
          className="w-full px-3 py-3 text-[11px] border border-dashed border-stone-400 hover:border-stone-700 hover:bg-white text-stone-600 hover:text-stone-900 rounded-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {parsing ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing…</>
          ) : (
            <><Upload className="w-3.5 h-3.5" /> Drop xlsx or click to upload</>
          )}
        </button>
      ) : (
        <div className="bg-white border border-stone-200 rounded-sm px-3 py-2">
          <div className="flex items-center gap-2 text-[11px]">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="font-medium text-stone-900 truncate flex-1" title={report.fileName}>
              {report.fileName}
            </span>
          </div>
          <div className="text-[10px] mono text-stone-400 mt-1">
            {report.months.length} months · uploaded {new Date(report.uploadedAt).toLocaleString()}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 px-2 py-1.5 bg-rose-50 border border-rose-200 rounded-sm text-[10px] text-rose-900 flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }}
      />
    </div>
  );
}

/* ---------- Simple Report Panel (non-portfolio levels) ---------- */
// One upload slot, no segments, no cascade. Used by Building / Season / Listing.
// WHY a separate, slimmer component: those levels are scoped manually (you
// filter PriceLabs to a specific building, then export). They don't need three
// sub-tabs or cross-segment dedup logic — that's portfolio-level only.

/* ---------- Reusable flag detail row ----------
   Renders one flag (problem or opportunity) inside a flag card, plus
   optional contribution chips below it. Three contribution shapes are supported:

   1. NO contribs (contribs === null or undefined) → just the flag row.
   2. BUILDING contribs (contribs is { sameDirection, oppositeDirection }) →
      shown on PH/Excl PH segments. Two chip rows: same-direction (color-matched
      to flag severity) AND opposite-direction (inverted color, labeled as
      counteracting). This bidirectional view tells the user both who's at
      fault AND who's offsetting them, so they don't apply the wrong fix.
   3. SEGMENT contribs (contribs is { segments: [...] }) → shown on the All
      segment. Single chip row of segments moving in the same direction as
      the flag, with the most-impactful segment first.
*/
const FlagDetailRow = ({ flag, contribs, direction, onSnooze, onRemove, onRestore, dismissedStatus }) => {
  const isOpp = direction === 'up';
  const Icon = isOpp ? Sparkles : Flag;
  const sameColor = isOpp
    ? { bg: 'bg-amber-50', border: 'border-amber-200', fg: 'text-amber-900' }
    : { bg: 'bg-rose-50',  border: 'border-rose-200',  fg: 'text-rose-900'  };
  const oppositeColor = isOpp
    ? { bg: 'bg-rose-50',   border: 'border-rose-200',  fg: 'text-rose-900'  }
    : { bg: 'bg-emerald-50', border: 'border-emerald-200', fg: 'text-emerald-900' };
  const iconBg = isOpp ? 'bg-amber-600' : 'bg-rose-600';

  // Decide which contribution shape we're rendering
  const isBidirectional = contribs && (Array.isArray(contribs.sameDirection) || Array.isArray(contribs.oppositeDirection));
  const isSegmentList = contribs && Array.isArray(contribs.segments);

  // Labels adapt to flag direction so they read naturally in either case
  const sameLabel = isOpp ? 'Buildings driving up:' : 'Buildings pulling down:';
  const oppositeLabel = isOpp ? 'Buildings dragging down:' : 'Buildings pulling up:';

  const segmentDisplayName = (id) =>
    id === 'ph' ? 'PH' : id === 'exclPh' ? 'Excl PH' : id === 'all' ? 'All' : id;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2 text-[11px] group/flag">
        <span className={`inline-flex items-center justify-center w-4 h-4 ${iconBg} text-white rounded-sm shrink-0`}>
          <Icon className="w-2.5 h-2.5" />
        </span>
        <span className={`font-medium w-32 shrink-0 ${dismissedStatus ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{flag.label}</span>
        <span className={`mono ${dismissedStatus ? 'text-stone-400' : 'text-stone-600'}`}>{flag.detail}</span>
        {dismissedStatus ? (
          onRestore && (
            <button
              onClick={() => onRestore(flag.id)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-sm transition-colors"
              title="Restore this flag"
            >
              <Undo2 className="w-2.5 h-2.5" /> Restore
            </button>
          )
        ) : (
          <span className="inline-flex items-center gap-1 opacity-0 group-hover/flag:opacity-100 transition-opacity">
            {onSnooze && (
              <button
                onClick={() => onSnooze(flag.id)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium text-stone-400 hover:text-amber-700 hover:bg-amber-50 rounded-sm transition-colors"
                title="Snooze this flag for 24 hours"
              >
                <Clock className="w-2.5 h-2.5" /> Snooze
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(flag.id)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded-sm transition-colors"
                title="Remove this flag from the active list"
              >
                <EyeOff className="w-2.5 h-2.5" /> Remove
              </button>
            )}
          </span>
        )}
      </div>

      {/* Bidirectional building chips (PH / Excl PH segments) */}
      {isBidirectional && contribs.sameDirection.length > 0 && (
        <div className="flex items-center gap-1 ml-6 flex-wrap text-[10px]">
          <span className="text-stone-400 italic">{sameLabel}</span>
          {contribs.sameDirection.map(c => (
            <span
              key={`same-${c.group}`}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 ${sameColor.bg} border ${sameColor.border} ${sameColor.fg} rounded-sm mono font-medium`}
              title={`${c.group} · TY ${fmtFlagValue(flag.id, c.ty)} vs STLY ${fmtFlagValue(flag.id, c.ly)} · gap ${fmtFlagGap(flag.id, c.gap)}`}
            >
              {c.group} ({fmtFlagGap(flag.id, c.gap)})
            </span>
          ))}
        </div>
      )}
      {isBidirectional && contribs.oppositeDirection.length > 0 && (
        <div className="flex items-center gap-1 ml-6 flex-wrap text-[10px]">
          <span className="text-stone-400 italic">{oppositeLabel}</span>
          {contribs.oppositeDirection.map(c => (
            <span
              key={`opp-${c.group}`}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 ${oppositeColor.bg} border ${oppositeColor.border} ${oppositeColor.fg} rounded-sm mono font-medium`}
              title={`${c.group} · TY ${fmtFlagValue(flag.id, c.ty)} vs STLY ${fmtFlagValue(flag.id, c.ly)} · gap ${fmtFlagGap(flag.id, c.gap)}`}
            >
              {c.group} ({fmtFlagGap(flag.id, c.gap)})
            </span>
          ))}
        </div>
      )}

      {/* Segment chips (All segment) */}
      {isSegmentList && contribs.segments.length > 0 && (
        <div className="flex items-center gap-1 ml-6 flex-wrap text-[10px]">
          <span className="text-stone-400 italic">{isOpp ? 'Segments driving up:' : 'Segments pulling down:'}</span>
          {contribs.segments.map(c => (
            <span
              key={`seg-${c.segment}`}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 ${sameColor.bg} border ${sameColor.border} ${sameColor.fg} rounded-sm mono font-medium`}
              title={`${segmentDisplayName(c.segment)} · TY ${fmtFlagValue(flag.id, c.ty)} vs STLY ${fmtFlagValue(flag.id, c.ly)} · gap ${fmtFlagGap(flag.id, c.gap)}`}
            >
              {segmentDisplayName(c.segment)} ({fmtFlagGap(flag.id, c.gap)})
            </span>
          ))}
        </div>
      )}
      {/* Diagnostic: if segment list was requested but came back empty,
          show a faint hint so we can tell "feature on, no data" apart from
          "feature not running". Helps debug the not-uncommon edge case
          where a segment's metric is null on a flagged month. */}
      {isSegmentList && contribs.segments.length === 0 && (
        <div className="flex items-center gap-1 ml-6 flex-wrap text-[10px]">
          <span className="text-stone-400 italic">No segment breakdown — sub-segments don't have data for this metric/month.</span>
        </div>
      )}
    </div>
  );
};

// Collapsible list of snoozed and removed flags shown below the active flags panel
const DismissedFlagsList = ({ dismissedFlagsList, segment, onRestore, buildingReport }) => {
  const [open, setOpen] = useState(false);
  const snoozed = dismissedFlagsList.filter(d => d.status === 'snoozed');
  const removed = dismissedFlagsList.filter(d => d.status === 'removed');

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        {snoozed.length > 0 && <span>{snoozed.length} snoozed</span>}
        {snoozed.length > 0 && removed.length > 0 && <span>·</span>}
        {removed.length > 0 && <span>{removed.length} removed</span>}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {snoozed.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-[0.15em] text-amber-600 font-semibold mb-1 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Snoozed (24h)
              </div>
              <div className="space-y-1 pl-1 border-l-2 border-amber-200">
                {snoozed.map(({ month, flag }) => (
                  <div key={`${month.iso}-${flag.id}`} className="flex items-baseline gap-2 text-[10px] text-stone-400 px-2 py-0.5">
                    <span className="text-stone-500 font-medium w-20 shrink-0">{month.label}</span>
                    <FlagDetailRow
                      flag={flag}
                      contribs={buildingReport ? computeContributingBuildings(buildingReport, flag, month.iso, segment) : null}
                      direction={flag.severity === 'opportunity' ? 'up' : 'down'}
                      onRestore={(fid) => onRestore(month.iso, fid)}
                      dismissedStatus="snoozed"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {removed.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-[0.15em] text-stone-400 font-semibold mb-1 flex items-center gap-1">
                <EyeOff className="w-2.5 h-2.5" /> Removed
              </div>
              <div className="space-y-1 pl-1 border-l-2 border-stone-200">
                {removed.map(({ month, flag }) => (
                  <div key={`${month.iso}-${flag.id}`} className="flex items-baseline gap-2 text-[10px] text-stone-400 px-2 py-0.5">
                    <span className="text-stone-500 font-medium w-20 shrink-0">{month.label}</span>
                    <FlagDetailRow
                      flag={flag}
                      contribs={buildingReport ? computeContributingBuildings(buildingReport, flag, month.iso, segment) : null}
                      direction={flag.severity === 'opportunity' ? 'up' : 'down'}
                      onRestore={(fid) => onRestore(month.iso, fid)}
                      dismissedStatus="removed"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function SimpleReportPanel({ levelLabel, levelHint, todayReport, priorReport, priorDate, onUpload, onClear, isReadOnly, selectedISO, onInvestigate, segmentLabel, syncSegment, dismissedFlags, setDismissedFlags, listingReport }) {
  const inputRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(null);

  const handle = async (file) => {
    if (!file) return;
    setUploadError(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseReportFile(buf, file.name);
      onUpload(parsed);
    } catch (e) {
      // 15s timeout (was 5s) — parsing errors often have actionable details
      // (missing column names, etc.) that the user needs time to read.
      setUploadError(e.message || 'Could not parse report');
      setTimeout(() => setUploadError(null), 15000);
    }
    setParsing(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handle(e.dataTransfer.files[0]);
  };

  // 1-day pickup is only meaningful when the prior report is from exactly
  // yesterday — otherwise the diff captures multiple days of revenue change
  // and labeling it "1-day" would mislead.
  const priorIsYesterday = !!priorReport && isExactlyYesterday(selectedISO, priorDate);
  const pickup1d = computeOneDayPickup(todayReport, priorReport, selectedISO, priorDate);
  const havePriorForDiff = !!priorReport;
  const reportForDisplay = todayReport || priorReport;
  const allMonths = reportForDisplay?.months || [];
  const isShowingPriorOnly = !todayReport && !!priorReport;
  // Past-month toggle: default OFF (hide past months). They have DBA = 0 and
  // can't be acted upon. Toggle on for reconciliation purposes.
  const [showPastMonths, setShowPastMonths] = useState(false);
  const months = showPastMonths
    ? allMonths
    : allMonths.filter(m => daysToEndOfMonth(m.y, m.m) > 0);
  const pastMonthCount = allMonths.length - months.length;

  // Multi-building mode: when the report has byBuilding data, render per-building
  // rows instead of aggregate. Each row = (building, month) pair.
  // Sorted: by month first, then by group name (alphabetical) within each month
  // — natural reading order for a revenue manager scanning a single report.
  const byBuilding = reportForDisplay?.byBuilding || null;
  const isMultiBuilding = !!byBuilding && Object.keys(byBuilding).length > 0;
  const buildingPickup1d = isMultiBuilding ? computeOneDayPickupByBuilding(todayReport, priorReport, selectedISO, priorDate) : {};

  // Flatten byBuilding into rows for rendering, applying the past-month filter
  const buildingRows = useMemo(() => {
    if (!isMultiBuilding) return [];
    const rows = [];
    Object.entries(byBuilding).forEach(([group, monthsArr]) => {
      monthsArr.forEach(m => {
        const dba = daysToEndOfMonth(m.y, m.m);
        if (!showPastMonths && dba === 0) return;
        rows.push({ group, month: m, dba });
      });
    });
    rows.sort((a, b) => {
      if (a.month.iso !== b.month.iso) return a.month.iso.localeCompare(b.month.iso);
      return a.group.localeCompare(b.group, undefined, { numeric: true });
    });
    return rows;
  }, [byBuilding, isMultiBuilding, showPastMonths]);

  const totals = months.reduce((acc, m) => {
    acc.rentalRevenue += (revenueValue(m) || 0);
    acc.pickup3d     += (m.pickup3d || 0);
    acc.pickup7d     += (m.pickup7d || 0);
    if (havePriorForDiff && pickup1d[m.iso] != null) acc.pickup1d += pickup1d[m.iso];
    acc.goal         += (m.goal || 0);
    return acc;
  }, { rentalRevenue: 0, pickup3d: 0, pickup7d: 0, pickup1d: 0, goal: 0 });

  // Dismiss helpers scoped to this panel's segment label
  const dismissSegment = segmentLabel || levelLabel || 'simple';
  const handleSnoozeSimple = useCallback((monthIso, flagId) => {
    setDismissedFlags?.(prev => {
      const key = dismissedFlagKey(dismissSegment, monthIso, flagId);
      return { ...prev, snoozed: { ...prev.snoozed, [key]: { at: new Date().toISOString() } } };
    });
  }, [dismissSegment, setDismissedFlags]);

  const handleRemoveSimple = useCallback((monthIso, flagId) => {
    setDismissedFlags?.(prev => {
      const key = dismissedFlagKey(dismissSegment, monthIso, flagId);
      return { ...prev, removed: { ...prev.removed, [key]: { at: new Date().toISOString() } } };
    });
  }, [dismissSegment, setDismissedFlags]);

  const handleRestoreSimple = useCallback((monthIso, flagId) => {
    setDismissedFlags?.(prev => {
      const key = dismissedFlagKey(dismissSegment, monthIso, flagId);
      const { [key]: _s, ...snoozed } = prev.snoozed || {};
      const { [key]: _r, ...removed } = prev.removed || {};
      return { snoozed, removed };
    });
  }, [dismissSegment, setDismissedFlags]);

  const allFlaggedMonths = months
    .map(m => {
      const dba = daysToEndOfMonth(m.y, m.m);
      if (dba === 0) return null;
      const flags = computeMonthFlags(m);
      if (flags.length === 0) return null;
      return { month: m, dba, flags };
    })
    .filter(Boolean);

  const flaggedMonths = dismissedFlags
    ? allFlaggedMonths
        .map(entry => {
          const active = entry.flags.filter(f => !isFlagDismissed(dismissedFlags, dismissSegment, entry.month.iso, f.id));
          if (active.length === 0) return null;
          return { ...entry, flags: active };
        })
        .filter(Boolean)
    : allFlaggedMonths;

  const dismissedFlagsList = dismissedFlags
    ? allFlaggedMonths.flatMap(entry =>
        entry.flags
          .map(f => {
            const status = isFlagDismissed(dismissedFlags, dismissSegment, entry.month.iso, f.id);
            if (!status) return null;
            return { month: entry.month, dba: entry.dba, flag: f, status };
          })
          .filter(Boolean)
      )
    : [];

  const flagSummary = flaggedMonths.reduce((acc, entry) => {
    entry.flags.forEach(f => {
      if (f.severity === 'opportunity') acc.opportunities++;
      else acc.problems++;
    });
    acc.flaggedMonths++;
    return acc;
  }, { problems: 0, opportunities: 0, flaggedMonths: 0 });

  const fmtMoney = (v) => v == null || v === '' ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const fmtPct = (v) => v == null || v === '' ? '—' : `${Number(v).toFixed(1)}%`;
  const fmtPickup1d = (v) => {
    if (v == null) return null;
    if (v === 0) return '$0';
    const sign = v > 0 ? '+' : '−';
    return `${sign}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  };

  const priorDateLabel = (() => {
    if (!priorDate) return null;
    const today = new Date(selectedISO + 'T00:00:00');
    const prior = new Date(priorDate + 'T00:00:00');
    const diffDays = Math.round((today - prior) / (1000 * 60 * 60 * 24));
    const dateLabel = isoToMDY(priorDate);
    if (diffDays === 1) return `${dateLabel} (yesterday)`;
    return `${dateLabel} (${diffDays} days ago)`;
  })();

  return (
    <div className="border border-stone-300 rounded-sm bg-white">
      {/* Upload section */}
      <div className="p-4 border-b border-stone-200 bg-stone-50/40">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">
            {levelLabel} report
          </div>
          {!todayReport && !isReadOnly && syncSegment && (
            <SyncReportButton segment={syncSegment} onReportLoaded={(parsed) => onUpload(parsed)} />
          )}
        </div>
        {levelHint && <div className="text-[10px] text-stone-500 mb-2 italic">{levelHint}</div>}

        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={!isReadOnly ? handleDrop : undefined}
          className="border border-emerald-300 bg-emerald-50/30 rounded-sm p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-700" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-stone-600 font-semibold">
                Today ({isoToMDY(selectedISO)})
              </span>
            </div>
            {todayReport && !isReadOnly && (
              <button
                onClick={onClear}
                className="text-[10px] text-stone-400 hover:text-rose-700 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {!todayReport ? (
            <button
              onClick={() => !isReadOnly && inputRef.current?.click()}
              disabled={isReadOnly || parsing}
              className="w-full px-3 py-3 text-[11px] border border-dashed border-stone-400 hover:border-stone-700 hover:bg-white text-stone-600 hover:text-stone-900 rounded-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {parsing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing…</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Drop xlsx or click to upload</>
              )}
            </button>
          ) : (
            <div className="bg-white border border-stone-200 rounded-sm px-3 py-2">
              <div className="flex items-center gap-2 text-[11px]">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="font-medium text-stone-900 truncate flex-1" title={todayReport.fileName}>
                  {todayReport.fileName}
                </span>
              </div>
              <div className="text-[10px] mono text-stone-400 mt-1">
                {todayReport.months.length} months · uploaded {new Date(todayReport.uploadedAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px] flex-wrap">
          <span className="text-stone-500">Comparing against:</span>
          {priorReport ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-sm text-emerald-900">
              <FileSpreadsheet className="w-3 h-3" />
              <span className="mono">{priorDateLabel}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-stone-100 border border-stone-200 rounded-sm text-stone-600">
              <AlertCircle className="w-3 h-3" />
              <span>No prior report — 1-day pickup unavailable</span>
            </span>
          )}
          {todayReport && priorReport && (() => {
            const todaySchema = reportRevenueSchema(todayReport);
            const priorSchema = reportRevenueSchema(priorReport);
            if (todaySchema && priorSchema && todaySchema !== priorSchema) {
              return (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-sm text-amber-900"
                  title="The prior report uses Total Revenue while today's uses Rental Revenue (or vice versa). 1-day pickup is disabled to avoid garbage values. Re-upload the prior file to fix."
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Schema mismatch — 1-day pickup disabled</span>
                </span>
              );
            }
            // Prior exists but isn't yesterday — 1-day pickup would be misleading
            if (!priorIsYesterday) {
              return (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-stone-100 border border-stone-200 rounded-sm text-stone-600"
                  title="1-day pickup needs a report from exactly yesterday to be meaningful. With a multi-day gap, the diff would capture several days of change."
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Prior is not yesterday — 1-day pickup unavailable</span>
                </span>
              );
            }
            return null;
          })()}
        </div>

        {uploadError && (
          <div className="mt-2 px-2 py-1.5 bg-rose-50 border border-rose-200 rounded-sm text-[10px] text-rose-900 flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> <span>{uploadError}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      {/* Browse-only banner if showing prior */}
      {isShowingPriorOnly && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 flex items-center gap-2">
          <AlertCircle className="w-3 h-3" />
          Showing prior report ({priorDateLabel}) — no report uploaded for {isoToMDY(selectedISO)} yet.
        </div>
      )}

      {/* Building-column detection diagnostic — surfaces when the report
          looks multi-row but no building/group column was recognized.
          ALSO triggers for old cached reports that were parsed before
          multi-building support existed (no _detectionInfo field).
          WHY: prevents silent fallback to legacy aggregate mode that hides
          per-building data behind cryptic "all rows look the same" output. */}
      {todayReport && !isMultiBuilding && allMonths.length > 12 && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-[11px] text-rose-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold mb-1">Report looks like multi-building data, but it isn't being grouped</div>
              <div className="leading-snug mb-1.5">
                This report has {allMonths.length} rows, which suggests it's a multi-building export. Either the Building/Group column wasn't recognized, or the report was uploaded before multi-building support was added.
              </div>
              <div className="leading-snug font-medium mb-1">
                Try: clear and re-upload the same file.
              </div>
              {todayReport._detectionInfo ? (
                <>
                  <div className="leading-snug">
                    <span className="font-medium">Columns found:</span>{' '}
                    <span className="mono text-[10px]">{todayReport._detectionInfo.availableColumns.join(' · ')}</span>
                  </div>
                  <div className="leading-snug mt-1 italic">
                    Expected one of: <span className="mono text-[10px]">Group Name · Group · Sub Group · Customization Group · Listing Group · Listing Name · Building</span>
                  </div>
                </>
              ) : (
                <div className="leading-snug italic">
                  This report was parsed by an older version of the parser and doesn't have building data. Re-upload to fix.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pickup-column detection diagnostic — fires when multi-building parsing
          succeeded but every row's 3d/7d pickup is null. That means the parser
          couldn't find pickup columns under any of its known names.
          WHY a separate banner: a building report with all-null pickups
          would silently hide critical pacing signal — better to call it out. */}
      {isMultiBuilding && buildingRows.length > 0 && buildingRows.every(r => r.month.pickup3d == null) && todayReport?._detectionInfo && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold mb-1">3-day and 7-day pickup columns not recognized</div>
              <div className="leading-snug mb-1.5">
                Building data is loading correctly, but pickup values came back empty. The export probably uses pickup column names different from the patterns the parser knows.
              </div>
              <div className="leading-snug">
                <span className="font-medium">Columns in your file:</span>{' '}
                <span className="mono text-[10px]">{todayReport._detectionInfo.availableColumns.filter(c => /pickup/i.test(c)).join(' · ') || '(none containing the word "pickup")'}</span>
              </div>
              <div className="leading-snug mt-1 italic">
                Expected one of: <span className="mono text-[10px]">Total Revenue Pickup (3 Days) · Pickup (3 Days) · Revenue Pickup (3 Days)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flag summary (no cascade — single segment) */}
      {months.length > 0 && (
        flaggedMonths.length > 0 ? (
          <div className="border-b border-stone-200 bg-stone-50/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-2">⚠ Needs attention</div>
            <div className="text-[11px] text-stone-600 mb-3">
              {flaggedMonths.length} {flaggedMonths.length === 1 ? 'month' : 'months'} flagged ·
              {flagSummary.problems > 0 && <span className="text-rose-800 font-medium"> {flagSummary.problems} problem{flagSummary.problems === 1 ? '' : 's'}</span>}
              {flagSummary.problems > 0 && flagSummary.opportunities > 0 && <span className="text-stone-400"> ·</span>}
              {flagSummary.opportunities > 0 && <span className="text-amber-800 font-medium"> {flagSummary.opportunities} opportunit{flagSummary.opportunities === 1 ? 'y' : 'ies'}</span>}
            </div>
            <div className="space-y-2">
              {flaggedMonths.map(({ month, dba, flags }) => {
                const problems = flags.filter(f => f.severity === 'problem');
                const opportunities = flags.filter(f => f.severity === 'opportunity');
                const isExpanded = expandedMonth === month.iso;
                return (
                  <div key={month.iso} className="bg-white border border-stone-200 rounded-sm px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-stone-900">{month.label}</span>
                        <span className="text-[10px] mono text-stone-400">{dba}d to end of month</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {problems.length > 0 && (
                          <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 border border-rose-300 text-rose-900 rounded-sm font-medium">
                            <Flag className="w-2.5 h-2.5" /> {problems.length}
                          </span>
                        )}
                        {opportunities.length > 0 && (
                          <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 rounded-sm font-medium">
                            <Sparkles className="w-2.5 h-2.5" /> {opportunities.length}
                          </span>
                        )}
                        {listingReport?.byBuilding && (
                          <button
                            onClick={() => setExpandedMonth(isExpanded ? null : month.iso)}
                            className={`text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-medium transition-colors ${
                              isExpanded ? 'bg-stone-700 text-white' : 'bg-stone-900 hover:bg-stone-800 text-white'
                            }`}
                          >
                            <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /> Investigate
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {[...problems, ...opportunities].map(f => (
                        <FlagDetailRow
                          key={f.id}
                          flag={f}
                          contribs={null}
                          direction={f.severity === 'opportunity' ? 'up' : 'down'}
                          onSnooze={setDismissedFlags ? (fid) => handleSnoozeSimple(month.iso, fid) : undefined}
                          onRemove={setDismissedFlags ? (fid) => handleRemoveSimple(month.iso, fid) : undefined}
                        />
                      ))}
                    </div>

                    {/* Listing breakdown drilldown */}
                    {isExpanded && listingReport?.byBuilding && (() => {
                      // Find listings that belong to building groups shown in this panel
                      // Match by extracting the building number from listing name (e.g. "730.2304" → 730)
                      const listingRows = [];
                      Object.entries(listingReport.byBuilding).forEach(([name, monthsArr]) => {
                        const monthRow = monthsArr.find(m => m.iso === month.iso);
                        if (!monthRow) return;
                        const listingFlags = [];
                        flags.forEach(f => {
                          const cfg = FLAG_METRIC_MAP[f.id];
                          if (!cfg) return;
                          const ty = monthRow[cfg.ty];
                          const ly = monthRow[cfg.ly];
                          if (ty == null || ly == null) return;
                          const gap = Number(ty) - Number(ly);
                          const isSameDir = cfg.direction === 'down' ? gap < 0 : gap > 0;
                          listingFlags.push({ flag: f, ty, ly, gap, isSameDir });
                        });
                        if (listingFlags.length === 0) return;
                        const rev = monthRow.rentalRevenue != null ? Number(monthRow.rentalRevenue) : 0;
                        listingRows.push({ name, monthRow, listingFlags, rev });
                      });
                      listingRows.sort((a, b) => b.rev - a.rev);
                      if (listingRows.length === 0) return <div className="mt-2 text-[10px] text-stone-400 italic">No listing data for this month.</div>;
                      return (
                        <div className="mt-2 border-t border-stone-100 pt-2">
                          <div className="border border-stone-200 rounded-sm bg-white">
                            <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-stone-600 font-semibold border-b border-stone-200 bg-stone-50">
                              Listings — {month.label} ({listingRows.length})
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                              <table className="w-full text-[10px]">
                                <thead className="sticky top-0 bg-stone-50">
                                  <tr className="text-stone-500">
                                    <th className="text-left px-2 py-1 font-semibold">Listing</th>
                                    <th className="text-right px-2 py-1 font-semibold">Revenue</th>
                                    {flags.map(f => (
                                      <th key={f.id} className="text-right px-2 py-1 font-semibold" title={f.detail}>
                                        {f.label.replace(/ (behind|ahead of|<|>) .*/, '')}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {listingRows.map((lr, idx) => (
                                    <tr key={lr.name} className={`border-t border-stone-100 ${idx % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                                      <td className="px-2 py-1 text-stone-800 font-medium truncate max-w-[200px]" title={lr.name}>
                                        {lr.name.split(' -- ')[0]}
                                        {lr.name.includes(' -- ') && (
                                          <span className="text-stone-400 font-normal ml-1 text-[9px]">{lr.name.split(' -- ')[1]?.slice(0, 25)}</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1 text-right mono text-stone-700">
                                        {lr.monthRow.rentalRevenue != null ? `$${Math.round(Number(lr.monthRow.rentalRevenue)).toLocaleString('en-US')}` : '—'}
                                      </td>
                                      {flags.map(f => {
                                        const match = lr.listingFlags.find(lf => lf.flag.id === f.id);
                                        if (!match) return <td key={f.id} className="px-2 py-1 text-right text-stone-300">—</td>;
                                        const color = match.isSameDir
                                          ? (f.severity === 'opportunity' ? 'text-amber-800 bg-amber-50' : 'text-rose-800 bg-rose-50')
                                          : (f.severity === 'opportunity' ? 'text-rose-700' : 'text-emerald-700');
                                        return (
                                          <td key={f.id} className={`px-2 py-1 text-right mono font-medium ${color}`}
                                            title={`TY ${fmtFlagValue(f.id, match.ty)} vs STLY ${fmtFlagValue(f.id, match.ly)}`}
                                          >
                                            {fmtFlagGap(f.id, match.gap)}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {dismissedFlagsList.length > 0 && (
              <DismissedFlagsList
                dismissedFlagsList={dismissedFlagsList}
                segment={dismissSegment}
                onRestore={handleRestoreSimple}
                buildingReport={null}
              />
            )}
          </div>
        ) : flaggedMonths.length === 0 && dismissedFlagsList.length > 0 ? (
          <div className="border-b border-stone-200 bg-stone-50/40 p-4">
            <div className="bg-emerald-50/40 px-4 py-3 flex items-center gap-2 text-[12px] text-emerald-900 rounded-sm mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span><span className="font-medium">All clear.</span> All flags have been snoozed or removed.</span>
            </div>
            <DismissedFlagsList
              dismissedFlagsList={dismissedFlagsList}
              segment={dismissSegment}
              onRestore={handleRestoreSimple}
              buildingReport={null}
            />
          </div>
        ) : (
          <div className="border-b border-stone-200 bg-emerald-50/40 px-4 py-3 flex items-center gap-2 text-[12px] text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span><span className="font-medium">All clear.</span> No flags fired against last year for this scope.</span>
          </div>
        )
      )}

      {/* Compact data table */}
      {allMonths.length > 0 && (pastMonthCount > 0 || showPastMonths) && (
        <div className="px-4 py-2 border-b border-stone-200 bg-stone-50/30 flex items-center justify-end text-[10px]">
          <button
            onClick={() => setShowPastMonths(v => !v)}
            className="inline-flex items-center gap-1 px-2 py-0.5 border border-stone-300 hover:border-stone-500 bg-white text-stone-700 rounded-sm font-medium transition-colors"
            title={showPastMonths ? 'Hide past (closed) months' : `Show ${pastMonthCount} past month${pastMonthCount === 1 ? '' : 's'}`}
          >
            {showPastMonths
              ? <>Hide past months</>
              : <>Show past months {pastMonthCount > 0 && <span className="text-stone-400">({pastMonthCount})</span>}</>
            }
          </button>
        </div>
      )}
      {/* Compact data table (legacy aggregate when no byBuilding map) */}
      {!isMultiBuilding && months.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-emerald-800 text-white">
                <th className="text-left px-3 py-2 font-semibold">Month</th>
                <th className="text-right px-3 py-2 font-semibold">DBA</th>
                <th className="text-right px-3 py-2 font-semibold">Rental Rev</th>
                <th className="text-right px-3 py-2 font-semibold">Rev Gap</th>
                <th className="text-right px-3 py-2 font-semibold">1d</th>
                <th className="text-right px-3 py-2 font-semibold">3d</th>
                <th className="text-right px-3 py-2 font-semibold">7d</th>
                <th className="text-right px-3 py-2 font-semibold">ADR</th>
                <th className="text-right px-3 py-2 font-semibold">Occ</th>
                <th className="text-right px-3 py-2 font-semibold">RevPAR</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const dba = daysToEndOfMonth(m.y, m.m);
                const isPast = dba === 0;
                const flagSet = new Set(isPast ? [] : computeMonthFlags(m).map(f => f.id));
                const tint = (id, sev = 'problem') => flagSet.has(id)
                  ? (sev === 'opportunity' ? 'bg-amber-100 text-amber-900 font-semibold' : 'bg-rose-100 text-rose-900 font-semibold')
                  : '';
                const p1d = havePriorForDiff ? pickup1d[m.iso] : null;
                // Compute revenue gap once for this row — used in the new Rev Gap column
                const tyRev = num(m.rentalRevenue);
                const lyRev = num(m.rentalRevenueSTLY);
                const revGap = (tyRev != null && lyRev != null) ? (tyRev - lyRev) : null;
                const revGapPct = (revGap != null && lyRev != null && lyRev > 0) ? (revGap / lyRev) * 100 : null;
                return (
                  <tr key={m.iso} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/50' : 'bg-white'} ${isPast ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 font-medium text-stone-900">{m.label}</td>
                    <td className="text-right px-3 py-2 mono text-stone-700">{isPast ? <span className="text-stone-400">closed</span> : `${dba}d`}</td>
                    <td className="text-right px-3 py-2 mono text-stone-900">{fmtMoney(revenueValue(m))}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('rev-low') || (revGap == null ? 'text-stone-300' : revGap >= 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')}`}>
                      {revGap == null ? '—' : (
                        <>
                          {revGap === 0 ? '$0' : `${revGap >= 0 ? '+$' : '−$'}${Math.abs(Math.round(revGap)).toLocaleString('en-US')}`}
                          {revGapPct != null && (
                            <span className="text-[9px] ml-1 opacity-60">
                              ({revGapPct >= 0 ? '+' : ''}{revGapPct.toFixed(1)}%)
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`text-right px-3 py-2 mono ${
                      !havePriorForDiff ? 'text-stone-300 italic' :
                      p1d == null ? 'text-stone-300' :
                      p1d > 0 ? 'text-emerald-700 font-medium' :
                      p1d < 0 ? 'text-rose-700 font-medium' : 'text-stone-500'
                    }`}>{!havePriorForDiff ? 'N/A' : (fmtPickup1d(p1d) ?? '—')}</td>
                    <td className={`text-right px-3 py-2 mono ${
                      tint('pickup3d-zero') || tint('pickup3d-behind') || tint('pickup3d-ahead', 'opportunity') ||
                      (m.pickup3d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')
                    }`}>{fmtMoney(m.pickup3d)}</td>
                    <td className={`text-right px-3 py-2 mono ${
                      tint('pickup7d-zero') || tint('pickup7d-behind') || tint('pickup7d-ahead', 'opportunity') ||
                      (m.pickup7d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')
                    }`}>{fmtMoney(m.pickup7d)}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('adr-low') || 'text-stone-700'}`}>{fmtMoney(m.rentalADR)}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('occ-high', 'opportunity') || tint('occ-low') || 'text-stone-700'}`}>{fmtPct(m.occupancy)}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('revpar-low') || 'text-stone-700'}`}>{fmtMoney(m.rentalRevPAR)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Multi-building table — shows one row per (building × month) pair.
          WHY: at the Building level the user wants to see each building's
          performance individually so they can spot which buildings need
          attention. Aggregating across buildings here would defeat the purpose. */}
      {isMultiBuilding && buildingRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-emerald-800 text-white">
                <th className="text-left px-3 py-2 font-semibold">Building</th>
                <th className="text-left px-3 py-2 font-semibold">Segment</th>
                <th className="text-left px-3 py-2 font-semibold">Month</th>
                <th className="text-right px-3 py-2 font-semibold">DBA</th>
                <th className="text-right px-3 py-2 font-semibold">Rental Rev</th>
                <th className="text-right px-3 py-2 font-semibold">Rev Gap</th>
                <th className="text-right px-3 py-2 font-semibold">1d</th>
                <th className="text-right px-3 py-2 font-semibold">3d</th>
                <th className="text-right px-3 py-2 font-semibold">7d</th>
                <th className="text-right px-3 py-2 font-semibold">ADR</th>
                <th className="text-right px-3 py-2 font-semibold">Occ</th>
                <th className="text-right px-3 py-2 font-semibold">RevPAR</th>
              </tr>
            </thead>
            <tbody>
              {buildingRows.map((row, i) => {
                const { group, month: m, dba } = row;
                const isPast = dba === 0;
                const seg = buildingToSegment(group);
                const segLabel = seg === 'ph' ? 'PH' : 'Excl PH';
                const segPillClass = seg === 'ph'
                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200';
                const flagSet = new Set(isPast ? [] : computeMonthFlags(m).map(f => f.id));
                const tint = (id, sev = 'problem') => flagSet.has(id)
                  ? (sev === 'opportunity' ? 'bg-amber-100 text-amber-900 font-semibold' : 'bg-rose-100 text-rose-900 font-semibold')
                  : '';
                const p1d = havePriorForDiff ? buildingPickup1d[`${group}|${m.iso}`] : null;
                // Per-row revenue gap for the new Rev Gap column
                const tyRev = num(m.rentalRevenue);
                const lyRev = num(m.rentalRevenueSTLY);
                const revGap = (tyRev != null && lyRev != null) ? (tyRev - lyRev) : null;
                const revGapPct = (revGap != null && lyRev != null && lyRev > 0) ? (revGap / lyRev) * 100 : null;
                // Visual separator row between months for scan-ability
                const prevMonthIso = i > 0 ? buildingRows[i - 1].month.iso : null;
                const isFirstOfMonth = prevMonthIso !== m.iso;
                return (
                  <tr key={`${group}|${m.iso}`} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/50' : 'bg-white'} ${isPast ? 'opacity-50' : ''} ${isFirstOfMonth ? 'border-t-2 border-t-stone-300' : ''}`}>
                    <td className="px-3 py-2 font-medium text-stone-900 mono">{group}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-1.5 py-0.5 text-[9px] uppercase tracking-wider border rounded-sm ${segPillClass}`}>
                        {segLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-stone-700">{m.label}</td>
                    <td className="text-right px-3 py-2 mono text-stone-700">{isPast ? <span className="text-stone-400">closed</span> : `${dba}d`}</td>
                    <td className="text-right px-3 py-2 mono text-stone-900">{fmtMoney(revenueValue(m))}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('rev-low') || (revGap == null ? 'text-stone-300' : revGap >= 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')}`}>
                      {revGap == null ? '—' : (
                        <>
                          {revGap === 0 ? '$0' : `${revGap >= 0 ? '+$' : '−$'}${Math.abs(Math.round(revGap)).toLocaleString('en-US')}`}
                          {revGapPct != null && (
                            <span className="text-[9px] ml-1 opacity-60">
                              ({revGapPct >= 0 ? '+' : ''}{revGapPct.toFixed(1)}%)
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`text-right px-3 py-2 mono ${
                      !havePriorForDiff ? 'text-stone-300 italic' :
                      p1d == null ? 'text-stone-300' :
                      p1d > 0 ? 'text-emerald-700 font-medium' :
                      p1d < 0 ? 'text-rose-700 font-medium' : 'text-stone-500'
                    }`}>{!havePriorForDiff ? 'N/A' : (fmtPickup1d(p1d) ?? '—')}</td>
                    <td className={`text-right px-3 py-2 mono ${
                      tint('pickup3d-zero') || tint('pickup3d-behind') || tint('pickup3d-ahead', 'opportunity') ||
                      (m.pickup3d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')
                    }`}>{fmtMoney(m.pickup3d)}</td>
                    <td className={`text-right px-3 py-2 mono ${
                      tint('pickup7d-zero') || tint('pickup7d-behind') || tint('pickup7d-ahead', 'opportunity') ||
                      (m.pickup7d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')
                    }`}>{fmtMoney(m.pickup7d)}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('adr-low') || 'text-stone-700'}`}>{fmtMoney(m.rentalADR)}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('occ-high', 'opportunity') || tint('occ-low') || 'text-stone-700'}`}>{fmtPct(m.occupancy)}</td>
                    <td className={`text-right px-3 py-2 mono ${tint('revpar-low') || 'text-stone-700'}`}>{fmtMoney(m.rentalRevPAR)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PortfolioReportPanel({ portfolioData, onUpdate, isReadOnly, selectedISO, onInvestigate, buildingReport, dismissedFlags, setDismissedFlags }) {
  const [segment, setSegment] = useState('all');
  const [expandedMonth, setExpandedMonth] = useState(null); // monthIso or null
  const segData = portfolioData[segment] || {};
  const todayReport = segData.todayReport || null;
  const priorReport = segData.priorReport || null;
  const priorDate = segData.priorDate || null;

  const handleUpload = (kind, parsed) => {
    onUpdate(segment, kind, parsed);
  };

  const handleClear = (kind) => {
    onUpdate(segment, kind, null);
  };

  // Skip monthly computations for weeks segment (handled by WeeksTab)
  const isWeeksSegment = segment === 'weeks';
  const priorIsYesterday = !isWeeksSegment && !!priorReport && isExactlyYesterday(selectedISO, priorDate);
  const pickup1d = isWeeksSegment ? {} : computeOneDayPickup(todayReport, priorReport, selectedISO, priorDate);
  const havePriorForDiff = !isWeeksSegment && !!priorReport;

  // Display rows come from today's report (or prior if today not yet uploaded — read-only browse mode)
  const reportForDisplay = todayReport || priorReport;
  const allMonths = isWeeksSegment ? [] : (reportForDisplay?.months || []);
  const isShowingPriorOnly = !todayReport && !!priorReport;
  // Past-month toggle: default OFF (hide past months). They have DBA = 0 and
  // can't be acted upon. Toggle on for reconciliation purposes.
  const [showPastMonths, setShowPastMonths] = useState(false);
  const months = showPastMonths
    ? allMonths
    : allMonths.filter(m => daysToEndOfMonth(m.y, m.m) > 0);
  const pastMonthCount = allMonths.length - months.length;

  // Portfolio totals (sum of numeric fields where present)
  const totals = months.reduce((acc, m) => {
    acc.rentalRevenue += (revenueValue(m) || 0);
    acc.pickup3d     += (m.pickup3d || 0);
    acc.pickup7d     += (m.pickup7d || 0);
    if (havePriorForDiff && pickup1d[m.iso] != null) acc.pickup1d += pickup1d[m.iso];
    acc.bookableNights += (m.bookableNights || 0);
    acc.goal         += (m.goal || 0);
    return acc;
  }, { rentalRevenue: 0, pickup3d: 0, pickup7d: 0, pickup1d: 0, bookableNights: 0, goal: 0 });

  // Roll up flags across all forward months (skip past months — closed)
  // Flag counts are based on cascade-filtered flags so the headline numbers
  // reflect what's actually shown to the user.
  // Dismiss helpers scoped to current segment
  const handleSnooze = useCallback((monthIso, flagId) => {
    setDismissedFlags(prev => {
      const key = dismissedFlagKey(segment, monthIso, flagId);
      return { ...prev, snoozed: { ...prev.snoozed, [key]: { at: new Date().toISOString() } } };
    });
  }, [segment, setDismissedFlags]);

  const handleRemove = useCallback((monthIso, flagId) => {
    setDismissedFlags(prev => {
      const key = dismissedFlagKey(segment, monthIso, flagId);
      return { ...prev, removed: { ...prev.removed, [key]: { at: new Date().toISOString() } } };
    });
  }, [segment, setDismissedFlags]);

  const handleRestore = useCallback((monthIso, flagId) => {
    setDismissedFlags(prev => {
      const key = dismissedFlagKey(segment, monthIso, flagId);
      const { [key]: _s, ...snoozed } = prev.snoozed || {};
      const { [key]: _r, ...removed } = prev.removed || {};
      return { snoozed, removed };
    });
  }, [segment, setDismissedFlags]);

  // All flags (before dismiss filtering) for computing dismissed lists
  const allFlaggedMonths = months
    .map(m => {
      const dba = daysToEndOfMonth(m.y, m.m);
      if (dba === 0) return null;
      const rawFlags = computeMonthFlags(m);
      const flags = cascadeFilterFlags(rawFlags, m.iso, segment, portfolioData);
      if (flags.length === 0) return null;
      return { month: m, dba, flags };
    })
    .filter(Boolean);

  // Split active vs dismissed
  const flaggedMonths = allFlaggedMonths
    .map(entry => {
      const active = entry.flags.filter(f => !isFlagDismissed(dismissedFlags, segment, entry.month.iso, f.id));
      if (active.length === 0) return null;
      return { ...entry, flags: active };
    })
    .filter(Boolean);

  const dismissedFlagsList = allFlaggedMonths.flatMap(entry =>
    entry.flags
      .map(f => {
        const status = isFlagDismissed(dismissedFlags, segment, entry.month.iso, f.id);
        if (!status) return null;
        return { month: entry.month, dba: entry.dba, flag: f, status };
      })
      .filter(Boolean)
  );

  const flagSummary = flaggedMonths.reduce((acc, entry) => {
    entry.flags.forEach(f => {
      if (f.severity === 'opportunity') acc.opportunities++;
      else acc.problems++;
    });
    acc.flaggedMonths++;
    return acc;
  }, { problems: 0, opportunities: 0, flaggedMonths: 0 });

  // Cascade is "active" only when all three segments have today's reports.
  // Used to show a hint in the UI so the user understands why some flags moved.
  const cascadeActive = ['all', 'ph', 'exclPh'].every(s => portfolioData?.[s]?.todayReport);

  const fmtMoney = (v) => v == null || v === '' ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const fmtPct = (v) => v == null || v === '' ? '—' : `${Number(v).toFixed(1)}%`;
  const fmtPickup1d = (v) => {
    if (v == null) return null; // sentinel for N/A
    if (v === 0) return '$0';
    const sign = v > 0 ? '+' : '−';
    return `${sign}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  };

  // Format the prior-date relative to today for the helper text
  const priorDateLabel = (() => {
    if (!priorDate) return null;
    const today = new Date(selectedISO + 'T00:00:00');
    const prior = new Date(priorDate + 'T00:00:00');
    const diffDays = Math.round((today - prior) / (1000 * 60 * 60 * 24));
    const dateLabel = isoToMDY(priorDate);
    if (diffDays === 1) return `${dateLabel} (yesterday)`;
    return `${dateLabel} (${diffDays} days ago)`;
  })();

  return (
    <div className="border border-stone-300 rounded-sm bg-white">
      {/* Sub-tabs */}
      <div className="flex border-b border-stone-200 bg-stone-50/60">
        {PORTFOLIO_SEGMENTS.map(s => {
          const active = segment === s.id;
          const has = portfolioData[s.id]?.todayReport || portfolioData[s.id]?.priorReport;
          return (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={`px-4 py-2.5 text-[12px] font-medium transition-colors flex items-center gap-2 border-r border-stone-200 last:border-r-0 ${
                active
                  ? 'bg-white text-stone-900 border-b-2 border-b-emerald-700 -mb-px'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <span>{s.label}</span>
              {has && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" title="Report uploaded" />}
            </button>
          );
        })}
        {/* Visual separator between segments and drill-downs */}
        <div className="w-px bg-stone-300" />
        {PORTFOLIO_DRILLDOWNS.map(s => {
          const active = segment === s.id;
          const has = portfolioData[s.id]?.todayReport || portfolioData[s.id]?.priorReport;
          return (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={`px-4 py-2.5 text-[12px] font-medium transition-colors flex items-center gap-2 border-r border-stone-200 last:border-r-0 ${
                active
                  ? 'bg-white text-stone-900 border-b-2 border-b-emerald-700 -mb-px'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <span>{s.label}</span>
              {has && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" title="Report uploaded" />}
            </button>
          );
        })}
        <div className="ml-auto flex items-center px-4 text-[10px] text-stone-500">
          {PORTFOLIO_SEGMENTS.find(s => s.id === segment)?.subtitle ||
           PORTFOLIO_DRILLDOWNS.find(s => s.id === segment)?.subtitle}
        </div>
      </div>

      {/* Drill-down tabs use SimpleReportPanel — same per-row rendering as the
          Building level in the funnel, but inside the Portfolio tab bar.
          WHY a different panel: drill-downs have no segment cascade, no contributing
          chips. Reusing the segment infrastructure would force unnecessary
          complexity. SimpleReportPanel already handles per-building rows. */}
      {(segment === 'building' || segment === 'listing') && (() => {
        const drilldown = PORTFOLIO_DRILLDOWNS.find(d => d.id === segment);
        return (
          <SimpleReportPanel
            key={`drilldown-${segment}`}
            levelLabel={drilldown.label}
            levelHint={drilldown.hint}
            todayReport={todayReport}
            priorReport={priorReport}
            priorDate={priorDate}
            onUpload={(parsed) => handleUpload('todayReport', parsed)}
            onClear={() => handleClear('todayReport')}
            isReadOnly={isReadOnly}
            selectedISO={selectedISO}
            onInvestigate={onInvestigate}
            segmentLabel={drilldown.label}
            syncSegment={segment}
            dismissedFlags={dismissedFlags}
            setDismissedFlags={setDismissedFlags}
            listingReport={segment === 'building' ? (portfolioData['listing']?.todayReport || null) : null}
          />
        );
      })()}

      {/* Weeks drilldown — rendered as WeeksTab inside the funnel */}
      {segment === 'weeks' && (() => {
        // Build weeksReport with _prior from portfolioData
        const weeksToday = portfolioData['weeks']?.todayReport || null;
        const weeksPrior = portfolioData['weeks']?.priorReport || null;
        const weeksWithPrior = weeksToday ? { ...weeksToday, _prior: weeksPrior } : null;
        return (
          <WeeksTab
            weeksReport={weeksWithPrior}
            onUpload={(parsed) => handleUpload('todayReport', parsed)}
            onClear={() => handleClear('todayReport')}
            onSyncLoaded={(parsed) => handleUpload('todayReport', parsed)}
          />
        );
      })()}

      {/* Standard segment view (All / PH / Excl PH) — only render when we're not on a drill-down */}
      {segment !== 'building' && segment !== 'listing' && segment !== 'weeks' && (
      <>
      {/* Compact report status bar */}
      <div className="px-4 py-2 border-b border-stone-200 bg-stone-50/40 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[11px]">
          {todayReport ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-800" title={`${todayReport.fileName || 'Report'} · ${todayReport.months?.length || 0} months · uploaded ${todayReport.uploadedAt ? new Date(todayReport.uploadedAt).toLocaleString() : ''}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span className="mono">{isoToMDY(selectedISO)}</span>
            </span>
          ) : isShowingPriorOnly ? (
            <span className="text-amber-700" title="No report for today — showing most recent prior">
              <span className="mono">{priorDateLabel}</span> <span className="text-stone-400">(prior)</span>
            </span>
          ) : (
            <span className="text-stone-400">No report</span>
          )}
          {priorReport && !isShowingPriorOnly && (
            <span className="text-stone-400" title={`Comparing against ${priorDateLabel}. 1-day pickup = today minus prior.`}>
              vs <span className="mono">{priorDateLabel}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {todayReport && !isReadOnly && (
            <button onClick={() => handleClear('todayReport')} className="text-[10px] text-stone-400 hover:text-rose-600 transition-colors">Clear</button>
          )}
          {!isReadOnly && (
            <SyncReportButton segment={segment} onReportLoaded={(parsed) => handleUpload('todayReport', parsed)} />
          )}
          {!todayReport && !isReadOnly && (
            <ReportUploadSlot
              label="Drop xlsx"
              kind="todayReport"
              report={null}
              onUpload={handleUpload}
              onClear={handleClear}
              isReadOnly={isReadOnly}
              accent="today"
            />
          )}
        </div>
      </div>

      {/* Data display */}
      {months.length === 0 ? (
        <div className="p-8 text-center text-stone-400 text-sm italic">
          Upload today's report to see metrics by month.
        </div>
      ) : (
        <>
          {/* Flag legend */}
          <div className="px-4 py-2 border-b border-stone-200 bg-stone-50/30 flex items-center gap-3 flex-wrap text-[10px]">
            <span className="uppercase tracking-[0.2em] text-stone-500 font-semibold">Auto-flags vs STLY</span>
            <span className="inline-flex items-center gap-1 text-rose-900">
              <Flag className="w-2.5 h-2.5" /> Problem: pickup ≤90% of STLY (or zero), ADR/RevPAR &lt; STLY by &gt;{(ADR_PROBLEM_THRESHOLD * 100).toFixed(0)}%, Occ &lt; STLY by &gt;{OCC_PROBLEM_THRESHOLD}pp
            </span>
            <span className="inline-flex items-center gap-1 text-amber-900">
              <Sparkles className="w-2.5 h-2.5" /> Opportunity: pickup ≥110% of STLY · occupancy &gt; LY +{OCCUPANCY_OUTPACE_THRESHOLD}pp (test pricing)
            </span>
            <div className="ml-auto flex items-center gap-2">
              {cascadeActive && (
                <span className="inline-flex items-center gap-1 text-emerald-900" title="When the same flag fires across All / PH / Excl PH, it is shown only on the most specific accurate segment to reduce noise.">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Cascade active
                </span>
              )}
              {(pastMonthCount > 0 || showPastMonths) && (
                <button
                  onClick={() => setShowPastMonths(v => !v)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 border border-stone-300 hover:border-stone-500 bg-white text-stone-700 rounded-sm font-medium transition-colors"
                  title={showPastMonths ? 'Hide past (closed) months' : `Show ${pastMonthCount} past month${pastMonthCount === 1 ? '' : 's'}`}
                >
                  {showPastMonths
                    ? <>Hide past months</>
                    : <>Show past months {pastMonthCount > 0 && <span className="text-stone-400">({pastMonthCount})</span>}</>
                  }
                </button>
              )}
            </div>
          </div>

          {/* Flag summary panel — moved above the table so it's the first thing
              the user sees. WHY: the per-cell tints in the data table are subtle
              and easy to miss when most months look healthy at a glance.
              Surfacing the actionable list up top means a "what needs my attention
              today?" question is answered before the user scrolls anywhere. */}
          {flaggedMonths.length > 0 ? (
            <div className="border-b border-stone-200 bg-stone-50/40 p-4">
              <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-0.5">⚠ Needs attention</div>
                  <div className="text-[12px] text-stone-700">
                    <span className="font-medium">{flaggedMonths.length}</span> {flaggedMonths.length === 1 ? 'month' : 'months'} flagged ·
                    {flagSummary.problems > 0 && (
                      <span className="text-rose-800 font-medium"> {flagSummary.problems} problem{flagSummary.problems === 1 ? '' : 's'}</span>
                    )}
                    {flagSummary.problems > 0 && flagSummary.opportunities > 0 && <span className="text-stone-400"> ·</span>}
                    {flagSummary.opportunities > 0 && (
                      <span className="text-amber-800 font-medium"> {flagSummary.opportunities} opportunit{flagSummary.opportunities === 1 ? 'y' : 'ies'}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {flaggedMonths.map(({ month, dba, flags }) => {
                  const problems = flags.filter(f => f.severity === 'problem');
                  const opportunities = flags.filter(f => f.severity === 'opportunity');
                  const isExpanded = expandedMonth === month.iso;
                  return (
                    <div key={month.iso} className="bg-white border border-stone-200 rounded-sm px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13px] font-semibold text-stone-900">{month.label}</span>
                          <span className="text-[10px] mono text-stone-400">{dba}d to end of month</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {problems.length > 0 && (
                            <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 border border-rose-300 text-rose-900 rounded-sm font-medium">
                              <Flag className="w-2.5 h-2.5" /> {problems.length} problem{problems.length === 1 ? '' : 's'}
                            </span>
                          )}
                          {opportunities.length > 0 && (
                            <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 rounded-sm font-medium">
                              <Sparkles className="w-2.5 h-2.5" /> {opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'}
                            </span>
                          )}
                          <button
                            onClick={() => setExpandedMonth(isExpanded ? null : month.iso)}
                            className={`text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-medium transition-colors ${
                              isExpanded
                                ? 'bg-stone-700 text-white'
                                : 'bg-stone-900 hover:bg-stone-800 text-white'
                            }`}
                          >
                            <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /> Investigate
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {problems.map(f => {
                          // Show building breakdown for all segments (including All)
                          const contribs = computeContributingBuildings(buildingReport, f, month.iso, segment);
                          return (
                            <FlagDetailRow
                              key={f.id}
                              flag={f}
                              contribs={contribs}
                              direction="down"
                              onSnooze={(fid) => handleSnooze(month.iso, fid)}
                              onRemove={(fid) => handleRemove(month.iso, fid)}
                            />
                          );
                        })}
                        {opportunities.map(f => {
                          const contribs = computeContributingBuildings(buildingReport, f, month.iso, segment);
                          return (
                            <FlagDetailRow
                              key={f.id}
                              flag={f}
                              contribs={contribs}
                              direction="up"
                              onSnooze={(fid) => handleSnooze(month.iso, fid)}
                              onRemove={(fid) => handleRemove(month.iso, fid)}
                            />
                          );
                        })}
                      </div>

                      {/* Inline contributor drilldown */}
                      {isExpanded && (
                        <div className="mt-2 border-t border-stone-100 pt-2 space-y-3">
                          {/* Per-flag contributor breakdown */}
                          {flags.map(f => {
                            const direction = f.severity === 'opportunity' ? 'up' : 'down';
                            const isOpp = direction === 'up';
                            const chipBg = isOpp ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900';
                            const headerBg = isOpp ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200';

                            // Segments (PH / Excl PH) — only when viewing All
                            const segContribs = segment === 'all'
                              ? computeContributingSegments(portfolioData, f, month.iso)
                              : [];

                            // Buildings — show for Excl PH and All
                            const buildingContribs = (segment === 'exclPh' || segment === 'all')
                              ? computeContributingBuildings(buildingReport, f, month.iso, segment)
                              : { sameDirection: [], oppositeDirection: [] };
                            const sameBuildings = buildingContribs.sameDirection || [];

                            // Weeks — only for All segment; use fresh data from portfolioData
                            const weekContribs = segment === 'all'
                              ? computeContributingWeeks(portfolioData['weeks']?.todayReport || null, f, month.iso)
                              : [];

                            const hasAny = segContribs.length > 0 || sameBuildings.length > 0 || weekContribs.length > 0;

                            return (
                              <div key={f.id} className={`border rounded-sm ${headerBg}`}>
                                <div className={`px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 border-b ${headerBg}`}>
                                  {isOpp ? <Sparkles className="w-3 h-3" /> : <Flag className="w-3 h-3" />}
                                  {f.label} — contributors matching direction
                                </div>

                                {!hasAny ? (
                                  <div className="px-3 py-2 text-[10px] text-stone-400 italic">No contributor data available for this flag.</div>
                                ) : (
                                  <div className="px-3 py-2 space-y-2">
                                    {/* Segment contributors */}
                                    {segContribs.length > 0 && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Segments</div>
                                        <div className="flex gap-1.5 flex-wrap">
                                          {segContribs.map(c => (
                                            <span key={c.segment} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] mono font-medium rounded-sm border ${chipBg}`}
                                              title={`TY ${fmtFlagValue(f.id, c.ty)} vs STLY ${fmtFlagValue(f.id, c.ly)} · gap ${fmtFlagGap(f.id, c.gap)}`}
                                            >
                                              {c.segment === 'ph' ? 'PH' : c.segment === 'exclPh' ? 'Excl PH' : c.segment}
                                              <span className="text-[9px] opacity-70">({fmtFlagGap(f.id, c.gap)})</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Building contributors */}
                                    {sameBuildings.length > 0 && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Buildings {isOpp ? 'driving up' : 'pulling down'}</div>
                                        <div className="flex gap-1.5 flex-wrap">
                                          {sameBuildings.map(c => (
                                            <span key={c.group} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] mono font-medium rounded-sm border ${chipBg}`}
                                              title={`TY ${fmtFlagValue(f.id, c.ty)} vs STLY ${fmtFlagValue(f.id, c.ly)} · gap ${fmtFlagGap(f.id, c.gap)}`}
                                            >
                                              {c.group}
                                              <span className="text-[9px] opacity-70">({fmtFlagGap(f.id, c.gap)})</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Week contributors */}
                                    {weekContribs.length > 0 && (
                                      <div>
                                        <div className="text-[9px] uppercase tracking-wider text-stone-500 font-semibold mb-1">Weeks {isOpp ? 'driving up' : 'pulling down'}</div>
                                        <div className="flex gap-1.5 flex-wrap">
                                          {weekContribs.map(c => (
                                            <span key={c.label} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] mono font-medium rounded-sm border ${chipBg}`}
                                              title={`${c.dateRange}${c.event ? ' · ' + c.event : ''} · TY ${fmtFlagValue(f.id, c.ty)} vs STLY ${fmtFlagValue(f.id, c.ly)} · gap ${fmtFlagGap(f.id, c.gap)}`}
                                            >
                                              {c.label.replace(' · ', ' ')}
                                              {c.event && <span className="text-[9px] opacity-60 truncate max-w-[100px]">{c.event}</span>}
                                              <span className="text-[9px] opacity-70">({fmtFlagGap(f.id, c.gap)})</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Consolidated listing table — all listings for this month across all flags */}
                          {(() => {
                            const listingSource = segment === 'ph'
                              ? buildingReport
                              : (portfolioData['listing']?.todayReport);
                            if (!listingSource?.byBuilding) return null;

                            const listingRows = [];
                            Object.entries(listingSource.byBuilding).forEach(([name, monthsArr]) => {
                              // For PH segment, only show PH-tagged listings
                              if (segment === 'ph' && buildingToSegment(name) !== 'ph') return;
                              const monthRow = monthsArr.find(m => m.iso === month.iso);
                              if (!monthRow) return;

                              // Compute all flag metrics for this listing
                              const listingFlags = [];
                              flags.forEach(f => {
                                const cfg = FLAG_METRIC_MAP[f.id];
                                if (!cfg) return;
                                const ty = monthRow[cfg.ty];
                                const ly = monthRow[cfg.ly];
                                if (ty == null || ly == null) return;
                                const gap = Number(ty) - Number(ly);
                                const isSameDir = cfg.direction === 'down' ? gap < 0 : gap > 0;
                                listingFlags.push({ flag: f, ty, ly, gap, isSameDir });
                              });
                              if (listingFlags.length === 0) return;

                              // Revenue for sorting
                              const rev = monthRow.rentalRevenue != null ? Number(monthRow.rentalRevenue) : 0;
                              listingRows.push({ name, monthRow, listingFlags, rev });
                            });

                            if (listingRows.length === 0) return null;
                            listingRows.sort((a, b) => b.rev - a.rev);

                            return (
                              <div className="border border-stone-200 rounded-sm bg-white mt-2">
                                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-stone-600 font-semibold border-b border-stone-200 bg-stone-50">
                                  {segment === 'ph' ? 'PH Listings' : 'Listings'} — {month.label} ({listingRows.length})
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                  <table className="w-full text-[10px]">
                                    <thead className="sticky top-0 bg-stone-50">
                                      <tr className="text-stone-500">
                                        <th className="text-left px-2 py-1 font-semibold">Listing</th>
                                        <th className="text-right px-2 py-1 font-semibold">Revenue</th>
                                        {flags.map(f => (
                                          <th key={f.id} className="text-right px-2 py-1 font-semibold" title={f.detail}>
                                            {f.label.replace(/ (behind|ahead of|<|>) .*/, '')}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {listingRows.map((lr, idx) => (
                                        <tr key={lr.name} className={`border-t border-stone-100 ${idx % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                                          <td className="px-2 py-1 text-stone-800 font-medium truncate max-w-[200px]" title={lr.name}>
                                            {lr.name.split(' -- ')[0]}
                                            {lr.name.includes(' -- ') && (
                                              <span className="text-stone-400 font-normal ml-1 text-[9px]">{lr.name.split(' -- ')[1]?.slice(0, 25)}</span>
                                            )}
                                          </td>
                                          <td className="px-2 py-1 text-right mono text-stone-700">
                                            {lr.monthRow.rentalRevenue != null ? `$${Math.round(Number(lr.monthRow.rentalRevenue)).toLocaleString('en-US')}` : '—'}
                                          </td>
                                          {flags.map(f => {
                                            const match = lr.listingFlags.find(lf => lf.flag.id === f.id);
                                            if (!match) return <td key={f.id} className="px-2 py-1 text-right text-stone-300">—</td>;
                                            const color = match.isSameDir
                                              ? (f.severity === 'opportunity' ? 'text-amber-800 bg-amber-50' : 'text-rose-800 bg-rose-50')
                                              : (f.severity === 'opportunity' ? 'text-rose-700' : 'text-emerald-700');
                                            return (
                                              <td key={f.id} className={`px-2 py-1 text-right mono font-medium ${color}`}
                                                title={`TY ${fmtFlagValue(f.id, match.ty)} vs STLY ${fmtFlagValue(f.id, match.ly)}`}
                                              >
                                                {fmtFlagGap(f.id, match.gap)}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Dismissed flags (snoozed + removed) */}
              {dismissedFlagsList.length > 0 && (
                <DismissedFlagsList
                  dismissedFlagsList={dismissedFlagsList}
                  segment={segment}
                  onRestore={handleRestore}
                  buildingReport={buildingReport}
                />
              )}
            </div>
          ) : flaggedMonths.length === 0 && dismissedFlagsList.length > 0 ? (
            <div className="border-b border-stone-200 bg-stone-50/40 p-4">
              <div className="border-b border-stone-200 bg-emerald-50/40 px-4 py-3 flex items-center gap-2 text-[12px] text-emerald-900 rounded-sm mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span><span className="font-medium">All clear.</span> All flags have been snoozed or removed.</span>
              </div>
              <DismissedFlagsList
                dismissedFlagsList={dismissedFlagsList}
                segment={segment}
                onRestore={handleRestore}
                buildingReport={buildingReport}
              />
            </div>
          ) : (
            <div className="border-b border-stone-200 bg-emerald-50/40 px-4 py-3 flex items-center gap-2 text-[12px] text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span><span className="font-medium">All clear.</span> No flags fired against last year. Every forward month is matching or beating LY across pickup, ADR, occupancy, and RevPAR.</span>
            </div>
          )}

          <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-emerald-800 text-white">
                <th className="text-left px-3 py-2 font-semibold">Month</th>
                <th className="text-right px-3 py-2 font-semibold">DBA<br/><span className="text-[9px] font-normal opacity-70">days left</span></th>
                <th className="text-right px-3 py-2 font-semibold">Rental Revenue</th>
                <th className="text-right px-3 py-2 font-semibold">Rev Gap<br/><span className="text-[9px] font-normal opacity-70">vs STLY</span></th>
                <th className="text-right px-3 py-2 font-semibold">1-day Pickup</th>
                <th className="text-right px-3 py-2 font-semibold">3-day Pickup</th>
                <th className="text-right px-3 py-2 font-semibold">7-day Pickup</th>
                <th className="text-right px-3 py-2 font-semibold">Rental ADR</th>
                <th className="text-right px-3 py-2 font-semibold">Occupancy</th>
                <th className="text-right px-3 py-2 font-semibold">RevPAR</th>
                {segment === 'all' && (
                  <th className="text-right px-3 py-2 font-semibold">Goal %</th>
                )}
                <th className="text-left px-3 py-2 font-semibold" style={{ minWidth: 200 }}>Flags <span className="text-[9px] font-normal opacity-70">vs LY</span></th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const dba = daysToEndOfMonth(m.y, m.m);
                const isPast = dba === 0;
                // 1-day pickup logic:
                //   - If we have a prior report → compute & show (signed)
                //   - If we don't → render as N/A
                const p1dRaw = havePriorForDiff ? pickup1d[m.iso] : null;
                const p1dDisplay = havePriorForDiff
                  ? (fmtPickup1d(p1dRaw) ?? '—')
                  : 'N/A';

                // Compute flags vs STLY (skip past months — flags are forward-looking)
                // Cascade filter applied here too so cell tints match the summary panel.
                const rawFlags = isPast ? [] : computeMonthFlags(m);
                const flags = isPast ? [] : cascadeFilterFlags(rawFlags, m.iso, segment, portfolioData);
                const flagSet = new Set(flags.map(f => f.id));
                // Per-cell tinting + inline badge: gives the eye both a strong
                // background signal and a tiny tag next to the number explaining why.
                // For metrics where both a problem and an opportunity flag are possible
                // (pickup), the cell-level helpers accept arrays — first matching flag wins.
                const cellTint = (id, severity = 'problem') => {
                  if (!flagSet.has(id)) return '';
                  return severity === 'opportunity'
                    ? 'bg-amber-100 text-amber-900 font-bold border-l-4 border-amber-500'
                    : 'bg-rose-100 text-rose-900 font-bold border-l-4 border-rose-500';
                };
                const cellBadge = (id, severity = 'problem') => {
                  if (!flagSet.has(id)) return null;
                  const flag = flags.find(f => f.id === id);
                  if (severity === 'opportunity') {
                    return (
                      <span
                        className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-bold bg-amber-600 text-white rounded-sm"
                        title={flag?.detail}
                      >
                        ↑ OPP
                      </span>
                    );
                  }
                  return (
                    <span
                      className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-bold bg-rose-600 text-white rounded-sm"
                      title={flag?.detail}
                    >
                      ↓ LY
                    </span>
                  );
                };
                // Returns the appropriate tint/badge for a metric that has both a
                // problem flag and an opportunity flag, with optional zero-flag.
                // Problem wins over opportunity if both somehow fire (shouldn't happen
                // by design — the rules are mutually exclusive — but safe default).
                const pickupCellTint = (zeroId, behindId, aheadId) => {
                  if (flagSet.has(zeroId))    return cellTint(zeroId, 'problem');
                  if (flagSet.has(behindId))  return cellTint(behindId, 'problem');
                  if (flagSet.has(aheadId))   return cellTint(aheadId, 'opportunity');
                  return '';
                };
                const pickupCellBadge = (zeroId, behindId, aheadId) => {
                  if (flagSet.has(zeroId))    return cellBadge(zeroId, 'problem');
                  if (flagSet.has(behindId))  return cellBadge(behindId, 'problem');
                  if (flagSet.has(aheadId))   return cellBadge(aheadId, 'opportunity');
                  return null;
                };

                return (
                  <tr
                    key={m.iso}
                    className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/50' : 'bg-white'} ${isPast ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-2 font-medium text-stone-900">{m.label}</td>
                    <td className="text-right px-3 py-2 mono text-stone-700">
                      {isPast ? <span className="text-stone-400">closed</span> : `${dba}d`}
                    </td>
                    <td className="text-right px-3 py-2 mono text-stone-900">{fmtMoney(revenueValue(m))}</td>
                    <td className={`text-right px-3 py-2 mono ${cellTint('rev-low') || 'text-stone-700'}`}>
                      {(() => {
                        // Rev gap = TY Rental Revenue − STLY Rental Revenue.
                        // Shown for every month that has both values; rendered as
                        // — when STLY data is unavailable. The cellTint('rev-low')
                        // above tints the cell red when the rev-low flag fires
                        // (gap ≤ −5% of STLY).
                        const ty = num(m.rentalRevenue);
                        const ly = num(m.rentalRevenueSTLY);
                        if (ty == null || ly == null) return <span className="text-stone-300">—</span>;
                        const gap = ty - ly;
                        const sign = gap >= 0 ? '+$' : '−$';
                        const abs = Math.abs(Math.round(gap)).toLocaleString('en-US');
                        const pct = ly > 0 ? ((gap / ly) * 100) : null;
                        // Coloring: when the rev-low flag fires, cellTint already
                        // applies the rose theme; otherwise green for positive,
                        // muted stone for slightly negative (within threshold).
                        const isFlagged = flagSet.has('rev-low');
                        const colorCls = isFlagged ? '' : (gap >= 0 ? 'text-emerald-700 font-medium' : 'text-stone-700');
                        return (
                          <span className={colorCls}>
                            {gap === 0 ? '$0' : `${sign}${abs}`}
                            {pct != null && (
                              <span className="text-[9px] ml-1 opacity-60">
                                ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                              </span>
                            )}
                            {cellBadge('rev-low')}
                          </span>
                        );
                      })()}
                    </td>
                    <td className={`text-right px-3 py-2 mono ${
                      !havePriorForDiff ? 'text-stone-300 italic' :
                      p1dRaw == null ? 'text-stone-300' :
                      p1dRaw > 0 ? 'text-emerald-700 font-medium' :
                      p1dRaw < 0 ? 'text-rose-700 font-medium' : 'text-stone-500'
                    }`}>{p1dDisplay}</td>
                    <td className={`text-right px-3 py-2 mono ${pickupCellTint('pickup3d-zero', 'pickup3d-behind', 'pickup3d-ahead') || (m.pickup3d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')}`}>
                      <span>{fmtMoney(m.pickup3d)}</span>{pickupCellBadge('pickup3d-zero', 'pickup3d-behind', 'pickup3d-ahead')}
                    </td>
                    <td className={`text-right px-3 py-2 mono ${pickupCellTint('pickup7d-zero', 'pickup7d-behind', 'pickup7d-ahead') || (m.pickup7d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')}`}>
                      <span>{fmtMoney(m.pickup7d)}</span>{pickupCellBadge('pickup7d-zero', 'pickup7d-behind', 'pickup7d-ahead')}
                    </td>
                    <td className={`text-right px-3 py-2 mono ${cellTint('adr-low') || 'text-stone-700'}`}>
                      <span>{fmtMoney(m.rentalADR)}</span>{cellBadge('adr-low')}
                    </td>
                    <td className={`text-right px-3 py-2 mono ${
                      cellTint('occ-high', 'opportunity') || cellTint('occ-low') || 'text-stone-700'
                    }`}>
                      <span>{fmtPct(m.occupancy)}</span>
                      {cellBadge('occ-high', 'opportunity')}
                      {cellBadge('occ-low')}
                    </td>
                    <td className={`text-right px-3 py-2 mono ${cellTint('revpar-low') || 'text-stone-700'}`}>
                      <span>{fmtMoney(m.rentalRevPAR)}</span>{cellBadge('revpar-low')}
                    </td>
                    {segment === 'all' && (
                      <td className="text-right px-3 py-2 mono text-stone-600">{fmtPct(m.goalPct)}</td>
                    )}
                    <td className="px-3 py-2">
                      {flags.length === 0 ? (
                        <span className="text-[10px] text-stone-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {flags.map(f => (
                            <span
                              key={f.id}
                              title={f.detail}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-sm border ${
                                f.severity === 'opportunity'
                                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                                  : 'bg-rose-50 border-rose-300 text-rose-900'
                              }`}
                            >
                              {f.severity === 'opportunity'
                                ? <Sparkles className="w-2.5 h-2.5" />
                                : <Flag className="w-2.5 h-2.5" />}
                              {f.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-stone-700 bg-stone-100 font-semibold">
                <td className="px-3 py-2 text-stone-900">Total ({months.length} months)</td>
                <td className="text-right px-3 py-2 mono text-stone-500">—</td>
                <td className="text-right px-3 py-2 mono text-stone-900">{fmtMoney(totals.rentalRevenue)}</td>
                <td className={`text-right px-3 py-2 mono ${
                  !havePriorForDiff ? 'text-stone-300 italic' :
                  totals.pickup1d > 0 ? 'text-emerald-700' :
                  totals.pickup1d < 0 ? 'text-rose-700' : 'text-stone-500'
                }`}>
                  {havePriorForDiff ? (fmtPickup1d(totals.pickup1d) ?? '—') : 'N/A'}
                </td>
                <td className="text-right px-3 py-2 mono text-stone-900">{fmtMoney(totals.pickup3d)}</td>
                <td className="text-right px-3 py-2 mono text-stone-900">{fmtMoney(totals.pickup7d)}</td>
                <td className="text-right px-3 py-2 mono text-stone-500">—</td>
                <td className="text-right px-3 py-2 mono text-stone-500">—</td>
                <td className="text-right px-3 py-2 mono text-stone-500">—</td>
                {segment === 'all' && (
                  <td
                    className="text-right px-3 py-2 mono text-stone-400"
                    title="Per-month Goal % is PriceLabs' Total Revenue Goal Completion. Aggregating across months would mix Rental Revenue (numerator) with Total Revenue Goal (denominator); see per-month values instead."
                  >—</td>
                )}
                <td className="px-3 py-2">
                  {flagSummary.problems === 0 && flagSummary.opportunities === 0 ? (
                    <span className="text-[10px] text-stone-400">No flags</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {flagSummary.problems > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 border border-rose-300 text-rose-900 rounded-sm">
                          <Flag className="w-2.5 h-2.5" /> {flagSummary.problems} problem{flagSummary.problems === 1 ? '' : 's'}
                        </span>
                      )}
                      {flagSummary.opportunities > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 rounded-sm">
                          <Sparkles className="w-2.5 h-2.5" /> {flagSummary.opportunities} opp{flagSummary.opportunities === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}
      </>
      )}
    </div>
  );
}

function LevelEditor({ level, dayData, onUpdate, onSetStatus, isReadOnly, portfolioData, onUpdatePortfolio, selectedISO, onInvestigate, levelReport, onUpdateLevelReport, buildingReport, onParseNotes, dismissedFlags, setDismissedFlags }) {
  const data = dayData?.[level.id] || { status: null, fields: {}, notes: '' };

  return (
    <div className="border border-stone-300 rounded-sm bg-white">
      {/* Portfolio: full segment-aware panel */}
      {level.isReportDriven && (
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50/30">
          <PortfolioReportPanel
            portfolioData={portfolioData || {}}
            onUpdate={onUpdatePortfolio}
            isReadOnly={isReadOnly}
            selectedISO={selectedISO}
            onInvestigate={onInvestigate}
            buildingReport={buildingReport}
            dismissedFlags={dismissedFlags}
            setDismissedFlags={setDismissedFlags}
          />
        </div>
      )}

      {/* Building / Season / Listing: simple single-report upload */}
      {level.acceptsReport && (
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50/30">
          <SimpleReportPanel
            levelLabel={level.title}
            levelHint={level.reportHint}
            todayReport={levelReport?.todayReport}
            priorReport={levelReport?.priorReport}
            priorDate={levelReport?.priorDate}
            onUpload={onUpdateLevelReport}
            onClear={() => onUpdateLevelReport(null)}
            isReadOnly={isReadOnly}
            selectedISO={selectedISO}
            onInvestigate={onInvestigate}
            segmentLabel={level.title}
            dismissedFlags={dismissedFlags}
            setDismissedFlags={setDismissedFlags}
          />
        </div>
      )}

      {/* Field grid for non-report-driven levels (and for the secondary fields on report-accepting levels) */}
      {!level.isReportDriven && (
        <div className="px-5 py-4 border-b border-stone-200 grid grid-cols-1 md:grid-cols-2 gap-3">
          {level.fields.map(f => (
            <div key={f.key}>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  value={data.fields[f.key] || ''}
                  onChange={(e) => !isReadOnly && onUpdate(level.id, 'fields', { ...data.fields, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  disabled={isReadOnly}
                  className={`w-full px-2.5 py-1.5 text-[12px] border border-stone-300 focus:outline-none focus:border-emerald-700 rounded-sm placeholder-stone-300 resize-none ${isReadOnly ? 'bg-stone-50 text-stone-500' : 'bg-white text-stone-800'}`}
                  rows={2}
                  style={{ fontFamily: 'inherit' }}
                />
              ) : (
                <input
                  type="text"
                  value={data.fields[f.key] || ''}
                  onChange={(e) => !isReadOnly && onUpdate(level.id, 'fields', { ...data.fields, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  disabled={isReadOnly}
                  className={`w-full px-2.5 py-1.5 text-[12px] border border-stone-300 focus:outline-none focus:border-emerald-700 rounded-sm placeholder-stone-300 ${isReadOnly ? 'bg-stone-50 text-stone-500' : 'bg-white text-stone-800'}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Free notes */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] uppercase tracking-wider text-stone-500">Notes</label>
          {!isReadOnly && (
            <button
              onClick={() => onParseNotes?.()}
              className="px-2.5 py-1 text-[11px] font-medium bg-emerald-700 text-white hover:bg-emerald-800 transition-colors flex items-center gap-1.5 rounded-sm"
              title="Parse funnel notes into action log rows"
            >
              <Sparkles className="w-3 h-3" /> Parse notes → actions
            </button>
          )}
        </div>
        <textarea
          value={data.notes || ''}
          onChange={(e) => !isReadOnly && onUpdate(level.id, 'notes', e.target.value)}
          placeholder="Free-form observations for this level today…"
          disabled={isReadOnly}
          className={`w-full px-2.5 py-1.5 text-[12px] border border-stone-300 focus:outline-none focus:border-emerald-700 rounded-sm placeholder-stone-300 resize-y ${isReadOnly ? 'bg-stone-50 text-stone-500' : 'bg-white text-stone-800'}`}
          rows={2}
          style={{ fontFamily: 'inherit', minHeight: 50 }}
        />
      </div>

      {/* Flag for next level button */}
      {!isReadOnly && data.status === 'flagged' && level.num < FUNNEL_LEVELS.length && FUNNEL_LEVELS[level.num] && (
        <div className="px-5 py-3 border-t border-stone-200 bg-amber-50/60 text-[12px] text-amber-900 flex items-center gap-2">
          <Flag className="w-3.5 h-3.5 shrink-0" />
          <span>Flagged at {level.title}. Drill down to <strong>{FUNNEL_LEVELS[level.num].title}</strong> next.</span>
        </div>
      )}
    </div>
  );
}

function FunnelView({ funnel, setFunnel, portfolioReports, setPortfolioReports, rows, setRows, loaded, dismissedFlags, setDismissedFlags }) {
  const [selectedISO, setSelectedISO] = useState(todayISO());
  const [openLevelId, setOpenLevelId] = useState('portfolio');
  const [view, setView] = useState('today'); // 'today' | 'history'
  const [confirmCopyForward, setConfirmCopyForward] = useState(null); // ISO of source day or null
  const [parseModalOpen, setParseModalOpen] = useState(false);
  // Track segments explicitly cleared by the user — prevents fallback from re-showing them
  const [clearedSegments, setClearedSegments] = useState<Set<string>>(new Set());

  // Convert AI-proposed actions into action log rows and prepend them
  // WHY prepend: most-recent-first matches the action log's existing default ordering
  const acceptParsedActions = useCallback((proposed) => {
    if (!proposed || proposed.length === 0) return;
    const newRows = proposed.map(p => ({
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: p.date || todayMDY(),
      owner: p.owner || 'Liuba',
      reason: p.reason || '',
      affectedGroup: p.affectedGroup || '',
      affectedDates: p.affectedDates || '',
      action: p.action || '',
      valueBefore: p.valueBefore || '',
      valueAfter: p.valueAfter || '',
      notes: p.notes || '',
      checkDone: false,
    }));
    setRows(prev => [...newRows, ...prev]);
  }, [setRows]);

  // Brief toast shown after Investigate is clicked, so the user knows the row
  // was added (since they're on the funnel tab, not the action log)
  const [investigateToast, setInvestigateToast] = useState(null);

  // Auto-create an Action Log row from a flagged month + segment.
  // WHY immediate (no preview): per spec — investigation rows are routine
  // follow-ups, not one-off pricing actions, so the friction of a confirmation
  // step would slow down the daily review without adding value. The user can
  // still edit or delete the row in the Action Log if needed.
  const onInvestigate = useCallback(({ segmentLabel, monthLabel, dba, flags }) => {
    const problems = flags.filter(f => f.severity === 'problem');
    const opportunities = flags.filter(f => f.severity === 'opportunity');
    const flagListText = flags.map(f => `${f.label} (${f.detail})`).join('; ');
    const primaryFlag = flags[0];
    const investigationKind = problems.length > 0 ? 'Investigate problem' : 'Investigate opportunity';

    const newRow = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: todayMDY(),
      owner: 'Liuba',
      reason: `Auto-flag triggered: ${flagListText}`,
      affectedGroup: segmentLabel,
      affectedDates: `${monthLabel} (${dba}d to end of month)`,
      action: `${investigationKind}: ${primaryFlag?.label || 'flagged metric'}`,
      valueBefore: '',
      valueAfter: '',
      notes: `From Portfolio funnel · auto-flag · ${problems.length} problem${problems.length === 1 ? '' : 's'}, ${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'}`,
      checkDone: false,
    };
    setRows(prev => [newRow, ...prev]);
    setInvestigateToast(`Added "${monthLabel}" investigation to Action Log`);
    setTimeout(() => setInvestigateToast(null), 3000);
  }, [setRows]);

  const isToday = selectedISO === todayISO();
  const isReadOnly = !isToday; // historical days are view-only

  // Get day data, default to blank
  const dayData = funnel[selectedISO] || blankDayData();

  // Update a level's field-bag or notes
  const updateLevel = useCallback((levelId, key, value) => {
    setFunnel(prev => {
      const day = prev[selectedISO] || blankDayData();
      const level = day[levelId] || { status: null, fields: {}, notes: '' };
      return {
        ...prev,
        [selectedISO]: {
          ...day,
          [levelId]: { ...level, [key]: value },
        },
      };
    });
  }, [selectedISO, setFunnel]);

  const setLevelStatus = useCallback((levelId, status) => {
    updateLevel(levelId, 'status', status);
  }, [updateLevel]);

  // Portfolio reports come from the global archive, indexed by calendar date.
  // For the currently-selected funnel day, we look up:
  //   today's report  = portfolioReports[selectedISO][segment]
  //   prior report    = portfolioReports[<most-recent-prior-date>][segment]
  // WHY this shape: each calendar date holds one report per segment. Today's
  // upload is automatically tomorrow's "yesterday's" — no re-uploading.
  const updatePortfolio = useCallback((segment, kind, parsed) => {
    // kind is always 'todayReport' (we no longer accept manual prior uploads).
    // 'parsed === null' means clear today's report for this segment.
    if (parsed === null) {
      // Mark as explicitly cleared so buildLookup won't fall back to prior
      setClearedSegments(prev => new Set([...prev, `${selectedISO}:${segment}`]));
    } else {
      // Uploading new data removes the cleared flag
      setClearedSegments(prev => {
        const next = new Set(prev);
        next.delete(`${selectedISO}:${segment}`);
        return next;
      });
    }
    setPortfolioReports(prev => {
      const dayReports = { ...(prev[selectedISO] || {}) };
      if (parsed === null) {
        delete dayReports[segment];
      } else {
        dayReports[segment] = parsed;
      }
      const next = { ...prev };
      if (Object.keys(dayReports).length === 0) {
        delete next[selectedISO];
      } else {
        next[selectedISO] = dayReports;
      }
      return next;
    });
  }, [selectedISO, setPortfolioReports]);

  // Sorted history (most recent first), excluding today
  // History includes days from both funnel state and portfolio reports
  const historyDays = [...new Set([
    ...Object.keys(funnel),
    ...Object.keys(portfolioReports),
  ])].filter(d => d !== todayISO() && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();

  // Quick day-summary for history list
  const summarizeDay = (iso) => {
    const day = funnel[iso] || {};
    const counts = { reviewed: 0, flagged: 0, action: 0 };
    FUNNEL_LEVELS.forEach(L => {
      const s = day[L.id]?.status;
      if (s && counts[s] !== undefined) counts[s]++;
    });
    const touched = counts.reviewed + counts.flagged + counts.action;
    // Count reports uploaded for this date
    const dayReports = portfolioReports[iso] || {};
    const reportSegments = Object.keys(dayReports).filter(k => dayReports[k]);
    return { ...counts, touched, reportSegments };
  };

  // Copy a past day's content forward to today
  const copyForwardToToday = (sourceISO) => {
    const source = funnel[sourceISO];
    if (!source) return;
    setFunnel(prev => ({
      ...prev,
      [todayISO()]: JSON.parse(JSON.stringify(source)), // deep clone
    }));
    setSelectedISO(todayISO());
    setView('today');
    setConfirmCopyForward(null);
  };

  // Reset today (after confirmation)
  const resetToday = () => {
    if (!confirm("Reset today's funnel? All inputs and statuses for today will be cleared.")) return;
    setFunnel(prev => {
      const { [todayISO()]: _, ...rest } = prev;
      return rest;
    });
  };

  if (!loaded) {
    return (
      <div className="text-stone-400 text-sm py-12 text-center">Loading funnel…</div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-6">
      {/* Sub-tab nav: Today vs History */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-px bg-stone-200 border border-stone-200 rounded-sm">
          <button
            onClick={() => { setView('today'); setSelectedISO(todayISO()); }}
            className={`px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
              view === 'today' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
          >
            Today · {isoToMDY(todayISO())}
          </button>
          <button
            onClick={() => setView('history')}
            className={`px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
              view === 'history' ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
          >
            <History className="w-3 h-3" /> History · {historyDays.length}
          </button>
        </div>
        {view === 'today' && (
          <div className="flex items-center gap-2">
            {Object.keys(dayData).some(k => dayData[k]?.status || Object.keys(dayData[k]?.fields || {}).length > 0 || dayData[k]?.notes) && (
              <button
                onClick={resetToday}
                className="text-[11px] text-stone-500 hover:text-rose-700 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Reset today
              </button>
            )}
          </div>
        )}
      </div>

      {/* HISTORY VIEW */}
      {view === 'history' && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3">
            Past funnel days · most recent first
          </div>
          {historyDays.length === 0 ? (
            <div className="border border-stone-200 bg-stone-50 rounded-sm px-6 py-12 text-center text-stone-500 text-sm">
              No past days yet. Once you complete today's funnel and a new day rolls over, history will appear here.
            </div>
          ) : (
            <div className="border border-stone-200 bg-white rounded-sm divide-y divide-stone-100">
              {historyDays.map(iso => {
                const summary = summarizeDay(iso);
                return (
                  <div key={iso} className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50/60 transition-colors">
                    <div className="shrink-0 w-24">
                      <div className="text-[13px] font-medium text-stone-900 mono">{isoToMDY(iso)}</div>
                      <div className="text-[10px] text-stone-400">{new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    </div>
                    <div className="flex-1 flex items-center gap-3 text-[11px] mono">
                      {summary.reportSegments.length > 0 ? (
                        <span className="text-emerald-700 inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          {summary.reportSegments.length} report{summary.reportSegments.length === 1 ? '' : 's'}
                          <span className="text-stone-400 text-[10px]">({summary.reportSegments.join(', ')})</span>
                        </span>
                      ) : (
                        <span className="text-stone-400">no reports</span>
                      )}
                      {summary.reviewed > 0 && (
                        <span className="inline-flex items-center gap-1 text-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> {summary.reviewed} OK
                        </span>
                      )}
                      {summary.flagged > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" /> {summary.flagged} flagged
                        </span>
                      )}
                      {summary.action > 0 && (
                        <span className="inline-flex items-center gap-1 text-rose-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" /> {summary.action} action
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedISO(iso); setView('today'); }}
                        className="text-[11px] text-stone-700 hover:text-stone-900 underline underline-offset-2 decoration-dotted"
                      >
                        View
                      </button>
                      <button
                        onClick={() => setConfirmCopyForward(iso)}
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 underline underline-offset-2 decoration-dotted"
                      >
                        Copy to today
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Copy-forward confirmation */}
          {confirmCopyForward && (
            <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setConfirmCopyForward(null)}>
              <div className="bg-white border border-stone-200 rounded-sm max-w-md p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="text-[14px] font-semibold text-stone-900 mb-2">
                  Copy {isoToMDY(confirmCopyForward)} to today?
                </div>
                <div className="text-[12px] text-stone-600 mb-4 leading-relaxed">
                  This will overwrite any existing funnel data for today ({isoToMDY(todayISO())}). Use this when today is a continuation of a past day's review.
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirmCopyForward(null)} className="px-3 py-1.5 text-[12px] text-stone-600 hover:text-stone-900">Cancel</button>
                  <button
                    onClick={() => copyForwardToToday(confirmCopyForward)}
                    className="px-3 py-1.5 text-[12px] font-medium bg-emerald-700 text-white hover:bg-emerald-800 rounded-sm"
                  >
                    Copy forward
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TODAY / SELECTED-DAY VIEW */}
      {view === 'today' && (
        <>
          {/* Read-only banner if viewing past day */}
          {isReadOnly && (
            <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[12px] text-amber-900">
                <Calendar className="w-3.5 h-3.5" />
                <span>Viewing <strong>{isoToMDY(selectedISO)}</strong> — read-only. Switch back to today to edit.</span>
              </div>
              <button
                onClick={() => setSelectedISO(todayISO())}
                className="text-[11px] font-medium text-amber-900 hover:text-amber-700 underline underline-offset-2"
              >
                Back to today
              </button>
            </div>
          )}

          {/* Funnel diagram, reference table, and per-level navigation removed.
              Sub-tabs at the Portfolio level (All, PH, Excl PH, Building, Listing)
              now serve as the funnel steps. The Portfolio LevelEditor renders
              directly here as the only level. Other funnel levels' data
              (Segment notes, Building/Listing fields) is preserved in storage
              but not rendered. */}

          {/* Selected level editor — always Portfolio */}
          <div>
            {FUNNEL_LEVELS.filter(L => L.id === 'portfolio').map(L => {
              // Build segment + drill-down lookup for the Portfolio level.
              // Each entry shape: { todayReport, priorReport, priorDate }.
              const portfolioLookup = {};
              if (L.isReportDriven) {
                const buildLookup = (segId) => {
                  const todayReport = portfolioReports[selectedISO]?.[segId] || null;
                  const priorDate = findPriorReportDate(portfolioReports, selectedISO, segId);
                  const priorReport = priorDate ? portfolioReports[priorDate][segId] : null;
                  // When no report for selectedISO, shift: use most recent as "today"
                  // and find a second-prior for the diff so 1-day pickup works.
                  // BUT skip if user explicitly cleared this segment — respect the clear.
                  const wasCleared = clearedSegments.has(`${selectedISO}:${segId}`);
                  if (!todayReport && priorReport && priorDate && !wasCleared) {
                    const secondPriorDate = findPriorReportDate(portfolioReports, priorDate, segId);
                    const secondPrior = secondPriorDate ? portfolioReports[secondPriorDate][segId] : null;
                    return { todayReport: priorReport, priorReport: secondPrior, priorDate: secondPriorDate };
                  }
                  return { todayReport, priorReport, priorDate };
                };
                PORTFOLIO_SEGMENTS.forEach(s => { portfolioLookup[s.id] = buildLookup(s.id); });
                PORTFOLIO_DRILLDOWNS.forEach(s => { portfolioLookup[s.id] = buildLookup(s.id); });
              }
              // Building report for cross-referencing at Portfolio level
              // (used to show "which buildings are pulling this segment down/up").
              // Fall back to the most recent prior building report if today's isn't uploaded yet.
              const buildingReportToday = portfolioReports[selectedISO]?.['building']
                || (() => {
                  const priorDate = findPriorReportDate(portfolioReports, selectedISO, 'building');
                  return priorDate ? portfolioReports[priorDate]['building'] : null;
                })();
              return (
                <LevelEditor
                  key={L.id}
                  level={L}
                  dayData={dayData}
                  onUpdate={updateLevel}
                  onSetStatus={setLevelStatus}
                  isReadOnly={isReadOnly}
                  portfolioData={portfolioLookup}
                  onUpdatePortfolio={updatePortfolio}
                  selectedISO={selectedISO}
                  onInvestigate={onInvestigate}
                  levelReport={null}
                  onUpdateLevelReport={null}
                  buildingReport={buildingReportToday}
                  onParseNotes={() => setParseModalOpen(true)}
                  dismissedFlags={dismissedFlags}
                  setDismissedFlags={setDismissedFlags}
                />
              );
            })}
          </div>

          {/* Footer note */}
          <div className="mt-8 pt-5 border-t border-stone-200 text-[11px] text-stone-500 leading-relaxed max-w-2xl">
            <span className="text-stone-700 font-medium">How this works.</span> Funnel data saves automatically per day; switch to History to review past days or copy a day's setup forward. The sub-tabs above (All, PH, Excl PH, Building, Listing) cover the levels of the daily review funnel — start at All, drill into PH/Excl PH if a segment is flagged, then into Building or Listing if you need to act on specific inventory.
            <br />
            <span className="text-stone-700 font-medium">Parse notes → actions:</span> use the button in the Notes section to have Claude scan your funnel notes and propose action log rows. You preview and pick which to add.
          </div>
        </>
      )}

      {/* Parse Notes modal */}
      {parseModalOpen && (
        <ParseNotesModal
          funnel={funnel}
          selectedISO={selectedISO}
          currentLevelId={openLevelId}
          existingRows={rows}
          onClose={() => setParseModalOpen(false)}
          onAccept={acceptParsedActions}
        />
      )}

      {/* Investigate toast — bottom-right confirmation when a flag is logged */}
      {investigateToast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-stone-900 text-white px-4 py-3 rounded-sm shadow-2xl border border-stone-700 flex items-center gap-2 text-[12px] animate-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{investigateToast}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- State Cell + Modal ---------- */

function StateCell({ rowId, side, capture, onAdd, onClick, onRemove }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) onAdd(rowId, side, e.dataTransfer.files[0]);
  };

  if (!capture) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative ${dragOver ? 'ring-1 ring-emerald-500 bg-emerald-50/40' : ''}`}
      >
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-12 border border-dashed border-stone-300 hover:border-stone-500 hover:bg-stone-50 text-stone-400 hover:text-stone-700 rounded-sm flex items-center justify-center gap-1 transition-colors"
          title={`Add ${side} state (image or CSV)`}
        >
          <ImagePlus className="w-3.5 h-3.5" />
          <span className="text-[10px] uppercase tracking-wider">Add</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onAdd(rowId, side, f);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  // Status indicator
  const status = capture.extractionStatus;
  const metrics = capture.metrics;

  return (
    <div className="relative group">
      <button
        onClick={() => onClick(rowId, side)}
        className="w-full h-12 border border-stone-300 hover:border-stone-600 rounded-sm overflow-hidden bg-white flex items-stretch text-left transition-colors"
      >
        {/* Thumbnail (image) or icon (csv) */}
        {capture.kind === 'image' ? (
          <div className="w-12 h-12 shrink-0 bg-stone-100 overflow-hidden border-r border-stone-200">
            <img src={capture.dataUrl} alt={capture.source} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-12 h-12 shrink-0 bg-stone-100 border-r border-stone-200 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
          </div>
        )}
        {/* Mini metrics or status */}
        <div className="flex-1 min-w-0 px-2 py-1 flex flex-col justify-center">
          {status === 'extracting' && (
            <div className="flex items-center gap-1 text-[10px] text-stone-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Extracting…
            </div>
          )}
          {status === 'done' && metrics && (
            <>
              <div className="flex items-baseline gap-1.5 text-[10px] mono">
                <span className="text-stone-400">ADR</span>
                <span className="text-stone-900 font-medium">{formatMetric(metrics.adr, 'money')}</span>
              </div>
              <div className="flex items-baseline gap-1.5 text-[10px] mono">
                <span className="text-stone-400">Occ</span>
                <span className="text-stone-900 font-medium">{formatMetric(metrics.occupancy, 'percent')}</span>
              </div>
            </>
          )}
          {status === 'failed' && (
            <div className="flex items-center gap-1 text-[10px] text-rose-700">
              <AlertCircle className="w-3 h-3" /> Failed
            </div>
          )}
          {status === 'pending' && (
            <div className="text-[10px] text-stone-400">Queued</div>
          )}
        </div>
      </button>
      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(rowId, side); }}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-stone-900/80 hover:bg-rose-700 text-white rounded-full w-4 h-4 flex items-center justify-center transition-all"
        title="Remove"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

function StateModal({ rowId, side, capture, otherCapture, row, onClose, onRetry }) {
  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!capture) return null;

  const metrics = capture.metrics;
  const otherMetrics = otherCapture?.metrics;

  // Compute deltas if both sides exist with metrics
  const computeDelta = (key, fmt) => {
    if (!metrics || !otherMetrics) return null;
    const a = parseFloat(String(metrics[key] ?? '').replace(/[$,%\s]/g, ''));
    const b = parseFloat(String(otherMetrics[key] ?? '').replace(/[$,%\s]/g, ''));
    if (isNaN(a) || isNaN(b)) return null;
    // We're showing capture (this side); other = comparison
    // For "after", delta = after - before (this - other)
    // For "before", delta = before - after (this - other) which inverts sign
    const delta = side === 'after' ? a - b : b - a;
    const pct = b !== 0 ? (delta / Math.abs(b)) * 100 : null;
    return { delta, pct, fmt };
  };

  const sideLabel = side === 'before' ? 'State Before' : 'State After';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[55] bg-stone-900/60 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto cursor-zoom-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-stone-200 rounded-sm w-full max-w-3xl mt-8 mb-8 shadow-2xl cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-0.5">
              {sideLabel} · {row?.date} · {row?.affectedGroup || '—'}
            </div>
            <h2 className="text-base font-semibold text-stone-900">
              {row?.action || 'Action'}
            </h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-0 divide-x divide-stone-200">
          {/* Left: source (image or CSV preview) */}
          <div className="p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Source</div>
            {capture.kind === 'image' ? (
              <div className="border border-stone-200 rounded-sm overflow-hidden bg-stone-50">
                <img src={capture.dataUrl} alt={capture.source} className="w-full h-auto block" />
              </div>
            ) : (
              <div className="border border-stone-200 rounded-sm bg-stone-50 p-3 max-h-80 overflow-auto">
                <pre className="text-[10px] mono text-stone-700 whitespace-pre-wrap leading-snug">
                  {capture.csvText.slice(0, 4000)}
                  {capture.csvText.length > 4000 && '\n…(truncated)'}
                </pre>
              </div>
            )}
            <div className="mt-2 text-[10px] mono text-stone-400 truncate">
              {capture.source} · added {new Date(capture.addedAt).toLocaleString()}
            </div>
          </div>

          {/* Right: extracted metrics */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Extracted metrics</div>
              {capture.extractionStatus === 'done' && (
                <button
                  onClick={() => onRetry(rowId, side)}
                  className="text-[10px] text-stone-500 hover:text-stone-900 underline underline-offset-2 decoration-dotted"
                >
                  Re-extract
                </button>
              )}
            </div>
            {capture.extractionStatus === 'extracting' && (
              <div className="flex items-center gap-2 text-stone-500 text-sm py-8">
                <Loader2 className="w-4 h-4 animate-spin" /> Extracting metrics from {capture.kind}…
              </div>
            )}
            {capture.extractionStatus === 'failed' && (
              <div className="space-y-3">
                <div className="px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-sm flex items-start gap-2 text-[12px] text-rose-900">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Extraction failed</div>
                    <div className="text-[11px] mt-0.5 opacity-80">{capture.extractionError}</div>
                  </div>
                </div>
                <button
                  onClick={() => onRetry(rowId, side)}
                  className="px-3 py-1.5 text-[12px] font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors rounded-sm"
                >
                  Retry extraction
                </button>
              </div>
            )}
            {capture.extractionStatus === 'done' && metrics && (
              <>
                <div className="space-y-2.5">
                  {METRIC_FIELDS.map(field => {
                    const val = metrics[field.key];
                    const delta = computeDelta(field.key, field.format);
                    return (
                      <div key={field.key} className="flex items-baseline justify-between border-b border-stone-100 pb-2 last:border-b-0">
                        <span className="text-[11px] uppercase tracking-wider text-stone-500">{field.label}</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[15px] font-medium text-stone-900 mono">
                            {formatMetric(val, field.format)}
                          </span>
                          {delta && delta.delta !== 0 && (
                            <span className={`text-[10px] mono px-1.5 py-0.5 rounded-sm ${delta.delta > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                              {delta.delta > 0 ? '+' : ''}{formatMetric(Math.abs(delta.delta), field.format).replace('-', '')}
                              {delta.pct !== null && delta.pct !== Infinity && (
                                <span className="opacity-70 ml-1">({delta.delta > 0 ? '+' : '−'}{Math.abs(delta.pct).toFixed(1)}%)</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {metrics.notes && (
                  <div className="mt-3 pt-3 border-t border-stone-200">
                    <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">AI note</div>
                    <div className="text-[11px] text-stone-600 italic leading-snug">{metrics.notes}</div>
                  </div>
                )}
                {otherMetrics && (
                  <div className="mt-3 pt-3 border-t border-stone-200 text-[10px] mono text-stone-400">
                    Δ shown vs. {side === 'after' ? 'before' : 'after'} state for this action
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Screenshot UI components ---------- */

function ScreenshotTray({ shots, onAdd, onDelete, onClick, dense = false }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) onAdd(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex flex-wrap items-start gap-2 ${dragOver ? 'bg-emerald-50/60 ring-1 ring-emerald-400/60' : ''} transition-colors rounded-sm ${dense ? 'p-1' : 'p-2'}`}
    >
      {shots.map(shot => (
        <div key={shot.id} className="relative group">
          <button
            onClick={() => onClick(shot)}
            className="block border border-stone-300 hover:border-stone-600 rounded-sm overflow-hidden bg-white"
            style={{ width: dense ? 64 : 80, height: dense ? 64 : 80 }}
            title={shot.name}
          >
            <img
              src={shot.dataUrl}
              alt={shot.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </button>
          {/* Hover preview — large floating thumbnail */}
          <div
            className="hidden group-hover:block absolute z-40 left-full ml-2 top-0 bg-white border border-stone-300 shadow-2xl rounded-sm p-1 pointer-events-none"
            style={{ width: 380 }}
          >
            <img src={shot.dataUrl} alt={shot.name} className="w-full h-auto block" />
            <div className="text-[10px] mono text-stone-500 px-1 pt-1 pb-0.5 truncate">
              {shot.name} · {shot.width}×{shot.height}
            </div>
          </div>
          {/* Delete X */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(shot.id); }}
            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-stone-900/80 hover:bg-rose-700 text-white rounded-full w-4 h-4 flex items-center justify-center transition-all"
            title="Remove screenshot"
          >
            <X className="w-2.5 h-2.5" />
          </button>
          {/* Zoom indicator */}
          <div className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-stone-900/70 text-white rounded-sm px-1 py-0.5 transition-all pointer-events-none">
            <ZoomIn className="w-2.5 h-2.5" />
          </div>
        </div>
      ))}
      <button
        onClick={() => inputRef.current?.click()}
        className={`border border-dashed border-stone-300 hover:border-stone-600 hover:bg-stone-50 text-stone-400 hover:text-stone-700 rounded-sm flex flex-col items-center justify-center transition-colors`}
        style={{ width: dense ? 64 : 80, height: dense ? 64 : 80 }}
        title="Add screenshot"
      >
        <ImagePlus className={dense ? 'w-4 h-4' : 'w-5 h-5'} />
        {!dense && <span className="text-[9px] mt-0.5 uppercase tracking-wider">Add</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { onAdd(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

function Lightbox({ shot, onClose }) {
  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-stone-900/85 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
    >
      <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 bg-white text-stone-900 hover:bg-stone-200 rounded-full w-8 h-8 flex items-center justify-center shadow-lg"
        >
          <X className="w-4 h-4" />
        </button>
        <img
          src={shot.dataUrl}
          alt={shot.name}
          className="max-w-[95vw] max-h-[90vh] object-contain rounded-sm shadow-2xl"
        />
        <div className="mt-2 text-center text-[11px] text-stone-300 mono">
          {shot.name} · {shot.width}×{shot.height}
        </div>
      </div>
    </div>
  );
}

/* ---------- Parse Notes → Actions Modal ---------- */

// Build a structured payload of funnel notes for the AI to parse.
// scope = 'today' | 'level' | 'all'
// For 'today': all levels in selectedISO
// For 'level':  one level in selectedISO
// For 'all':    all levels in all funnel days
const collectNotesForParsing = (funnel, scope, selectedISO, levelId, portfolioReports) => {
  const sections = [];

  const collectDay = (iso, restrictLevel = null) => {
    const day = funnel[iso];
    if (!day) return;
    FUNNEL_LEVELS.forEach(L => {
      if (restrictLevel && L.id !== restrictLevel) return;
      const lvl = day[L.id];
      if (!lvl) return;
      const parts = [];
      if (lvl.status) parts.push(`Status: ${lvl.status}`);
      // Field values
      if (lvl.fields) {
        Object.entries(lvl.fields).forEach(([k, v]) => {
          if (v && String(v).trim()) {
            const fieldDef = L.fields.find(f => f.key === k);
            const label = fieldDef?.label || k;
            parts.push(`${label}: ${String(v).trim()}`);
          }
        });
      }
      if (lvl.notes && lvl.notes.trim()) {
        parts.push(`Free notes: ${lvl.notes.trim()}`);
      }
      if (parts.length === 0) return;
      sections.push({
        date: isoToMDY(iso),
        levelTitle: L.title,
        levelId: L.id,
        body: parts.join('\n'),
      });
    });
  };

  if (scope === 'all') {
    Object.keys(funnel).sort().forEach(iso => collectDay(iso));
  } else if (scope === 'today') {
    collectDay(selectedISO);
  } else if (scope === 'level') {
    collectDay(selectedISO, levelId);
  }

  return sections;
};

// Call AI to parse notes into structured action proposals.
// Returns array of { date, owner, reason, affectedGroup, affectedDates, action, valueBefore, valueAfter, notes, sourceLevel, sourceDate }
const parseNotesIntoActions = async (sections, existingRows) => {
  if (sections.length === 0) {
    return { actions: [], summary: 'No notes to parse.' };
  }

  // Build compact existing-rows summary for dedup
  const existingSummary = existingRows.length === 0
    ? '(no existing action rows)'
    : existingRows.slice(0, 50).map((r, i) =>
        `[${i + 1}] ${r.date} · ${r.action || '?'} · ${r.affectedGroup || '?'} · ${r.affectedDates || '?'}`
      ).join('\n');

  const sectionsText = sections.map(s =>
    `--- ${s.date} · ${s.levelTitle} ---\n${s.body}`
  ).join('\n\n');

  const prompt = `You're helping a Chicago downtown luxury STR revenue manager turn their funnel notes into structured action log rows.

PORTFOLIO CONTEXT:
- ~90 units across 12 buildings (60, 160, 215, 365, 730, 747, 833, 1000, 1044, 1125, 1475)
- Three segments: 2BR, 3BR, Penthouse (PH). PH is treated separately.
- Tools: PriceLabs (DBA-based dynamic pricing), Guesty (PMS).
- Common actions: Demand Factor changes, DOW Adjustments, Date-Specific Overrides (added/removed), 3/7-day OG (orphan) discounts, base price changes, OBA/PBA profile switches.

EXISTING ACTION LOG ROWS (to avoid duplicating):
${existingSummary}

FUNNEL NOTES TO PARSE:
${sectionsText}

Extract every distinct concrete action from these notes. Return ONLY valid JSON in this shape (no markdown fences, no preamble):

{
  "actions": [
    {
      "date": "MM/DD/YYYY",
      "owner": "Liuba",
      "reason": "<short explanation of WHY — one sentence>",
      "affectedGroup": "<Account / building # / listing prefix / PH / Excl PH>",
      "affectedDates": "<All / specific date range / month name>",
      "action": "<concise action name like 'Demand Factor chng', 'Override added 10%', 'DOW Adj weekends'>",
      "valueBefore": "<value or empty>",
      "valueAfter": "<value or empty>",
      "notes": "<source context: which level, which note>",
      "isDuplicate": false
    }
  ],
  "summary": "<one-sentence overall: how many actions found, anything ambiguous>"
}

EXTRACTION RULES:
- Only extract CONCRETE actions taken or to be taken. Do NOT extract observations, hypotheses, or status notes ("pickup is soft" is not an action; "added 10% discount because pickup is soft" is).
- One action per row. If a note describes multiple changes, split into multiple rows.
- Use the date the action was taken — usually the funnel date the note was written on. If the note explicitly says "yesterday" or "tomorrow," adjust.
- Mark "isDuplicate": true if the action plausibly matches an existing row in the log (same date ± action ± group). Be conservative — only mark dup if confident.
- If a note is purely an observation with no action, just skip it. Don't pad the output.
- Actions should be specific. "Reviewed pricing" is too vague. "Lowered weekend demand factor on building 833" is good.
- For "affectedDates": use what the note says ("All" if unspecified, "Jun 26-27" for ranges, "July weekends" if pattern).
- "valueBefore" / "valueAfter" only when explicit (e.g., "from Mod Aggressive to Recommended" → before: "Mod Aggressive", after: "Recommended"). Empty otherwise.

Return strictly valid JSON. If no actions found, return {"actions": [], "summary": "No concrete actions found in notes."}.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API ${response.status}: ${errText.slice(0, 150)}`);
  }
  const data = await response.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Could not parse AI response as JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.actions)) parsed.actions = [];
  return parsed;
};

function ParseNotesModal({ funnel, selectedISO, currentLevelId, existingRows, onClose, onAccept }) {
  const [scope, setScope] = useState('today');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [proposals, setProposals] = useState(null); // { actions: [...], summary: '...' }
  const [selected, setSelected] = useState({}); // { proposalIndex: bool }

  const currentLevelTitle = FUNNEL_LEVELS.find(L => L.id === currentLevelId)?.title || 'level';

  const runParse = async () => {
    setParsing(true);
    setError(null);
    setProposals(null);
    try {
      const sections = collectNotesForParsing(funnel, scope, selectedISO, currentLevelId);
      if (sections.length === 0) {
        setError('No notes found in the selected scope. Add some funnel notes first.');
        setParsing(false);
        return;
      }
      const result = await parseNotesIntoActions(sections, existingRows);
      setProposals(result);
      // Default-select all non-duplicates
      const initialSel = {};
      result.actions.forEach((a, i) => { initialSel[i] = !a.isDuplicate; });
      setSelected(initialSel);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Parse failed');
    }
    setParsing(false);
  };

  const acceptSelected = () => {
    if (!proposals) return;
    const toAdd = proposals.actions.filter((_, i) => selected[i]);
    onAccept(toAdd);
    onClose();
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const totalProposed = proposals?.actions?.length || 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[55] bg-stone-900/40 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-stone-200 rounded-sm w-full max-w-3xl mt-8 mb-8 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-stone-900">Parse notes → action log</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scope picker */}
        <div className="px-6 py-4 border-b border-stone-200 bg-stone-50/40">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Scope</div>
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { id: 'today', label: `Today (${isoToMDY(selectedISO)})`, hint: 'all levels for the selected day' },
              { id: 'level', label: `This level (${currentLevelTitle})`, hint: 'just one level on the selected day' },
              { id: 'all', label: 'All days', hint: 'every funnel day in storage' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => { setScope(opt.id); setProposals(null); }}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-sm border transition-colors ${
                  scope === opt.id
                    ? 'bg-stone-900 border-stone-900 text-white'
                    : 'bg-white border-stone-300 text-stone-700 hover:border-stone-500'
                }`}
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 min-h-[200px]">
          {!proposals && !parsing && !error && (
            <div className="text-stone-400 text-sm italic py-8 text-center">
              Click <span className="font-medium text-stone-700">Parse</span> to extract actions from the notes in scope.
            </div>
          )}

          {parsing && (
            <div className="flex items-center gap-2 text-stone-500 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
              Reading notes and extracting actions…
            </div>
          )}

          {error && (
            <div className="px-3 py-2.5 bg-rose-50 border border-rose-200 text-[12px] text-rose-900 rounded-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Couldn't parse notes</div>
                <div className="text-[11px] mt-0.5 opacity-80">{error}</div>
              </div>
            </div>
          )}

          {proposals && (
            <>
              <div className="mb-4 px-3 py-2 bg-emerald-50/60 border border-emerald-200 rounded-sm text-[12px] text-emerald-900">
                <span className="font-medium">{totalProposed}</span> {totalProposed === 1 ? 'action' : 'actions'} proposed.
                {proposals.summary && <span className="ml-2 opacity-80">{proposals.summary}</span>}
              </div>

              {totalProposed === 0 ? (
                <div className="text-stone-400 text-sm italic py-8 text-center">
                  No concrete actions found in the selected notes.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2 text-[11px]">
                    <span className="text-stone-500">{selectedCount} of {totalProposed} selected</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const all = {};
                          proposals.actions.forEach((_, i) => { all[i] = true; });
                          setSelected(all);
                        }}
                        className="text-stone-600 hover:text-stone-900 underline underline-offset-2 decoration-dotted"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setSelected({})}
                        className="text-stone-600 hover:text-stone-900 underline underline-offset-2 decoration-dotted"
                      >
                        Deselect all
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {proposals.actions.map((a, i) => (
                      <label
                        key={i}
                        className={`block border rounded-sm px-3 py-2.5 cursor-pointer transition-colors ${
                          a.isDuplicate
                            ? 'bg-amber-50/60 border-amber-200 hover:border-amber-300'
                            : selected[i]
                              ? 'bg-emerald-50/40 border-emerald-300'
                              : 'bg-white border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={!!selected[i]}
                            onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })}
                            className="mt-0.5 w-3.5 h-3.5 accent-emerald-700 cursor-pointer shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[12px] font-semibold text-stone-900">{a.action || '(unnamed action)'}</span>
                              <span className="text-[10px] mono text-stone-500">{a.date}</span>
                              {a.affectedGroup && (
                                <span className="text-[10px] mono px-1.5 py-0.5 bg-stone-100 text-stone-700 rounded-sm">{a.affectedGroup}</span>
                              )}
                              {a.isDuplicate && (
                                <span className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded-sm border border-amber-300">
                                  <AlertCircle className="w-2.5 h-2.5" /> Possible duplicate
                                </span>
                              )}
                            </div>
                            {a.reason && (
                              <div className="text-[11px] text-stone-700 leading-snug mb-1">
                                {a.reason}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mono text-stone-500">
                              {a.affectedDates && <span>Dates: <span className="text-stone-700">{a.affectedDates}</span></span>}
                              {(a.valueBefore || a.valueAfter) && (
                                <span>Change: <span className="text-stone-700">{a.valueBefore || '?'} → {a.valueAfter || '?'}</span></span>
                              )}
                            </div>
                            {a.notes && (
                              <div className="text-[10px] text-stone-400 italic mt-1">From: {a.notes}</div>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-stone-200 bg-stone-50/40">
          <div className="text-[10px] mono text-stone-400">
            AI-extracted · review before adding
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] text-stone-700 hover:text-stone-900 font-medium"
            >
              Cancel
            </button>
            {!proposals && (
              <button
                onClick={runParse}
                disabled={parsing}
                className="px-4 py-1.5 text-[12px] font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors flex items-center gap-1.5 rounded-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> {parsing ? 'Parsing…' : 'Parse'}
              </button>
            )}
            {proposals && totalProposed > 0 && (
              <>
                <button
                  onClick={runParse}
                  disabled={parsing}
                  className="px-3 py-1.5 text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-stone-500 disabled:opacity-50 transition-colors rounded-sm"
                >
                  Re-parse
                </button>
                <button
                  onClick={acceptSelected}
                  disabled={selectedCount === 0}
                  className="px-4 py-1.5 text-[12px] font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 rounded-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Add {selectedCount} to log
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Report Modal (AI-generated executive summary) ---------- */

function ReportModal({ rows, scratchpad, notes, screenshots, states, onClose }) {
  // Default range: earliest row date through today
  const earliestDate = (() => {
    const dates = rows.map(r => parseMDY(r.date)).filter(Boolean);
    if (dates.length === 0) return todayMDY();
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    return formatMDY(min);
  })();

  const [from, setFrom] = useState(earliestDate);
  const [to, setTo] = useState(todayMDY());
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);

  // Filter rows + notes within range
  const filteredRows = rows.filter(r => inRange(r.date, from, to));
  const filteredNotes = notes.filter(n => inRange(n.date, from, to));

  // Collect images: scratchpad shots are always relevant (general); notes shots
  // only if their note is in range.
  const imagesForRequest = (() => {
    const out = [];
    (screenshots.scratchpad || []).forEach(s => out.push({ source: 'scratchpad', shot: s }));
    filteredNotes.forEach(n => {
      const list = screenshots.byNote?.[n.id] || [];
      list.forEach(s => out.push({ source: `note ${n.date}`, shot: s }));
    });
    return out;
  })();
  // Cap at 20 images per Anthropic API request to keep payloads sane
  const cappedImages = imagesForRequest.slice(0, 20);
  const imagesTruncated = imagesForRequest.length > cappedImages.length;

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    setReport('');

    // Build a compact, structured payload for the model
    const formatStateMetrics = (capture) => {
      if (!capture || !capture.metrics) return null;
      const m = capture.metrics;
      const parts = [];
      if (m.adr != null) parts.push(`ADR ${formatMetric(m.adr, 'money')}`);
      if (m.occupancy != null) parts.push(`Occ ${formatMetric(m.occupancy, 'percent')}`);
      if (m.revenue != null) parts.push(`Rev ${formatMetric(m.revenue, 'money')}`);
      if (m.revpar != null) parts.push(`RevPAR ${formatMetric(m.revpar, 'money')}`);
      if (m.pickup3d != null) parts.push(`3d pickup ${formatMetric(m.pickup3d, 'money')}`);
      if (m.pickup7d != null) parts.push(`7d pickup ${formatMetric(m.pickup7d, 'money')}`);
      return parts.length > 0 ? parts.join(' · ') : null;
    };

    const rowsText = filteredRows.length === 0
      ? '(no logged actions in this range)'
      : filteredRows.map((r, i) => {
          const before = formatStateMetrics(states?.[r.id]?.before);
          const after = formatStateMetrics(states?.[r.id]?.after);
          const parts = [
            `[${i + 1}] ${r.date} — ${r.owner || 'unknown'}`,
            r.action ? `Action: ${r.action}` : null,
            r.affectedGroup ? `Group: ${r.affectedGroup}` : null,
            r.affectedDates ? `Dates affected: ${r.affectedDates}` : null,
            (r.valueBefore || r.valueAfter) ? `Change: ${r.valueBefore || '?'} → ${r.valueAfter || '?'}` : null,
            r.reason ? `Reason: ${r.reason}` : null,
            r.notes ? `Notes: ${r.notes}` : null,
            before ? `STATE BEFORE: ${before}` : null,
            after ? `STATE AFTER: ${after}` : null,
            r.checkDone ? 'Status: reviewed/done' : null,
          ].filter(Boolean);
          return parts.join('\n');
        }).join('\n\n---\n\n');

    const notesText = filteredNotes.length === 0
      ? '(no dated notes in this range)'
      : filteredNotes.map(n => `${n.date}: ${n.text}`).join('\n');

    const scratchText = scratchpad.trim() || '(empty)';

    const imagesNote = (includeImages && cappedImages.length > 0)
      ? `\n\nATTACHED SCREENSHOTS (${cappedImages.length}${imagesTruncated ? ', truncated from ' + imagesForRequest.length : ''}):\n` +
        cappedImages.map((img, i) => `[Image ${i + 1}] from ${img.source} — ${img.shot.name}`).join('\n') +
        `\n\nUse the screenshots to ground your summary. PriceLabs screenshots typically show base prices, occupancy charts, demand factor settings, override grids, or strategy configurations. Reference specific numbers, profile names, or visual patterns where they support your narrative.`
      : '';

    const prompt = `You are summarizing a revenue manager's pricing activity for a Chicago downtown luxury short-term rental portfolio (~90 units across 12 buildings, managed via PriceLabs). Produce a simple, scannable summary covering ${from} through ${to}.

LOGGED ACTIONS:
${rowsText}

DATED NOTES (other things done):
${notesText}

GENERAL SCRATCHPAD (running notes):
${scratchText}${imagesNote}

Write a short, plain-language summary in bullet points. Rules:

- Use simple, everyday language. No jargon, no "synthesize", no "leverage", no consultant-speak.
- Use short bullet points, one idea per bullet.
- Keep each bullet to one line where possible, two lines max.
- When STATE BEFORE and STATE AFTER metrics are present for an action, reference the actual change (e.g. "ADR went from $245 to $268, occupancy held at 78%"). Don't invent numbers — only use what's given.
- Use these four sections, each with a bold header on its own line, followed by 2–5 bullets:

**What I did**
- (group similar actions; mention scope: account / building / listing, and the % or change)

**Why**
- (the reasoning in plain words — what was the goal of these changes)

**What to watch**
- (things to check in the next few days; flag any overdue check-backs)

**Open questions**
- (anything unclear or worth raising with the team — leave empty if nothing)

Format bullets with a leading "- ". Do not use markdown headers (#). Keep the whole thing under 200 words.`;

    // Build multimodal content array if images are included
    const userContent = (includeImages && cappedImages.length > 0)
      ? [
          ...cappedImages.map(img => ({
            type: 'image',
            source: { type: 'base64', media_type: img.shot.mediaType, data: img.shot.base64 },
          })),
          { type: 'text', text: prompt },
        ]
      : prompt;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
      }
      const data = await response.json();
      const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      if (!text) throw new Error('Empty response');
      setReport(text);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to generate report');
    }
    setGenerating(false);
  };

  const copyReport = async () => {
    // Combined: log table + report
    const combined = `${buildLogTextTable(filteredRows)}\n\n${report}`;
    const ok = await copyText(combined);
    if (ok) {
      setCopied('ok');
      setTimeout(() => setCopied(false), 1800);
    } else {
      // Fallback path: offer a download so the user still gets the content
      try {
        const blob = new Blob([combined], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `summary_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setCopied('downloaded');
        setTimeout(() => setCopied(false), 2500);
      } catch (e) {
        setCopied('failed');
        setTimeout(() => setCopied(false), 2500);
      }
    }
  };

  // Render the report: bold **headers** become section titles, lines starting
  // with "- " become bullet items grouped into a list.
  const renderReport = (txt) => {
    const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
    const blocks = [];
    let currentList = null;

    const flushList = () => {
      if (currentList) {
        blocks.push({ type: 'list', items: currentList });
        currentList = null;
      }
    };

    lines.forEach((line, i) => {
      // Bold header (whole line is **...**)
      const headerMatch = line.match(/^\*\*([^*]+)\*\*:?$/);
      if (headerMatch) {
        flushList();
        blocks.push({ type: 'header', text: headerMatch[1].trim() });
        return;
      }
      // Bullet
      if (/^[-•*]\s+/.test(line)) {
        const text = line.replace(/^[-•*]\s+/, '');
        if (!currentList) currentList = [];
        currentList.push(text);
        return;
      }
      // Plain paragraph (rare with new prompt, but handle gracefully)
      flushList();
      blocks.push({ type: 'para', text: line });
    });
    flushList();

    // Inline bold renderer for any **bold** within bullets/paragraphs
    const renderInline = (text, key) => text.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <strong key={`${key}-${j}`} className="font-semibold text-stone-900">{seg.slice(2, -2)}</strong>;
      }
      return <span key={`${key}-${j}`}>{seg}</span>;
    });

    return blocks.map((b, i) => {
      if (b.type === 'header') {
        return (
          <h3 key={i} className="text-[13px] font-semibold text-stone-900 mt-4 mb-2 first:mt-0">
            {b.text}
          </h3>
        );
      }
      if (b.type === 'list') {
        return (
          <ul key={i} className="space-y-1.5 mb-3 ml-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2 text-[13px] text-stone-800 leading-relaxed">
                <span className="text-emerald-700 shrink-0 mt-0.5">•</span>
                <span>{renderInline(item, `${i}-${j}`)}</span>
              </li>
            ))}
          </ul>
        );
      }
      // paragraph
      return (
        <p key={i} className="mb-3 leading-relaxed text-stone-800 text-[13px]">
          {renderInline(b.text, `p${i}`)}
        </p>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto">
      <div className="bg-white border border-stone-200 rounded-sm w-full max-w-2xl mt-10 mb-10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-stone-900">Generate executive summary</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date range */}
        <div className="px-6 py-5 border-b border-stone-200 bg-stone-50/40">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Date range</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-stone-600 w-10">From</label>
              <input
                type="text"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="MM/DD/YYYY"
                className="px-2.5 py-1.5 text-[13px] border border-stone-300 focus:outline-none focus:border-emerald-700 rounded-sm w-32 mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-stone-600 w-6">To</label>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="MM/DD/YYYY"
                className="px-2.5 py-1.5 text-[13px] border border-stone-300 focus:outline-none focus:border-emerald-700 rounded-sm w-32 mono"
              />
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {[
                { label: 'Today', from: todayMDY(), to: todayMDY() },
                { label: 'Last 7d', from: formatMDY(addDays(new Date(), -6)), to: todayMDY() },
                { label: 'Last 30d', from: formatMDY(addDays(new Date(), -29)), to: todayMDY() },
                { label: 'All', from: earliestDate, to: todayMDY() },
              ].map(p => (
                <button
                  key={p.label}
                  onClick={() => { setFrom(p.from); setTo(p.to); }}
                  className="px-2 py-1 text-[10px] uppercase tracking-wider text-stone-600 hover:bg-stone-200 rounded-sm transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-stone-500 mono">
              {filteredRows.length} action{filteredRows.length === 1 ? '' : 's'} · {filteredNotes.length} note{filteredNotes.length === 1 ? '' : 's'} · {imagesForRequest.length} screenshot{imagesForRequest.length === 1 ? '' : 's'} in range
            </div>
            {imagesForRequest.length > 0 && (
              <label className="flex items-center gap-1.5 text-[11px] text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  className="w-3 h-3 accent-emerald-700 cursor-pointer"
                />
                Send screenshots to AI
                {imagesTruncated && includeImages && (
                  <span className="text-amber-700 mono">(first {cappedImages.length} only)</span>
                )}
              </label>
            )}
          </div>
        </div>

        {/* Output area */}
        <div className="px-6 py-5 min-h-[200px]">
          {!report && !generating && !error && (
            <div className="text-stone-400 text-sm italic py-8 text-center">
              Click <span className="font-medium text-stone-700">Generate</span> to summarize the actions, notes, and scratchpad in the selected range.
            </div>
          )}
          {generating && (
            <div className="flex items-center gap-2 text-stone-500 text-sm py-8 justify-center">
              <Sparkles className="w-4 h-4 animate-pulse text-emerald-700" />
              Generating summary…
            </div>
          )}
          {error && (
            <div className="px-3 py-2.5 bg-rose-50 border border-rose-200 text-[12px] text-rose-900 rounded-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Couldn't generate report</div>
                <div className="text-[11px] mt-0.5 opacity-80">{error}</div>
              </div>
            </div>
          )}
          {report && (
            <div className="text-stone-800">
              {/* Action log table — included in copy alongside the report */}
              {filteredRows.length > 0 && (
                <div className="mb-5 border border-stone-200 rounded-sm overflow-hidden">
                  <div className="px-3 py-2 bg-stone-100 border-b border-stone-200 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-700 font-semibold">
                      Action log · {filteredRows.length} {filteredRows.length === 1 ? 'entry' : 'entries'}
                    </div>
                    <div className="text-[10px] mono text-stone-500">{from} → {to}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-600 mono text-[10px] uppercase tracking-wider">Date</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-600 mono text-[10px] uppercase tracking-wider">Action</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-600 mono text-[10px] uppercase tracking-wider">Group</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-600 mono text-[10px] uppercase tracking-wider">Dates</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-600 mono text-[10px] uppercase tracking-wider">Change</th>
                          <th className="text-left px-2.5 py-1.5 font-medium text-stone-600 mono text-[10px] uppercase tracking-wider">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r, i) => {
                          const change = (r.valueBefore || r.valueAfter)
                            ? `${r.valueBefore || '?'} → ${r.valueAfter || '?'}`
                            : '';
                          return (
                            <tr key={r.id} className="border-b border-stone-100 last:border-b-0 align-top">
                              <td className="px-2.5 py-1.5 mono text-[11px] text-stone-600 whitespace-nowrap">{r.date}</td>
                              <td className="px-2.5 py-1.5 text-stone-800">{r.action || <span className="text-stone-300">—</span>}</td>
                              <td className="px-2.5 py-1.5 text-stone-700 whitespace-nowrap">{r.affectedGroup || <span className="text-stone-300">—</span>}</td>
                              <td className="px-2.5 py-1.5 text-stone-700 whitespace-nowrap">{r.affectedDates || <span className="text-stone-300">—</span>}</td>
                              <td className="px-2.5 py-1.5 mono text-[11px] text-stone-700">{change || <span className="text-stone-300">—</span>}</td>
                              <td className="px-2.5 py-1.5 text-stone-600 max-w-xs">{r.reason || <span className="text-stone-300">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* AI summary */}
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">Summary</div>
              {renderReport(report)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-200 bg-stone-50/40">
          <div className="text-[10px] mono text-stone-400">
            Plain-language bullets · log table included on copy
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={copyReport}
                className="px-3 py-1.5 text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-stone-500 transition-colors flex items-center gap-1.5 rounded-sm"
              >
                {copied === 'ok' && <><Check className="w-3.5 h-3.5 text-emerald-700" /> Copied</>}
                {copied === 'downloaded' && <><Download className="w-3.5 h-3.5 text-amber-700" /> Downloaded as .txt</>}
                {copied === 'failed' && <><AlertCircle className="w-3.5 h-3.5 text-rose-700" /> Copy failed</>}
                {!copied && <><Copy className="w-3.5 h-3.5" /> Copy summary + log</>}
              </button>
            )}
            <button
              onClick={generateReport}
              disabled={generating || (filteredRows.length === 0 && filteredNotes.length === 0 && !scratchpad.trim())}
              className="px-4 py-1.5 text-[12px] font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <Sparkles className="w-3.5 h-3.5" /> {report ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Rules tab (documentation page) ---------- */
// Renders all rules applied to uploaded reports. Threshold values are pulled
// directly from the constants used by the flag logic, so if a constant
// changes, this page reflects it without manual updates.

/* ---------- Weeks Report tab ----------
   Standalone weekly view fed by the PriceLabs "Overview by Weeks" export.
   Displays per-week metrics with the Events column inline, applies the
   standard flag rules + the index-specific rules (MPI, ADR Index, RevPAR Index).

   Architecturally simpler than the Portfolio tab: single upload slot, no
   prior-day comparison (weekly cadence makes daily diffs irrelevant), no
   segment cascade, no contributing buildings.
*/
function WeeksTab({ weeksReport, onUpload, onClear, onSyncLoaded }) {
  const inputRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [showPastWeeks, setShowPastWeeks] = useState(false);

  const handle = async (file) => {
    if (!file) return;
    setUploadError(null);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseWeeksReportFile(buf, file.name);
      onUpload(parsed);
    } catch (e) {
      setUploadError(e.message || 'Could not parse Weeks Report');
      setTimeout(() => setUploadError(null), 6000);
    }
    setParsing(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handle(e.dataTransfer.files[0]);
  };

  const allWeeks = weeksReport?.weeks || [];
  const weeks = showPastWeeks
    ? allWeeks
    : allWeeks.filter(w => daysToEndOfWeek(w.y, w.w) > 0);
  const pastWeekCount = allWeeks.length - weeks.length;

  // 1-day pickup: diff between today's and yesterday's pickup3d per week
  const priorWeeks = weeksReport?._prior?.weeks || [];
  const priorPickupMap = useMemo(() => {
    const map = new Map();
    priorWeeks.forEach(w => map.set(w.iso, { pickup3d: w.pickup3d, pickup7d: w.pickup7d }));
    return map;
  }, [priorWeeks]);
  const hasPickup1d = priorWeeks.length > 0;

  // Roll up flags across forward weeks for the summary panel
  const flaggedWeeks = weeks
    .map(w => {
      const dba = daysToEndOfWeek(w.y, w.w);
      if (dba === 0) return null;
      const flags = computeWeekFlags(w);
      if (flags.length === 0) return null;
      return { week: w, dba, flags };
    })
    .filter(Boolean);

  const flagCounts = flaggedWeeks.reduce((acc, fw) => {
    fw.flags.forEach(f => {
      if (f.severity === 'opportunity') acc.opportunities++;
      else acc.problems++;
    });
    return acc;
  }, { problems: 0, opportunities: 0 });

  const fmtMoney = (v) => v == null || v === '' ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const fmtPct = (v) => v == null || v === '' ? '—' : `${Number(v).toFixed(1)}%`;
  const fmtIndex = (v) => v == null ? '—' : `${Number(v).toFixed(1)}%`;
  const fmtSignedRev = (v) => {
    if (v == null) return '—';
    if (v === 0) return '$0';
    const sign = v >= 0 ? '+$' : '−$';
    return `${sign}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="mb-4">
        <p className="text-[13px] text-stone-700 leading-relaxed">
          Drop the PriceLabs <span className="mono text-[12px]">Overview by Weeks</span> export. The report shows weekly competitive-set indices (MPI, ADR Index, RevPAR Index), pickup pacing, and event names so you can correlate event weeks with performance.
        </p>
      </div>

      {/* Upload section */}
      <div className="border border-stone-300 rounded-sm bg-white mb-6">
        <div className="p-4 border-b border-stone-200 bg-stone-50/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Weeks Report</span>
            {!weeksReport && (
              <SyncReportButton segment="weeks" onReportLoaded={onSyncLoaded} />
            )}
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border border-emerald-300 bg-emerald-50/30 rounded-sm p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-stone-600 font-semibold">
                Weeks Report
              </span>
              {weeksReport && (
                <button
                  onClick={onClear}
                  className="text-[10px] text-stone-400 hover:text-rose-700 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            {!weeksReport ? (
              <button
                onClick={() => inputRef.current?.click()}
                disabled={parsing}
                className="w-full px-3 py-3 text-[11px] border border-dashed border-stone-400 hover:border-stone-700 hover:bg-white text-stone-600 hover:text-stone-900 rounded-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {parsing ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing…</>
                ) : (
                  <><Upload className="w-3.5 h-3.5" /> Drop xlsx or click to upload</>
                )}
              </button>
            ) : (
              <div className="bg-white border border-stone-200 rounded-sm px-3 py-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="font-medium text-stone-900 truncate flex-1" title={weeksReport.fileName}>
                    {weeksReport.fileName}
                  </span>
                </div>
                <div className="text-[10px] mono text-stone-400 mt-1 flex items-center gap-2 flex-wrap">
                  <span>{allWeeks.length} weeks · uploaded {new Date(weeksReport.uploadedAt).toLocaleString()}</span>
                  {weeksReport._stlySource === 'direct' && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded-sm text-emerald-800"
                      title="Direct STLY columns (Occupancy % STLY, Rental ADR STLY, etc.) read from the export. Flag rules are accurate apples-to-apples."
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" /> STLY: direct
                    </span>
                  )}
                  {weeksReport._stlySource === 'back-calc' && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded-sm text-amber-900"
                      title="STLY values back-calculated from YoY-difference columns. Flag rules work but values may have rounding noise. For best accuracy, re-export from PriceLabs with direct STLY columns enabled."
                    >
                      <AlertCircle className="w-2.5 h-2.5" /> STLY: back-calculated
                    </span>
                  )}
                  {weeksReport._stlySource === 'missing' && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-50 border border-rose-200 rounded-sm text-rose-900"
                      title="No direct STLY columns and no YoY columns either. Flag rules will use null STLY values — most flags will not fire."
                    >
                      <AlertTriangle className="w-2.5 h-2.5" /> STLY: missing
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          {uploadError && (
            <div className="mt-2 px-2 py-1.5 bg-rose-50 border border-rose-200 rounded-sm text-[10px] text-rose-900 flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> <span>{uploadError}</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        {/* Legend & toggle */}
        {allWeeks.length > 0 && (
          <div className="px-4 py-2 border-b border-stone-200 bg-stone-50/30 flex items-center gap-3 flex-wrap text-[10px]">
            <span className="uppercase tracking-[0.2em] text-stone-500 font-semibold">Auto-flags</span>
            <span className="inline-flex items-center gap-1 text-rose-900">
              <Flag className="w-2.5 h-2.5" /> Problem: pickup ≤90% of STLY (or zero), ADR/RevPAR &lt; STLY by &gt;{(ADR_PROBLEM_THRESHOLD * 100).toFixed(0)}%, Occ &lt; STLY by &gt;{OCC_PROBLEM_THRESHOLD}pp, MPI &lt; {WEEK_MPI_PROBLEM_THRESHOLD}%, ADR/RevPAR Index &lt; {WEEK_ADR_INDEX_THRESHOLD}%
            </span>
            <span className="inline-flex items-center gap-1 text-amber-900">
              <Sparkles className="w-2.5 h-2.5" /> Opportunity: pickup ≥110% of STLY · Occ &gt; LY +{OCCUPANCY_OUTPACE_THRESHOLD}pp · MPI &gt; {WEEK_MPI_OPPORTUNITY_THRESHOLD}%
            </span>
            {(pastWeekCount > 0 || showPastWeeks) && (
              <button
                onClick={() => setShowPastWeeks(v => !v)}
                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 border border-stone-300 hover:border-stone-500 bg-white text-stone-700 rounded-sm font-medium transition-colors"
              >
                {showPastWeeks
                  ? <>Hide past weeks</>
                  : <>Show past weeks {pastWeekCount > 0 && <span className="text-stone-400">({pastWeekCount})</span>}</>
                }
              </button>
            )}
          </div>
        )}

        {/* Flag summary */}
        {allWeeks.length > 0 && (
          flaggedWeeks.length > 0 ? (
            <div className="border-b border-stone-200 bg-stone-50/40 p-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-2">⚠ Needs attention</div>
              <div className="text-[11px] text-stone-600 mb-3">
                {flaggedWeeks.length} {flaggedWeeks.length === 1 ? 'week' : 'weeks'} flagged ·
                {flagCounts.problems > 0 && <span className="text-rose-800 font-medium"> {flagCounts.problems} problem{flagCounts.problems === 1 ? '' : 's'}</span>}
                {flagCounts.problems > 0 && flagCounts.opportunities > 0 && <span className="text-stone-400"> ·</span>}
                {flagCounts.opportunities > 0 && <span className="text-amber-800 font-medium"> {flagCounts.opportunities} opportunit{flagCounts.opportunities === 1 ? 'y' : 'ies'}</span>}
              </div>
              <div className="space-y-2">
                {flaggedWeeks.map(({ week, dba, flags }) => {
                  const problems = flags.filter(f => f.severity === 'problem');
                  const opportunities = flags.filter(f => f.severity === 'opportunity');
                  return (
                    <div key={week.iso} className="bg-white border border-stone-200 rounded-sm px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-stone-900">{week.label}</span>
                          <span className="text-[11px] text-stone-600 mono">{formatWeekDateRange(week.y, week.w)}</span>
                          <span className="text-[10px] mono text-stone-400">{dba}d to end of week</span>
                          {week.eventsName && (
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-sm text-[10px] font-medium" title={`Event this week${week.eventsNameLY ? ` · LY: ${week.eventsNameLY}` : ''}`}>
                              📅 {week.eventsName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {problems.length > 0 && (
                            <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 border border-rose-300 text-rose-900 rounded-sm font-medium">
                              <Flag className="w-2.5 h-2.5" /> {problems.length}
                            </span>
                          )}
                          {opportunities.length > 0 && (
                            <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 rounded-sm font-medium">
                              <Sparkles className="w-2.5 h-2.5" /> {opportunities.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {[...problems, ...opportunities].map(f => (
                          <FlagDetailRow
                            key={f.id}
                            flag={f}
                            contribs={null}
                            direction={f.severity === 'opportunity' ? 'up' : 'down'}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="border-b border-stone-200 bg-emerald-50/40 px-4 py-3 flex items-center gap-2 text-[12px] text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span><span className="font-medium">All clear.</span> No flags fired against last year or against the comp set. Every forward week is healthy.</span>
            </div>
          )
        )}

        {/* Data table */}
        {weeks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-emerald-800 text-white">
                  <th className="text-left px-3 py-2 font-semibold">Week</th>
                  <th className="text-left px-3 py-2 font-semibold">Event</th>
                  <th className="text-right px-3 py-2 font-semibold" title="Market Penetration Index — your occupancy / market occupancy × 100">MPI</th>
                  <th className="text-right px-3 py-2 font-semibold" title="ADR Index — your ADR / market ADR × 100">ADR Idx</th>
                  <th className="text-right px-3 py-2 font-semibold" title="RevPAR Index — your RevPAR / market RevPAR × 100">RevPAR Idx</th>
                  <th className="text-right px-3 py-2 font-semibold" title="1-day pickup: change in 3d pickup since prior report">1d</th>
                  <th className="text-right px-3 py-2 font-semibold">3d</th>
                  <th className="text-right px-3 py-2 font-semibold">7d</th>
                  <th className="text-right px-3 py-2 font-semibold">ADR</th>
                  <th className="text-right px-3 py-2 font-semibold">Occ</th>
                  <th className="text-right px-3 py-2 font-semibold">RevPAR</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w, i) => {
                  const dba = daysToEndOfWeek(w.y, w.w);
                  const isPast = dba === 0;
                  const flagSet = new Set(isPast ? [] : computeWeekFlags(w).map(f => f.id));
                  const tint = (id, sev = 'problem') => flagSet.has(id)
                    ? (sev === 'opportunity' ? 'bg-amber-100 text-amber-900 font-semibold' : 'bg-rose-100 text-rose-900 font-semibold')
                    : '';
                  return (
                    <tr key={w.iso} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/50' : 'bg-white'} ${isPast ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2 font-medium text-stone-900 whitespace-nowrap">
                        <div>
                          {w.label}
                          {isPast && <span className="ml-1 text-[10px] text-stone-400 mono">closed</span>}
                        </div>
                        <div className="text-[10px] text-stone-500 mono font-normal">{formatWeekDateRange(w.y, w.w)}</div>
                      </td>
                      <td className="px-3 py-2 text-stone-700 max-w-[200px]">
                        {w.eventsName ? (
                          <span title={w.eventsNameLY ? `LY: ${w.eventsNameLY}` : 'No matching LY event'}>
                            {w.eventsName}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className={`text-right px-3 py-2 mono ${tint('mpi-low') || tint('mpi-high', 'opportunity') || 'text-stone-700'}`}>
                        {fmtIndex(w.mpi)}
                      </td>
                      <td className={`text-right px-3 py-2 mono ${tint('adr-index-low') || 'text-stone-700'}`}>
                        {fmtIndex(w.adrIndex)}
                      </td>
                      <td className={`text-right px-3 py-2 mono ${tint('revpar-index-low') || 'text-stone-700'}`}>
                        {fmtIndex(w.revparIndex)}
                      </td>
                      {(() => {
                        if (!hasPickup1d) return <td className="text-right px-3 py-2 mono text-stone-300 italic">N/A</td>;
                        const prior = priorPickupMap.get(w.iso);
                        if (!prior || w.pickup3d == null || prior.pickup3d == null) return <td className="text-right px-3 py-2 mono text-stone-300">—</td>;
                        const diff = Number(w.pickup3d) - Number(prior.pickup3d);
                        return (
                          <td className={`text-right px-3 py-2 mono ${diff > 0 ? 'text-emerald-700 font-medium' : diff < 0 ? 'text-rose-700 font-medium' : 'text-stone-500'}`}
                            title={`Today 3d: ${fmtSignedRev(w.pickup3d)} · Prior 3d: ${fmtSignedRev(prior.pickup3d)}`}
                          >
                            {diff === 0 ? '$0' : `${diff > 0 ? '+' : '−'}$${Math.abs(Math.round(diff)).toLocaleString('en-US')}`}
                          </td>
                        );
                      })()}
                      <td className={`text-right px-3 py-2 mono ${
                        tint('pickup3d-zero') || tint('pickup3d-behind') || tint('pickup3d-ahead', 'opportunity') ||
                        (w.pickup3d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')
                      }`}>{fmtSignedRev(w.pickup3d)}</td>
                      <td className={`text-right px-3 py-2 mono ${
                        tint('pickup7d-zero') || tint('pickup7d-behind') || tint('pickup7d-ahead', 'opportunity') ||
                        (w.pickup7d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-700')
                      }`}>{fmtSignedRev(w.pickup7d)}</td>
                      <td className={`text-right px-3 py-2 mono ${tint('adr-low') || 'text-stone-700'}`}>{fmtMoney(w.rentalADR)}</td>
                      <td className={`text-right px-3 py-2 mono ${tint('occ-high', 'opportunity') || tint('occ-low') || 'text-stone-700'}`}>{fmtPct(w.occupancy)}</td>
                      <td className={`text-right px-3 py-2 mono ${tint('revpar-low') || 'text-stone-700'}`}>{fmtMoney(w.rentalRevPAR)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Summary tab ----------
   Cross-references the Building report (per-building × per-month flags) with
   the Weeks report (per-week flags) to surface compounding signals:
   - Problems: building flagged AND week flagged in the same month
     → ranked by the building's revenue gap vs STLY for that month (largest absolute first)
   - Opportunities: building outperforming AND week outperforming in the same month
     → ranked the same way

   Match by ISO week → month containment: if a week starts in May, it pairs with
   any building flagged in May. A week spanning two months (rare for ISO weeks)
   is matched to the month its Monday falls in.

   Empty states are handled gracefully — Summary depends on having BOTH reports
   uploaded; if either is missing, an explanatory empty state shows.
*/
function SummaryTab({ portfolioReports, selectedISO, setRows, setActiveTab, rows, dismissedFlags, setDismissedFlags }) {
  // Derive weeks from portfolioReports (stored by date like other segments)
  const weeksReport = (() => {
    const todayWeeks = portfolioReports[selectedISO]?.['weeks'];
    if (todayWeeks) return todayWeeks;
    const priorDate = findPriorReportDate(portfolioReports, selectedISO, 'weeks');
    return priorDate ? portfolioReports[priorDate]['weeks'] : null;
  })();
  // perPage: how many rows to show per bucket page (was 'topN' before pagination).
  // page: per-bucket current page index (1-based). Each bucket paginates independently
  // because the buckets have very different sizes — capping all three at the same
  // page index would waste space on small buckets and undershow large ones.
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState({ problems: 1, opportunities: 1, mixed: 1 });
  // Month filter — null = all months, Set of monthIso strings when filtering
  const [monthFilter, setMonthFilter] = useState(null);
  // Toast confirms an action log row was created from this view. Auto-clears after 3s.
  const [addToast, setAddToast] = useState(null);
  const [showDismissed, setShowDismissed] = useState(false);
  // Override modal state
  const [overrideModal, setOverrideModal] = useState(null); // { pair, bucket }
  const [settingModal, setSettingModal] = useState(null); // { pair, bucket }

  // Inline month label helper — "May 2026", "Jun 2026" etc.
  const monthLabel = (y, m) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m - 1]} ${y}`;
  };

  // Get building report for today, falling back to the most recent prior date
  const buildingReport = portfolioReports[selectedISO]?.['building']
    || (() => {
      const priorDate = findPriorReportDate(portfolioReports, selectedISO, 'building');
      return priorDate ? portfolioReports[priorDate]['building'] : null;
    })();

  // ---- Add a row to the Action Log from a Summary pair ----
  // Schema mirrors the existing onInvestigate row in FunnelView so the new row
  // looks native in the Action Log table. WHY mirror not extend: any divergence
  // between the two creation paths would force two parallel maintenance jobs.
  const followUpMDY = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return formatMDY(d);
  };

  const addActionFromPair = useCallback((pair, bucket) => {
    if (!setRows) return; // safety — setRows is required prop
    const allFlags = [...(pair.buildingFlags || []), ...(pair.weekFlags || [])];
    const flagListText = allFlags.map(f => `${f.label} (${f.detail})`).join('; ');
    const primaryFlag = allFlags[0];
    // Action verb by bucket: problems → "Investigate problem", opportunities → "Test price increase",
    // mixed → "Investigate mixed signal" (different action implied; mixed needs reconciliation
    // before committing to a direction).
    const actionVerb = bucket === 'problem' ? 'Investigate problem'
      : bucket === 'opportunity' ? 'Test price increase'
      : 'Investigate mixed signal';
    const revGapStr = pair.revenueGap == null ? 'n/a'
      : (pair.revenueGap >= 0 ? `+$${Math.round(pair.revenueGap).toLocaleString('en-US')}` : `−$${Math.abs(Math.round(pair.revenueGap)).toLocaleString('en-US')}`);
    const newRow = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: todayMDY(),
      owner: 'Liuba',
      reason: `Auto-flag (Summary · ${bucket}): ${flagListText}`,
      affectedGroup: pair.building,
      affectedDates: `${pair.monthLabel} · ${pair.weekLabel} (${pair.weekDateRange})${pair.eventName ? ' · 📅 ' + pair.eventName : ''}`,
      action: `${actionVerb}: ${primaryFlag?.label || 'compounding signal'} · Rev gap ${revGapStr}`,
      valueBefore: '',
      valueAfter: '',
      notes: `From Summary tab · ${bucket} bucket · ${pair.buildingFlags.length} bldg flag${pair.buildingFlags.length === 1 ? '' : 's'}, ${pair.weekFlags.length} week flag${pair.weekFlags.length === 1 ? '' : 's'}${pair.mixedReason ? ' · ' + pair.mixedReason : ''}`,
      checkDone: false,
      followUpDate: followUpMDY(),
    };
    setRows(prev => [newRow, ...prev]);
    setAddToast({ building: pair.building, week: pair.weekLabel, bucket });
    setTimeout(() => setAddToast(null), 3000);
  }, [setRows]);

  // ---- Compute compounding pairs ----
  const { problems, opportunities, mixed, hasBuildingData, hasWeekData } = useMemo(() => {
    const empty = { problems: [], opportunities: [], mixed: [], hasBuildingData: false, hasWeekData: false };
    const hasBuildingData = !!(buildingReport?.byBuilding);
    const hasWeekData = !!(weeksReport?.weeks?.length);
    if (!hasBuildingData || !hasWeekData) return { ...empty, hasBuildingData, hasWeekData };

    // For each week, determine which month (YYYY-MM) it falls in based on Monday.
    const weeksWithMonth = weeksReport.weeks.map(w => {
      const monday = isoWeekStartDate(w.y, w.w);
      const month = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}`;
      const flags = computeWeekFlags(w);
      const problems = flags.filter(f => f.severity === 'problem');
      const opportunities = flags.filter(f => f.severity === 'opportunity');
      // Skip past weeks
      const dba = daysToEndOfWeek(w.y, w.w);
      return { week: w, month, problems, opportunities, dba, isPast: dba === 0 };
    }).filter(x => !x.isPast);

    // Index weeks by month for O(1) lookup
    const weeksByMonth = new Map();
    weeksWithMonth.forEach(x => {
      if (!weeksByMonth.has(x.month)) weeksByMonth.set(x.month, []);
      weeksByMonth.get(x.month).push(x);
    });

    const problemPairs = [];
    const opportunityPairs = [];
    const mixedPairs = [];

    // For each (building, month) pair in the building report
    Object.entries(buildingReport.byBuilding).forEach(([group, monthsArr]) => {
      monthsArr.forEach(m => {
        // Skip past months — building flags are forward-looking
        const todayDate = new Date();
        const monthLastDay = new Date(m.y, m.m, 0); // m.m is 1-indexed
        if (monthLastDay < todayDate && monthLastDay.toDateString() !== todayDate.toDateString()) return;

        const buildingFlags = computeMonthFlags(m);
        if (buildingFlags.length === 0) return;
        const buildingProblems = buildingFlags.filter(f => f.severity === 'problem');
        const buildingOpps = buildingFlags.filter(f => f.severity === 'opportunity');

        const matchingWeeks = weeksByMonth.get(m.iso) || [];
        if (matchingWeeks.length === 0) return;

        // Compute the building's revenue gap vs STLY for this month — used as the rank
        // and as the direction filter for problem/opportunity classification.
        // WHY use revenue gap as the direction arbiter: a building can have a "pickup
        // behind STLY" flag (a leading indicator of trouble) while still having
        // positive cumulative revenue (because it booked early). That's a mixed
        // signal — neither a clean problem nor a clean opportunity.
        const tyRev = m.rentalRevenue;
        const stlyRev = m.rentalRevenueSTLY;
        const revenueGap = (tyRev != null && stlyRev != null) ? (tyRev - stlyRev) : null;

        // For each matching week, classify the (building, week) pair into one of
        // three buckets based on flag direction AND revenue gap direction:
        //   - Problems:      flag direction = down  AND  revenue gap ≤ 0  (consistent downside)
        //   - Opportunities: flag direction = up    AND  revenue gap ≥ 0  (consistent upside)
        //   - Mixed signals: flag direction disagrees with revenue gap direction
        matchingWeeks.forEach(({ week, problems: wProblems, opportunities: wOpps }) => {
          const basePair = (buildingFlagsForBucket, weekFlagsForBucket) => ({
            building: group,
            monthLabel: monthLabel(m.y, m.m),
            monthIso: m.iso,
            weekLabel: week.label,
            weekDateRange: formatWeekDateRange(week.y, week.w),
            weekIso: week.iso,
            buildingFlags: buildingFlagsForBucket,
            weekFlags: weekFlagsForBucket,
            revenueGap,
            tyRev, stlyRev,
            eventName: week.eventsName || null,
            buildingMetrics: { tyAdr: m.rentalADR, stlyAdr: m.rentalADRSTLY, tyOcc: m.occupancy, stlyOcc: m.occupancySTLY },
          });

          // Classify based on building flags — week flags enhance but aren't required
          if (buildingProblems.length > 0) {
            if (revenueGap == null || revenueGap <= 0) {
              problemPairs.push({ ...basePair(buildingProblems, wProblems), bucket: 'problem' });
            } else {
              // Building flagged DOWN but revenue is UP → mixed signal
              mixedPairs.push({
                ...basePair(buildingProblems, wProblems),
                bucket: 'mixed',
                mixedReason: 'down-flagged but revenue up',
              });
            }
          }
          if (buildingOpps.length > 0) {
            if (revenueGap == null || revenueGap >= 0) {
              opportunityPairs.push({ ...basePair(buildingOpps, wOpps), bucket: 'opportunity' });
            } else {
              // Building flagged UP but revenue is DOWN → mixed signal
              mixedPairs.push({
                ...basePair(buildingOpps, wOpps),
                bucket: 'mixed',
                mixedReason: 'up-flagged but revenue down',
              });
            }
          }
        });
      });
    });

    // Sort by absolute revenue gap descending; null gaps sort last
    const sortByImpact = (a, b) => {
      if (a.revenueGap == null && b.revenueGap == null) return 0;
      if (a.revenueGap == null) return 1;
      if (b.revenueGap == null) return -1;
      return Math.abs(b.revenueGap) - Math.abs(a.revenueGap);
    };
    problemPairs.sort(sortByImpact);
    opportunityPairs.sort(sortByImpact);
    mixedPairs.sort(sortByImpact);

    return { problems: problemPairs, opportunities: opportunityPairs, mixed: mixedPairs, hasBuildingData, hasWeekData };
  }, [buildingReport, weeksReport]);

  // Summary pair dismiss helpers
  const summaryPairKey = (pair) => `summary:${pair.building}:${pair.weekIso}`;
  const isPairDismissed = (pair) => {
    if (!dismissedFlags) return false;
    const key = summaryPairKey(pair);
    if (dismissedFlags.removed?.[key]) return 'removed';
    const snoozed = dismissedFlags.snoozed?.[key];
    if (snoozed) {
      // Pairs snooze for 7 days (flags snooze for 24h)
      const expiresAt = new Date(snoozed.at).getTime() + 7 * 24 * 60 * 60 * 1000;
      if (Date.now() < expiresAt) return 'snoozed';
    }
    return false;
  };
  const handleSnoozePair = useCallback((pair) => {
    setDismissedFlags?.(prev => {
      const key = summaryPairKey(pair);
      return { ...prev, snoozed: { ...prev.snoozed, [key]: { at: new Date().toISOString() } } };
    });
  }, [setDismissedFlags]);
  const handleRemovePair = useCallback((pair) => {
    setDismissedFlags?.(prev => {
      const key = summaryPairKey(pair);
      return { ...prev, removed: { ...prev.removed, [key]: { at: new Date().toISOString() } } };
    });
  }, [setDismissedFlags]);
  const handleRestorePair = useCallback((pair) => {
    setDismissedFlags?.(prev => {
      const key = summaryPairKey(pair);
      const { [key]: _s, ...snoozed } = prev.snoozed || {};
      const { [key]: _r, ...removed } = prev.removed || {};
      return { snoozed, removed };
    });
  }, [setDismissedFlags]);

  // Filter dismissed pairs
  // Collect all unique months across all pairs for the filter
  const allMonthOptions = useMemo(() => {
    const seen = new Map();
    [...problems, ...opportunities, ...mixed].forEach(p => {
      if (p.monthIso && !seen.has(p.monthIso)) seen.set(p.monthIso, p.monthLabel);
    });
    return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [problems, opportunities, mixed]);

  const monthPass = (p) => !monthFilter || monthFilter.has(p.monthIso);
  const activeProblems = problems.filter(p => !isPairDismissed(p) && monthPass(p));
  const activeOpportunities = opportunities.filter(p => !isPairDismissed(p) && monthPass(p));
  const activeMixed = mixed.filter(p => !isPairDismissed(p) && monthPass(p));
  const dismissedProblems = problems.filter(p => isPairDismissed(p));
  const dismissedOpportunities = opportunities.filter(p => isPairDismissed(p));
  const dismissedMixed = mixed.filter(p => isPairDismissed(p));
  const totalDismissed = dismissedProblems.length + dismissedOpportunities.length + dismissedMixed.length;

  const fmtMoney = (v) => v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`;
  const fmtSignedMoney = (v) => {
    if (v == null) return '—';
    if (v === 0) return '$0';
    const sign = v >= 0 ? '+$' : '−$';
    return `${sign}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  };

  // Build a TSV (tab-separated values) string for a list of pairs.
  // TSV pastes into Excel as a clean table — each tab becomes a column boundary,
  // each newline becomes a row. Headers are included as the first row.
  // WHY TSV not CSV: CSV needs Excel's "Text to Columns" step to split into cells;
  // TSV is recognized natively as a table on paste.
  const pairsToTSV = (pairs, bucketName) => {
    const headers = [
      'Rank', 'Building', 'Month', 'Week', 'Week dates', 'Event',
      'Revenue gap (mo.)', 'TY Revenue (mo.)', 'STLY Revenue (mo.)',
      'Building flags', 'Week flags',
    ];
    if (bucketName === 'mixed') headers.push('Why mixed');
    const rows = [headers.join('\t')];
    pairs.forEach((p, i) => {
      const row = [
        i + 1,
        p.building,
        p.monthLabel,
        p.weekLabel,
        p.weekDateRange,
        // Strip tabs/newlines from event names and flag labels so they don't
        // break the TSV structure
        (p.eventName || '').replace(/[\t\n\r]+/g, ' '),
        // Numeric values export as plain numbers, not formatted strings —
        // Excel can format them as currency afterward if desired
        p.revenueGap == null ? '' : Math.round(p.revenueGap),
        p.tyRev == null ? '' : Math.round(p.tyRev),
        p.stlyRev == null ? '' : Math.round(p.stlyRev),
        p.buildingFlags.map(f => f.label).join('; '),
        p.weekFlags.map(f => f.label).join('; '),
      ];
      if (bucketName === 'mixed') row.push(p.mixedReason || '');
      rows.push(row.join('\t'));
    });
    return rows.join('\n');
  };

  // Build a markdown table — for ClickUp Docs, Notion, GitHub, Slack rich text.
  // ClickUp converts markdown tables into native tables on paste in Docs.
  // WHY a separate format from TSV: ClickUp doesn't treat tabs as table delimiters,
  // so TSV pastes as a single block of text; markdown's pipe-and-dash syntax IS
  // recognized as a table.
  // Numbers ARE formatted with $ here (unlike TSV) because markdown tables
  // are read as text — humans need readable currency, not raw integers.
  const pairsToMarkdown = (pairs, bucketName) => {
    const headers = [
      'Rank', 'Building', 'Month', 'Week', 'Week dates', 'Event',
      'Revenue gap', 'TY Rev', 'STLY Rev',
      'Building flags', 'Week flags',
    ];
    if (bucketName === 'mixed') headers.push('Why mixed');
    // Pipe-escape helper — markdown table cells can't contain unescaped pipes
    const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/[\n\r]+/g, ' ');
    const fmtMoneyMd = (v) => v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`;
    const fmtSignedMd = (v) => {
      if (v == null) return '—';
      if (v === 0) return '$0';
      const sign = v >= 0 ? '+$' : '−$';
      return `${sign}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
    };
    const lines = [];
    lines.push('| ' + headers.map(cell).join(' | ') + ' |');
    lines.push('|' + headers.map(() => '---').join('|') + '|');
    pairs.forEach((p, i) => {
      const row = [
        String(i + 1),
        p.building,
        p.monthLabel,
        p.weekLabel,
        p.weekDateRange,
        p.eventName || '',
        fmtSignedMd(p.revenueGap),
        fmtMoneyMd(p.tyRev),
        fmtMoneyMd(p.stlyRev),
        p.buildingFlags.map(f => f.label).join('; '),
        p.weekFlags.map(f => f.label).join('; '),
      ];
      if (bucketName === 'mixed') row.push(p.mixedReason || '');
      lines.push('| ' + row.map(cell).join(' | ') + ' |');
    });
    return lines.join('\n');
  };

  // Build an HTML table — for ClickUp chat/comments/Docs, Notion, Gmail, etc.
  // Rich-text editors honor <table> markup on paste even when they don't parse
  // markdown. Includes minimal inline styling so the table looks like a real
  // table in surfaces that don't apply default <table> CSS (most do, but ClickUp
  // chat is one of those that benefits from explicit borders).
  const pairsToHTML = (pairs, bucketName) => {
    const headers = [
      'Rank', 'Building', 'Month', 'Week', 'Week dates', 'Event',
      'Revenue gap', 'TY Rev', 'STLY Rev',
      'Building flags', 'Week flags',
    ];
    if (bucketName === 'mixed') headers.push('Why mixed');
    // HTML escape — required because cell values may contain user-supplied
    // strings (event names, flag labels). Without escaping, a stray `<` or `&`
    // would break the markup and could be a tiny XSS vector if the destination
    // re-renders the HTML.
    const esc = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const fmtMoneyHtml = (v) => v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`;
    const fmtSignedHtml = (v) => {
      if (v == null) return '—';
      if (v === 0) return '$0';
      const sign = v >= 0 ? '+$' : '−$';
      return `${sign}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
    };
    const cellStyle = 'border:1px solid #d4d4d8;padding:6px 10px;text-align:left;vertical-align:top;font-size:12px;';
    const headerStyle = cellStyle + 'background:#f4f4f5;font-weight:600;';
    const thead = '<thead><tr>' + headers.map(h => `<th style="${headerStyle}">${esc(h)}</th>`).join('') + '</tr></thead>';
    const bodyRows = pairs.map((p, i) => {
      const cells = [
        String(i + 1),
        p.building,
        p.monthLabel,
        p.weekLabel,
        p.weekDateRange,
        p.eventName || '',
        fmtSignedHtml(p.revenueGap),
        fmtMoneyHtml(p.tyRev),
        fmtMoneyHtml(p.stlyRev),
        p.buildingFlags.map(f => f.label).join('; '),
        p.weekFlags.map(f => f.label).join('; '),
      ];
      if (bucketName === 'mixed') cells.push(p.mixedReason || '');
      return '<tr>' + cells.map(c => `<td style="${cellStyle}">${esc(c)}</td>`).join('') + '</tr>';
    }).join('');
    return `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">${thead}<tbody>${bodyRows}</tbody></table>`;
  };

  // Track copy state per (bucket × format) — each button has its own indicator
  const [copyState, setCopyState] = useState({});
  const handleCopy = async (bucketName, pairs, format) => {
    const key = `${bucketName}:${format}`;
    let ok;
    if (format === 'markdown') {
      // ClickUp / Notion / docs path — write rich HTML to clipboard with
      // markdown as the plain-text fallback. ClickUp chat fields don't parse
      // markdown but DO honor an HTML table paste.
      ok = await copyRich(pairsToHTML(pairs, bucketName), pairsToMarkdown(pairs, bucketName));
    } else {
      // Excel path — TSV pastes natively as a table in spreadsheets.
      ok = await copyText(pairsToTSV(pairs, bucketName));
    }
    setCopyState(prev => ({ ...prev, [key]: ok ? 'copied' : 'failed' }));
    setTimeout(() => setCopyState(prev => ({ ...prev, [key]: null })), 2000);
  };

  // Reusable copy button — placed in each table's header.
  // format: 'tsv' (Excel) or 'markdown' (ClickUp / Notion / docs)
  const CopyButton = ({ bucketName, pairs, accent, format = 'tsv' }) => {
    const status = copyState[`${bucketName}:${format}`];
    const accentClasses = {
      rose:   'border-rose-300 hover:border-rose-500 text-rose-800 hover:bg-rose-100',
      amber:  'border-amber-300 hover:border-amber-500 text-amber-800 hover:bg-amber-100',
      indigo: 'border-indigo-300 hover:border-indigo-500 text-indigo-800 hover:bg-indigo-100',
    }[accent] || 'border-stone-300 hover:border-stone-500 text-stone-700 hover:bg-stone-100';
    const label = format === 'markdown' ? 'Copy for ClickUp' : 'Copy as table';
    const tooltip = format === 'markdown'
      ? `Copy top ${pairs.length} as a rich table (paste into ClickUp chat / Docs, Notion, Gmail, Slack rich compose)`
      : `Copy top ${pairs.length} as TSV (paste into Excel)`;
    return (
      <button
        onClick={() => handleCopy(bucketName, pairs, format)}
        disabled={pairs.length === 0}
        className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] mono border rounded-sm bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${accentClasses}`}
        title={tooltip}
      >
        {status === 'copied' ? (
          <><Check className="w-3 h-3" /> Copied!</>
        ) : status === 'failed' ? (
          <><AlertCircle className="w-3 h-3" /> Failed</>
        ) : (
          <><Copy className="w-3 h-3" /> {label}</>
        )}
      </button>
    );
  };

  // Pager — Prev / "Page X of Y" / Next. Disables ends; shows total count.
  // Renders nothing when there's only one page (no need for nav controls).
  // WHY render nothing on single-page: less visual noise when the bucket fits
  // entirely on one page.
  const Pager = ({ bucketName, currentPage, totalItems, accent }) => {
    const totalPages = pageCount(totalItems);
    if (totalPages <= 1) return null;
    const accentClasses = {
      rose:   'border-rose-300 hover:border-rose-500 text-rose-800 hover:bg-rose-100',
      amber:  'border-amber-300 hover:border-amber-500 text-amber-800 hover:bg-amber-100',
      indigo: 'border-indigo-300 hover:border-indigo-500 text-indigo-800 hover:bg-indigo-100',
    }[accent] || 'border-stone-300 hover:border-stone-500 text-stone-700 hover:bg-stone-100';
    const goTo = (p) => setPage(prev => ({ ...prev, [bucketName]: p }));
    return (
      <div className="flex items-center gap-1.5 text-[10px] mono">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`px-1.5 py-1 border rounded-sm bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${accentClasses}`}
          title="Previous page"
        >
          ← Prev
        </button>
        <span className="text-stone-600 px-1">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={`px-1.5 py-1 border rounded-sm bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${accentClasses}`}
          title="Next page"
        >
          Next →
        </button>
      </div>
    );
  };

  // Add-action button rendered in each pair row.
  // Greys out if setRows isn't wired (defensive — shouldn't happen in practice).
  const AddActionButton = ({ pair, bucket, accent }) => {
    const accentClasses = {
      rose:   'border-rose-300 hover:border-rose-500 text-rose-800 hover:bg-rose-100',
      amber:  'border-amber-300 hover:border-amber-500 text-amber-800 hover:bg-amber-100',
      indigo: 'border-indigo-300 hover:border-indigo-500 text-indigo-800 hover:bg-indigo-100',
    }[accent] || 'border-stone-300 hover:border-stone-500 text-stone-700 hover:bg-stone-100';
    return (
      <div className="inline-flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setSettingModal({ pair, bucket })}
          className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] mono border rounded-sm bg-white transition-colors ${accentClasses}`}
          title="Record a PriceLabs setting change"
        >
          <Pencil className="w-3 h-3" /> Adjust setting
        </button>
        <button
          onClick={() => setOverrideModal({ pair, bucket })}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] mono border border-indigo-300 hover:border-indigo-500 text-indigo-800 hover:bg-indigo-100 rounded-sm bg-white transition-colors"
          title="Change date-level price override via API"
        >
          <Plus className="w-3 h-3" /> Override
        </button>
        <button
          onClick={() => handleSnoozePair(pair)}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] mono border border-stone-200 hover:border-amber-400 text-stone-400 hover:text-amber-700 hover:bg-amber-50 rounded-sm bg-white transition-colors"
          title="Snooze this row for 1 week"
        >
          <Clock className="w-3 h-3" /> Snooze
        </button>
        <button
          onClick={() => handleRemovePair(pair)}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] mono border border-stone-200 hover:border-rose-400 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded-sm bg-white transition-colors"
          title="Remove this row from the list"
        >
          <EyeOff className="w-3 h-3" /> Remove
        </button>
      </div>
    );
  };

  // Empty states
  if (!hasBuildingData && !hasWeekData) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="border border-stone-300 rounded-sm bg-white p-8 text-center">
          <TrendingUp className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <div className="text-stone-700 font-medium mb-1">No data yet</div>
          <div className="text-[12px] text-stone-500 max-w-md mx-auto leading-relaxed">
            Summary cross-references the Building report (in the Funnel → Building sub-tab) with the Weeks report. Upload both to see compounding problems and opportunities ranked by revenue impact.
          </div>
        </div>
      </div>
    );
  }
  if (!hasBuildingData) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="border border-stone-300 rounded-sm bg-white p-8 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <div className="text-stone-700 font-medium mb-1">Building report needed</div>
          <div className="text-[12px] text-stone-500 max-w-md mx-auto leading-relaxed">
            Upload a multi-building PriceLabs export (with a Group Name column) in the Funnel → Building sub-tab to enable Summary.
          </div>
        </div>
      </div>
    );
  }
  if (!hasWeekData) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="border border-stone-300 rounded-sm bg-white p-8 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <div className="text-stone-700 font-medium mb-1">Weeks report needed</div>
          <div className="text-[12px] text-stone-500 max-w-md mx-auto leading-relaxed">
            Upload the PriceLabs Overview by Weeks export in the Weeks tab to enable Summary.
          </div>
        </div>
      </div>
    );
  }

  // Paginated slices. Each bucket has its own current page.
  // Page count = ceil(total / perPage), with at least 1 page even when bucket is empty.
  // WHY guard with Math.max(...1, totalPages): keeps the "Page X of Y" display
  // sensible when there are zero results.
  const pageCount = (n) => Math.max(1, Math.ceil(n / perPage));
  const sliceFor = (arr, p) => arr.slice((p - 1) * perPage, p * perPage);
  // Clamp page to valid range — if perPage changes and current page is now past the end,
  // snap to the last available page. Computed inline rather than as effect to keep the
  // render deterministic on perPage changes.
  const clamp = (p, total) => Math.max(1, Math.min(p, pageCount(total)));
  const pageProblems = clamp(page.problems, activeProblems.length);
  const pageOpps     = clamp(page.opportunities, activeOpportunities.length);
  const pageMixed    = clamp(page.mixed, activeMixed.length);
  const problemsTop = sliceFor(activeProblems, pageProblems);
  const opportunitiesTop = sliceFor(activeOpportunities, pageOpps);
  const mixedTop = sliceFor(activeMixed, pageMixed);

  // Find last action logged for a specific building + week
  const getLastAction = (building, weekLabel) => {
    if (!rows?.length) return null;
    return rows.find(r =>
      r.affectedGroup === building &&
      r.affectedDates?.includes(weekLabel) &&
      (r.action?.includes('Override') || r.action?.includes('changed') || r.action?.includes('Investigate'))
    ) || null;
  };

  // Reusable row component
  const PairRow = ({ pair, isProblem, i, bucket, accent }) => {
    const lastAction = getLastAction(pair.building, pair.weekLabel);
    return (
    <tr key={`${pair.building}-${pair.weekIso}`} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/50' : 'bg-white'}`}>
      <td className="px-2 py-1.5 text-stone-500 mono text-[10px]">{i + 1}</td>
      <td className="px-2 py-1.5">
        <div className="font-medium text-stone-900 text-[12px]">{pair.building}</div>
        <div className="text-[9px] text-stone-500 mono">{pair.monthLabel}</div>
        {lastAction && (
          <div className="mt-1 space-y-0.5">
            <div className="text-[9px] px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded-sm text-blue-800 max-w-[160px]" title={`${lastAction.action} (${lastAction.date})`}>
              <div className="truncate">Last: {lastAction.action}</div>
              <div className="text-blue-600 mono">{lastAction.date}</div>
            </div>
            {lastAction.followUpDate && (
              <div className={`text-[9px] px-1.5 py-0.5 rounded-sm truncate ${
                parseMDY(lastAction.followUpDate) <= new Date()
                  ? 'bg-rose-50 border border-rose-200 text-rose-800 font-semibold'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}>
                F/U: {lastAction.followUpDate}{parseMDY(lastAction.followUpDate) <= new Date() ? ' ⚠ due' : ''}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-2 max-w-[130px]">
        <div className="text-[11px] text-stone-800 font-medium">W{pair.weekIso?.split('-W')[1] || pair.weekLabel}</div>
        <div className="text-[9px] text-stone-500 mono">{pair.weekDateRange}</div>
        {pair.eventName && (
          <div className="text-[9px] text-purple-700 mt-0.5 italic truncate max-w-[120px]" title={pair.eventName}>
            {pair.eventName}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 mono text-[10px]">
        <div className={isProblem ? 'text-rose-800 font-semibold' : 'text-emerald-800 font-semibold'}>
          {fmtSignedMoney(pair.revenueGap)}
        </div>
        <div className="text-[9px] text-stone-500">
          {fmtMoney(pair.tyRev)} vs {fmtMoney(pair.stlyRev)}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-0.5">
          {pair.buildingFlags.map((f, fi) => (
            <span key={fi} className={`inline-flex items-center px-1 py-0.5 rounded-sm text-[9px] mono ${
              isProblem ? 'bg-rose-100 text-rose-900 border border-rose-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`} title={f.detail}>
              {f.label}
            </span>
          ))}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-0.5">
          {pair.weekFlags.map((f, fi) => (
            <span key={fi} className={`inline-flex items-center px-1 py-0.5 rounded-sm text-[9px] mono ${
              isProblem ? 'bg-rose-100 text-rose-900 border border-rose-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`} title={f.detail}>
              {f.label}
            </span>
          ))}
        </div>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <AddActionButton pair={pair} bucket={bucket} accent={accent} />
      </td>
    </tr>
  );
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      {/* Description + controls */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <p className="text-[13px] text-stone-700 leading-relaxed max-w-3xl">
          Buildings flagged in months that overlap with weeks also flagged on their own metrics. The compounding signal — a building underperforming during a week that's also underperforming on the comp set — points to the most actionable problems and opportunities. Ranked by absolute revenue gap vs STLY for the building × month.
        </p>
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          {/* Month filter */}
          <div className="flex items-center gap-1.5">
            <label className="text-stone-500">Month</label>
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => { setMonthFilter(null); setPage({ problems: 1, opportunities: 1, mixed: 1 }); }}
                className={`px-2 py-1 rounded-sm border transition-colors ${
                  !monthFilter ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'
                }`}
              >
                All
              </button>
              {allMonthOptions.map(([iso, label]) => {
                const isActive = monthFilter?.has(iso);
                return (
                  <button
                    key={iso}
                    onClick={() => {
                      setMonthFilter(prev => {
                        if (!prev) {
                          return new Set([iso]);
                        }
                        const next = new Set(prev);
                        if (next.has(iso)) { next.delete(iso); } else { next.add(iso); }
                        return next.size === 0 ? null : next;
                      });
                      setPage({ problems: 1, opportunities: 1, mixed: 1 });
                    }}
                    className={`px-2 py-1 rounded-sm border transition-colors ${
                      isActive ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-500'
                    }`}
                  >
                    {label.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
          <span className="text-stone-200">|</span>
          <div className="flex items-center gap-2">
            <label className="text-stone-500">Per page</label>
            <input
              type="number"
              min="1"
              max="100"
              value={perPage}
              onChange={(e) => {
                const v = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1));
                setPerPage(v);
                setPage({ problems: 1, opportunities: 1, mixed: 1 });
              }}
              className="w-16 px-2 py-1 border border-stone-300 rounded-sm mono text-stone-900"
            />
          </div>
        </div>
      </div>

      {/* Summary header counts */}
      <div className="mb-4 flex items-center gap-4 text-[11px] text-stone-600 flex-wrap">
        <span><span className="font-medium text-rose-800">{activeProblems.length}</span> compounding problems</span>
        <span className="text-stone-300">·</span>
        <span><span className="font-medium text-amber-800">{activeOpportunities.length}</span> compounding opportunities</span>
        <span className="text-stone-300">·</span>
        <span><span className="font-medium text-indigo-800">{activeMixed.length}</span> mixed signals</span>
        {totalDismissed > 0 && (
          <>
            <span className="text-stone-300">·</span>
            <span className="text-stone-400">{totalDismissed} snoozed/removed</span>
          </>
        )}
        <span className="text-stone-300">·</span>
        <span className="text-stone-500 italic">across {Object.keys(buildingReport.byBuilding).length} buildings × {weeksReport.weeks.length} weeks</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* PROBLEMS table */}
        <div className="border border-rose-300 rounded-sm bg-white overflow-hidden">
          <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-rose-700" />
              <span className="text-[13px] font-semibold text-rose-900">Biggest problems</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-rose-700 mono">
                {problemsTop.length} of {activeProblems.length}
              </span>
              <CopyButton bucketName="problems" pairs={problemsTop} accent="rose" format="tsv" />
              <CopyButton bucketName="problems" pairs={problemsTop} accent="rose" format="markdown" />
            </div>
          </div>
          {problemsTop.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-stone-500 italic">
              No compounding problems — no building × week pairs where BOTH are flagged with downside signals.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-rose-100/60 border-b border-rose-200">
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-rose-900 font-semibold">#</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-rose-900 font-semibold">Building</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-rose-900 font-semibold">Week</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-rose-900 font-semibold">Rev gap</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-rose-900 font-semibold">Bldg flags</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-rose-900 font-semibold">Week flags</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-rose-900 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {problemsTop.map((p, i) => (
                    <PairRow
                      key={`p-${p.building}-${p.weekIso}-${(pageProblems - 1) * perPage + i}`}
                      pair={p}
                      isProblem={true}
                      i={(pageProblems - 1) * perPage + i}
                      bucket="problem"
                      accent="rose"
                    />
                  ))}
                </tbody>
              </table>
              {/* Pager — appears only when there's more than one page */}
              {activeProblems.length > perPage && (
                <div className="px-4 py-2 border-t border-rose-200 bg-rose-50/40 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-rose-700 mono">
                    Showing {(pageProblems - 1) * perPage + 1}–{Math.min(pageProblems * perPage, activeProblems.length)} of {activeProblems.length}
                  </span>
                  <Pager bucketName="problems" currentPage={pageProblems} totalItems={activeProblems.length} accent="rose" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* OPPORTUNITIES table */}
        <div className="border border-amber-300 rounded-sm bg-white overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-700" />
              <span className="text-[13px] font-semibold text-amber-900">Biggest opportunities</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-amber-700 mono">
                {opportunitiesTop.length} of {activeOpportunities.length}
              </span>
              <CopyButton bucketName="opportunities" pairs={opportunitiesTop} accent="amber" format="tsv" />
              <CopyButton bucketName="opportunities" pairs={opportunitiesTop} accent="amber" format="markdown" />
            </div>
          </div>
          {opportunitiesTop.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-stone-500 italic">
              No compounding opportunities — no building × week pairs where BOTH are flagged with upside signals.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-amber-100/60 border-b border-amber-200">
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-amber-900 font-semibold">#</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-amber-900 font-semibold">Building</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-amber-900 font-semibold">Week</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-amber-900 font-semibold">Rev gap</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-amber-900 font-semibold">Bldg flags</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-amber-900 font-semibold">Week flags</th>
                    <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-amber-900 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunitiesTop.map((p, i) => (
                    <PairRow
                      key={`o-${p.building}-${p.weekIso}-${(pageOpps - 1) * perPage + i}`}
                      pair={p}
                      isProblem={false}
                      i={(pageOpps - 1) * perPage + i}
                      bucket="opportunity"
                      accent="amber"
                    />
                  ))}
                </tbody>
              </table>
              {activeOpportunities.length > perPage && (
                <div className="px-4 py-2 border-t border-amber-200 bg-amber-50/40 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-amber-700 mono">
                    Showing {(pageOpps - 1) * perPage + 1}–{Math.min(pageOpps * perPage, activeOpportunities.length)} of {activeOpportunities.length}
                  </span>
                  <Pager bucketName="opportunities" currentPage={pageOpps} totalItems={activeOpportunities.length} accent="amber" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MIXED SIGNALS table — pairs where the flag direction disagrees with the
          revenue direction. These are worth investigating: flag is a leading
          indicator, revenue is the cumulative result, so they tell different
          stories. */}
      {activeMixed.length > 0 && (
        <div className="mt-4 border border-indigo-300 rounded-sm bg-white overflow-hidden">
          <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-indigo-700" />
              <span className="text-[13px] font-semibold text-indigo-900">Mixed signals</span>
              <span className="text-[10px] text-indigo-700 italic">flag direction ≠ revenue direction</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-700 mono">
                {mixedTop.length} of {activeMixed.length}
              </span>
              <CopyButton bucketName="mixed" pairs={mixedTop} accent="indigo" format="tsv" />
              <CopyButton bucketName="mixed" pairs={mixedTop} accent="indigo" format="markdown" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-indigo-100/60 border-b border-indigo-200">
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">#</th>
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">Building</th>
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">Week</th>
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">Rev gap</th>
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">Bldg flags</th>
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">Week flags</th>
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">Why mixed</th>
                  <th className="text-left px-2 py-1.5 text-[9px] uppercase tracking-wider text-indigo-900 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {mixedTop.map((p, idx) => {
                  // Use global index (not page-local) for the # column so users
                  // can reference "row 23" consistently across pages.
                  const i = (pageMixed - 1) * perPage + idx;
                  const flagSev = p.buildingFlags[0]?.severity; // 'problem' or 'opportunity'
                  const flagBg = flagSev === 'problem' ? 'bg-rose-100 text-rose-900 border border-rose-300' : 'bg-amber-100 text-amber-900 border border-amber-300';
                  return (
                    <tr key={`m-${p.building}-${p.weekIso}-${i}`} className={`border-b border-stone-100 ${idx % 2 === 1 ? 'bg-stone-50/50' : 'bg-white'}`}>
                      <td className="px-2 py-1.5 text-stone-500 mono text-[10px]">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-stone-900 text-[12px]">{p.building}</div>
                        <div className="text-[9px] text-stone-500 mono">{p.monthLabel}</div>
                      </td>
                      <td className="px-2 py-1.5 max-w-[130px]">
                        <div className="text-[11px] text-stone-800 font-medium">W{p.weekIso?.split('-W')[1] || p.weekLabel}</div>
                        <div className="text-[9px] text-stone-500 mono">{p.weekDateRange}</div>
                        {p.eventName && (
                          <div className="text-[9px] text-purple-700 mt-0.5 italic truncate max-w-[120px]" title={p.eventName}>
                            {p.eventName}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 mono text-[10px]">
                        <div className={p.revenueGap != null && p.revenueGap < 0 ? 'text-rose-800 font-semibold' : 'text-emerald-800 font-semibold'}>
                          {fmtSignedMoney(p.revenueGap)}
                        </div>
                        <div className="text-[9px] text-stone-500">
                          {fmtMoney(p.tyRev)} vs {fmtMoney(p.stlyRev)}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-0.5">
                          {p.buildingFlags.map((f, fi) => (
                            <span key={fi} className={`inline-flex items-center px-1 py-0.5 rounded-sm text-[9px] mono ${flagBg}`} title={f.detail}>
                              {f.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-0.5">
                          {p.weekFlags.map((f, fi) => (
                            <span key={fi} className={`inline-flex items-center px-1 py-0.5 rounded-sm text-[9px] mono ${flagBg}`} title={f.detail}>
                              {f.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-indigo-900 italic">
                        {p.mixedReason}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <AddActionButton pair={p} bucket="mixed" accent="indigo" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {activeMixed.length > perPage && (
              <div className="px-4 py-2 border-t border-indigo-200 bg-indigo-50/40 flex items-center justify-between gap-2">
                <span className="text-[10px] text-indigo-700 mono">
                  Showing {(pageMixed - 1) * perPage + 1}–{Math.min(pageMixed * perPage, activeMixed.length)} of {activeMixed.length}
                </span>
                <Pager bucketName="mixed" currentPage={pageMixed} totalItems={activeMixed.length} accent="indigo" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dismissed pairs (snoozed + removed) */}
      {totalDismissed > 0 && (
          <div className="mt-4 border border-stone-200 rounded-sm bg-stone-50/50">
            <button
              onClick={() => setShowDismissed(prev => !prev)}
              className="w-full flex items-center gap-2 px-4 py-2 text-[11px] text-stone-500 hover:text-stone-700 transition-colors"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showDismissed ? '' : '-rotate-90'}`} />
              {totalDismissed} snoozed/removed row{totalDismissed === 1 ? '' : 's'}
            </button>
            {showDismissed && (
              <div className="border-t border-stone-200 overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-stone-100/60">
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-stone-500">Status</th>
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-stone-500">Building</th>
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-stone-500">Week</th>
                      <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-stone-500">Bucket</th>
                      <th className="px-3 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dismissedProblems, ...dismissedOpportunities, ...dismissedMixed].map((p, i) => {
                      const status = isPairDismissed(p);
                      return (
                        <tr key={`d-${p.building}-${p.weekIso}-${i}`} className="border-t border-stone-100">
                          <td className="px-3 py-1.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-medium ${
                              status === 'snoozed' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500'
                            }`}>
                              {status === 'snoozed' ? <><Clock className="w-2.5 h-2.5" /> Snoozed</> : <><EyeOff className="w-2.5 h-2.5" /> Removed</>}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-stone-500">{p.building} · {p.monthLabel}</td>
                          <td className="px-3 py-1.5 text-stone-500">{p.weekLabel}</td>
                          <td className="px-3 py-1.5 text-stone-400 capitalize">{p.bucket}</td>
                          <td className="px-3 py-1.5">
                            <button
                              onClick={() => handleRestorePair(p)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-sm transition-colors"
                            >
                              <Undo2 className="w-2.5 h-2.5" /> Restore
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      )}

      <div className="mt-6 text-[11px] text-stone-500 leading-relaxed max-w-3xl italic">
        <span className="text-stone-700 font-medium not-italic">Reading this:</span> a row appears when a building flags AND a week flags in the same month, both moving in the same direction AND consistent with revenue gap. <span className="font-medium not-italic">Mixed signals</span> shows pairs where the flag direction disagrees with the revenue direction — for example, a building flagged for "pickup behind STLY" (a leading indicator) while still having positive cumulative revenue (booked early). These are real signals worth investigating but don't fit cleanly as problems or opportunities. Building flags use monthly metrics (TY ADR/Occ/RevPAR vs STLY); week flags add the competitive indices (MPI/ADR Index/RevPAR Index). Revenue gap = building's monthly Rental Revenue − STLY Rental Revenue. Hover any flag chip to see the underlying values.
      </div>

      {/* Floating toast — confirms an action log row was created. Auto-dismisses
          after 3s. Clickable: switches to the Action Log tab so the user can
          immediately verify or edit the row. */}
      {addToast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-stone-900 text-white rounded-sm shadow-xl border border-stone-700 cursor-pointer hover:bg-stone-800 transition-colors max-w-sm"
          onClick={() => setActiveTab && setActiveTab('log')}
          title="Click to open the Action Log"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
            <div className="text-[12px] leading-snug">
              <div className="font-medium">Added to Action Log</div>
              <div className="text-stone-300 text-[11px] mt-0.5">
                {addToast.building} · {addToast.week} <span className="text-stone-500">({addToast.bucket})</span>
              </div>
              <div className="text-stone-400 text-[10px] mt-1 italic">Click to open the log →</div>
            </div>
          </div>
        </div>
      )}

      {/* Setting Modal */}
      {settingModal && (
        <SettingModal
          pair={settingModal.pair}
          bucket={settingModal.bucket}
          onClose={() => setSettingModal(null)}
          onRecord={(pair, bucket, info) => {
            const newRow = {
              id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              date: todayMDY(),
              owner: 'Liuba',
              reason: `Setting change (Summary · ${bucket}): ${pair.buildingFlags?.map(f => f.label).join(', ') || 'flagged'}`,
              affectedGroup: info.affectedGroup || pair.building,
              affectedDates: info.affectedDates || `${pair.monthLabel} · ${pair.weekLabel || ''}`,
              action: `${info.setting}: changed`,
              valueBefore: info.before,
              valueAfter: info.after,
              notes: info.notes || '',
              checkDone: false,
              followUpDate: followUpMDY(),
            };
            setRows(prev => [newRow, ...prev]);
            setAddToast({ building: pair.building, week: pair.weekLabel || '', bucket });
            setTimeout(() => setAddToast(null), 3000);
          }}
        />
      )}

      {/* Override Modal */}
      {overrideModal && (
        <OverrideModal
          pair={overrideModal.pair}
          bucket={overrideModal.bucket}
          onClose={() => setOverrideModal(null)}
          onRecordAction={(pair, bucket, overrideInfo) => {
            // Record the override as an action log entry
            const newRow = {
              id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              date: todayMDY(),
              owner: 'Liuba',
              reason: `Override applied (Summary · ${bucket})`,
              affectedGroup: pair.building,
              affectedDates: `${pair.monthLabel || ''} · ${pair.weekLabel || ''} · ${overrideInfo.dates}`,
              action: `Override: ${overrideInfo.description}`,
              valueBefore: overrideInfo.before || '',
              valueAfter: overrideInfo.after || '',
              notes: `Via PriceLabs API · listing ${overrideInfo.listingId}`,
              checkDone: false,
              followUpDate: followUpMDY(),
            };
            setRows(prev => [newRow, ...prev]);
            setAddToast({ building: pair.building, week: pair.weekLabel || '', bucket });
            setTimeout(() => setAddToast(null), 3000);
          }}
        />
      )}
    </div>
  );
}

/* ---------- PriceLabs Settings ---------- */

const PRICELABS_SETTINGS = [
  'Last Minute Prices',
  'Far Out Prices',
  'Booking Recency Factor',
  'Orphan Day Prices',
  'Occupancy Based Adjustments',
  'Safety Minimum Price',
  'Demand Factor Sensitivity',
  'Seasonality Factor Sensitivity',
  'Custom Seasonal Profile',
  'Weekend Adjustments',
  'Weekly Discounts',
  'Monthly Discounts',
  'Day of Week Pricing Adjustments',
  'Extra Person Fee',
  'Pricing Offset',
  'Rounding',
];

function SettingModal({ pair, bucket, onClose, onRecord }) {
  const [setting, setSetting] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [affectedGroup, setAffectedGroup] = useState(pair.building || '');
  const [affectedDates, setAffectedDates] = useState(
    `${pair.monthLabel || ''} · ${pair.weekLabel || ''} (${pair.weekDateRange || ''})`
  );
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!setting) return;
    onRecord(pair, bucket, { setting, before, after, affectedGroup, affectedDates, notes });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-200">
          <div>
            <h2 className="text-[14px] font-semibold text-stone-900">Adjust Setting</h2>
            <p className="text-[11px] text-stone-500">{pair.building} · {pair.weekLabel || pair.monthLabel}{pair.weekDateRange ? ` · ${pair.weekDateRange}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-lg">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Setting picker */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">PriceLabs Setting</label>
            <select
              value={setting}
              onChange={e => setSetting(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500 bg-white"
            >
              <option value="">Select a setting...</option>
              {PRICELABS_SETTINGS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Affected group */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">Affected Group</label>
            <input value={affectedGroup} onChange={e => setAffectedGroup(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
          </div>

          {/* Affected dates */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">Affected Dates</label>
            <input value={affectedDates} onChange={e => setAffectedDates(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
          </div>

          {/* Before / After */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">Value Before</label>
              <input value={before} onChange={e => setBefore(e.target.value)} placeholder="e.g. Aggressive"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">Value After</label>
              <input value={after} onChange={e => setAfter(e.target.value)} placeholder="e.g. Recommended"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional context..."
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-stone-200 bg-stone-50">
          <button onClick={onClose} className="text-[11px] text-stone-500 hover:text-stone-700">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!setting}
            className="px-4 py-2 text-[11px] font-semibold bg-stone-900 text-white rounded-sm hover:bg-stone-700 disabled:opacity-40 transition-colors"
          >
            Record Action
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Override Modal ---------- */

function OverrideModal({ pair, bucket, onClose, onRecordAction }) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState([]);
  const [error, setError] = useState('');
  const [listingId, setListingId] = useState('');
  const [pms, setPms] = useState('guesty');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Listings for this building group
  const [groupListings, setGroupListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  // Pricing context from PriceLabs API
  const [pricingData, setPricingData] = useState(null);
  const [loadingPricing, setLoadingPricing] = useState(false);

  // Form fields
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [priceType, setPriceType] = useState('fixed');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [minPrice, setMinPrice] = useState('');
  const [minStay, setMinStay] = useState('');
  // Selected listing IDs (all selected by default)
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());

  // Auto-fetch listings for this building group
  useEffect(() => {
    if (pair.building) {
      setLoadingListings(true);
      fetch(`/api/pricelabs/listings?building_group=${encodeURIComponent(pair.building)}`)
        .then(r => r.json())
        .then(data => {
          const listings = data.listings || [];
          setGroupListings(listings);
          setSelectedListings(new Set(listings.map(l => l.listing_id)));
        })
        .catch(() => {})
        .finally(() => setLoadingListings(false));
    }
  }, [pair.building]);

  // Auto-fetch pricing context (overrides + listing prices) when listings are loaded
  // Sends all listing IDs — API averages values when multiple listings in a group
  useEffect(() => {
    if (loadingListings || groupListings.length === 0) return;
    setLoadingPricing(true);
    const ids = groupListings.map(l => l.listing_id).join(',');
    const firstPms = groupListings[0].pms || 'guesty';
    // Fetch pricing data — limit to first 5 listings to avoid timeout
    const limitedIds = groupListings.slice(0, 5).map(l => l.listing_id).join(',');
    fetch(`/api/pricelabs/listing-prices?listingIds=${limitedIds}&pms=${firstPms}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          console.warn('Listing prices error:', data.error);
          setError(data.error);
        }
        if (data.pricesDebug) {
          console.warn('Listing prices debug (all attempts failed):', data.pricesDebug);
        }
        if (data.pricesSource) {
          console.log('Listing prices loaded via:', data.pricesSource);
        }
        if (data.overrides) setExisting(data.overrides);
        if (data.listing) setPricingData(data.listing);
        setLoading(false);
      })
      .catch(e => {
        console.error('Listing prices fetch failed:', e);
        setError(`Failed to fetch pricing data: ${e.message}`);
      })
      .finally(() => setLoadingPricing(false));
  }, [loadingListings, groupListings]);

  // Pre-fill dates from the pair's week range if available
  useEffect(() => {
    if (pair.weekDateRange) {
      // weekDateRange is like "May 18–24, 2026"
      // Try to extract start/end dates
      const match = pair.weekDateRange.match(/(\w+ \d+)[–-](\d+),?\s*(\d{4})/);
      if (match) {
        const year = match[3];
        const monthDay = match[1];
        const endDay = match[2];
        const start = new Date(`${monthDay}, ${year}`);
        const end = new Date(start);
        end.setDate(parseInt(endDay));
        if (!isNaN(start.getTime())) setDateFrom(start.toISOString().split('T')[0]);
        if (!isNaN(end.getTime())) setDateTo(end.toISOString().split('T')[0]);
      }
    }
  }, [pair]);

  // Fetch existing overrides when listing ID is entered
  const fetchOverrides = async () => {
    if (!listingId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/pricelabs/overrides?listingId=${listingId}&pms=${pms}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to fetch overrides');
        setExisting([]);
      } else {
        setExisting(data.overrides || []);
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  // Generate date range array
  const generateDates = (from, to) => {
    const dates = [];
    const d = new Date(from);
    const end = new Date(to);
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    return dates;
  };

  const handleSubmit = async () => {
    const targetListings = selectedListings.size > 0
      ? groupListings.filter(l => selectedListings.has(l.listing_id)).map(l => ({ id: l.listing_id, pms: l.pms || 'guesty' }))
      : listingId ? [{ id: listingId, pms }] : [];

    if (targetListings.length === 0 || !dateFrom || !dateTo) {
      setError('Select listings and date range');
      return;
    }
    setSubmitting(true);
    setError('');

    const dates = generateDates(dateFrom, dateTo);
    const overrides = dates.map(date => {
      const o = { date };
      if (price) {
        o.price = price;
        o.price_type = priceType;
        if (priceType === 'fixed') o.currency = currency;
      }
      if (minPrice) {
        o.min_price = parseInt(minPrice);
        o.min_price_type = 'fixed';
        o.currency = currency;
      }
      if (minStay) {
        o.min_stay = parseInt(minStay);
      }
      return o;
    });

    try {
      let successCount = 0;
      let failCount = 0;
      for (const target of targetListings) {
        const res = await fetch('/api/pricelabs/overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: target.id, pms: target.pms, overrides }),
        });
        if (res.ok) successCount++;
        else failCount++;
      }

      if (failCount > 0 && successCount === 0) {
        setError(`Failed to apply overrides to all ${failCount} listings`);
      } else {
        setSubmitted(true);
        const desc = [];
        if (price) desc.push(`${priceType === 'fixed' ? '$' : ''}${price}${priceType === 'percent' ? '%' : ''}`);
        if (minPrice) desc.push(`min $${minPrice}`);
        if (minStay) desc.push(`min stay ${minStay}n`);

        onRecordAction(pair, bucket, {
          listingId: targetListings.length > 1 ? `${targetListings.length} listings` : listingId,
          dates: `${dateFrom} → ${dateTo}`,
          description: desc.join(', ') || 'override applied',
          before: existing.length > 0 ? `${existing.length} existing overrides` : 'none',
          after: `${dates.length} dates × ${successCount} listings${failCount ? ` (${failCount} failed)` : ''}`,
        });

        setTimeout(onClose, 1500);
      }
    } catch (e) {
      setError(String(e));
    }
    setSubmitting(false);
  };

  const handleDelete = async (date) => {
    // Delete from all selected listings (or manual listingId if no group)
    const targets = selectedListings.size > 0
      ? groupListings.filter(l => selectedListings.has(l.listing_id)).map(l => ({ id: l.listing_id, pms: l.pms || 'guesty' }))
      : listingId ? [{ id: listingId, pms }] : [];
    if (targets.length === 0) return;
    try {
      for (const target of targets) {
        await fetch('/api/pricelabs/overrides', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: target.id, pms: target.pms, overrides: [{ date }] }),
        });
      }
      setExisting(prev => prev.filter(o => o.date !== date));
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-200">
          <div>
            <h2 className="text-[14px] font-semibold text-stone-900">Price Override</h2>
            <p className="text-[11px] text-stone-500">{pair.building} · {pair.weekLabel || pair.monthLabel}{pair.weekDateRange ? ` · ${pair.weekDateRange}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-lg">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Listings in this building group */}
          {loadingListings ? (
            <div className="text-[11px] text-stone-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading listings for {pair.building}...
            </div>
          ) : groupListings.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-wider text-stone-500">
                  Listings in {pair.building} ({selectedListings.size}/{groupListings.length} selected)
                </label>
                <button
                  onClick={() => {
                    if (selectedListings.size === groupListings.length) {
                      setSelectedListings(new Set());
                    } else {
                      setSelectedListings(new Set(groupListings.map(l => l.listing_id)));
                    }
                  }}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800"
                >
                  {selectedListings.size === groupListings.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-sm">
                {groupListings.map(l => (
                  <label
                    key={l.listing_id}
                    className={`flex items-center gap-2 px-2 py-1.5 border-b border-stone-100 last:border-0 cursor-pointer hover:bg-stone-50 text-[11px] ${
                      selectedListings.has(l.listing_id) ? 'text-stone-900' : 'text-stone-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedListings.has(l.listing_id)}
                      onChange={() => {
                        setSelectedListings(prev => {
                          const next = new Set(prev);
                          if (next.has(l.listing_id)) next.delete(l.listing_id);
                          else next.add(l.listing_id);
                          return next;
                        });
                      }}
                      className="accent-indigo-500 shrink-0"
                    />
                    <span className="truncate" title={l.listing_name}>{l.listing_name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">Listing ID (no mapping found)</label>
                <div className="flex gap-2">
                  <input
                    value={listingId}
                    onChange={e => setListingId(e.target.value)}
                    placeholder="e.g. 640f2a1a19ef5f003879cc6b"
                    className="flex-1 px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={fetchOverrides}
                    disabled={!listingId.trim()}
                    className="px-3 py-2 text-[11px] font-medium bg-stone-900 text-white rounded-sm hover:bg-stone-700 disabled:opacity-40"
                  >
                    Check
                  </button>
                </div>
              </div>
              <div className="w-24">
                <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">PMS</label>
                <select value={pms} onChange={e => setPms(e.target.value)} className="w-full px-2 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500">
                  <option value="guesty">Guesty</option>
                  <option value="airbnb">Airbnb</option>
                  <option value="vrbo">VRBO</option>
                  <option value="hostaway">Hostaway</option>
                </select>
              </div>
            </div>
          )}

          {/* Pricing context from PriceLabs API */}
          {loadingPricing && (
            <div className="text-[11px] text-stone-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading pricing data from PriceLabs...
            </div>
          )}
          {pricingData && pricingData.data && pricingData.data.length > 0 && (() => {
            // Filter pricing data to the selected date range (or show first 14 days)
            const allDays = pricingData.data;
            const filteredDays = dateFrom && dateTo
              ? allDays.filter(d => d.date >= dateFrom && d.date <= dateTo)
              : allDays.slice(0, 14);
            const displayDays = filteredDays.length > 0 ? filteredDays : allDays.slice(0, 7);
            // Extract listing-level info — use averaged info if available, else first day with reason data
            const dayWithReason = allDays.find(d => d.reason?.listing_info);
            const listingInfo = pricingData._averaged_listing_info || dayWithReason?.reason?.listing_info;
            return (
              <div className="border border-indigo-200 rounded-sm bg-indigo-50/30">
                <div className="px-3 py-2 border-b border-indigo-200 bg-indigo-50">
                  <div className="text-[10px] uppercase tracking-wider text-indigo-700 font-semibold">
                    Pricing Context — {pricingData.id || groupListings[0]?.listing_id}
                    {pricingData._listing_count > 1 && (
                      <span className="text-indigo-500 font-normal ml-1">(averaged across {pricingData._listing_count} listings)</span>
                    )}
                  </div>
                  {pricingData.currency && (
                    <span className="text-[10px] text-indigo-500 ml-1">({pricingData.currency})</span>
                  )}
                </div>

                {/* Listing-level metrics */}
                {listingInfo && (
                  <div className="px-3 py-2 border-b border-indigo-100 grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                    <div>
                      <span className="text-stone-500">Base Price:</span>{' '}
                      <span className="font-medium text-stone-900">${listingInfo.base_price}</span>
                      {listingInfo.base_price_type && (
                        <span className="text-[9px] text-stone-400 ml-1">({listingInfo.base_price_type})</span>
                      )}
                    </div>
                    <div>
                      <span className="text-stone-500">Min:</span>{' '}
                      <span className="font-medium text-stone-900">${listingInfo.minimum_price}</span>
                    </div>
                    <div>
                      <span className="text-stone-500">Max:</span>{' '}
                      <span className="font-medium text-stone-900">${listingInfo.maximum_price}</span>
                    </div>
                    <div>
                      <span className="text-stone-500">Occupancy:</span>{' '}
                      <span className="font-medium text-stone-900">{typeof listingInfo.occupancy === 'number' ? `${(listingInfo.occupancy * 100).toFixed(0)}%` : listingInfo.occupancy || '—'}</span>
                    </div>
                    <div>
                      <span className="text-stone-500">Nhood Occ:</span>{' '}
                      <span className="font-medium text-stone-900">{listingInfo.nhood_occ || '—'}</span>
                    </div>
                    <div>
                      <span className="text-stone-500">ADR STLY:</span>{' '}
                      <span className="font-medium text-stone-900">{listingInfo.ADR_STLY != null && listingInfo.ADR_STLY !== -1 ? `$${listingInfo.ADR_STLY}` : '—'}</span>
                    </div>
                  </div>
                )}

                {/* LOS pricing if available */}
                {pricingData.los_pricing && Object.keys(pricingData.los_pricing).length > 0 && (
                  <div className="px-3 py-1.5 border-b border-indigo-100">
                    <div className="text-[9px] uppercase tracking-wider text-stone-400 mb-1">LOS Adjustments</div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.values(pricingData.los_pricing).map((los: any) => (
                        <span key={los.los_night} className="text-[10px] mono px-1.5 py-0.5 bg-white border border-stone-200 rounded-sm">
                          {los.los_night}n: <span className={Number(los.los_adjustment) < 0 ? 'text-rose-700' : 'text-emerald-700'}>{Number(los.los_adjustment) > 0 ? '+' : ''}{los.los_adjustment}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily pricing breakdown */}
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-indigo-50">
                      <tr className="text-indigo-800">
                        <th className="text-left px-2 py-1 font-semibold">Date</th>
                        <th className="text-right px-2 py-1 font-semibold">PL Price</th>
                        <th className="text-right px-2 py-1 font-semibold">User Price</th>
                        <th className="text-right px-2 py-1 font-semibold">Min Stay</th>
                        <th className="text-left px-2 py-1 font-semibold">Demand</th>
                        <th className="text-left px-2 py-1 font-semibold">Status STLY</th>
                        <th className="text-right px-2 py-1 font-semibold">ADR STLY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayDays.map((d, i) => {
                        const hasUserOverride = d.user_price && d.user_price !== d.price;
                        return (
                          <tr key={d.date} className={`border-t border-indigo-100 ${i % 2 === 1 ? 'bg-indigo-50/20' : ''}`}>
                            <td className="px-2 py-1 mono text-stone-700">{d.date}</td>
                            <td className="px-2 py-1 text-right mono font-medium text-stone-900">${d.price}</td>
                            <td className={`px-2 py-1 text-right mono font-medium ${hasUserOverride ? 'text-indigo-700' : 'text-stone-400'}`}>
                              {d.user_price ? `$${d.user_price}` : '—'}
                            </td>
                            <td className="px-2 py-1 text-right mono text-stone-600">{d.min_stay || '—'}</td>
                            <td className="px-2 py-1">
                              {d.demand_desc && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.demand_color || '#ccc' }} />
                                  <span className="text-stone-600 truncate max-w-[80px]" title={d.demand_desc}>{d.demand_desc}</span>
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-stone-600">
                              {d.booking_status_STLY || '—'}
                            </td>
                            <td className="px-2 py-1 text-right mono text-stone-600">
                              {d.ADR_STLY != null && d.ADR_STLY !== -1 ? `$${d.ADR_STLY}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pricing factors for first day with reason data */}
                {dayWithReason?.market_factors && (
                  <div className="px-3 py-1.5 border-t border-indigo-100">
                    <div className="text-[9px] uppercase tracking-wider text-stone-400 mb-1">Market Factors (sample: {dayWithReason.date})</div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.values(dayWithReason.market_factors).map((f: any, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white border border-stone-200 rounded-sm">
                          {f.title}: <span className={f.value?.startsWith('-') ? 'text-rose-700 font-medium' : 'text-emerald-700 font-medium'}>{f.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {dayWithReason?.pricing_customizations && (
                  <div className="px-3 py-1.5 border-t border-indigo-100">
                    <div className="text-[9px] uppercase tracking-wider text-stone-400 mb-1">Pricing Customizations</div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.values(dayWithReason.pricing_customizations).map((f: any, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white border border-stone-200 rounded-sm">
                          {f.title}: <span className={f.value?.startsWith('-') ? 'text-rose-700 font-medium' : 'text-emerald-700 font-medium'}>{f.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Existing overrides — enriched with listing_prices data */}
          {existing.length > 0 && (() => {
            // Build date → pricing day lookup from listing_prices data
            const pricingByDate = {};
            if (pricingData?.data) {
              pricingData.data.forEach(d => { pricingByDate[d.date] = d; });
            }
            return (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">
                Existing Overrides ({existing.length}){groupListings.length > 1 && <span className="text-stone-400 font-normal ml-1">· showing {groupListings[0]?.listing_name?.split(' -- ')[0] || 'first listing'}</span>}
              </label>
              <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-sm">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-stone-50">
                    <tr className="text-stone-500">
                      <th className="text-left px-2 py-1 font-semibold">Date</th>
                      <th className="text-right px-2 py-1 font-semibold">Override</th>
                      <th className="text-left px-2 py-1 font-semibold">Type</th>
                      <th className="text-right px-2 py-1 font-semibold">PL Price</th>
                      <th className="text-right px-2 py-1 font-semibold">User Price</th>
                      <th className="text-right px-2 py-1 font-semibold">Min Stay</th>
                      <th className="text-left px-2 py-1 font-semibold">Demand</th>
                      <th className="text-right px-2 py-1 font-semibold" title="Listing occupancy">Occ</th>
                      <th className="text-right px-2 py-1 font-semibold" title="Neighborhood occupancy">Nhood</th>
                      <th className="text-right px-2 py-1 font-semibold">ADR STLY</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {existing.map((o, idx) => {
                      const pd = pricingByDate[o.date];
                      return (
                      <tr key={o.date} className={`border-t border-stone-100 ${idx % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                        <td className="px-2 py-1 mono text-stone-700">{o.date}</td>
                        <td className="px-2 py-1 text-right mono font-medium text-stone-900">{o.price || '—'}</td>
                        <td className="px-2 py-1 text-stone-600">{o.price_type || '—'}</td>
                        <td className="px-2 py-1 text-right mono text-stone-700">{pd?.price != null ? `$${pd.price}` : '—'}</td>
                        <td className={`px-2 py-1 text-right mono ${pd?.user_price && pd.user_price !== pd.price ? 'text-indigo-700 font-medium' : 'text-stone-400'}`}>
                          {pd?.user_price != null ? `$${pd.user_price}` : '—'}
                        </td>
                        <td className="px-2 py-1 text-right mono text-stone-600">{o.min_stay || pd?.min_stay || '—'}</td>
                        <td className="px-2 py-1">
                          {pd?.demand_desc ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: pd.demand_color || '#ccc' }} />
                              <span className="text-stone-600 truncate max-w-[70px]" title={pd.demand_desc}>{pd.demand_desc}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-1 text-right mono text-stone-600">
                          {pd?.reason?.listing_info?.occupancy != null
                            ? `${Math.round(Number(pd.reason.listing_info.occupancy) * 100)}%`
                            : '—'}
                        </td>
                        <td className="px-2 py-1 text-right mono text-stone-600">
                          {pd?.reason?.listing_info?.nhood_occ || '—'}
                        </td>
                        <td className="px-2 py-1 text-right mono text-stone-600">
                          {pd?.ADR_STLY != null && pd.ADR_STLY !== -1 ? `$${pd.ADR_STLY}` : '—'}
                        </td>
                        <td className="px-2 py-1">
                          <button onClick={() => handleDelete(o.date)} className="text-rose-500 hover:text-rose-700">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

          {/* Date range */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 block mb-1">Date Range</label>
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
              <span className="text-stone-400">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          {/* Price Settings */}
          <div className="bg-stone-50 border border-stone-200 rounded-sm p-3">
            <label className="text-[10px] uppercase tracking-wider text-stone-600 font-semibold block mb-2">Price Settings</label>
            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-stone-700 font-medium">New Final Price</span>
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input type="radio" name="priceType" value="fixed" checked={priceType === 'fixed'} onChange={() => setPriceType('fixed')} className="accent-rose-500" />
                    Fixed
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input type="radio" name="priceType" value="percent" checked={priceType === 'percent'} onChange={() => setPriceType('percent')} className="accent-rose-500" />
                    Percent
                  </label>
                  <input value={price} onChange={e => setPrice(e.target.value)} placeholder={priceType === 'fixed' ? '250' : '10'}
                    className="w-20 px-2 py-1.5 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
                  {priceType === 'fixed' && (
                    <span className="text-[11px] text-stone-400">{currency}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                <div>
                  <span className="text-[11px] text-stone-700 font-medium">Min Price</span>
                  <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Optional"
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <span className="text-[11px] text-stone-700 font-medium">Currency</span>
                  <input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="USD"
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Stay Restrictions */}
          <div className="bg-stone-50 border border-stone-200 rounded-sm p-3">
            <label className="text-[10px] uppercase tracking-wider text-stone-600 font-semibold block mb-2">Stay Restrictions</label>
            <div>
              <span className="text-[11px] text-stone-700 font-medium">Minimum Stay</span>
              <div className="flex items-center gap-2 mt-1">
                <input value={minStay} onChange={e => setMinStay(e.target.value)} placeholder="0"
                  className="w-20 px-2 py-1.5 text-sm border border-stone-300 rounded-sm focus:outline-none focus:border-indigo-500" />
                <span className="text-[11px] text-stone-500">Night(s)</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-700">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}

          {submitted && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
              <Check className="w-3 h-3" /> Override applied and recorded in Action Log
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-stone-200 bg-stone-50">
          <button onClick={onClose} className="text-[11px] text-stone-500 hover:text-stone-700">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (!listingId && selectedListings.size === 0) || !dateFrom || !dateTo || submitted}
            className="px-4 py-2 text-[11px] font-semibold bg-indigo-600 text-white rounded-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {submitting ? <><Loader2 className="w-3 h-3 animate-spin" /> Applying...</> : 'Confirm Override'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RulesTab() {
  // Local helpers to render a single rule entry consistently
  const RuleSection = ({ kicker, title, children }) => (
    <section className="mb-8">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 font-semibold mb-1">{kicker}</div>
      <h2 className="text-lg font-semibold text-stone-900 mb-3">{title}</h2>
      <div className="border border-stone-200 rounded-sm bg-white">
        {children}
      </div>
    </section>
  );

  const Rule = ({ id, severity, name, when, why, last }) => {
    const palette = severity === 'opportunity'
      ? { iconBg: 'bg-amber-600', tag: 'bg-amber-100 text-amber-900 border-amber-300', tagLabel: 'Opportunity' }
      : severity === 'problem'
      ? { iconBg: 'bg-rose-600', tag: 'bg-rose-100 text-rose-900 border-rose-300', tagLabel: 'Problem' }
      : { iconBg: 'bg-stone-600', tag: 'bg-stone-100 text-stone-700 border-stone-300', tagLabel: 'Info' };
    const Icon = severity === 'opportunity' ? Sparkles : severity === 'problem' ? Flag : CheckCircle2;
    return (
      <div className={`px-4 py-3 ${last ? '' : 'border-b border-stone-100'}`}>
        <div className="flex items-baseline justify-between gap-3 mb-1.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-5 h-5 ${palette.iconBg} text-white rounded-sm shrink-0`}>
              <Icon className="w-3 h-3" />
            </span>
            <span className="text-[13px] font-semibold text-stone-900">{name}</span>
            <span className="text-[10px] mono text-stone-400">{id}</span>
          </div>
          <span className={`text-[10px] inline-flex items-center px-1.5 py-0.5 ${palette.tag} border rounded-sm font-medium`}>
            {palette.tagLabel}
          </span>
        </div>
        <div className="text-[11px] leading-relaxed ml-7">
          <div className="mb-1">
            <span className="text-stone-500 font-medium">Fires when:</span>{' '}
            <span className="text-stone-800">{when}</span>
          </div>
          <div>
            <span className="text-stone-500 font-medium">Why:</span>{' '}
            <span className="text-stone-700 italic">{why}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <p className="text-[13px] text-stone-700 leading-relaxed mb-1">
          These rules run automatically against every PriceLabs <span className="mono text-[12px]">Total Revenue On The Books</span> report uploaded to the funnel. They flag months and buildings that need attention so you don't have to scan the entire report manually.
        </p>
        <p className="text-[12px] text-stone-500 leading-relaxed">
          Past months (DBA = 0) are excluded from all rules — flags are forward-looking only. Rules apply equally to Portfolio, Building, Season/Month, and Listing levels.
        </p>
      </div>

      {/* PICKUP RULES */}
      <RuleSection kicker="① Pickup vs Last Year" title="3-day and 7-day pickup pacing">
        <Rule
          id="pickup3d-zero / pickup7d-zero"
          severity="problem"
          name="Pickup zeroed out"
          when={<>This-year pickup = $0 AND last-year pickup &gt; $0 (we used to pick up at this DBA, now we don't).</>}
          why="$0 against a non-zero baseline often signals a pricing block, calendar issue, or sync-off problem — qualitatively different from underperforming, so it gets its own flag."
        />
        <Rule
          id="pickup3d-behind / pickup7d-behind"
          severity="problem"
          name="Pickup behind LY"
          when={<>This-year pickup &lt; <span className="mono">{(100 * (1 - PICKUP_BEHIND_THRESHOLD)).toFixed(0)}%</span> of last-year pickup, when LY &gt; $0. When LY ≤ $0, falls back to direction comparison with $1,000 minimum gap.</>}
          why="A 10% threshold catches real signal while ignoring normal week-to-week noise. Tighter would over-trigger; looser would miss problems too late."
        />
        <Rule
          id="pickup3d-ahead / pickup7d-ahead"
          severity="opportunity"
          name="Pickup ahead of LY"
          when={<>This-year pickup &gt; <span className="mono">{(100 * (1 + PICKUP_AHEAD_THRESHOLD)).toFixed(0)}%</span> of last-year pickup, when LY &gt; $0.</>}
          why="Pickup pacing this far ahead of LY suggests room to test pricing premiums — yield opportunity worth investigating."
          last
        />
      </RuleSection>

      {/* ADR / OCC / REVPAR RULES */}
      <RuleSection kicker="② ADR, Occupancy, RevPAR vs STLY" title="Rate and demand metrics">
        <Rule
          id="adr-low"
          severity="problem"
          name="ADR below STLY"
          when={<>This-year Rental ADR &lt; STLY × <span className="mono">{(1 - ADR_PROBLEM_THRESHOLD).toFixed(2)}</span> (i.e., more than {(ADR_PROBLEM_THRESHOLD * 100).toFixed(0)}% below STLY).</>}
          why="A 5% relative threshold filters out routine day-to-day noise vs STLY while still catching real signal. Tighter would over-trigger on minor variations; looser would miss problems too late to course-correct."
        />
        <Rule
          id="occ-low"
          severity="problem"
          name="Occupancy below STLY"
          when={<>This-year Occupancy is more than <span className="mono">{OCC_PROBLEM_THRESHOLD}pp</span> below STLY (e.g., 50% TY vs 56% STLY = −6pp = problem; 50% vs 54% = −4pp = no flag).</>}
          why="Occupancy is already a percentage, so a percentage-point gap (rather than relative %) is the natural threshold. 5pp below STLY at the same DBA means demand has softened materially — could be pricing too high, or genuine market softness. Investigate to determine cause before adjusting."
        />
        <Rule
          id="revpar-low"
          severity="problem"
          name="RevPAR below STLY"
          when={<>This-year Rental RevPAR &lt; STLY × <span className="mono">{(1 - REVPAR_PROBLEM_THRESHOLD).toFixed(2)}</span> (i.e., more than {(REVPAR_PROBLEM_THRESHOLD * 100).toFixed(0)}% below STLY).</>}
          why="RevPAR (revenue per available night) combines ADR and occupancy. A 5% drop here is the bottom-line signal that the pricing strategy is leaving money on the table."
        />
        <Rule
          id="rev-low"
          severity="problem"
          name="Revenue below STLY"
          when={<>This-year Rental Revenue &lt; STLY × <span className="mono">{(1 - REV_PROBLEM_THRESHOLD).toFixed(2)}</span> (i.e., more than {(REV_PROBLEM_THRESHOLD * 100).toFixed(0)}% below STLY).</>}
          why="The bottom-line outcome itself, not a rate or density indicator. Fires when small ADR/Occ misses compound into a real dollar gap, OR when STLY had abnormal upside we're not matching. Same 5% threshold as ADR/RevPAR for internal consistency. Visible in the new Rev Gap column on every month row."
        />
        <Rule
          id="occ-high"
          severity="opportunity"
          name="Occupancy outpacing STLY"
          when={<>This-year Occupancy &gt; STLY + <span className="mono">{OCCUPANCY_OUTPACE_THRESHOLD}pp</span>.</>}
          why="A 10-percentage-point lead suggests demand is materially stronger than the same time last year — opportunity to test higher rates without sacrificing occupancy."
          last
        />
      </RuleSection>

      {/* CASCADE RULE */}
      <RuleSection kicker="③ Portfolio segment cascade" title="Cross-segment flag deduplication">
        <div className="px-4 py-3 text-[12px] leading-relaxed text-stone-700">
          <p className="mb-2">
            When all three Portfolio segments (<span className="mono">All</span>, <span className="mono">PH</span>, <span className="mono">Excl PH</span>) have today's report uploaded, flags are deduplicated to the most specific accurate level:
          </p>
          <table className="w-full text-[11px] border border-stone-200 mt-2">
            <thead>
              <tr className="bg-stone-100 border-b border-stone-200">
                <th className="text-left px-3 py-1.5 font-semibold">Situation</th>
                <th className="text-left px-3 py-1.5 font-semibold">Where flag shows</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100">
                <td className="px-3 py-1.5">All flagged + PH flagged + Excl PH flagged</td>
                <td className="px-3 py-1.5"><span className="mono font-medium">All</span> only (truly portfolio-wide)</td>
              </tr>
              <tr className="border-b border-stone-100">
                <td className="px-3 py-1.5">All flagged + PH flagged + Excl PH not flagged</td>
                <td className="px-3 py-1.5"><span className="mono font-medium">PH</span> only (PH-specific)</td>
              </tr>
              <tr className="border-b border-stone-100">
                <td className="px-3 py-1.5">All flagged + Excl PH flagged + PH not flagged</td>
                <td className="px-3 py-1.5"><span className="mono font-medium">Excl PH</span> only</td>
              </tr>
              <tr className="border-b border-stone-100">
                <td className="px-3 py-1.5">Only PH flagged</td>
                <td className="px-3 py-1.5"><span className="mono font-medium">PH</span> only</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5">Only Excl PH flagged</td>
                <td className="px-3 py-1.5"><span className="mono font-medium">Excl PH</span> only</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 italic text-stone-600 text-[11px]">
            Why: without dedup, the same flag echoes across all three sub-tabs, padding the count and obscuring which segment is actually the cause. Cascade collapses noise into signal.
          </p>
          <p className="mt-2 italic text-stone-500 text-[11px]">
            Cascade only runs when all three segments have today's report uploaded. With partial uploads, flags display as-is and a status indicator notes that cascade is inactive.
          </p>
        </div>
      </RuleSection>

      {/* BUILDING SEGMENT MAPPING */}
      <RuleSection kicker="④ Building → Segment mapping" title="How buildings are classified into PH or Excl PH">
        <div className="px-4 py-3 text-[12px] leading-relaxed text-stone-700">
          <p className="mb-2">
            Building (Group) names from the multi-building report are automatically classified into one of two segments based on naming convention:
          </p>
          <ul className="space-y-1 mb-3">
            <li><span className="mono bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-sm border border-purple-200 text-[10px] font-medium">PH</span>{' '}— Group name is exactly <span className="mono">"PH"</span> (case-insensitive) OR ends with <span className="mono">.PH</span>, <span className="mono"> PH</span>, <span className="mono">-PH</span>, or <span className="mono">/PH</span>.</li>
            <li><span className="mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-sm border border-emerald-200 text-[10px] font-medium">Excl PH</span>{' '}— everything else (all non-penthouse buildings).</li>
          </ul>
          <p className="italic text-stone-600 text-[11px]">
            Why this rule shape: substring matching ("contains PH anywhere") would mis-classify buildings whose names happen to contain those letters (e.g. <span className="mono">Sapphire</span>). Anchored matching is robust against such false positives.
          </p>
        </div>
      </RuleSection>

      {/* CONTRIBUTING BUILDINGS */}
      <RuleSection kicker="⑤ Contribution chips on flag cards" title="Drill-down depending on which segment you're viewing">
        <div className="px-4 py-3 text-[12px] leading-relaxed text-stone-700">
          <p className="mb-3">
            When a flag fires at Portfolio level, the flag card shows contribution chips beneath the flag detail. The chip type adapts to the segment you're viewing:
          </p>

          <div className="border-l-2 border-stone-300 pl-3 mb-3">
            <div className="font-semibold text-stone-900 text-[12px] mb-1">All segment → segment chips</div>
            <p className="text-[11px] text-stone-600 leading-snug mb-1">
              Shows which sub-segment(s) — PH, Excl PH — are moving in the same direction as the flag, ranked by absolute gap.
            </p>
            <p className="text-[11px] italic text-stone-500 leading-snug">
              Example: a "3d pickup behind LY" flag on All shows only the segment(s) whose pickup is also behind LY. Tells the user which sub-tab to drill into next.
            </p>
          </div>

          <div className="border-l-2 border-stone-300 pl-3 mb-3">
            <div className="font-semibold text-stone-900 text-[12px] mb-1">PH or Excl PH segment → bidirectional building chips</div>
            <p className="text-[11px] text-stone-600 leading-snug mb-1">
              Shows up to the top 3 buildings in the SAME direction as the flag (driving the flag) AND up to the top 3 in the OPPOSITE direction (counteracting the flag). Both ranked by absolute gap.
            </p>
            <p className="text-[11px] italic text-stone-500 leading-snug">
              Why bidirectional: when investigating a flagged segment, you need to see who's at fault AND who's already performing. Adjusting pricing on a building that's outperforming would damage what's working.
            </p>
            <p className="text-[11px] italic text-stone-500 leading-snug mt-1">
              Note: PH segment chips will only show meaningful breakdowns if the PriceLabs report splits penthouses by building. With a single bundled "PH" group, no breakdown is possible — drill into individual listings at the Listing level instead.
            </p>
          </div>

          <p className="italic text-stone-600 text-[11px]">
            Requires a Building/Portfolio report with a <span className="mono">Group Name</span> column uploaded for the same date. If no building data is available, the chips simply don't appear.
          </p>

          <div className="mt-3 pt-3 border-t border-stone-200">
            <div className="font-semibold text-stone-900 text-[12px] mb-1.5">Drill-down sub-tabs</div>
            <p className="text-[11px] leading-snug mb-1">
              Two additional sub-tabs sit alongside All / PH / Excl PH at Portfolio level:
            </p>
            <ul className="text-[11px] leading-snug list-disc ml-4 space-y-1">
              <li><span className="mono font-medium">Building</span> — upload a building-grouped PriceLabs export to see per-building rows. Same flag rules apply per row.</li>
              <li><span className="mono font-medium">Listing</span> — upload a listing-level PriceLabs export to see per-listing rows.</li>
            </ul>
            <p className="text-[11px] leading-snug italic text-stone-500 mt-1">
              These are scope drill-downs, not segment slices. They have no cascade and no contributing-building chips of their own (the rows themselves ARE the contributors).
            </p>
          </div>
        </div>
      </RuleSection>

      {/* DATA INTERPRETATION */}
      <RuleSection kicker="⑥ Weekly indices (Weeks Report only)" title="Competitive-set rules vs the market">
        <div className="px-4 py-3 text-[12px] leading-relaxed text-stone-700 space-y-3">
          <p className="mb-2">
            The Weeks tab applies all the standard rules (pickup vs STLY, ADR/RevPAR &gt;5% below STLY, Occ &gt;5pp below STLY, occupancy outpace) plus three competitive-index rules that compare us against the market:
          </p>
          <table className="w-full text-[11px] border border-stone-200">
            <thead>
              <tr className="bg-stone-100 border-b border-stone-200">
                <th className="text-left px-3 py-1.5 font-semibold">Index</th>
                <th className="text-left px-3 py-1.5 font-semibold">Rule</th>
                <th className="text-left px-3 py-1.5 font-semibold">Severity</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100">
                <td className="px-3 py-1.5 mono">MPI</td>
                <td className="px-3 py-1.5">&gt; <span className="mono">{WEEK_MPI_OPPORTUNITY_THRESHOLD}%</span> — capturing meaningful market share</td>
                <td className="px-3 py-1.5"><span className="text-amber-800 font-medium">Opportunity</span></td>
              </tr>
              <tr className="border-b border-stone-100">
                <td className="px-3 py-1.5 mono">MPI</td>
                <td className="px-3 py-1.5">&lt; <span className="mono">{WEEK_MPI_PROBLEM_THRESHOLD}%</span> — materially below market</td>
                <td className="px-3 py-1.5"><span className="text-rose-800 font-medium">Problem</span></td>
              </tr>
              <tr className="border-b border-stone-100">
                <td className="px-3 py-1.5 mono">ADR Index</td>
                <td className="px-3 py-1.5">&lt; <span className="mono">{WEEK_ADR_INDEX_THRESHOLD}%</span> — underpriced vs market</td>
                <td className="px-3 py-1.5"><span className="text-rose-800 font-medium">Problem</span></td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 mono">RevPAR Index</td>
                <td className="px-3 py-1.5">&lt; <span className="mono">{WEEK_REVPAR_INDEX_THRESHOLD}%</span> — yield below 120% of market</td>
                <td className="px-3 py-1.5"><span className="text-rose-800 font-medium">Problem</span></td>
              </tr>
            </tbody>
          </table>
          <p className="italic text-stone-600 text-[11px] mt-2">
            <span className="font-medium">MPI</span> = (Your occupancy ÷ Market occupancy) × 100. <span className="font-medium">ADR Index</span> = (Your ADR ÷ Market ADR) × 100. <span className="font-medium">RevPAR Index</span> = (Your RevPAR ÷ Market RevPAR) × 100. All three are read directly from the PriceLabs Overview by Weeks export.
          </p>
          <p className="italic text-stone-600 text-[11px]">
            The 120% threshold on ADR and RevPAR Index reflects that as a luxury portfolio Cloud9 should expect to clear at least 20% above market parity — anything less suggests under-pricing.
          </p>
          <p className="italic text-stone-600 text-[11px] mt-2">
            <span className="font-medium">Empty-week exception:</span> when MPI, ADR Index, AND RevPAR Index all read 0%, the four index flags above are skipped entirely. All three indices reading 0 means there are no reservations yet for this week — far-out weeks before bookings start. That's a "data not present" signal, not "underperforming," so flagging would be misleading.
          </p>
        </div>
      </RuleSection>

      <RuleSection kicker="⑦ How metrics are calculated" title="Data definitions and caveats">
        <div className="px-4 py-3 text-[12px] leading-relaxed text-stone-700 space-y-3">
          <div>
            <span className="font-semibold text-stone-900">STLY vs LY (critical distinction):</span>{' '}
            <span className="mono">STLY</span> = Same Time Last Year — last year's value at this exact same DBA. <span className="mono">LY</span> = closed-week / closed-month total from last year. <span className="font-medium">All flag rules compare against STLY, not LY.</span> Comparing forward-looking weeks against closed LY values produces wrong signal: a week building up at $957 ADR vs closed-LY $668 looks "ahead" when it's actually $80 behind STLY ($1,037). Flag detail labels say "vs STLY" to make this explicit.
          </div>
          <div>
            <span className="font-semibold text-stone-900">Rental Revenue:</span>{' '}
            Read from the <span className="mono">Rental Revenue</span> column. Excludes cleaning fees and ancillary charges. Used as the headline revenue figure because pricing decisions only affect the rental rate; cleaning fees recover costs and aren't pricing-driven.
          </div>
          <div>
            <span className="font-semibold text-stone-900">DBA (Days Before Arrival):</span>{' '}
            Calculated as <span className="mono">(last day of month − today) + 1</span>, inclusive. Past months show as "closed".
          </div>
          <div>
            <span className="font-semibold text-stone-900">1-day pickup:</span>{' '}
            Computed as <span className="mono">today's Rental Revenue − yesterday's Rental Revenue</span> per month (or per building, at Building level). Requires a prior report from <span className="font-medium">exactly yesterday</span> — if the prior is from any other day, the column shows N/A and a "Prior is not yesterday" indicator appears. This is NET pickup (new bookings minus cancellations).
          </div>
          <div>
            <span className="font-semibold text-stone-900">3-day & 7-day pickup:</span>{' '}
            Read directly from PriceLabs columns (<span className="mono">Total Revenue Pickup (3 Days)</span> or <span className="mono">Rental Revenue Pickup (3 Days)</span> depending on which export template you use). Parser auto-detects which column name is present.
          </div>
          <div>
            <span className="font-semibold text-stone-900">Weeks Report STLY:</span>{' '}
            The Overview by Weeks export needs direct STLY columns (<span className="mono">Occupancy % STLY</span>, <span className="mono">Rental ADR STLY</span>, <span className="mono">Rental RevPAR STLY</span>). If those aren't present, the parser back-calculates STLY from the YoY-difference columns (<span className="mono">Occupancy STLY YoY Difference</span>, etc.). The upload card in the Weeks tab shows which source is in use.
          </div>
          <div>
            <span className="font-semibold text-stone-900">Goal %:</span>{' '}
            Per-month value comes directly from PriceLabs' <span className="mono">Total Revenue Goal Completion %</span> column. Shown only on the All segment because the goal is set portfolio-wide. The totals row Goal % is suppressed because mixing Rental Revenue (numerator) with Total Revenue Goal (denominator) would mislead.
          </div>
        </div>
      </RuleSection>

      <div className="mt-8 px-4 py-3 bg-stone-100 border border-stone-200 rounded-sm text-[11px] text-stone-600 leading-relaxed">
        Rules and thresholds are defined in code as constants. To change a threshold (e.g. switch the pickup band from ±10% to ±15%), edit <span className="mono">PICKUP_BEHIND_THRESHOLD</span> / <span className="mono">PICKUP_AHEAD_THRESHOLD</span> at the top of the file, and this page will reflect the new values automatically.
      </div>
    </div>
  );
}

/* ---------- Sync Report Button ---------- */

function SyncReportButton({ segment, onReportLoaded }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // PH and Excl PH are derived from the Building report (which has Group Name column)
  // so we download 'building' and parse it client-side.
  // Listing has its own report URL in PriceLabs Report Builder.
  const apiSegment = (segment === 'ph' || segment === 'exclPh') ? 'building' : segment;

  const sync = async () => {
    setSyncing(true);
    setError('');
    setDone(false);
    try {
      // Step 1: Try live sync from PriceLabs
      const syncRes = await fetch(`/api/pricelabs/daily-report?segment=${apiSegment}`, { method: 'POST' });
      let syncError = '';
      try {
        const syncData = await syncRes.json();
        if (!syncRes.ok || syncData.error) {
          syncError = syncData.error || `HTTP ${syncRes.status}`;
          console.warn('Live sync failed:', syncError);
        }
      } catch {
        syncError = `HTTP ${syncRes.status} (no response body)`;
        console.warn('Live sync failed:', syncError);
      }

      // Step 2: Fetch from Supabase (either just synced or previously stored)
      const res = await fetch('/api/pricelabs/portfolio-report');
      const data = await res.json();
      const reports = data.reports || [];

      // Find the latest report for this segment
      const match = reports.find(r => r.segment === apiSegment);
      if (!match?.report_data?.rawRows) {
        setError(syncError ? `Sync failed: ${syncError}` : 'No report found for this segment');
        setSyncing(false);
        return;
      }

      // Step 3: Parse rawRows into the format the Action Log expects
      let rawRows = match.report_data.rawRows;

      // For PH / Excl PH, filter the Building report rows by Group Name
      if (segment === 'ph' || segment === 'exclPh') {
        const groupCol = Object.keys(rawRows[0] || {}).find(k =>
          /group\s*name/i.test(k) || /^group$/i.test(k)
        );
        if (groupCol) {
          rawRows = segment === 'ph'
            ? rawRows.filter(r => buildingToSegment(String(r[groupCol] || '')) === 'ph')
            : rawRows.filter(r => buildingToSegment(String(r[groupCol] || '')) === 'exclPh');
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rawRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const arrayBuffer = XLSX.write(wb, { type: 'array' });

      const parsed = segment === 'weeks'
        ? parseWeeksReportFile(arrayBuffer, match.report_data.fileName || 'weeks-report.xlsx')
        : parseReportFile(arrayBuffer, match.report_data.fileName || `report-${segment}.xlsx`);

      // Step 4: Feed into the component via the same path as XLSX drop
      onReportLoaded(parsed);
      setDone(true);
    } catch (e) {
      setError(String(e));
    }
    setSyncing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={sync}
        disabled={syncing}
        className="px-3 py-1.5 text-[11px] font-medium bg-stone-900 text-white hover:bg-stone-700 transition-colors flex items-center gap-1.5 rounded-sm disabled:opacity-50"
      >
        {syncing ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> Syncing {segment}...</>
        ) : (
          <><RefreshCw className="w-3 h-3" /> Sync from PriceLabs</>
        )}
      </button>
      {done && (
        <span className="text-[10px] text-emerald-700 flex items-center gap-1">
          <Check className="w-3 h-3" /> Loaded
        </span>
      )}
      {error && (
        <span className="text-[10px] text-rose-700 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error.slice(0, 80)}
        </span>
      )}
    </div>
  );
}

/* ---------- Main App ---------- */

export default function ActionLog() {
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'funnel' | 'rules'
  const [rows, setRows] = useState([]);
  const [scratchpad, setScratchpad] = useState('');
  const [notes, setNotes] = useState([]);
  const [screenshots, setScreenshots] = useState({ scratchpad: [], byNote: {} });
  const [states, setStates] = useState({}); // { rowId: { before, after } }
  const [funnel, setFunnel] = useState({}); // { 'YYYY-MM-DD': { levelId: { status, fields, notes } } }
  const [portfolioReports, setPortfolioReports] = useState({}); // { 'YYYY-MM-DD': { all, ph, exclPh } }
  const [weeksReport, setWeeksReport] = useState(null); // legacy — weeks now stored in portfolioReports
  const [dismissedFlags, setDismissedFlags] = useState({ snoozed: {}, removed: {} });
  const [stateModal, setStateModal] = useState(null); // { rowId, side: 'before'|'after' }
  const [lightboxShot, setLightboxShot] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [copyStatus, setCopyStatus] = useState('idle'); // 'idle' | 'copied'
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearText, setConfirmClearText] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [parseModalOpenApp, setParseModalOpenApp] = useState(false);
  const saveTimer = useRef(null);
  const scratchTimer = useRef(null);
  const notesTimer = useRef(null);
  const screenshotsTimer = useRef(null);
  const statesTimer = useRef(null);
  const funnelTimer = useRef(null);
  const portfolioReportsTimer = useRef(null);
  const weeksReportTimer = useRef(null);
  const dismissedFlagsTimer = useRef(null);

  // Load on mount
  useEffect(() => {
    (async () => {
      const [storedRows, storedScratch, storedNotes, storedShots, storedStates, storedFunnel, storedReports, storedWeeks, storedDismissed] = await Promise.all([
        loadRows(),
        loadScratchpad(),
        loadNotes(),
        loadScreenshots(),
        loadStates(),
        loadFunnel(),
        loadPortfolioReports(),
        loadWeeksReport(),
        loadDismissedFlags(),
      ]);
      setRows(storedRows);
      setScratchpad(storedScratch);
      setNotes(storedNotes);
      setScreenshots(storedShots);
      setStates(storedStates);
      setFunnel(storedFunnel);
      setPortfolioReports(storedReports);
      setWeeksReport(storedWeeks);
      setDismissedFlags(storedDismissed);
      setLoaded(true);

      // Auto-merge cron-synced reports from portfolio_reports table
      // into the Action Log's portfolioReports state. This bridges the
      // gap between the cron (saves to portfolio_reports table) and the
      // Action Log (reads from action_log_state.portfolio_reports).
      try {
        const prRes = await fetch('/api/pricelabs/portfolio-report');
        const prData = await prRes.json();
        const allCronReports = prData.reports || [];
        // Only merge last 3 days to avoid oversizing the action_log_state payload
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const cutoff = threeDaysAgo.toISOString().split('T')[0];
        const cronReports = allCronReports.filter(r => r.report_date >= cutoff);
        if (cronReports.length > 0) {
          // Group by date → segment → rawRows
          const byDate = {};
          cronReports.forEach(r => {
            if (!r.report_date || !r.segment || !r.report_data?.rawRows) return;
            if (!byDate[r.report_date]) byDate[r.report_date] = {};
            byDate[r.report_date][r.segment] = r.report_data;
          });
          // Parse each report and merge into portfolioReports if not already present
          setPortfolioReports(prev => {
            const next = { ...prev };
            let changed = false;
            Object.entries(byDate).forEach(([date, segments]) => {
              Object.entries(segments).forEach(([seg, reportData]) => {
                // Skip if already have this date+segment
                if (next[date]?.[seg]) return;
                // Parse rawRows into the Action Log format
                try {
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.json_to_sheet(reportData.rawRows);
                  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                  const arrayBuffer = XLSX.write(wb, { type: 'array' });
                  // Derive PH/ExclPH from building report
                  let rows = reportData.rawRows;
                  if (seg === 'ph' || seg === 'exclPh') {
                    const groupCol = Object.keys(rows[0] || {}).find(k =>
                      /group\s*name/i.test(k) || /^group$/i.test(k)
                    );
                    if (groupCol) {
                      rows = seg === 'ph'
                        ? rows.filter(r => buildingToSegment(String(r[groupCol] || '')) === 'ph')
                        : rows.filter(r => buildingToSegment(String(r[groupCol] || '')) === 'exclPh');
                      const wb2 = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(rows), 'Sheet1');
                      const buf2 = XLSX.write(wb2, { type: 'array' });
                      const parsed = parseReportFile(buf2, reportData.fileName || `report-${seg}.xlsx`);
                      if (!next[date]) next[date] = {};
                      next[date][seg] = parsed;
                      changed = true;
                      return;
                    }
                  }
                  if (seg === 'weeks') {
                    const parsed = parseWeeksReportFile(arrayBuffer, reportData.fileName || 'weeks-report.xlsx');
                    if (!next[date]) next[date] = {};
                    next[date][seg] = parsed;
                    changed = true;
                    return;
                  }
                  const parsed = parseReportFile(arrayBuffer, reportData.fileName || `report-${seg}.xlsx`);
                  if (!next[date]) next[date] = {};
                  next[date][seg] = parsed;
                  changed = true;
                } catch (e) {
                  console.warn(`Failed to parse cron report ${date}/${seg}:`, e);
                }
              });

              // Auto-derive PH and ExclPH from building report if building exists
              if (next[date]?.['building'] && !next[date]?.['ph']) {
                try {
                  const buildingData = byDate[date]?.['building'];
                  if (buildingData?.rawRows) {
                    const groupCol = Object.keys(buildingData.rawRows[0] || {}).find(k =>
                      /group\s*name/i.test(k) || /^group$/i.test(k)
                    );
                    if (groupCol) {
                      ['ph', 'exclPh'].forEach(derivedSeg => {
                        if (next[date]?.[derivedSeg]) return;
                        const filtered = buildingData.rawRows.filter(r =>
                          buildingToSegment(String(r[groupCol] || '')) === derivedSeg
                        );
                        if (filtered.length === 0) return;
                        const wb3 = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb3, XLSX.utils.json_to_sheet(filtered), 'Sheet1');
                        const buf3 = XLSX.write(wb3, { type: 'array' });
                        const parsed = parseReportFile(buf3, `report-${derivedSeg}.xlsx`);
                        if (!next[date]) next[date] = {};
                        next[date][derivedSeg] = parsed;
                        changed = true;
                      });
                    }
                  }
                } catch (e) {
                  console.warn(`Failed to derive PH/ExclPH from building report ${date}:`, e);
                }
              }
            });
            return changed ? next : prev;
          });
        }
      } catch (e) {
        console.warn('Failed to auto-merge cron reports:', e);
      }
    })();
  }, []);

  // Debounced save on rows change
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      const ok = await saveRows(rows);
      setSaveStatus(ok ? 'saved' : 'error');
      if (ok) setTimeout(() => setSaveStatus('idle'), 1500);
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [rows, loaded]);

  // Debounced save for scratchpad
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(scratchTimer.current);
    scratchTimer.current = setTimeout(() => { saveScratchpad(scratchpad); }, 600);
    return () => clearTimeout(scratchTimer.current);
  }, [scratchpad, loaded]);

  // Debounced save for notes
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => { saveNotes(notes); }, 400);
    return () => clearTimeout(notesTimer.current);
  }, [notes, loaded]);

  // Debounced save for screenshots
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(screenshotsTimer.current);
    screenshotsTimer.current = setTimeout(() => { saveScreenshots(screenshots); }, 400);
    return () => clearTimeout(screenshotsTimer.current);
  }, [screenshots, loaded]);

  // Debounced save for states
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(statesTimer.current);
    statesTimer.current = setTimeout(() => { saveStates(states); }, 400);
    return () => clearTimeout(statesTimer.current);
  }, [states, loaded]);

  // Debounced save for funnel
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(funnelTimer.current);
    funnelTimer.current = setTimeout(() => { saveFunnel(funnel); }, 400);
    return () => clearTimeout(funnelTimer.current);
  }, [funnel, loaded]);

  // Debounced save for portfolio reports — trim to last 7 days to avoid oversizing
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(portfolioReportsTimer.current);
    portfolioReportsTimer.current = setTimeout(() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const trimmed = {};
      Object.entries(portfolioReports).forEach(([date, segs]) => {
        if (date >= cutoffStr) trimmed[date] = segs;
      });
      savePortfolioReports(trimmed);
    }, 400);
    return () => clearTimeout(portfolioReportsTimer.current);
  }, [portfolioReports, loaded]);

  // Debounced save for weeks report
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(weeksReportTimer.current);
    weeksReportTimer.current = setTimeout(() => { saveWeeksReport(weeksReport); }, 400);
    return () => clearTimeout(weeksReportTimer.current);
  }, [weeksReport, loaded]);

  // Debounced save for dismissed flags
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(dismissedFlagsTimer.current);
    dismissedFlagsTimer.current = setTimeout(() => { saveDismissedFlags(dismissedFlags); }, 400);
    return () => clearTimeout(dismissedFlagsTimer.current);
  }, [dismissedFlags, loaded]);

  const updateCell = useCallback((id, key, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [newRow(), ...prev]);
  }, []);

  const deleteRow = useCallback((id) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setStates(prev => {
      if (!prev[id]) return prev;
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const sortByDateDesc = useCallback(() => {
    setRows(prev => [...prev].sort((a, b) => sortKeyForDate(b.date).localeCompare(sortKeyForDate(a.date))));
  }, []);

  const copyAsHtml = useCallback(async () => {
    const html = buildHTMLTable(rows);
    const tsv = buildTSV(rows);
    const ok = await copyHtml(html, tsv);
    if (ok) {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1800);
    }
  }, [rows]);

  const copyToClipboard = useCallback(async () => {
    const tsv = buildTSV(rows);
    const ok = await copyText(tsv);
    if (ok) {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1800);
    } else {
      // Fallback: download as .tsv so user still gets the content
      try {
        const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `action_log_${new Date().toISOString().slice(0, 10)}.tsv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setCopyStatus('downloaded');
        setTimeout(() => setCopyStatus('idle'), 2500);
      } catch (e) {
        setCopyStatus('failed');
        setTimeout(() => setCopyStatus('idle'), 2500);
      }
    }
  }, [rows]);

  const clearAll = useCallback(() => {
    setRows([]);
    setConfirmClear(false);
    setConfirmClearText('');
  }, []);

  const addNote = useCallback(() => {
    setNotes(prev => [newNote(), ...prev]);
  }, []);

  const updateNote = useCallback((id, key, value) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, [key]: value } : n));
  }, []);

  const deleteNote = useCallback((id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    // Cascade: drop any screenshots tied to this note
    setScreenshots(prev => {
      if (!prev.byNote[id]) return prev;
      const { [id]: _, ...rest } = prev.byNote;
      return { ...prev, byNote: rest };
    });
  }, []);

  // ------------- Screenshots: upload, delete, paste -------------

  const processFiles = useCallback(async (fileList, target) => {
    // target: { kind: 'scratchpad' } or { kind: 'note', noteId }
    setUploadError(null);
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    try {
      const processed = await Promise.all(files.map(async f => {
        const r = await resizeImageFile(f);
        return newScreenshot({ name: f.name, ...r });
      }));
      setScreenshots(prev => {
        if (target.kind === 'scratchpad') {
          return { ...prev, scratchpad: [...prev.scratchpad, ...processed] };
        }
        const existing = prev.byNote[target.noteId] || [];
        return { ...prev, byNote: { ...prev.byNote, [target.noteId]: [...existing, ...processed] } };
      });
    } catch (e) {
      console.error(e);
      setUploadError(e.message || 'Failed to process image');
      setTimeout(() => setUploadError(null), 4000);
    }
  }, []);

  const deleteScreenshot = useCallback((target, shotId) => {
    setScreenshots(prev => {
      if (target.kind === 'scratchpad') {
        return { ...prev, scratchpad: prev.scratchpad.filter(s => s.id !== shotId) };
      }
      const list = (prev.byNote[target.noteId] || []).filter(s => s.id !== shotId);
      return { ...prev, byNote: { ...prev.byNote, [target.noteId]: list } };
    });
  }, []);

  // ------------- State capture (Before / After per row) -------------

  // Helper: update a single side (before/after) of a row's state
  const setRowSideState = useCallback((rowId, side, capture) => {
    setStates(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [side]: capture },
    }));
  }, []);

  // Helper: patch the existing capture (e.g. update extraction status)
  const patchRowSideState = useCallback((rowId, side, patch) => {
    setStates(prev => {
      const cur = prev[rowId]?.[side];
      if (!cur) return prev;
      return {
        ...prev,
        [rowId]: { ...prev[rowId], [side]: { ...cur, ...patch } },
      };
    });
  }, []);

  // Run extraction in the background after capture is set
  const runExtraction = useCallback(async (rowId, side, capture) => {
    patchRowSideState(rowId, side, { extractionStatus: 'extracting', extractionError: null });
    try {
      const metrics = await extractMetricsFromCapture(capture);
      patchRowSideState(rowId, side, { extractionStatus: 'done', metrics });
    } catch (e) {
      console.error('Extraction failed:', e);
      patchRowSideState(rowId, side, {
        extractionStatus: 'failed',
        extractionError: e.message || 'Unknown error',
      });
    }
  }, [patchRowSideState]);

  // Add a state capture from a File (image or csv)
  const addStateCapture = useCallback(async (rowId, side, file) => {
    setUploadError(null);
    if (!file) return;
    let capture = null;
    try {
      if (file.type.startsWith('image/')) {
        const r = await resizeImageFile(file);
        capture = newStateCapture('image', {
          source: file.name,
          mediaType: r.mediaType,
          dataUrl: r.dataUrl,
          base64: r.base64,
          width: r.width,
          height: r.height,
        });
      } else if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
        const csvText = await readCSVFile(file);
        capture = newStateCapture('csv', {
          source: file.name,
          csvText,
        });
      } else {
        throw new Error(`Unsupported file type: ${file.type || file.name}. Use an image or .csv file.`);
      }
    } catch (e) {
      setUploadError(e.message);
      setTimeout(() => setUploadError(null), 4000);
      return;
    }
    // Set immediately, then kick off extraction
    setRowSideState(rowId, side, capture);
    // Auto-extract per spec
    runExtraction(rowId, side, capture);
  }, [setRowSideState, runExtraction]);

  const removeStateCapture = useCallback((rowId, side) => {
    setStates(prev => {
      if (!prev[rowId]) return prev;
      const updated = { ...prev[rowId], [side]: null };
      return { ...prev, [rowId]: updated };
    });
  }, []);

  // Manual retry for failed extractions
  const retryExtraction = useCallback((rowId, side) => {
    const capture = states[rowId]?.[side];
    if (!capture) return;
    runExtraction(rowId, side, capture);
  }, [states, runExtraction]);

  // Paste anywhere on page → attach to scratchpad
  // (Per-note has its own paste handler on the note row)
  useEffect(() => {
    const onPaste = (e) => {
      // Only intercept paste if it contains image data
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = [];
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length === 0) return;
      // Don't intercept if user is pasting into a textarea/input alongside text
      // unless it's purely image data
      const target = e.target;
      const isTextField = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
      const hasText = items && Array.from(items).some(it => it.kind === 'string' && it.type === 'text/plain');
      if (isTextField && hasText) return;
      e.preventDefault();
      processFiles(imageFiles, { kind: 'scratchpad' });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [processFiles]);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center text-stone-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-stone-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .log-scroll::-webkit-scrollbar { height: 10px; width: 10px; }
        .log-scroll::-webkit-scrollbar-track { background: #F0EBE2; }
        .log-scroll::-webkit-scrollbar-thumb { background: #C7C2BC; }
        .log-scroll::-webkit-scrollbar-thumb:hover { background: #A8A29E; }
      `}</style>

      {/* Header */}
      <div className="border-b border-stone-200 bg-white sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-8 py-5">
          <div className="flex items-baseline justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 mb-1">Daily Workflow</div>
              <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
                {activeTab === 'log' ? 'Action Log'
                  : activeTab === 'funnel' ? 'Daily Workflow Funnel'
                  : activeTab === 'summary' ? 'Summary · Compounding signals'
                  : activeTab === 'results' ? 'Results · Action Follow-Up'
                  : 'Rules & Definitions'}
              </h1>
            </div>
            <div className="flex items-center gap-2 text-[11px] mono">
              {saveStatus === 'saving' && <span className="text-stone-400">Saving…</span>}
              {saveStatus === 'saved' && <span className="text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" /> Saved locally</span>}
              {saveStatus === 'error' && <span className="text-rose-700 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Save failed</span>}
              {saveStatus === 'idle' && activeTab === 'log' && <span className="text-stone-400">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>}
            </div>
          </div>
          {/* Tab nav */}
          <div className="mt-4 flex items-center gap-1 -mb-5">
            <button
              onClick={() => setActiveTab('log')}
              className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'log'
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Action Log
            </button>
            <button
              onClick={() => setActiveTab('funnel')}
              className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'funnel'
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> Daily Workflow Funnel
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'summary'
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Summary
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'results'
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Results
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Rules
            </button>
          </div>
        </div>
      </div>

      {/* TAB: ACTION LOG */}
      {activeTab === 'log' && <>
      {/* Toolbar */}
      <div className="max-w-[1600px] mx-auto px-8 pt-6 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={addRow}
              className="px-3.5 py-2 text-[12px] font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add row
            </button>
            <button
              onClick={sortByDateDesc}
              disabled={rows.length === 0}
              className="px-3 py-2 text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-stone-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-sm"
            >
              Sort by date ↓
            </button>
            {/* Check-back summary chip */}
            {(() => {
              let overdue = 0, today = 0, soon = 0;
              rows.forEach(r => {
                const s = checkBackStatus(r);
                if (!s || s.tone === 'done') return;
                if (s.tone === 'overdue') overdue++;
                else if (s.tone === 'today') today++;
                else if (s.tone === 'soon') soon++;
              });
              if (overdue + today + soon === 0) return null;
              return (
                <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-stone-300">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-stone-500 mr-1">Check-back</span>
                  {overdue > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm" style={{ background: toneStyles.overdue.bg, color: toneStyles.overdue.fg }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneStyles.overdue.dot }} />
                      {overdue} overdue
                    </span>
                  )}
                  {today > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm" style={{ background: toneStyles.today.bg, color: toneStyles.today.fg }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneStyles.today.dot }} />
                      {today} today
                    </span>
                  )}
                  {soon > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm" style={{ background: toneStyles.soon.bg, color: toneStyles.soon.fg }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneStyles.soon.dot }} />
                      {soon} soon
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setReportOpen(true)}
              disabled={rows.length === 0 && notes.length === 0 && !scratchpad.trim()}
              className="px-3 py-2 text-[12px] font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <Sparkles className="w-3.5 h-3.5" /> Generate report
            </button>
            <button
              onClick={copyToClipboard}
              disabled={rows.length === 0}
              className="px-3 py-2 text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-stone-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 rounded-sm"
            >
              {copyStatus === 'copied' && <><Check className="w-3.5 h-3.5 text-emerald-700" /> Copied</>}
              {copyStatus === 'downloaded' && <><Download className="w-3.5 h-3.5 text-amber-700" /> Downloaded .tsv</>}
              {copyStatus === 'failed' && <><AlertCircle className="w-3.5 h-3.5 text-rose-700" /> Copy failed</>}
              {copyStatus === 'idle' && <><Copy className="w-3.5 h-3.5" /> Copy (Excel)</>}
            </button>
            <button
              onClick={copyAsHtml}
              disabled={rows.length === 0}
              className="px-3 py-2 text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-stone-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 rounded-sm"
              title="Copy as rich HTML table — paste into email, Notion, ClickUp, Slack"
            >
              <Copy className="w-3.5 h-3.5" /> Copy (HTML)
            </button>
            <button
              onClick={() => downloadCSV(rows)}
              disabled={rows.length === 0}
              className="px-3 py-2 text-[12px] font-medium border border-stone-300 bg-white text-stone-700 hover:border-stone-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={rows.length === 0}
              className="px-3 py-2 text-[12px] font-medium text-stone-500 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </button>
          </div>
        </div>
      </div>

      {/* Daily scratchpad */}
      <div className="max-w-[1600px] mx-auto px-8 pb-4">
        <div className="border border-stone-200 bg-white rounded-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200 bg-stone-50/60">
            <div className="flex items-center gap-2">
              <StickyNote className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-stone-700 font-semibold">Daily scratchpad</span>
              <span className="text-[10px] text-stone-400 mono">running notes · paste screenshots anywhere</span>
            </div>
            <div className="flex items-center gap-2">
              {scratchpad.trim() && (
                <button
                  onClick={() => { if (confirm('Clear scratchpad text? (Screenshots stay)')) setScratchpad(''); }}
                  className="text-[11px] text-stone-400 hover:text-rose-700 transition-colors"
                >
                  Clear text
                </button>
              )}
            </div>
          </div>
          <textarea
            value={scratchpad}
            onChange={(e) => setScratchpad(e.target.value)}
            placeholder="Anything else on your mind today — observations, things to follow up on, hypotheses to test, market notes…"
            className="w-full px-4 py-3 text-[14px] bg-transparent border-0 focus:outline-none placeholder-stone-400 resize-y text-stone-800"
            style={{ minHeight: 220, fontFamily: 'inherit', lineHeight: 1.6 }}
          />
          {/* Screenshot tray */}
          <div className="border-t border-stone-100 bg-stone-50/30">
            <ScreenshotTray
              shots={screenshots.scratchpad || []}
              onAdd={(files) => processFiles(files, { kind: 'scratchpad' })}
              onDelete={(shotId) => deleteScreenshot({ kind: 'scratchpad' }, shotId)}
              onClick={(shot) => setLightboxShot(shot)}
            />
          </div>
        </div>
        {uploadError && (
          <div className="mt-2 px-3 py-2 bg-rose-50 border border-rose-200 text-[11px] text-rose-900 rounded-sm flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="max-w-[1600px] mx-auto px-8 pb-12">
        <div className="border border-stone-200 bg-white log-scroll overflow-x-auto rounded-sm">
          <table className="border-collapse" style={{ minWidth: '100%' }}>
            <thead>
              <tr className="bg-emerald-800">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="text-left px-2.5 py-2.5 text-[11px] font-semibold text-white border-r border-emerald-700/50 last:border-r-0"
                    style={{ minWidth: col.width, width: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
                <th
                  className="text-left px-2.5 py-2.5 text-[11px] font-semibold text-white border-r border-emerald-700/50"
                  style={{ minWidth: 160, width: 160 }}
                >
                  <div className="flex items-center gap-1">
                    <Camera className="w-3 h-3" /> State Before
                  </div>
                </th>
                <th
                  className="text-left px-2.5 py-2.5 text-[11px] font-semibold text-white border-r border-emerald-700/50"
                  style={{ minWidth: 160, width: 160 }}
                >
                  <div className="flex items-center gap-1">
                    <Camera className="w-3 h-3" /> State After
                  </div>
                </th>
                <th
                  className="text-left px-2.5 py-2.5 text-[11px] font-semibold text-white border-r border-emerald-700/50"
                  style={{ minWidth: 150, width: 150 }}
                >
                  Check-Back
                </th>
                <th className="w-10 bg-emerald-800"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 4} className="px-6 py-16 text-center">
                    <div className="text-stone-400 text-sm mb-3">No entries yet.</div>
                    <button
                      onClick={addRow}
                      className="text-[12px] text-emerald-800 hover:text-emerald-900 font-medium underline underline-offset-4 decoration-dotted"
                    >
                      Add your first action
                    </button>
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-t border-stone-200 ${idx % 2 === 1 ? 'bg-stone-50/40' : ''} group`}
                >
                  {COLUMNS.map(col => (
                    <td
                      key={col.key}
                      className="border-r border-stone-200 last:border-r-0 align-top"
                      style={{ minWidth: col.width, width: col.width }}
                    >
                      <Cell
                        value={row[col.key]}
                        onChange={(v) => updateCell(row.id, col.key, v)}
                        type={col.type}
                        placeholder={col.placeholder}
                        width={col.width}
                      />
                    </td>
                  ))}
                  {/* State Before */}
                  <td className="border-r border-stone-200 align-top px-2 py-2" style={{ minWidth: 160, width: 160 }}>
                    <StateCell
                      rowId={row.id}
                      side="before"
                      capture={states[row.id]?.before}
                      onAdd={addStateCapture}
                      onClick={(rId, s) => setStateModal({ rowId: rId, side: s })}
                      onRemove={removeStateCapture}
                    />
                  </td>
                  {/* State After */}
                  <td className="border-r border-stone-200 align-top px-2 py-2" style={{ minWidth: 160, width: 160 }}>
                    <StateCell
                      rowId={row.id}
                      side="after"
                      capture={states[row.id]?.after}
                      onAdd={addStateCapture}
                      onClick={(rId, s) => setStateModal({ rowId: rId, side: s })}
                      onRemove={removeStateCapture}
                    />
                  </td>
                  {/* Check-Back cell */}
                  <td
                    className="border-r border-stone-200 align-top px-2 py-2"
                    style={{ minWidth: 150, width: 150 }}
                  >
                    {(() => {
                      const status = checkBackStatus(row);
                      if (!status) {
                        return <span className="text-[11px] text-stone-300 italic">enter date</span>;
                      }
                      const t = toneStyles[status.tone];
                      return (
                        <div className="flex flex-col gap-1.5">
                          <div
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-sm self-start"
                            style={{
                              background: t.bg,
                              color: t.fg,
                              textDecoration: row.checkDone ? 'line-through' : 'none',
                              opacity: row.checkDone ? 0.7 : 1,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: t.dot }}
                            />
                            {status.text}
                          </div>
                          {status.dueStr && (
                            <div className="mono text-[10px] text-stone-400 px-0.5">
                              {status.dueStr}
                            </div>
                          )}
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-[10px] text-stone-600 hover:text-stone-900 px-0.5">
                            <input
                              type="checkbox"
                              checked={!!row.checkDone}
                              onChange={(e) => updateCell(row.id, 'checkDone', e.target.checked)}
                              className="w-3 h-3 accent-emerald-700 cursor-pointer"
                            />
                            Mark done
                          </label>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="w-10 align-top pt-1.5 px-1">
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-700 transition-all p-1"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Dated notes log */}
        <div className="mt-8 border border-stone-200 bg-white rounded-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200 bg-stone-50/60">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-stone-600" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-stone-700 font-semibold">Notes log</span>
              <span className="text-[10px] text-stone-400 mono">other things done · dated entries</span>
            </div>
            <button
              onClick={addNote}
              className="px-2.5 py-1 text-[11px] font-medium text-stone-700 border border-stone-300 hover:border-stone-500 transition-colors flex items-center gap-1 rounded-sm bg-white"
            >
              <Plus className="w-3 h-3" /> Add note
            </button>
          </div>
          {notes.length === 0 ? (
            <div className="px-4 py-6 text-center text-stone-400 text-[12px] italic">
              No dated notes yet. Use this for non-pricing actions worth tracking — calls, conversations, observations, follow-ups.
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {notes.map(note => {
                const noteShots = screenshots.byNote?.[note.id] || [];
                return (
                  <div key={note.id} className="group hover:bg-stone-50/50">
                    <div className="flex items-start gap-3 px-4 py-2.5">
                      <input
                        type="text"
                        value={note.date}
                        onChange={(e) => updateNote(note.id, 'date', e.target.value)}
                        className="px-2 py-1 text-[12px] bg-transparent border border-transparent focus:border-stone-300 focus:outline-none rounded-sm w-28 mono text-stone-600 shrink-0"
                      />
                      <textarea
                        value={note.text}
                        onChange={(e) => updateNote(note.id, 'text', e.target.value)}
                        placeholder="What happened…"
                        className="flex-1 px-2 py-1 text-[13px] bg-transparent border border-transparent focus:border-stone-300 focus:outline-none rounded-sm resize-none text-stone-800 placeholder-stone-300"
                        style={{ minHeight: 32, fontFamily: 'inherit', lineHeight: 1.5 }}
                        rows={Math.max(1, Math.min(6, (note.text || '').split('\n').length))}
                      />
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-700 transition-all p-1 mt-0.5"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Per-note screenshot tray — only show "Add" button when empty, hidden until hover */}
                    <div className={`pl-32 pr-4 pb-2 ${noteShots.length > 0 ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                      <ScreenshotTray
                        dense
                        shots={noteShots}
                        onAdd={(files) => processFiles(files, { kind: 'note', noteId: note.id })}
                        onDelete={(shotId) => deleteScreenshot({ kind: 'note', noteId: note.id }, shotId)}
                        onClick={(shot) => setLightboxShot(shot)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footnote */}
        <div className="mt-5 text-[11px] text-stone-500 leading-relaxed max-w-3xl">
          <span className="text-stone-700 font-medium">How storage works.</span> Actions, scratchpad, notes, and screenshots all save automatically to this artifact's
          persistent storage — they'll be here when you come back. Use <span className="mono text-stone-700">Copy</span> to paste rows directly into Excel
          (tab-separated), or <span className="mono text-stone-700">Export CSV</span> for a downloadable file.
          <br />
          <span className="text-stone-700 font-medium">Check-back reminder.</span> Every action gets an automatic 3-day check-back —
          enough time for a pricing change to show signal in bookings without letting bad calls run too long. Yellow as it approaches,
          orange the day it's due, red when overdue.
          <br />
          <span className="text-stone-700 font-medium">Screenshots.</span> Drop, paste (Cmd/Ctrl+V), or click to upload images — to the daily
          scratchpad for general captures, or to a specific note. Hover thumbnails for a larger preview, click to view full-size. Images are
          resized to 1280px on save to stay within storage limits.
          <br />
          <span className="text-stone-700 font-medium">State Before / State After.</span> Drop a screenshot or CSV (PriceLabs Performance dashboard,
          Guesty pickup report) into either cell. Claude reads it automatically and pulls out ADR, Occupancy, Revenue, RevPAR, 3-day pickup, and 7-day pickup.
          Click the cell to view the full source and metrics with deltas. Definitions: ADR = revenue per sold night; RevPAR = revenue per available night;
          pickup = revenue booked in the last 3/7 days for any future stay date.
          <br />
          <span className="text-stone-700 font-medium">Generate report.</span> Pulls actions, scratchpad, notes, screenshots, and (when present)
          state metrics within a date range and asks Claude to write a simple bullet-point summary. The action log table is included automatically when
          you copy, so the summary and the underlying data travel together.
        </div>
      </div>
      </>}

      {/* TAB: FUNNEL */}
      {activeTab === 'funnel' && (
        <FunnelView
          funnel={funnel}
          setFunnel={setFunnel}
          portfolioReports={portfolioReports}
          setPortfolioReports={setPortfolioReports}
          rows={rows}
          setRows={setRows}
          loaded={loaded}
          dismissedFlags={dismissedFlags}
          setDismissedFlags={setDismissedFlags}
        />
      )}

      {/* TAB: SUMMARY — cross-references Building report with Weeks report
          to surface compounding signals (problems and opportunities) ranked
          by absolute revenue gap vs STLY. */}
      {activeTab === 'summary' && (() => {
        // Use today if reports exist, otherwise fall back to most recent date
        const today = todayISO();
        const reportDates = Object.keys(portfolioReports).sort().reverse();
        const effectiveISO = portfolioReports[today] ? today : (reportDates[0] || today);
        return (
          <SummaryTab
            portfolioReports={portfolioReports}
            selectedISO={effectiveISO}
            setRows={setRows}
            setActiveTab={setActiveTab}
            rows={rows}
            dismissedFlags={dismissedFlags}
            setDismissedFlags={setDismissedFlags}
          />
        );
      })()}

      {/* TAB: RULES — documentation of all rules applied to reports.
          Values are pulled from the actual constants in code (PICKUP_BEHIND_THRESHOLD
          etc.), so this page stays in sync if thresholds change. */}
      {activeTab === 'results' && (
        <ResultsTab
          rows={rows}
          states={states}
          portfolioReports={portfolioReports}
        />
      )}

      {activeTab === 'rules' && (
        <RulesTab />
      )}

      {/* Parse Notes modal — triggered from Action Log scratchpad header */}
      {parseModalOpenApp && (
        <ParseNotesModal
          funnel={funnel}
          selectedISO={todayISO()}
          currentLevelId={'portfolio'}
          existingRows={rows}
          onClose={() => setParseModalOpenApp(false)}
          onAccept={(proposed) => {
            if (!proposed || proposed.length === 0) return;
            const newRows = proposed.map(p => ({
              id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              date: p.date || todayMDY(),
              owner: p.owner || 'Liuba',
              reason: p.reason || '',
              affectedGroup: p.affectedGroup || '',
              affectedDates: p.affectedDates || '',
              action: p.action || '',
              valueBefore: p.valueBefore || '',
              valueAfter: p.valueAfter || '',
              notes: p.notes || '',
              checkDone: false,
            }));
            setRows(prev => [...newRows, ...prev]);
          }}
        />
      )}

      {/* Report modal */}
      {reportOpen && (
        <ReportModal
          rows={rows}
          scratchpad={scratchpad}
          notes={notes}
          screenshots={screenshots}
          states={states}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Lightbox */}
      {lightboxShot && (
        <Lightbox shot={lightboxShot} onClose={() => setLightboxShot(null)} />
      )}

      {/* State Modal */}
      {stateModal && (() => {
        const row = rows.find(r => r.id === stateModal.rowId);
        const rowStates = states[stateModal.rowId] || {};
        const capture = rowStates[stateModal.side];
        const otherSide = stateModal.side === 'before' ? 'after' : 'before';
        const otherCapture = rowStates[otherSide];
        return (
          <StateModal
            rowId={stateModal.rowId}
            side={stateModal.side}
            capture={capture}
            otherCapture={otherCapture}
            row={row}
            onClose={() => setStateModal(null)}
            onRetry={retryExtraction}
          />
        );
      })()}

      {/* Clear-all confirmation: type CLEAR to delete */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-[60] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => { setConfirmClear(false); setConfirmClearText(''); }}
        >
          <div
            className="bg-white border border-rose-300 rounded-sm w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-stone-200 bg-rose-50/40">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-700" />
                <h2 className="text-base font-semibold text-stone-900">Delete all action log entries?</h2>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] text-stone-700 leading-relaxed mb-3">
                This will permanently delete all <strong>{rows.length}</strong> {rows.length === 1 ? 'entry' : 'entries'} from your action log,
                along with any State Before / State After captures. <span className="text-rose-800 font-medium">This cannot be undone.</span>
              </p>
              <p className="text-[12px] text-stone-600 mb-3">
                Your scratchpad, dated notes, screenshots, and funnel data are <em>not</em> affected.
              </p>
              <p className="text-[12px] text-stone-700 mb-2">
                To confirm, type <span className="mono font-semibold text-rose-800 px-1.5 py-0.5 bg-rose-50 border border-rose-200 rounded-sm">CLEAR</span> below:
              </p>
              <input
                type="text"
                autoFocus
                value={confirmClearText}
                onChange={(e) => setConfirmClearText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && confirmClearText === 'CLEAR') clearAll();
                  if (e.key === 'Escape') { setConfirmClear(false); setConfirmClearText(''); }
                }}
                placeholder="Type CLEAR to confirm"
                className={`w-full px-3 py-2 text-[14px] mono border-2 focus:outline-none rounded-sm transition-colors ${
                  confirmClearText === 'CLEAR'
                    ? 'border-rose-600 bg-rose-50/40 text-rose-900'
                    : 'border-stone-300 focus:border-stone-500'
                }`}
              />
              <div className="text-[11px] text-stone-500 mt-1.5 mono">
                {confirmClearText === '' && 'Case-sensitive · all caps'}
                {confirmClearText !== '' && confirmClearText !== 'CLEAR' && (
                  <span className="text-amber-700">Doesn't match — type exactly "CLEAR"</span>
                )}
                {confirmClearText === 'CLEAR' && (
                  <span className="text-rose-700">Match. Press Enter or click Delete to proceed.</span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center px-5 py-3 border-t border-stone-200 bg-stone-50/40">
              <button
                onClick={() => { setConfirmClear(false); setConfirmClearText(''); }}
                className="px-3 py-1.5 text-[12px] text-stone-700 hover:text-stone-900 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={clearAll}
                disabled={confirmClearText !== 'CLEAR'}
                className={`px-4 py-1.5 text-[12px] font-medium rounded-sm transition-colors flex items-center gap-1.5 ${
                  confirmClearText === 'CLEAR'
                    ? 'bg-rose-700 hover:bg-rose-800 text-white'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete all {rows.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
