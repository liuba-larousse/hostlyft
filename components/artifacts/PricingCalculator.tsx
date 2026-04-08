'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

const NAVY = '#1a1a2e';

const TIERS: Record<string, { baseMin: number; stdMax: number; peakMax: number; desc: string }> = {
  Economy:      { baseMin: 0.60, stdMax: 2.00, peakMax: 2.50, desc: 'Budget hotels' },
  Midscale:     { baseMin: 0.65, stdMax: 2.25, peakMax: 3.00, desc: 'Mid-range hotels' },
  'Upper Scale': { baseMin: 0.70, stdMax: 2.50, peakMax: 3.50, desc: 'Upscale hotels' },
  Luxury:       { baseMin: 0.80, stdMax: 3.00, peakMax: 4.00, desc: 'Luxury hotels' },
};

const SEASONS = [
  { name: 'Low',      dot: '#FF6B6B', bg: '#fff0f0', tc: '#a32d2d', minAdj: 0.75, maxAdj: 1.00 },
  { name: 'Shoulder', dot: '#FFD93D', bg: '#fffbea', tc: '#854f0b', minAdj: 1.00, maxAdj: 1.00 },
  { name: 'High',     dot: '#6BCB77', bg: '#eaf3de', tc: '#3b6d11', minAdj: 1.15, maxAdj: 1.00 },
  { name: 'Peak',     dot: '#9D4EDD', bg: '#f3eafc', tc: '#53148a', minAdj: 1.30, maxAdj: 1.50 },
];

interface MonthData {
  label: string; year: number; month: number; isCurrentYear: boolean;
  mRevparCY: number; mAdrCY: number; revparCY: number; adrCY: number;
  mRevparLY: number; mAdrLY: number; revparLY: number; adrLY: number;
}

interface DetectedCols {
  mRevparCY: string; mAdrCY: string; revparCY: string; adrCY: string;
  mRevparLY: string; mAdrLY: string; revparLY: string; adrLY: string;
  currency: string;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────
function probit(p: number) {
  const pp = p / 100;
  if (pp <= 0) return -4; if (pp >= 1) return 4;
  const a = pp < 0.5 ? pp : 1 - pp;
  const t = Math.sqrt(-2 * Math.log(a));
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
  const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return pp < 0.5 ? -z : z;
}
function percentilePremium(p: number) {
  const sigma = 0.35;
  return Math.exp((probit(p) - probit(50)) * sigma);
}
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function getSeason(idx: number) {
  if (idx < -10) return SEASONS[0];
  if (idx <= 5)  return SEASONS[1];
  if (idx <= 20) return SEASONS[2];
  return SEASONS[3];
}
function fmtC(n: number, cur: string) { return cur + Math.round(n).toLocaleString(); }
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
function pct(n: number) { return (n * 100).toFixed(0) + '%'; }
function chgColor(n: number) { return n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : '#6b7280'; }
function pctBg(n: number) { return n > 0 ? { bg: '#f0fdf4', tc: '#15803d' } : n < 0 ? { bg: '#fef2f2', tc: '#b91c1c' } : { bg: '#f3f4f6', tc: '#6b7280' }; }

function colFind(headers: string[], keywords: string[], exclude: string[]) {
  const norm = (h: string) => String(h).toLowerCase().trim();
  let best = -1, bestIdx = -1;
  headers.forEach((h, i) => {
    const n = norm(h);
    if (exclude && exclude.some(x => n.includes(x.toLowerCase()))) return;
    const score = keywords.reduce((s, k) => s + (n.includes(k.toLowerCase()) ? 1 : 0), 0);
    if (score > best) { best = score; bestIdx = i; }
  });
  return best > 0 ? bestIdx : -1;
}

function detectCurrency(wb: XLSX.WorkBook): string {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const ref = ws['!ref']; if (!ref) return '$';
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.z) {
        const z = cell.z;
        if (z.includes('€') || z.toLowerCase().includes('eur')) return '€';
        if (z.includes('£')) return '£';
        if (z.includes('¥')) return '¥';
        if (z.includes('[$$]') || z.includes('$')) return '$';
      }
    }
  }
  return '$';
}

function parseRowDate(label: string) {
  const m = String(label).match(/(\d{4})-(\d{2})/);
  if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) };
  return null;
}

function buildLTMwindow() {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1; // 1-indexed, current month (not yet complete)
  // Complete months in current year: months before todayMonth
  // LY slots: remaining months (>= todayMonth) — use LY columns from same row
  const w: { year: number; month: number; cy: boolean }[] = [];
  for (let m = 1; m <= 12; m++) {
    const cy = m < todayMonth; // complete if strictly before today's month
    w.push({ year: todayYear, month: m, cy });
  }
  return w;
}

// ── ISO week → month mapping ──────────────────────────────────────────────────
function buildWeeklyRows(months: MonthData[], year: number) {
  const jan4 = new Date(year, 0, 4);
  const dow4 = (jan4.getDay() + 6) % 7; // 0=Mon
  const startOfW1 = new Date(year, 0, 4 - dow4);
  const ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const rows: (MonthData & { week: number })[] = [];
  for (let w = 1; w <= 53; w++) {
    const monday = new Date(startOfW1); monday.setDate(startOfW1.getDate() + (w - 1) * 7);
    const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
    if (thursday.getFullYear() !== year) continue;
    const month = thursday.getMonth() + 1;
    const md = months.find(m => m.month === month);
    if (!md) continue;
    rows.push({ ...md, week: w, label: `W${String(w).padStart(2,'0')} · ${ABBR[month-1]}` });
  }
  return rows;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function PricingCalculator() {
  const [tier, setTierState]       = useState('Midscale');
  const [revparSrc, setRevparSrc]  = useState<'market' | 'portfolio'>('market');
  const [adrSrc, setAdrSrc]        = useState<'market' | 'portfolio'>('market');
  const [percentile, setPercentile] = useState(50);
  const [channelPct, setChannelPct] = useState(0);
  const [currency, setCurrency]    = useState('$');
  const [reportMonths, setReportMonths] = useState<MonthData[] | null>(null);
  const [detected, setDetected]    = useState<DetectedCols | null>(null);
  const [dragOver, setDragOver]    = useState(false);
  const [fileLoaded, setFileLoaded] = useState(false);
  const [fileName, setFileName]    = useState('');
  const [statusMsg, setStatusMsg]  = useState<{ msg: string; ok: boolean } | null>(null);
  const [viewMode, setViewMode]    = useState<'monthly' | 'weekly'>('monthly');

  function reset() {
    setTierState('Midscale'); setRevparSrc('market'); setAdrSrc('market');
    setPercentile(50); setChannelPct(0); setCurrency('$');
    setReportMonths(null); setDetected(null);
    setFileLoaded(false); setFileName(''); setStatusMsg(null);
    setViewMode('monthly');
  }

  // ── File handling ─────────────────────────────────────────────────────────
  const processFile = useCallback((file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array' });
        const cur = detectCurrency(wb);
        setCurrency(cur);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
        if (!rows || rows.length < 2) { setStatusMsg({ msg: 'Could not parse file.', ok: false }); return; }

        const headers = rows[0].map(h => String(h).trim());
        const idxMRevparCY = colFind(headers, ['market', 'revpar'], ['ly', 'last', 'stly']);
        const idxMAdrCY    = colFind(headers, ['market', 'adr'], ['ly', 'last', 'revpar', 'stly']);
        const idxRevparCY  = colFind(headers, ['revpar'], ['ly', 'last', 'market', 'index', 'stly']);
        const idxAdrCY     = colFind(headers, ['adr'], ['ly', 'last', 'market', 'index', 'revpar', 'revenue', 'occupancy', 'stly']);
        const idxMRevparLY = colFind(headers, ['market', 'revpar', 'ly'], ['stly']);
        const idxMAdrLY    = colFind(headers, ['market', 'adr', 'ly'], ['revpar', 'stly']);
        const idxRevparLY  = colFind(headers, ['revpar', 'ly'], ['market', 'index', 'stly']);
        const idxAdrLY     = colFind(headers, ['adr', 'ly'], ['market', 'index', 'revpar', 'revenue', 'occupancy', 'stly']);

        // Log missing required columns
        const colChecks: [number, string][] = [
          [idxMRevparCY, 'Market RevPAR'], [idxMAdrCY, 'Market ADR'],
          [idxRevparCY, 'Rental RevPAR / RevPAR'], [idxAdrCY, 'Rental ADR'],
          [idxMRevparLY, 'Market RevPAR LY'], [idxMAdrLY, 'Market ADR LY'],
          [idxRevparLY, 'Rental RevPAR LY / RevPAR LY'], [idxAdrLY, 'Rental ADR LY'],
        ];
        const missing = colChecks.filter(([idx]) => idx < 0).map(([, name]) => name);
        if (missing.length) {
          console.error('[PricingCalculator] Missing columns:', missing);
          console.error('[PricingCalculator] Available headers:', headers);
        } else {
          console.log('[PricingCalculator] All columns found:', {
            'Market RevPAR': headers[idxMRevparCY], 'Market ADR': headers[idxMAdrCY],
            'RevPAR': headers[idxRevparCY], 'ADR': headers[idxAdrCY],
            'Market RevPAR LY': headers[idxMRevparLY], 'Market ADR LY': headers[idxMAdrLY],
            'RevPAR LY': headers[idxRevparLY], 'ADR LY': headers[idxAdrLY],
          });
        }
        const idxDate      = colFind(headers, ['year', 'month', 'date'], []);

        const hn = (i: number) => i >= 0 ? `"${headers[i]}"` : '—';
        setDetected({
          mRevparCY: hn(idxMRevparCY), mAdrCY: hn(idxMAdrCY),
          revparCY: hn(idxRevparCY),   adrCY: hn(idxAdrCY),
          mRevparLY: hn(idxMRevparLY), mAdrLY: hn(idxMAdrLY),
          revparLY: hn(idxRevparLY),   adrLY: hn(idxAdrLY),
          currency: cur,
        });

        const rowMap: Record<string, { row: string[]; label: string }> = {};
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const lbl = String(r[idxDate] || r[0] || '').trim();
          const d = parseRowDate(lbl);
          if (d) rowMap[`${d.year}-${d.month}`] = { row: r, label: lbl };
        }

        const result: MonthData[] = [];
        buildLTMwindow().forEach(({ year, month, cy }) => {
          const found = rowMap[`${year}-${month}`];
          if (!found) return;
          const r = found.row;
          const n = (v: string) => parseFloat(v) || 0;
          result.push({
            label: found.label, year, month, isCurrentYear: cy,
            mRevparCY: n(r[idxMRevparCY]), mAdrCY: n(r[idxMAdrCY]),
            revparCY: n(r[idxRevparCY]),   adrCY: n(r[idxAdrCY]),
            mRevparLY: n(r[idxMRevparLY]), mAdrLY: n(r[idxMAdrLY]),
            revparLY: n(r[idxRevparLY]),   adrLY: n(r[idxAdrLY]),
          });
        });

        if (!result.length) { setStatusMsg({ msg: 'No matching LTM months found.', ok: false }); return; }
        setReportMonths(result);
        setFileLoaded(true);
        setFileName(file.name);
        setStatusMsg({ msg: `Loaded ${result.length}/12 months · sorted Jan → Dec · Currency: ${cur}.`, ok: true });
      } catch (err: unknown) {
        setStatusMsg({ msg: 'Error: ' + (err instanceof Error ? err.message : String(err)), ok: false });
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ── Computed values ───────────────────────────────────────────────────────
  const tierData = TIERS[tier];
  const chF      = 1 - channelPct / 100;
  const usePercentile = adrSrc === 'market';
  const factor   = usePercentile ? percentilePremium(percentile) : 1.0;
  const premiumPct = (factor - 1) * 100;

  type ComputedRow = MonthData & { revpar: number; mktAdr: number; unitAdr: number };
  let computed: {
    values: ComputedRow[];
    weeklyValues: (ComputedRow & { week: number })[];
    ltmRevpar: number; ltmUnitAdr: number; ltmMktAdr: number;
    boardBase: number; boardMin: number; boardMax: number;
  } | null = null;

  if (reportMonths) {
    const getMktRevpar = (d: MonthData) => d.isCurrentYear ? d.mRevparCY : d.mRevparLY;
    const getMktAdr    = (d: MonthData) => d.isCurrentYear ? d.mAdrCY    : d.mAdrLY;
    const getRevpar    = (d: MonthData) => revparSrc === 'market' ? getMktRevpar(d) : (d.isCurrentYear ? d.revparCY : d.revparLY);
    const getRawAdr    = (d: MonthData) => adrSrc === 'market'    ? getMktAdr(d)    : (d.isCurrentYear ? d.adrCY    : d.adrLY);
    const getUnitAdr   = (d: MonthData) => { const raw = getRawAdr(d); return raw > 0 ? raw * factor : 0; };

    const values = reportMonths.map(d => ({
      ...d, revpar: getRevpar(d), mktAdr: getMktAdr(d), unitAdr: getUnitAdr(d),
    }));

    const nonZeroR = values.filter(v => v.revpar > 0).map(v => v.revpar);
    const nonZeroA = values.filter(v => v.unitAdr > 0).map(v => v.unitAdr);
    const nonZeroM = values.filter(v => v.mktAdr > 0).map(v => v.mktAdr);
    const ltmRevpar  = nonZeroR.length ? nonZeroR.reduce((a, b) => a + b, 0) / nonZeroR.length : 1;
    const ltmUnitAdr = nonZeroA.length ? nonZeroA.reduce((a, b) => a + b, 0) / nonZeroA.length : 1;
    const ltmMktAdr  = nonZeroM.length ? nonZeroM.reduce((a, b) => a + b, 0) / nonZeroM.length : 1;
    const weeklyRows = buildWeeklyRows(reportMonths, new Date().getFullYear());
    const weeklyValues = weeklyRows.map(d => ({
      ...d, revpar: getRevpar(d), mktAdr: getMktAdr(d), unitAdr: getUnitAdr(d),
    }));
    computed = {
      values, weeklyValues, ltmRevpar, ltmUnitAdr, ltmMktAdr,
      boardBase: ltmUnitAdr,
      boardMin:  ltmUnitAdr * tierData.baseMin,
      boardMax:  ltmUnitAdr * tierData.stdMax,
    };
  }

  // ── Season counts for badge row ───────────────────────────────────────────
  const seasonCounts: Record<string, number> = {};
  const activeRows = computed ? (viewMode === 'weekly' ? computed.weeklyValues : computed.values) : [];
  if (computed) {
    activeRows.forEach(d => {
      const seaIdx = computed!.ltmRevpar > 0 ? ((d.revpar / computed!.ltmRevpar) - 1) * 100 : 0;
      const s = getSeason(seaIdx);
      seasonCounts[s.name] = (seasonCounts[s.name] || 0) + 1;
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto font-sans">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4">
              <path d="M2 12L8 4l6 8"/><path d="M5 12v-3h6v3"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">hostlyft</div>
            <div className="text-xs text-gray-400">BASE, MIN, MAX & Seasonality Calculator</div>
          </div>
        </div>
        {fileLoaded && (
          <button onClick={reset}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 cursor-pointer transition-colors">
            ↺ Reset
          </button>
        )}
      </div>

      {/* ── Import report ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Import report</div>
        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all text-center ${
            fileLoaded ? 'border-green-300 bg-green-50' : dragOver ? 'border-gray-400 bg-gray-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
          }`}
        >
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only"
            onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} />
          <svg className="w-8 h-8 text-gray-300" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="24" height="24" rx="4"/><path d="M15 9v12M9 15l6 6 6-6"/>
          </svg>
          {fileLoaded ? (
            <>
              <span className="text-sm font-medium text-gray-700">Report loaded</span>
              <span className="text-xs text-gray-500">{fileName} · Currency: {currency}</span>
              <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium mt-1">✓ {fileName}</span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-gray-700">Drop your Hostlyft general report here</span>
              <span className="text-xs text-gray-400">Auto-detects currency · RevPAR · ADR · Market columns · LY columns</span>
            </>
          )}
        </label>

        {statusMsg && (
          <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${statusMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {statusMsg.msg}
          </div>
        )}

        {detected && (
          <div className="mt-4">
            <div className="text-xs font-medium text-gray-700 mb-2">Detected columns</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Market RevPAR', cy: detected.mRevparCY, ly: detected.mRevparLY },
                { label: 'Market ADR',    cy: detected.mAdrCY,    ly: detected.mAdrLY },
                { label: 'Portfolio RevPAR', cy: detected.revparCY, ly: detected.revparLY },
                { label: 'Portfolio ADR',    cy: detected.adrCY,    ly: detected.adrLY },
                { label: 'Currency',      cy: detected.currency,  ly: '' },
                { label: 'LTM window', cy: (() => { const n = new Date(); const todayM = n.getMonth()+1; const y = n.getFullYear(); const ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const ltmStart = todayM === 1 ? `Jan ${y-1}` : `${ABBR[todayM-1]} ${y}`; const ltmEnd = `${ABBR[todayM-2 < 0 ? 11 : todayM-2]} ${todayM === 1 ? y-1 : y}`; return `${ltmStart} → ${ltmEnd}`; })(), ly: (() => { const n = new Date(); const todayM = n.getMonth()+1; const y = n.getFullYear(); const ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const cyEnd = ABBR[todayM-2 < 0 ? 11 : todayM-2]; return `CY: Jan–${cyEnd} ${y} · LY: ${ABBR[todayM-1]}–Dec ${y}`; })() },
              ].map(col => (
                <div key={col.label} className="p-2.5 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="text-xs text-gray-400 uppercase tracking-wider">{col.label}</div>
                  <div className="text-xs font-medium text-gray-800 mt-0.5">{col.cy}</div>
                  {col.ly && <div className="text-xs text-gray-400 mt-0.5">{col.ly}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Hotel tier ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Hotel tier</div>
        <div className="flex gap-2 flex-wrap mb-3">
          {Object.entries(TIERS).map(([key]) => (
            <button key={key} onClick={() => setTierState(key)}
              className="px-3 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer"
              style={tier === key ? { background: NAVY, borderColor: NAVY, color: '#fff' } : { background: 'transparent', borderColor: '#e5e7eb', color: '#6b7280' }}>
              {key === 'Economy' ? 'Economy (0–25)' : key === 'Midscale' ? 'Midscale (25–50)' : key === 'Upper Scale' ? 'Upper Scale (50–75)' : 'Luxury (75–100)'}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            tier,
            `Baseline min ${pct(tierData.baseMin)} of ADR`,
            `Std max ${pct(tierData.stdMax)} of ADR`,
            `Peak max ${pct(tierData.peakMax)} of ADR`,
            tierData.desc,
          ].map(tag => (
            <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{tag}</span>
          ))}
        </div>
      </div>

      {/* ── Data source ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Data source</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">RevPAR:</span>
          {(['market', 'portfolio'] as const).map(src => (
            <button key={src} onClick={() => setRevparSrc(src)}
              className="px-2.5 py-1 rounded-md border text-xs cursor-pointer transition-all"
              style={revparSrc === src ? { background: NAVY, borderColor: NAVY, color: '#fff' } : { background: 'transparent', borderColor: '#e5e7eb', color: '#6b7280' }}>
              {src === 'market' ? 'Market RevPAR' : 'Portfolio RevPAR'}
            </button>
          ))}
          <span className="text-xs text-gray-500 ml-2">ADR:</span>
          {(['market', 'portfolio'] as const).map(src => (
            <button key={src} onClick={() => setAdrSrc(src)}
              className="px-2.5 py-1 rounded-md border text-xs cursor-pointer transition-all"
              style={adrSrc === src ? { background: NAVY, borderColor: NAVY, color: '#fff' } : { background: 'transparent', borderColor: '#e5e7eb', color: '#6b7280' }}>
              {src === 'market' ? 'Market ADR' : 'Portfolio ADR'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Percentile slider ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">Unit positioning</div>
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-sm font-medium text-gray-900">Market percentile position</div>
            <div className="text-xs text-gray-400 mt-0.5">Market ADR = 50th percentile baseline. Slide to position your unit.</div>
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className="text-xs text-gray-400">Premium vs market</div>
            <div className="text-xl font-medium mt-0.5" style={{ color: chgColor(premiumPct) }}>
              {fmtPct(premiumPct)}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">Percentile</span>
          <span className="text-sm font-medium text-gray-900 bg-gray-100 px-3 py-0.5 rounded-full">{ordinal(percentile)}</span>
        </div>
        <input type="range" min="1" max="99" value={percentile} step="1"
          onChange={e => setPercentile(parseInt(e.target.value))}
          className="w-full mb-1" style={{ accentColor: NAVY }} />
        <div className="flex justify-between text-xs text-gray-400 mb-3">
          <span>1st · Lowest price</span><span>25th</span><span>50th · Market avg</span><span>75th</span><span>99th · Highest price</span>
        </div>

        <div className="text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded-lg">
          {Math.abs(premiumPct) < 1
            ? <>At the <strong>{ordinal(percentile)} percentile</strong> your unit is priced at the market average — no premium applied.</>
            : premiumPct > 0
              ? <>At the <strong>{ordinal(percentile)} percentile</strong> your unit prices <strong>{fmtPct(premiumPct)}</strong> above the market average ADR. Base price = Market ADR × {factor.toFixed(3)}.</>
              : <>At the <strong>{ordinal(percentile)} percentile</strong> your unit prices <strong>{fmtPct(premiumPct)}</strong> below the market average ADR. Base price = Market ADR × {factor.toFixed(3)}.</>
          }
        </div>

        {adrSrc === 'portfolio' && (
          <div className="text-xs px-3 py-2 rounded-lg mt-2" style={{ background: '#fffbea', color: '#854f0b' }}>
            Percentile slider applies only when Market ADR is selected. Portfolio ADR is your actual achieved rate — no market percentile adjustment is applied.
          </div>
        )}
      </div>

      {/* ── Pricing board ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">LTM average pricing board</div>
        <div className="grid grid-cols-3 border border-gray-200 rounded-xl overflow-hidden mb-0">
          {computed ? (
            <>
              {[
                {
                  label: 'Minimum',
                  price: fmtC(computed.boardMin * chF, currency),
                  pctLabel: pct(tierData.baseMin) + ' of base',
                  shift: (tierData.baseMin - 1) * 100,
                  net: channelPct > 0 ? `Gross ${fmtC(computed.boardMin, currency)} → net ${fmtC(computed.boardMin * chF, currency)} after ${channelPct}% channel` : '',
                  border: '',
                },
                {
                  label: 'Base (adjusted ADR)',
                  price: fmtC(computed.boardBase * chF, currency),
                  pctLabel: usePercentile && Math.abs(premiumPct) > 0.5
                    ? `Mkt ADR ${fmtPct(premiumPct)} (${ordinal(percentile)} pct)`
                    : '100% reference · market ADR',
                  shift: null,
                  net: channelPct > 0 ? `Gross ${fmtC(computed.boardBase, currency)} → net ${fmtC(computed.boardBase * chF, currency)} after ${channelPct}% channel` : '',
                  border: 'border-l border-r border-gray-200',
                },
                {
                  label: 'Maximum',
                  price: fmtC(computed.boardMax * chF, currency),
                  pctLabel: pct(tierData.stdMax) + ' of base',
                  shift: (tierData.stdMax - 1) * 100,
                  net: channelPct > 0 ? `Gross ${fmtC(computed.boardMax, currency)} → net ${fmtC(computed.boardMax * chF, currency)} after ${channelPct}% channel` : '',
                  border: '',
                },
              ].map(cell => (
                <div key={cell.label} className={`p-4 flex flex-col gap-1 ${cell.border}`}>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">{cell.label}</div>
                  <div className="text-2xl font-medium text-gray-900 leading-tight">{cell.price}</div>
                  <div className="text-xs text-gray-400">{cell.pctLabel}</div>
                  {cell.shift !== null && (
                    <div className="text-sm font-medium mt-1" style={{ color: chgColor(cell.shift) }}>{fmtPct(cell.shift)} vs base</div>
                  )}
                  {cell.net && <div className="text-xs text-gray-400 mt-0.5">{cell.net}</div>}
                </div>
              ))}
            </>
          ) : (
            <>
              {['Minimum', 'Base (adjusted ADR)', 'Maximum'].map((label, i) => (
                <div key={label} className={`p-4 ${i === 1 ? 'border-l border-r border-gray-200' : ''}`}>
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</div>
                  <div className="text-2xl font-medium text-gray-300">—</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Channel markup row */}
        <div className="flex items-center gap-3 mt-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
          <label className="text-xs text-gray-500 whitespace-nowrap">Channel markup deduction:</label>
          <input type="number" value={channelPct} min={0} max={50} step={0.5}
            onChange={e => setChannelPct(parseFloat(e.target.value) || 0)}
            className="w-16 h-8 border border-gray-200 rounded-lg px-2 text-sm bg-white text-gray-900 outline-none focus:border-gray-400" />
          <span className="text-xs text-gray-400">% — applied to all prices</span>
        </div>
      </div>

      {/* ── Seasonality table ── */}
      {computed ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-widest">
              {viewMode === 'monthly'
                ? (() => { const n = new Date(); const todayM = n.getMonth()+1; const y = n.getFullYear(); const ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const ltmStart = `${ABBR[todayM-1 > 11 ? 0 : todayM-1]} ${y}`; const ltmEnd = `${ABBR[todayM-2 < 0 ? 11 : todayM-2]} ${y}`; return `12-month seasonality pricing — Jan → Dec (LTM ${ltmStart} – ${ltmEnd})`; })()
                : `${computed.weeklyValues.length}-week seasonality pricing`}
            </div>
            <div className="flex gap-1">
              {(['monthly', 'weekly'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className="px-2.5 py-1 rounded-md border text-xs cursor-pointer transition-all"
                  style={viewMode === m ? { background: NAVY, borderColor: NAVY, color: '#fff' } : { background: 'transparent', borderColor: '#e5e7eb', color: '#6b7280' }}>
                  {m === 'monthly' ? '12 months' : '53 weeks'}
                </button>
              ))}
            </div>
          </div>

          {/* LTM summary */}
          <div className="flex gap-2 flex-wrap mb-3">
            {[
              `LTM Mkt RevPAR ${fmtC(computed.ltmRevpar, currency)}`,
              `LTM Mkt ADR ${fmtC(computed.ltmMktAdr, currency)}`,
              usePercentile
                ? `Unit ADR (${ordinal(percentile)} pct) ${fmtC(computed.ltmUnitAdr, currency)} ${fmtPct(premiumPct)}`
                : `Portfolio ADR ${fmtC(computed.ltmUnitAdr, currency)}`,
              'Reference: Apr 8 2026 · Last completed: Mar 2026',
            ].map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{tag}</span>
            ))}
          </div>

          {/* Season badges */}
          <div className="flex gap-2 flex-wrap mb-4">
            {SEASONS.filter(s => seasonCounts[s.name]).map(s => (
              <span key={s.name} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: s.bg, color: s.tc }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                {s.name} <strong>{seasonCounts[s.name]}</strong> {viewMode === 'weekly' ? 'weeks' : 'months'}
              </span>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 860 }}>
              <thead>
                <tr className="border-b border-gray-200">
                  {['Month', 'Src', 'Mkt RevPAR', 'Mkt ADR', 'Unit ADR', 'Seas. index', 'Season',
                    'Min', 'Base', 'Max', 'Min % of base', 'Max % of base', 'Min shift', 'Max shift'].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRows.map(d => {
                  const seaIdx = computed!.ltmRevpar > 0 ? ((d.revpar / computed!.ltmRevpar) - 1) * 100 : 0;
                  const s = getSeason(seaIdx);
                  const isPeak = s.name === 'Peak';
                  const unitAdr = d.unitAdr > 0 ? d.unitAdr : computed!.ltmUnitAdr;
                  const tgtMinPct = tierData.baseMin * s.minAdj;
                  const tgtMaxPct = (isPeak ? tierData.peakMax : tierData.stdMax) * s.maxAdj;
                  const minPrice  = unitAdr * tgtMinPct * chF;
                  const basePrice = unitAdr * chF;
                  const maxPrice  = unitAdr * tgtMaxPct * chF;
                  const minPctOfBase = tgtMinPct * 100;
                  const maxPctOfBase = tgtMaxPct * 100;
                  const minShift = ((tgtMinPct - tierData.baseMin) / tierData.baseMin) * 100;
                  const maxShift = ((tgtMaxPct - (isPeak ? tierData.peakMax : tierData.stdMax)) / (isPeak ? tierData.peakMax : tierData.stdMax)) * 100;
                  const { bg: sIdxBg, tc: sIdxTc } = pctBg(seaIdx);
                  return (
                    <tr key={d.label} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-1.5 font-medium text-gray-800 whitespace-nowrap">{d.label}</td>
                      <td className="px-2 py-1.5">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={d.isCurrentYear ? { background: 'rgba(26,26,46,0.1)', color: NAVY } : { background: '#fffbea', color: '#854f0b' }}>
                          {d.isCurrentYear ? 'CY' : 'LY'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{d.revpar > 0 ? fmtC(d.revpar, currency) : '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{d.mktAdr > 0 ? fmtC(d.mktAdr, currency) : '—'}</td>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{fmtC(unitAdr, currency)}</td>
                      <td className="px-2 py-1.5">
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: sIdxBg, color: sIdxTc }}>{fmtPct(seaIdx)}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: s.bg, color: s.tc }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />{s.name}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{fmtC(minPrice, currency)}</td>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{fmtC(basePrice, currency)}</td>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{fmtC(maxPrice, currency)}</td>
                      <td className="px-2 py-1.5 text-gray-400">{minPctOfBase.toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-gray-400">{maxPctOfBase.toFixed(0)}%</td>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap" style={{ color: chgColor(minShift) }}>{fmtPct(minShift)}</td>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap" style={{ color: chgColor(maxShift) }}>{fmtPct(maxShift)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50 font-medium">
                  <td colSpan={2} className="px-2 py-2">LTM average</td>
                  <td className="px-2 py-2">{fmtC(activeRows.reduce((a, d) => a + d.revpar, 0) / activeRows.length, currency)}</td>
                  <td className="px-2 py-2">{fmtC(activeRows.reduce((a, d) => a + d.mktAdr, 0) / activeRows.length, currency)}</td>
                  <td className="px-2 py-2">{fmtC(activeRows.reduce((a, d) => a + d.unitAdr, 0) / activeRows.length, currency)}</td>
                  <td colSpan={9} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-400">
            Unit ADR = Market ADR × percentile premium factor · Min/Max shift = (target% − baseline%) ÷ baseline%
          </div>
        </div>
      ) : (
        <div className="text-center py-10 text-sm text-gray-400">
          Upload your Hostlyft general report to see the 12-month seasonality pricing output.
        </div>
      )}
    </div>
  );
}
