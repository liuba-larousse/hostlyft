'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, Upload, Printer, FileUp, Sparkles, Loader2 } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
const REPORT_YEAR = 2026;

const CUR_SYMBOLS: Record<string, string> = {
  '$': '$', '£': '£', '€': '€', '¥': '¥', '₹': '₹', 'R$': 'R$', 'A$': 'A$', 'C$': 'C$',
  'CHF': 'CHF ', 'kr': 'kr ', 'zł': 'zł ',
  'USD': '$', 'GBP': '£', 'EUR': '€', 'JPY': '¥', 'AUD': 'A$', 'CAD': 'C$', 'BRL': 'R$', 'MXN': '$',
};

// Embedded sample so the "Use sample data" button keeps working for demos.
const SAMPLE_CSV = `Year & Month,Total Revenue,Total Revenue STLY,Rental Revenue,Rental Revenue STLY,Rental Revenue LY,Rental Revenue STLY YoY %,Available & Bookable dates Potential Revenue (Final Price),Rental RevPAR STLY YoY %,Occupancy STLY YoY Difference,Rental ADR STLY YoY %,Weekend Occupancy STLY YoY Difference,Weekday Occupancy STLY YoY Difference,Market Occupancy STLY YoY Difference,Market ADR STLY YoY %,Market RevPAR STLY YoY %,Rental RevPAR,Rental RevPAR LY,Rental RevPAR STLY,Occupancy %,Occupancy % STLY,Weekend Occupancy %,Weekend Occupancy % STLY,Weekend Occupancy % LY,Weekday Occupancy % STLY,Weekday Occupancy %,Weekday Occupancy % LY,Market Occupancy %,Market Occupancy % STLY,Market Occupancy % LY,Rental ADR,Rental ADR LY,Rental ADR STLY,Final Price,Market Median Price,Market 75th Percentile Price,Market ADR,Market ADR LY,Market ADR STLY,ADR Index,Market RevPAR,Market RevPAR LY,Market RevPAR STLY,RevPAR Index,Market Penetration Index %,Booked Nights Pickup (3 Days),Booked Nights Pickup STLY (3 Days),Booked Nights Pickup (30 Days),Booked Nights Pickup STLY (30 Days),Booked Nights Pickup (7 Days),Booked Nights Pickup STLY (7 Days),Rental Revenue Pickup (3 Days),Rental Revenue Pickup STLY (3 Days),Rental Revenue Pickup (30 Days),Rental Revenue Pickup STLY (30 Days),Rental Revenue Pickup (7 Days),Rental Revenue Pickup STLY (7 Days)
2026-01 (Jan),7912.58,0.0,5497.22,0.0,0.0,,0,,21.51,,46.67,9.52,-3.5,2.18,-6.7,59.11,0.0,0.0,21.51,0.0,46.67,0.0,0.0,0.0,9.52,0.0,36.79,40.29,40.29,274.86,0.0,0.0,,208.01,281.37,279.65,273.69,273.69,98.29,102.88323499999998,110.26970100000001,110.26970100000001,57.45,58.47,0,0,0,0,0,0,0.0,0,0.0,0,0.0,0
2026-02 (Feb),7098.75,692.0,4808.5,447.0,447.0,975.73,0,617.29,33.93,-2.21,54.17,25.83,-4.45,-2.51,-13.09,57.24,7.98,7.98,39.29,5.36,66.67,12.5,12.5,2.5,28.33,2.5,36.57,41.02,41.02,145.71,149.0,149.0,,195.1,270.11,239.87,246.05,246.05,60.75,87.720459,100.92971000000001,100.92971000000001,65.25,107.44,0,0,0,0,0,0,0.0,0,0.0,0,0.0,0
2026-03 (Mar),14032.08,3767.0,9044.8,2597.0,2597.0,248.28,0,132.18,23.66,27.94,52.78,14.13,-0.88,-0.14,-1.55,97.26,41.89,41.89,52.69,29.03,91.67,38.89,38.89,25.0,39.13,25.0,61.33,62.21,62.21,184.59,144.28,144.28,,254.06,344.57,298.64,299.05,299.05,61.81,183.155912,186.039005,186.039005,53.1,85.91,0,0,0,0,0,0,0.0,0,0.0,0,0.0,0
2026-04 (Apr),13890.44,2477.0,8974.27,2011.0,2011.0,346.26,0,301.07,41.56,-14.55,48.1,39.25,-4.01,1.5,-5.25,100.83,25.14,25.14,52.81,11.25,70.83,22.73,22.73,6.9,46.15,6.9,56.31,60.32,60.32,190.94,223.44,223.44,,239.26,329.2,289.85,285.58,285.58,65.88,163.214535,172.26185600000002,172.26185600000002,61.78,93.78,0,0,0,0,0,0,0.0,0,0.0,0,0.0,0
2026-05 (May),17458.43,4716.0,11772.68,3377.33,3377.33,248.58,452,184.33,31.81,18.06,66.84,14.35,0.68,0.31,1.56,103.27,36.32,36.32,54.39,22.58,86.84,20.0,20.0,23.81,38.16,23.81,54.89,54.21,54.23,189.88,160.83,160.83,209.8,236.47,325.0,284.71,283.8,283.84,66.69,156.277319,153.90474,153.869664,66.08,99.09,0,0,40,7,0,0,0.0,0,6383.56,1000,0.0,0
2026-06 (Jun),27698.59,5037.0,22288.03,3839.67,5214.67,480.47,17743,275.88,39.77,16.09,36.11,41.28,-2.72,2.07,-2.87,160.35,57.94,42.66,57.55,17.78,69.44,33.33,41.67,12.12,53.4,21.21,53.47,56.19,72.11,278.6,217.28,239.98,283.48,329.96,433.46,384.32,362.12,376.52,72.49,205.49590400000002,261.124732,211.56658799999997,78.03,107.63,3,0,62,15,26,0,658.8,0,15663.29,3707,6991.4,0
2026-07 (Jul),23888.11,6599.0,19609.9,5455.0,11899.5,259.48,31273,119.93,19.28,15.96,30.56,14.29,2.65,0.2,7.66,129.01,127.95,58.66,40.79,21.51,55.56,25.0,66.67,20.29,34.58,44.93,38.23,35.58,75.68,316.29,253.18,272.75,342.9,361.91,465.16,426.37,372.78,425.53,74.18,163.001251,282.119904,151.403574,79.15,106.7,0,0,52,13,14,0,0.0,0,15667.0,3816,5123.06,0
2026-08 (Aug),6293.14,4345.0,4778.9,3668.0,8088.5,30.29,34086,-27.11,-5.06,5.86,-9.37,-2.93,3.69,-2.05,16.9,33.42,101.11,45.85,11.19,16.25,14.63,24.0,68.0,12.73,9.8,25.45,22.76,19.07,64.47,298.68,260.92,282.15,264.55,281.23,371.89,381.34,316.12,389.33,78.32,86.792984,203.802564,74.24523099999999,38.51,49.17,0,0,6,13,6,0,0.0,0,1322.74,3668,1322.74,0
2026-09 (Sep),3852.86,0.0,2875.76,0.0,7652.13,,34726,,11.59,,19.44,8.82,4.45,12.35,65.31,20.84,88.98,0.0,11.59,0.0,19.44,0.0,72.73,0.0,8.82,34.38,13.89,9.44,56.25,179.74,201.37,0.0,272.03,289.83,379.81,333.32,266.83,296.69,53.92,46.298148000000005,150.09187500000002,28.007536,45.01,83.44,4,0,14,0,7,0,731.7,0,2422.16,0,1363.5,0
2026-10 (Oct),5531.04,3204.0,4317.0,3031.0,18819.26,42.43,50162,-15.48,4.2,-43.03,-10.81,10.99,4.37,11.63,61.11,27.85,204.56,32.95,12.9,8.7,4.0,14.81,96.3,6.15,17.14,63.08,14.23,9.86,75.61,215.85,280.88,378.87,364.46,371.75,478.38,386.83,325.24,346.52,55.8,55.045909,245.91396400000002,34.166872,50.59,90.65,0,0,8,0,3,0,0.0,0,1909.8,0,568.8,0
2026-11 (Nov),1327.7,896.72,1025.41,672.0,12178.25,52.59,47612,-15.66,-0.3,-8.45,-4.55,1.28,3.66,14.32,91.23,7.27,156.13,8.62,3.55,3.85,0.0,4.55,90.91,3.57,4.85,55.36,9.1,5.44,63.2,205.08,238.79,224.0,351.46,365.96,477.55,435.96,335.18,381.35,47.04,39.67236,211.83376,20.745440000000002,18.33,39.01,0,0,5,3,0,0,0.0,0,1025.41,672,0.0,0
2026-12 (Dec),982.58,0.0,792.0,0.0,15054.36,,58452,,2.04,,5.56,0.9,3.29,-4.13,72.25,5.39,195.51,0.0,2.04,0.0,5.56,0.0,85.0,0.0,0.9,54.39,7.42,4.13,62.42,264.0,313.63,0.0,394.6,434.9,563.21,452.8,410.2,472.29,58.3,33.59776,256.04684000000003,19.505577000000002,16.04,27.49,3,0,3,0,3,0,792.0,0,792.0,0,792.0,0`;

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (ported from HTML)
// ────────────────────────────────────────────────────────────────────────────
function num(v: unknown): number {
  if (v == null) return 0;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^-/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^0-9.\-]/g, '').replace(/-/g, '');
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

function detectCurrency(objs: Record<string, string>[]): string {
  const moneyKeys = ['Rental Revenue', 'Total Revenue', 'Rental ADR', 'Market ADR', 'Final Price', 'Rental RevPAR'];
  const symRe = /(R\$|A\$|C\$|[$£€¥₹]|CHF|kr|zł)/;
  const codeRe = /\b(USD|GBP|EUR|JPY|AUD|CAD|BRL|MXN|CHF|SEK|NOK|DKK|PLN|INR)\b/;
  for (const o of objs) {
    for (const k of moneyKeys) {
      const raw = o[k];
      if (raw == null) continue;
      const s = String(raw);
      const m = s.match(symRe);
      if (m) return CUR_SYMBOLS[m[1]] || m[1];
      const c = s.match(codeRe);
      if (c) return CUR_SYMBOLS[c[1]] || `${c[1]} `;
    }
  }
  return '$';
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0, f = '', row: string[] = [], q = false;
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < t.length) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    i++;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

function toObjects(rows: string[][]): Record<string, string>[] {
  const h = rows[0].map((x) => x.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    h.forEach((k, j) => (o[k] = r[j] !== undefined ? String(r[j]).trim() : ''));
    return o;
  });
}

function pick(obj: Record<string, string>, ...names: string[]): string | undefined {
  for (const n of names) if (n in obj) return obj[n];
  return undefined;
}

function monthIndex(label: string): number {
  if (!label) return -1;
  const m = label.match(/(\d{4})[-/](\d{1,2})/);
  if (m) return parseInt(m[2], 10) - 1;
  for (let k = 0; k < 12; k++) if (new RegExp(MONTHS[k], 'i').test(label)) return k;
  return -1;
}

interface Row {
  mi: number; label: string;
  rev: number; revLY: number; revSTLY: number;
  occ: number; occLY: number; occSTLY: number;
  adr: number; adrLY: number; adrSTLY: number;
  revpar: number; revparLY: number; revparSTLY: number;
  occMkt: number; occMktLY: number; occMktSTLY: number;
  adrMkt: number; adrMktLY: number; adrMktSTLY: number;
  mktAdr: number;
  mktRevpar: number; mktRevparLY: number; mktRevparSTLY: number;
  revparIdx: number; mpi: number;
  pickN30: number; pickN30LY: number;
  pickR30: number; pickR30LY: number;
  potential: number;
  isFuture: boolean;
}

function buildModel(objs: Record<string, string>[], currentMonth: number): { rows: Row[]; missing: string[] } {
  const present = new Set<string>();
  objs.forEach((o) => Object.keys(o).forEach((k) => present.add(k.trim().toLowerCase())));
  const has = (...names: string[]) => names.some((n) => present.has(n.toLowerCase()));
  const missing: string[] = [];
  const req: { label: string; names: string[] }[] = [
    { label: 'Month (Year & Month)', names: ['Year & Month', 'Month', 'Year/Month', 'Period'] },
    { label: 'Rental Revenue', names: ['Rental Revenue', 'Revenue', 'Total Revenue'] },
    { label: 'Occupancy %', names: ['Occupancy %', 'Occupancy'] },
    { label: 'Rental ADR', names: ['Rental ADR', 'ADR'] },
    { label: 'Rental RevPAR', names: ['Rental RevPAR', 'RevPAR'] },
  ];
  req.forEach((r) => { if (!has(...r.names)) missing.push(r.label); });

  const rows: Row[] = objs
    .map((o) => {
      const label = pick(o, 'Year & Month', 'Month', 'Year/Month', 'Period') || '';
      const mi = monthIndex(label);
      return {
        mi, label,
        rev: num(pick(o, 'Rental Revenue', 'Revenue', 'Total Revenue')),
        revLY: num(pick(o, 'Rental Revenue LY', 'Rental Revenue Last Year')),
        revSTLY: num(pick(o, 'Rental Revenue STLY')),
        occ: num(pick(o, 'Occupancy %', 'Occupancy')),
        occLY: num(pick(o, 'Occupancy % LY')),
        occSTLY: num(pick(o, 'Occupancy % STLY')),
        adr: num(pick(o, 'Rental ADR', 'ADR')),
        adrLY: num(pick(o, 'Rental ADR LY')),
        adrSTLY: num(pick(o, 'Rental ADR STLY')),
        revpar: num(pick(o, 'Rental RevPAR', 'RevPAR')),
        revparLY: num(pick(o, 'Rental RevPAR LY')),
        revparSTLY: num(pick(o, 'Rental RevPAR STLY')),
        occMkt: num(pick(o, 'Market Occupancy %')),
        occMktLY: num(pick(o, 'Market Occupancy % LY')),
        occMktSTLY: num(pick(o, 'Market Occupancy % STLY')),
        adrMkt: num(pick(o, 'Market ADR')),
        adrMktLY: num(pick(o, 'Market ADR LY')),
        adrMktSTLY: num(pick(o, 'Market ADR STLY')),
        mktAdr: num(pick(o, 'Market ADR')),
        mktRevpar: num(pick(o, 'Market RevPAR')),
        mktRevparLY: num(pick(o, 'Market RevPAR LY')),
        mktRevparSTLY: num(pick(o, 'Market RevPAR STLY')),
        revparIdx: num(pick(o, 'RevPAR Index')),
        mpi: num(pick(o, 'Market Penetration Index %', 'Market Penetration Index')),
        pickN30: num(pick(o, 'Booked Nights Pickup (30 Days)')),
        pickN30LY: num(pick(o, 'Booked Nights Pickup STLY (30 Days)')),
        pickR30: num(pick(o, 'Rental Revenue Pickup (30 Days)')),
        pickR30LY: num(pick(o, 'Rental Revenue Pickup STLY (30 Days)')),
        potential: num(pick(o, 'Available & Bookable dates Potential Revenue (Final Price)', 'Potential Revenue')),
        isFuture: false,
      };
    })
    .filter((r) => r.mi >= 0)
    .sort((a, b) => a.mi - b.mi);
  rows.forEach((r) => { r.isFuture = r.mi > currentMonth; });
  return { rows, missing };
}

// Past months → vs LY (full prior-year actual). Future months → vs STLY (same-time-last-year), with LY fallback.
function basis(r: Row, ly: number, stly: number): { prev: number; label: string } {
  if (r.isFuture) {
    const v = stly != null && stly > 0 ? stly : ly;
    return { prev: v || 0, label: 'vs STLY' };
  }
  return { prev: ly || 0, label: 'vs LY' };
}

function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
type DeltaInfo = { d: number | null; label: string };

export default function MonthlyRevenueReport() {
  const today = useMemo(() => new Date(), []);
  const defaultReportMonth = today.getFullYear() === REPORT_YEAR ? today.getMonth() : 4;
  const [reportMonth, setReportMonth] = useState(defaultReportMonth);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [currency, setCurrency] = useState('$');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [bizName, setBizName] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const [summary, setSummary] = useState('');
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryEdited, setSummaryEdited] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  // ── Formatters (depend on `currency` via closure) ──
  const money = useCallback(
    (n: number) => currency + Math.round(n).toLocaleString('en-US'),
    [currency]
  );
  const moneyK = useCallback(
    (n: number) => {
      const a = Math.abs(n);
      if (a >= 1000) return currency + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      return currency + Math.round(n);
    },
    [currency]
  );
  const fmtPct = (n: number) => n.toFixed(n < 10 && n > -10 ? 1 : 0) + '%';

  // ── Derived model: actuals / future / aggregates ──
  // isFuture is derived from `reportMonth` (the focus month) so changing the
  // selector retargets the report without re-parsing the file.
  const rowsWithFuture = useMemo(
    () => (rows ? rows.map((r) => ({ ...r, isFuture: r.mi > reportMonth })) : null),
    [rows, reportMonth]
  );
  const actuals = useMemo(() => (rowsWithFuture ? rowsWithFuture.filter((r) => !r.isFuture) : []), [rowsWithFuture]);
  const future = useMemo(() => (rowsWithFuture ? rowsWithFuture.filter((r) => r.isFuture) : []), [rowsWithFuture]);

  const aggregates = useMemo(() => {
    if (!actuals.length) return null;
    const totRev = actuals.reduce((s, r) => s + r.rev, 0);
    const totRevLY = actuals.reduce((s, r) => s + r.revLY, 0);
    const avgOcc = actuals.reduce((s, r) => s + r.occ, 0) / actuals.length;
    const occLYVals = actuals.filter((r) => r.occLY > 0);
    const avgOccLY = occLYVals.length ? occLYVals.reduce((s, r) => s + r.occLY, 0) / occLYVals.length : 0;
    const occMktVals = actuals.filter((r) => r.occMkt > 0);
    const avgOccMkt = occMktVals.length ? occMktVals.reduce((s, r) => s + r.occMkt, 0) / occMktVals.length : 0;
    // revenue-weighted ADR (sum rev / sum nights-equiv); fallback to simple mean
    let n = 0, d = 0;
    actuals.forEach((r) => {
      if (r.adr && r.revpar) {
        const nights = r.rev / r.adr;
        n += r.adr * nights;
        d += nights;
      }
    });
    const wAdr = d ? n / d : (actuals.length ? actuals.reduce((s, r) => s + r.adr, 0) / actuals.length : 0);
    const adrLYVals = actuals.filter((r) => r.adrLY > 0);
    const wAdrLY = adrLYVals.length ? adrLYVals.reduce((s, r) => s + r.adrLY, 0) / adrLYVals.length : 0;
    const mktAdrVals = actuals.filter((r) => r.mktAdr > 0);
    const wAdrMkt = mktAdrVals.length ? mktAdrVals.reduce((s, r) => s + r.mktAdr, 0) / mktAdrVals.length : 0;
    const avgRevpar = actuals.reduce((s, r) => s + r.revpar, 0) / actuals.length;
    const revparLYVals = actuals.filter((r) => r.revparLY > 0);
    const avgRevparLY = revparLYVals.length ? revparLYVals.reduce((s, r) => s + r.revparLY, 0) / revparLYVals.length : 0;
    const mktRevparVals = actuals.filter((r) => r.mktRevpar > 0);
    const avgRevparMkt = mktRevparVals.length ? mktRevparVals.reduce((s, r) => s + r.mktRevpar, 0) / mktRevparVals.length : 0;
    const revparIdxVals = actuals.filter((r) => r.revparIdx > 0);
    const avgRevparIdx = revparIdxVals.length ? revparIdxVals.reduce((s, r) => s + r.revparIdx, 0) / revparIdxVals.length : 0;
    const mpiVals = actuals.filter((r) => r.mpi > 0);
    const avgMpi = mpiVals.length ? mpiVals.reduce((s, r) => s + r.mpi, 0) / mpiVals.length : 0;
    const adrVsMkt = mktAdrVals.length
      ? (actuals.reduce((s, r) => s + r.adr, 0) / actuals.length) /
        (mktAdrVals.reduce((s, r) => s + r.mktAdr, 0) / mktAdrVals.length) * 100
      : 0;
    return {
      totRev, totRevLY, avgOcc, avgOccLY, avgOccMkt,
      wAdr, wAdrLY, wAdrMkt, avgRevpar, avgRevparLY, avgRevparMkt,
      avgRevparIdx, avgMpi, adrVsMkt,
    };
  }, [actuals]);

  // ── Current-month spotlight ──
  const spotlight = useMemo(() => {
    if (!rowsWithFuture || !actuals.length) return null;
    let cur = rowsWithFuture.find((r) => r.mi === reportMonth);
    if (!cur || cur.rev <= 0) {
      const withRev = actuals.filter((r) => r.rev > 0);
      if (cur && cur.rev <= 0 && withRev.length) cur = withRev[withRev.length - 1];
      else if (!cur && withRev.length) cur = withRev[withRev.length - 1];
    }
    if (!cur) return null;
    // "Current month" label only applies when the focus month is literally today's month.
    const isCurrent = cur.mi === today.getMonth() && today.getFullYear() === REPORT_YEAR;
    const partial = isCurrent && today.getDate() < 28;
    const own = (val: number, ly: number, stly: number): DeltaInfo => {
      const bz = basis(cur!, ly, stly);
      return { d: bz.prev ? deltaPct(val, bz.prev) : null, label: bz.label };
    };
    const vsMkt = (val: number, mkt: number): DeltaInfo => ({
      d: mkt && mkt > 0 ? deltaPct(val, mkt) : null,
      label: 'vs market',
    });
    return {
      cur, partial,
      metrics: [
        { lab: 'Revenue',   val: money(cur.rev),    ly: own(cur.rev, cur.revLY, cur.revSTLY),       mkt: null },
        { lab: 'Occupancy', val: fmtPct(cur.occ),   ly: own(cur.occ, cur.occLY, cur.occSTLY),       mkt: vsMkt(cur.occ, cur.occMkt) },
        { lab: 'ADR',       val: money(cur.adr),    ly: own(cur.adr, cur.adrLY, cur.adrSTLY),       mkt: vsMkt(cur.adr, cur.mktAdr) },
        { lab: 'RevPAR',    val: money(cur.revpar), ly: own(cur.revpar, cur.revparLY, cur.revparSTLY), mkt: vsMkt(cur.revpar, cur.mktRevpar) },
      ],
    };
  }, [rowsWithFuture, actuals, reportMonth, today, money]);

  // ── AI prompt + local fallback ──
  const { aiPrompt, aiFallback } = useMemo(() => {
    if (!aggregates || !spotlight) return { aiPrompt: '', aiFallback: '' };
    const cur = spotlight.cur;
    const futRev = future.reduce((s, r) => s + Math.max(r.rev, r.pickR30), 0);
    const fmtP = (d: number | null) => (d === null || !isFinite(d) ? 'n/a' : (d >= 0 ? '+' : '') + d.toFixed(0) + '%');
    const curMpi = cur.mpi || 0;
    const curAdrVsMkt = cur.adr && cur.mktAdr ? (cur.adr / cur.mktAdr) * 100 : 0;
    const curRevparVsMkt = cur.revpar && cur.mktRevpar ? deltaPct(cur.revpar, cur.mktRevpar) : null;
    const curOccVsMkt = cur.occ && cur.occMkt ? deltaPct(cur.occ, cur.occMkt) : null;
    const curName = `${MONTHS[cur.mi]} ${REPORT_YEAR}`;
    const prompt = [
      `You are a friendly revenue manager writing a brief note to a property owner. Write a SHORT executive summary of AT MOST 300 CHARACTERS (hard limit — count characters, not words). Tone: conversational, warm, professional, and positive — soft and encouraging, like a trusted advisor sharing good news. The summary is about THE CURRENT MONTH'S performance; lead with the current month's headline win, then point gently to the one clear opportunity. You may add brief year-to-date / forward-booking context if it fits. Plain sentences, no bullet points, no markdown, no headers. Use the real numbers below; do not invent data. Stay under 300 characters total.`,
      ``,
      `CURRENCY SYMBOL: ${currency}.`,
      `CURRENT MONTH — ${curName} (this is the focus of the summary):`,
      `- Revenue: ${money(cur.rev || 0)}`,
      `- Occupancy: ${fmtPct(cur.occ || 0)} (${fmtP(curOccVsMkt)} vs current market)`,
      `- ADR: ${money(cur.adr || 0)} (ADR-vs-market index ${curAdrVsMkt ? curAdrVsMkt.toFixed(0) : 'n/a'}, 100 = market par)`,
      `- RevPAR: ${money(cur.revpar || 0)} (${fmtP(curRevparVsMkt)} vs current market)`,
      `- MPI (market penetration index, this month): ${curMpi ? curMpi.toFixed(0) : 'n/a'} (100 = fair share of demand)`,
      `CONTEXT — year-to-date: ${money(aggregates.totRev)} revenue (${fmtP(deltaPct(aggregates.totRev, aggregates.totRevLY))} vs last year). On the books ahead: ${money(futRev)} across ${future.length} month${future.length > 1 ? 's' : ''}.`,
      ``,
      `PRICING LOGIC — IMPORTANT: base the recommendation on THIS MONTH'S MPI and ADR-vs-market, not the year-to-date average. A below-market ADR is NOT automatically a problem. If this month's MPI is at or above 100, the lower ADR is JUSTIFIED — the property is winning more than its fair share of bookings (a deliberate occupancy/volume play), so do NOT urge raising rates; instead affirm the pricing is working and suggest only gentle, demand-led increases. Only recommend a clear rate increase when ADR is below market AND this month's MPI is below 100. State this reasoning briefly.`,
    ].join('\n');

    const adrLow = curAdrVsMkt > 0 && curAdrVsMkt < 100;
    const mpiStrong = curMpi >= 100;
    let closer: string;
    if (adrLow && mpiStrong) closer = `ADR sits below market, but with MPI at ${curMpi.toFixed(0)} you're winning more than your fair share — the lower rate is justified, so hold it and nudge only as demand builds.`;
    else if (adrLow) closer = `ADR is trailing the market with MPI at ${curMpi.toFixed(0)}, so there's room to nudge rates up and capture more revenue.`;
    else if (curAdrVsMkt >= 100) closer = `Pricing is at or above the market — lovely work; let's protect that pace.`;
    else closer = `Momentum is building nicely into the busier months ahead.`;
    const occBit = cur.occ ? ` ${MONTHS[cur.mi]}'s ${fmtPct(cur.occ)} occupancy shows real momentum.` : '';
    let fallback = `Great month: ${money(cur.rev || 0)} in ${MONTHS[cur.mi]}, with ${money(futRev)} on the books ahead.${occBit} ${closer}`;
    if (fallback.length > 300) fallback = fallback.slice(0, 297).trimEnd().replace(/[\s.,;:—-]+$/, '') + '…';
    return { aiPrompt: prompt, aiFallback: fallback };
  }, [aggregates, spotlight, future, currency, money]);

  // ── Generate AI summary via /api/claude ──
  const generateSummary = useCallback(
    async (isAuto: boolean) => {
      if (!aiPrompt) return;
      if (isAuto && summaryEdited) return;
      setSummaryBusy(true);
      let text = '';
      try {
        const resp = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            messages: [{ role: 'user', content: aiPrompt }],
          }),
        });
        if (!resp.ok) throw new Error(`api ${resp.status}`);
        const data = await resp.json();
        text = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim();
        if (!text) throw new Error('empty');
      } catch {
        text = aiFallback;
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (text.length > 300) text = text.slice(0, 299).replace(/[\s.,;:—-]+$/, '') + '…';
      setSummary(text);
      setSummaryEdited(false);
      if (summaryRef.current) summaryRef.current.textContent = text;
      setSummaryBusy(false);
    },
    [aiPrompt, aiFallback, summaryEdited]
  );

  // Auto-generate on first successful parse.
  useEffect(() => {
    if (rows && !summary && !summaryEdited && aiPrompt) {
      generateSummary(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Re-generate when the user picks a different reporting month (unless they
  // manually edited the summary — then leave their text alone).
  const firstMonthRender = useRef(true);
  useEffect(() => {
    if (firstMonthRender.current) {
      firstMonthRender.current = false;
      return;
    }
    if (rows && aiPrompt && !summaryEdited) {
      generateSummary(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportMonth]);

  // ── File handling ──
  const loadObjects = useCallback(
    (objs: Record<string, string>[], kind: string) => {
      try {
        const cur = detectCurrency(objs);
        setCurrency(cur);
        const { rows: model, missing } = buildModel(objs, reportMonth);
        if (missing.length) {
          setErrorMsg(
            `This file is missing required metric${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Please re-export the report with ${missing.length > 1 ? 'these columns' : 'this column'} included and upload again.`
          );
          return;
        }
        if (!model.length) {
          throw new Error(`Could not find a month column (e.g. "Year & Month") with values in this ${kind}.`);
        }
        setRows(model);
        setErrorMsg('');
      } catch (e: unknown) {
        setErrorMsg('Could not read that file. ' + (e instanceof Error ? e.message : 'Make sure it is the monthly revenue export.'));
      }
    },
    [reportMonth]
  );

  const loadText = useCallback(
    (text: string) => {
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setErrorMsg('Could not read that file. It looks empty.');
        return;
      }
      loadObjects(toObjects(parsed), 'CSV');
    },
    [loadObjects]
  );

  const loadWorkbook = useCallback(
    (buf: ArrayBuffer) => {
      try {
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: false, defval: '' });
        if (!aoa.length) {
          setErrorMsg('That spreadsheet has no data on its first sheet.');
          return;
        }
        const parsed = aoa.map((r) => r.map((c) => (c == null ? '' : String(c))));
        loadObjects(toObjects(parsed), 'spreadsheet');
      } catch (e: unknown) {
        setErrorMsg('Could not read that Excel file. ' + (e instanceof Error ? e.message : ''));
      }
    },
    [loadObjects]
  );

  const handleFile = useCallback(
    (f: File | undefined) => {
      setErrorMsg('');
      if (!f) return;
      setFileName(f.name);
      const name = (f.name || '').toLowerCase();
      const isXlsx = /\.(xlsx|xls|xlsm)$/.test(name) || /spreadsheet|ms-excel/.test(f.type || '');
      const r = new FileReader();
      r.onerror = () => setErrorMsg('Could not read that file.');
      if (isXlsx) {
        r.onload = (e) => loadWorkbook(e.target?.result as ArrayBuffer);
        r.readAsArrayBuffer(f);
      } else {
        r.onload = (e) => loadText(e.target?.result as string);
        r.readAsText(f);
      }
    },
    [loadText, loadWorkbook]
  );

  const reset = () => {
    setRows(null); setFileName(''); setErrorMsg('');
    setBizName(''); setOwnerName('');
    setSummary(''); setSummaryEdited(false); setSummaryBusy(false);
    setReportMonth(defaultReportMonth);
    firstMonthRender.current = true;
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (summaryRef.current) summaryRef.current.textContent = '';
  };

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────
  const ready = rows && actuals.length > 0 && aggregates;

  return (
    <div className="monthly-report-root tabular-nums">
      <style>{PRINT_AND_REPORT_CSS}</style>

      {/* ─── Toolbar (screen only) ─── */}
      {ready && (
        <div className="no-print flex items-center gap-2 mb-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-700 mr-auto">
            <span className="font-semibold">Reporting month</span>
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(parseInt(e.target.value, 10))}
              className="rounded-lg border border-gray-200 bg-white text-gray-900 text-sm font-medium px-3 py-2 hover:border-gray-300 focus:outline-none focus:border-yellow-400 cursor-pointer"
              aria-label="Choose the month this report covers"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m} {REPORT_YEAR}
                  {i === today.getMonth() && today.getFullYear() === REPORT_YEAR ? ' · current' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <FileUp size={14} />
            Load another file
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-black transition-colors cursor-pointer"
          >
            <Printer size={14} />
            Print / Save as PDF
          </button>
        </div>
      )}

      {/* ─── Dropzone ─── */}
      {!ready && (
        <div className="no-print">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-yellow-50">
                <BarChart3 size={20} className="text-yellow-700" strokeWidth={1.8} />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Monthly Reports</h1>
            </div>
            <p className="text-sm text-gray-500 ml-12">Portfolio revenue report from a PriceLabs monthly export.</p>
          </div>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all text-center ${
              dragOver ? 'border-yellow-400 bg-yellow-50/40' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="w-12 h-12 rounded-xl bg-yellow-400 flex items-center justify-center">
              <Upload size={22} className="text-gray-900" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Drop your revenue file here</h2>
            <p className="text-sm text-gray-500 max-w-md leading-relaxed">
              Export the monthly revenue file from your channel manager (PriceLabs &ldquo;Revenue by Month&rdquo;, or the equivalent) and drop it in — <b>.xlsx</b> or <b>.csv</b>. The report builds itself.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-black transition-colors cursor-pointer"
              >
                Choose file
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); loadText(SAMPLE_CSV); }}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white transition-colors cursor-pointer"
              >
                Use sample data
              </button>
            </div>
            {errorMsg && (
              <div className="mt-2 text-sm text-red-700 font-semibold max-w-lg leading-relaxed" dangerouslySetInnerHTML={{ __html: errorMsg }} />
            )}
          </label>
        </div>
      )}

      {/* ─── Report ─── */}
      {ready && (
        <div className="report-page bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-10 md:px-12 md:py-12">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 pb-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-semibold mb-2">
                Portfolio Revenue Report
              </div>
              <h1 className="text-3xl md:text-[33px] font-bold tracking-tight leading-none text-gray-900">
                {REPORT_YEAR} Performance
              </h1>
              <div className="mt-3 flex flex-col gap-1">
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="Business name…"
                  className="ef-input text-lg font-semibold tracking-tight bg-transparent border-b border-transparent hover:border-gray-200 focus:border-yellow-400 focus:outline-none transition-colors max-w-sm px-0.5"
                />
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Prepared for: owner name…"
                  className="ef-input text-sm font-medium bg-transparent border-b border-transparent hover:border-gray-200 focus:border-yellow-400 focus:outline-none transition-colors max-w-sm px-0.5"
                />
              </div>
            </div>
            <div className="text-left md:text-right shrink-0">
              <div className="flex md:justify-end items-center gap-2 text-xl font-bold tracking-tight">
                <span className="w-4 h-4 rounded bg-yellow-400" />
                Hostlyft
              </div>
              <div className="text-xs text-gray-500 mt-2 leading-relaxed">
                Generated {today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                <br />
                Reporting period: {REPORT_YEAR}
              </div>
            </div>
          </div>
          <div className="h-[3px] bg-yellow-400 rounded mt-1 mb-8" />

          {/* AI executive summary */}
          <div className="aisum mb-7 border border-gray-200 border-l-[3px] border-l-yellow-400 rounded-xl px-5 py-4 bg-[#FEFEFD]">
            <div className="flex items-center justify-between mb-2.5 gap-3">
              <div className="text-[11px] tracking-[0.12em] uppercase text-gray-500 font-bold">
                Executive summary
              </div>
              <button
                onClick={() => generateSummary(false)}
                disabled={summaryBusy}
                className="no-print inline-flex items-center gap-1.5 text-xs font-semibold border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white disabled:opacity-60 disabled:cursor-default disabled:hover:bg-white disabled:hover:text-gray-900 rounded-md px-3 py-1.5 transition-colors cursor-pointer"
              >
                {summaryBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {summaryBusy ? 'Generating…' : summary ? 'Regenerate summary' : 'Create AI Summary'}
              </button>
            </div>
            <div
              ref={summaryRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                setSummaryEdited(true);
                setSummary((e.target as HTMLDivElement).textContent || '');
              }}
              className={`outline-none text-[13px] leading-relaxed min-h-[48px] ${
                summaryBusy ? 'text-gray-500' : 'text-gray-900'
              } ${!summary && !summaryBusy ? 'aisum-empty' : ''}`}
              data-placeholder='A summary will be generated automatically from this report. Click "Create AI Summary" to (re)generate, or type your own here.'
            />
          </div>

          {/* Current-month spotlight */}
          {spotlight && (
            <div className="relative bg-neutral-900 rounded-2xl px-6 py-5 mb-8 flex flex-col md:flex-row md:items-center gap-5 overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-[5px] bg-yellow-400" />
              <div className="pl-1 md:pl-2 md:pr-2 md:border-r md:border-neutral-700 md:pr-6 shrink-0">
                <div className="text-[10.5px] tracking-[0.16em] uppercase text-yellow-400 font-bold mb-2">
                  {spotlight.partial ? 'Current month' : 'Spotlight'}
                </div>
                <div className="text-2xl font-bold text-white tracking-tight leading-none">
                  {MONTHS[spotlight.cur.mi]} {REPORT_YEAR}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 flex-1 min-w-0">
                {spotlight.metrics.map((m) => (
                  <div key={m.lab} className="min-w-0">
                    <div className="text-[10px] tracking-[0.08em] uppercase text-gray-400 font-semibold mb-1.5">{m.lab}</div>
                    <div className="text-[22px] font-bold tracking-tight text-white leading-none">{m.val}</div>
                    <div className="text-[10px] text-gray-400 mt-1.5 whitespace-nowrap">
                      {m.ly.d === null
                        ? (m.lab === 'Revenue' ? 'no prior-year basis' : '—')
                        : <DeltaChip d={m.ly.d} label={m.ly.label} dark />}
                    </div>
                    {m.mkt && (
                      <div className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">
                        {m.mkt.d === null
                          ? '— vs market'
                          : <DeltaChip d={m.mkt.d} label={m.mkt.label} dark />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI strip */}
          <Section title="Performance to date" range={`${MONTHS[actuals[0].mi]}–${MONTHS[actuals[actuals.length - 1].mi]} ${REPORT_YEAR}`}>
            <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-200 rounded-xl overflow-hidden">
              {[
                {
                  lab: 'Rental revenue', val: money(aggregates.totRev), primary: true,
                  ly: deltaPct(aggregates.totRev, aggregates.totRevLY),
                  mkt: null as number | null,
                  basisStr: `${money(aggregates.totRevLY)} last year`,
                },
                {
                  lab: 'Avg occupancy', val: fmtPct(aggregates.avgOcc),
                  ly: aggregates.avgOccLY ? deltaPct(aggregates.avgOcc, aggregates.avgOccLY) : null,
                  mkt: aggregates.avgOccMkt ? deltaPct(aggregates.avgOcc, aggregates.avgOccMkt) : null,
                  basisStr: aggregates.avgOccLY ? `${fmtPct(aggregates.avgOccLY)} last year` : '—',
                },
                {
                  lab: 'ADR', val: money(aggregates.wAdr),
                  ly: aggregates.wAdrLY ? deltaPct(aggregates.wAdr, aggregates.wAdrLY) : null,
                  mkt: aggregates.wAdrMkt ? deltaPct(aggregates.wAdr, aggregates.wAdrMkt) : null,
                  basisStr: aggregates.wAdrLY ? `${money(aggregates.wAdrLY)} last year` : '—',
                },
                {
                  lab: 'RevPAR', val: money(aggregates.avgRevpar),
                  ly: aggregates.avgRevparLY ? deltaPct(aggregates.avgRevpar, aggregates.avgRevparLY) : null,
                  mkt: aggregates.avgRevparMkt ? deltaPct(aggregates.avgRevpar, aggregates.avgRevparMkt) : null,
                  basisStr: aggregates.avgRevparLY ? `${money(aggregates.avgRevparLY)} last year` : '—',
                },
              ].map((k, i, arr) => (
                <div
                  key={k.lab}
                  className={`relative p-5 border-gray-200 ${i < arr.length - 1 ? 'border-r' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''}`}
                >
                  <span className="absolute left-0 top-[18px] bottom-[18px] w-[3px] bg-yellow-400 rounded" />
                  <div className={`text-[11px] tracking-[0.1em] uppercase font-semibold mb-2 ${k.primary ? 'text-gray-900' : 'text-gray-500'}`}>
                    {k.lab}
                  </div>
                  <div className={`font-bold tracking-tight leading-none ${k.primary ? 'text-[34px]' : 'text-[29px]'} text-gray-900`}>
                    {k.val}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {k.ly === null ? k.basisStr : <KpiChip d={k.ly} label="vs LY" />}
                  </div>
                  {(k.mkt !== null || k.ly !== null) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {k.mkt !== null ? <KpiChip d={k.mkt} label="vs market" /> : k.basisStr}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Chart */}
          <Section title="Rental revenue by month" range="Actuals · booked-to-date">
            <div className="border border-gray-200 rounded-xl px-5 py-5">
              <RevenueChart rows={rowsWithFuture!} currentMonth={reportMonth} moneyK={moneyK} />
              <div className="flex gap-5 text-[11.5px] text-gray-500 mt-1.5 pl-1">
                <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-900 mr-1.5 align-middle" />Actual revenue</span>
                <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-300 mr-1.5 align-middle" />On the books (upcoming)</span>
              </div>
            </div>
          </Section>

          {/* Monthly detail */}
          <Section title="Monthly detail" pageBreakBefore>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Month','Revenue','vs LY','Occupancy','ADR','RevPAR'].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold py-2.5 px-3 border-b border-gray-200 ${i === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actuals.map((r) => (
                  <tr key={r.mi}>
                    <td className="py-2.5 px-3 border-b border-gray-200 text-left font-semibold text-gray-900">
                      {MONTHS[r.mi]} {REPORT_YEAR}
                    </td>
                    <td className="py-2.5 px-3 border-b border-gray-200 text-right">{money(r.rev)}</td>
                    <td className="py-2.5 px-3 border-b border-gray-200 text-right"><TdDelta d={deltaPct(r.rev, r.revLY)} /></td>
                    <td className="py-2.5 px-3 border-b border-gray-200 text-right">{fmtPct(r.occ)}</td>
                    <td className="py-2.5 px-3 border-b border-gray-200 text-right">{money(r.adr)}</td>
                    <td className="py-2.5 px-3 border-b border-gray-200 text-right">{money(r.revpar)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 px-3 text-left font-bold border-t-2 border-gray-900">Total / Avg</td>
                  <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900">{money(aggregates.totRev)}</td>
                  <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900"><TdDelta d={deltaPct(aggregates.totRev, aggregates.totRevLY)} /></td>
                  <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900">{fmtPct(aggregates.avgOcc)}</td>
                  <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900">{money(aggregates.wAdr)}</td>
                  <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900">{money(aggregates.avgRevpar)}</td>
                </tr>
              </tfoot>
            </table>
          </Section>

          {/* Benchmark */}
          <Section title="How you compare to the market" range="Index 100 = market par">
            <div className="grid grid-cols-1 md:grid-cols-3 border border-gray-200 rounded-xl overflow-hidden">
              {[
                {
                  lab: 'RevPAR index', v: aggregates.avgRevparIdx,
                  note: aggregates.avgRevparIdx >= 100
                    ? 'At or above market on revenue per available night.'
                    : 'Below market on revenue per available night — pricing upside.',
                },
                {
                  lab: 'Market penetration', v: aggregates.avgMpi,
                  note: aggregates.avgMpi >= 100
                    ? 'Capturing more than fair share of demand.'
                    : 'Capturing below fair share of bookable demand.',
                },
                {
                  lab: 'ADR vs market', v: aggregates.adrVsMkt,
                  note: aggregates.adrVsMkt >= 100
                    ? 'Commanding a premium over the comp set.'
                    : aggregates.avgMpi >= 100
                      ? 'Below the comp set, but MPI ≥ 100 — the lower rate is justified by strong demand capture.'
                      : 'Priced below the comp set and under-capturing demand — room to lift rate.',
                },
              ].map((b, i, arr) => {
                const pos = b.v >= 100;
                const diff = Math.round(b.v - 100);
                return (
                  <div
                    key={b.lab}
                    className={`relative px-5 py-4 ${i < arr.length - 1 ? 'md:border-r border-gray-200' : ''} ${
                      i > 0 ? 'border-t md:border-t-0 border-gray-200' : ''
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded ${pos ? 'bg-green-700' : 'bg-red-700'}`}
                    />
                    <div className="text-[10px] tracking-wider uppercase text-gray-500 font-semibold mb-1.5">{b.lab}</div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-bold tracking-tight leading-none ${pos ? 'text-green-700' : 'text-red-700'}`}>
                        {b.v ? b.v.toFixed(0) : '—'}
                      </span>
                      <span className={`text-[11px] font-semibold ${pos ? 'text-green-700' : 'text-red-700'}`}>
                        {b.v ? `${diff >= 0 ? '+' : ''}${diff} vs par` : ''}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-gray-500 leading-snug mt-1.5">{b.note}</div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* On the books */}
          {future.length > 0 && (
            <Section
              title="On the books — upcoming"
              range={`${MONTHS[future[0].mi]}–${MONTHS[future[future.length - 1].mi]} ${REPORT_YEAR}`}
            >
              <p className="text-[13px] text-gray-500 mb-4 leading-relaxed max-w-2xl">
                Revenue already secured for upcoming months, plus booking <b>pace</b> — how fast nights and revenue are being picked up versus the same point last year. A positive pace means the calendar is filling faster than it did a year ago.
              </p>
              {(() => {
                const otbN = future.reduce((s, r) => s + r.pickN30, 0);
                const otbR = future.reduce((s, r) => s + r.pickR30, 0) + future.reduce((s, r) => s + r.rev, 0);
                const otbRLY = future.reduce((s, r) => s + r.pickR30LY, 0);
                const otbNLY = future.reduce((s, r) => s + r.pickN30LY, 0);
                const futRev = future.reduce((s, r) => s + Math.max(r.rev, r.pickR30), 0);
                const pickRev = otbR - future.reduce((s, r) => s + r.rev, 0);
                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                      {[
                        { lab: 'Revenue on the books', big: money(futRev), sub: `Confirmed bookings for ${future.length} upcoming month${future.length > 1 ? 's' : ''}` },
                        {
                          lab: 'Nights picked up · 30 days',
                          big: Math.round(otbN).toLocaleString(),
                          sub: otbNLY
                            ? `${otbN >= otbNLY ? 'Ahead of' : 'Behind'} last year (${Math.round(otbNLY)})`
                            : 'New pace — no prior-year basis',
                        },
                        {
                          lab: 'Revenue picked up · 30 days',
                          big: money(pickRev),
                          sub: otbRLY
                            ? `Booking pace ${pickRev >= otbRLY ? 'ahead of' : 'behind'} last year (${money(otbRLY)})`
                            : 'New pace — no prior-year basis',
                        },
                      ].map((c) => (
                        <div key={c.lab} className="relative border border-gray-200 rounded-xl p-5">
                          <span className="absolute left-0 top-4 bottom-4 w-[3px] bg-yellow-400 rounded" />
                          <div className="text-[11px] tracking-wider uppercase text-gray-500 font-semibold mb-2.5">{c.lab}</div>
                          <div className="text-[25px] font-bold tracking-tight text-gray-900">{c.big}</div>
                          <div className="text-xs text-gray-500 mt-1.5 leading-snug">{c.sub}</div>
                        </div>
                      ))}
                    </div>
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr>
                          {['Upcoming month','On the books','Nights picked up (30d)','Pace vs LY','Revenue pace (30d)'].map((h, i) => (
                            <th
                              key={h}
                              className={`text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold py-2.5 px-3 border-b border-gray-200 ${i === 0 ? 'text-left' : 'text-right'}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {future.map((r) => {
                          const obRev = Math.max(r.rev, r.pickR30);
                          return (
                            <tr key={r.mi}>
                              <td className="py-2.5 px-3 border-b border-gray-200 text-left font-semibold text-gray-500">{MONTHS[r.mi]} {REPORT_YEAR}</td>
                              <td className="py-2.5 px-3 border-b border-gray-200 text-right">{money(obRev)}</td>
                              <td className="py-2.5 px-3 border-b border-gray-200 text-right">{Math.round(r.pickN30)}</td>
                              <td className="py-2.5 px-3 border-b border-gray-200 text-right"><TdDelta d={deltaPct(r.pickN30, r.pickN30LY)} /></td>
                              <td className="py-2.5 px-3 border-b border-gray-200 text-right">{money(r.pickR30)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="py-3 px-3 text-left font-bold border-t-2 border-gray-900">Total upcoming</td>
                          <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900">{money(futRev)}</td>
                          <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900">{Math.round(otbN)}</td>
                          <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900"><TdDelta d={deltaPct(otbN, otbNLY)} /></td>
                          <td className="py-3 px-3 text-right font-bold border-t-2 border-gray-900">{money(future.reduce((s, r) => s + r.pickR30, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </>
                );
              })()}
            </Section>
          )}

          {/* Footer */}
          <div className="mt-10 pt-4 border-t border-gray-200 text-[11px] text-gray-500 flex flex-wrap justify-between gap-4 leading-relaxed">
            <div className="max-w-2xl">
              Actuals cover {MONTHS[actuals[0].mi]}–{MONTHS[actuals[actuals.length - 1].mi]} {REPORT_YEAR}. Upcoming figures reflect confirmed bookings on the calendar as of the generation date and will continue to build. &ldquo;Pace vs LY&rdquo; compares booking pickup to the same point in the prior year. Market indices: 100 = parity with comparable listings.
            </div>
            <div>Generated by Hostlyft Revenue Tools{fileName ? ` · ${fileName}` : ''}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────
function Section({
  title, range, pageBreakBefore, children,
}: {
  title: string;
  range?: string;
  pageBreakBefore?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`mt-9 ${pageBreakBefore ? 'page-break-before' : ''}`}>
      <div className="flex items-baseline gap-3 mb-4">
        <h3 className="text-[17px] font-bold tracking-tight text-gray-900">{title}</h3>
        <span className="flex-1 h-px bg-gray-200" />
        {range && <span className="text-[11px] text-gray-500 font-semibold tracking-wide">{range}</span>}
      </div>
      {children}
    </div>
  );
}

function DeltaChip({ d, label, dark }: { d: number | null; label: string; dark?: boolean }) {
  if (d === null || !isFinite(d)) {
    return <span className={dark ? 'text-gray-500' : 'text-gray-400'}>— {label}</span>;
  }
  const up = d >= 0;
  const upColor = dark ? 'text-green-400' : 'text-green-700';
  const downColor = dark ? 'text-red-300' : 'text-red-700';
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${up ? upColor : downColor}`}>
      <span
        className="inline-block w-0 h-0"
        style={
          up
            ? { borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: `6px solid currentColor` }
            : { borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid currentColor` }
        }
      />
      {(up ? '+' : '') + d.toFixed(1)}%
      <span className={`font-normal ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
    </span>
  );
}

function KpiChip({ d, label }: { d: number | null; label: string }) {
  if (d === null || !isFinite(d)) return <span className="text-gray-400">— {label}</span>;
  const up = d >= 0;
  return (
    <span>
      <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-green-700' : 'text-red-700'}`}>
        <span
          className="inline-block w-0 h-0"
          style={
            up
              ? { borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '6px solid currentColor' }
              : { borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid currentColor' }
          }
        />
        {(up ? '+' : '') + d.toFixed(1)}%
      </span>{' '}
      <span className="text-gray-500">{label}</span>
    </span>
  );
}

function TdDelta({ d }: { d: number | null }) {
  if (d === null || !isFinite(d)) return <span className="text-gray-300 text-[11.5px] font-semibold">—</span>;
  const up = d >= 0;
  return (
    <span className={`text-[11.5px] font-semibold ${up ? 'text-green-700' : 'text-red-700'}`}>
      {(up ? '+' : '') + d.toFixed(0)}%
    </span>
  );
}

function RevenueChart({
  rows, currentMonth, moneyK,
}: {
  rows: Row[];
  currentMonth: number;
  moneyK: (n: number) => string;
}) {
  const W = 900, H = 250, padL = 8, padR = 8, padT = 26, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const data = MONTHS.map((m, i) => {
    const r = rows.find((x) => x.mi === i);
    return { m, i, rev: r ? (r.isFuture ? Math.max(r.rev, r.pickR30) : r.rev) : 0, future: r ? r.isFuture : false };
  });
  const max = Math.max(...data.map((d) => d.rev), 1);
  const niceMax = Math.ceil(max / 5000) * 5000 || 5000;
  const bw = (innerW / 12) * 0.56;
  const gap = innerW / 12;
  const y0 = padT + innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto overflow-visible" role="img" aria-label="Monthly revenue chart">
      {/* baseline (yellow) */}
      <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke="#FBBF24" strokeWidth={2} />
      {/* faint gridlines */}
      {[1, 2, 3].map((g) => {
        const gy = padT + innerH - (innerH * g) / 3;
        return <line key={g} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#ECECEC" strokeWidth={1} />;
      })}
      {data.map((d) => {
        const x = padL + gap * d.i + (gap - bw) / 2;
        const h = (d.rev / niceMax) * innerH;
        const y = y0 - h;
        const fill = d.future ? '#D9D9D6' : '#111827';
        const isCur = d.i === currentMonth;
        const cx = x + bw / 2;
        return (
          <g key={d.i}>
            {d.rev > 0 && <rect x={x} y={y} width={bw} height={h} rx={2.5} fill={fill} />}
            {d.rev > 0 && (
              <text
                x={cx}
                y={y - 6}
                textAnchor="middle"
                style={{ fontSize: 10.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                fill={d.future ? '#6B7280' : '#111827'}
              >
                {moneyK(d.rev)}
              </text>
            )}
            <text
              x={cx}
              y={y0 + 16}
              textAnchor="middle"
              style={{ fontSize: 10, fontWeight: isCur ? 700 : 400 }}
              fill={isCur ? '#111827' : '#6B7280'}
            >
              {d.m}
            </text>
            {isCur && (() => {
              const uw = Math.max(bw, 18) / 2;
              return (
                <line
                  x1={cx - uw}
                  y1={y0 + 22}
                  x2={cx + uw}
                  y2={y0 + 22}
                  stroke="#FBBF24"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Print + a few scoped CSS rules
// ────────────────────────────────────────────────────────────────────────────
const PRINT_AND_REPORT_CSS = `
.monthly-report-root,
.monthly-report-root table,
.monthly-report-root input {
  font-feature-settings: "tnum" 1, "lnum" 1;
  font-variant-numeric: tabular-nums lining-nums;
}
.monthly-report-root .aisum-empty::before {
  content: attr(data-placeholder);
  color: #B8BCC4;
  font-size: 12.5px;
  line-height: 1.55;
}
.monthly-report-root .ef-input::placeholder { color: #B8BCC4; }

@media print {
  @page { size: A4 portrait; margin: 11mm; }
  html, body { background: #fff !important; }
  .no-print, aside, nav, header, .monthly-report-root + * { display: none !important; }
  .monthly-report-root { padding: 0; margin: 0; }
  .monthly-report-root .report-page {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
  .monthly-report-root .page-break-before { break-before: page; margin-top: 0 !important; }
  .monthly-report-root .ef-input { border-bottom-color: transparent !important; }
  .monthly-report-root .aisum-empty::before { content: ""; }
  .monthly-report-root .aisum:has(.aisum-empty) { display: none; }

  /* Tighten vertical rhythm so the report fits two A4 pages */
  .monthly-report-root .pb-5 { padding-bottom: 6px !important; }
  .monthly-report-root .mb-8 { margin-bottom: 10px !important; }
  .monthly-report-root .mb-7 { margin-bottom: 10px !important; }
  .monthly-report-root .mb-6 { margin-bottom: 8px !important; }
  .monthly-report-root .mb-4 { margin-bottom: 6px !important; }
  .monthly-report-root .mt-10 { margin-top: 12px !important; }
  .monthly-report-root .mt-9 { margin-top: 14px !important; }
  .monthly-report-root .pt-4 { padding-top: 6px !important; }
  /* compact card / section padding */
  .monthly-report-root .report-page .p-5 { padding: 12px 14px !important; }
  .monthly-report-root .report-page .px-5.py-5,
  .monthly-report-root .report-page .py-5.px-5 { padding: 8px 14px !important; }
  .monthly-report-root .report-page .px-5.py-4 { padding: 10px 14px !important; }
  .monthly-report-root .report-page .px-6.py-5 { padding: 12px 18px !important; }
  /* chart svg height cap */
  .monthly-report-root svg { max-height: 170px !important; }
  /* tables */
  .monthly-report-root table { font-size: 12px !important; }
  .monthly-report-root table td { padding: 6px 10px !important; }
  .monthly-report-root table th { padding: 0 10px 6px !important; }
  /* break-inside avoidance */
  .monthly-report-root .aisum,
  .monthly-report-root .report-page > .relative,
  .monthly-report-root table { break-inside: avoid; }

  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
