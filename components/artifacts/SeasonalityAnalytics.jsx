'use client';

import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const MONTHS = ["Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb"];
const UNIT_KEYS = ["U1","U2","U3","U4"]; // fallback only; dynamic keys come from file
// Unit names come from file headers dynamically; no static map needed
const UNIT_COLOR_PALETTE = ["#7c6af7","#1D9E75","#EF9F27","#E24B4A","#0891b2","#db2777","#65a30d","#d97706","#8b5cf6","#06b6d4"];
// Dynamic: returns a stable color for any unit key
function getUnitColor(uk, unitKeys) {
  const idx = unitKeys ? unitKeys.indexOf(uk) : parseInt((uk||"U1").slice(1))-1;
  return UNIT_COLOR_PALETTE[Math.max(0,idx) % UNIT_COLOR_PALETTE.length];
}
const UNIT_COLORS = {}; // kept for backward compat but not used for iteration

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
const ACC_COLS   = { rOcc:1, mOcc:2, occGap:3, rRevPAR:4, mRevPAR:5, bwGap:6 };

function daysInMonth(m1, yr) {
  if(m1===2) return (yr%4===0&&(yr%100!==0||yr%400===0))?29:28;
  return MONTH_DAYS[m1-1];
}

function classifyGap(g) {
  if(g===null||g===undefined||isNaN(g)) return {key:"na",label:"No data",         col:"#9ca3af",bg:"#f3f4f6",text:"#9ca3af",action:"—"};
  if(g<-10)  return {key:"r",label:"Seasonal misalign",col:"#c0392b",bg:"#FCEBEB",text:"#A32D2D",action:"Align multiplier - market rhythm"};
  if(g<0)    return {key:"o",label:"Slight misalign",  col:"#e67e22",bg:"#FAEEDA",text:"#854F0B",action:"Nudge multiplier halfway"};
  if(g<10)   return {key:"b",label:"Aligned",          col:"#2980b9",bg:"#E6F1FB",text:"#185FA5",action:"Hold current strategy"};
  if(g<20)   return {key:"g",label:"Outperforming",    col:"#27ae60",bg:"#EAF3DE",text:"#3B6D11",action:"Raise base 5% multiplier"};
  return           {key:"p",label:"Strong outperform",col:"#8e44ad",bg:"#EEEDFE",text:"#3C3489",action:"Raise base 10% multiplier"};
}
function calcTargetMult(cls,r,m){
  if(cls.key==="r")return m; if(cls.key==="o")return(r+m)/2;
  if(cls.key==="b")return r; if(cls.key==="g")return r*1.05;
  if(cls.key==="p")return r*1.10; return r;
}
function toRows(wb,sh){ if(!wb.Sheets[sh])return[]; return XLSX.utils.sheet_to_json(wb.Sheets[sh],{header:1,defval:null}); }

// ── Header parsing ────────────────────────────────────────────────────────────
// Each column header is either:
//   "Metric Name"                          → single-unit or LY/STLY variant
//   "Metric Name\n(Unit identifier text)"  → multi-unit, parenthesis = unit identity
function parseHeader(h) {
  const s = String(h||"").trim();
  // Format 1: newline separator (openpyxl / some XLSX readers preserve \n)
  const nl = s.indexOf("\n");
  if(nl >= 0) {
    const metric = s.slice(0, nl).trim();
    const paren  = s.slice(nl+1).trim().replace(/^\(/, "").replace(/\)$/, "").trim();
    return { metric, unitId: paren };
  }
  // Format 2: XLSX.js in browser strips \n → space before opening paren
  // e.g. "Rental ADR (W148 Unit 4 -- Artful 3BDR...)"
  const pi = s.indexOf(" (");
  if(pi >= 0 && s.endsWith(")")) {
    const metric = s.slice(0, pi).trim();
    const paren  = s.slice(pi+2, -1).trim();
    return { metric, unitId: paren };
  }
  return { metric: s, unitId: null };
}

// Extract a readable label from the unit identifier string
// "W148 Unit 4 -- Artful 3BDR: Near Subway..." → "Artful 3BDR"
// "Property Alpha" → "Property Alpha"
function unitLabel(uid) {
  if(!uid) return "Portfolio";
  if(uid.includes("--")) {
    const after = uid.split("--").slice(1).join("--").trim();
    return after.includes(":") ? after.split(":")[0].trim() : after.slice(0,50).trim();
  }
  return uid.slice(0,50).trim();
}

// Map a cleaned metric name to an internal field key
// isLY: whether this is a LY variant (for routing to ly object)
function metricToField(metric) {
  const lm = metric.toLowerCase();
  if(lm.includes("rental revpar"))           return "rRevPAR";
  if(lm.includes("market revpar"))           return "mRevPAR";
  if(lm.includes("rental adr"))              return "rADR";
  if(lm.includes("market adr"))              return "mADR";
  if(lm.includes("revpar index"))            return "rpi";
  if(lm.includes("adr index"))               return "adrIdx";
  if(lm.includes("market penetration"))      return "MPI";
  if(lm.includes("market occupancy"))        return "mOcc";
  if(lm.includes("occupancy"))               return "rOcc";
  if(lm.includes("booking window")&&lm.includes("market")) return "mBW";
  if(lm.includes("booking window"))          return "rBW";
  return null;
}

// "Rental ADR STLY" → {base:"Rental ADR", variant:"stly"}
// "Market RevPAR LY" → {base:"Market RevPAR", variant:"ly"}
// "Rental ADR"       → {base:"Rental ADR", variant:"current"}
function parseVariant(metric) {
  const lm = metric.toLowerCase().trim();
  if(lm.endsWith(" stly")) return { base: metric.slice(0,-5).trim(), variant:"stly" };
  if(lm.endsWith(" ly"))   return { base: metric.slice(0,-3).trim(), variant:"ly" };
  return { base: metric.trim(), variant:"current" };
}

// ── Date parsing ──────────────────────────────────────────────────────────────
function parseDateVal(v) {
  const s = String(v||"");
  const m1 = s.match(/(\d{4})-(\d{2})/);
  if(m1) {
    const yr=parseInt(m1[1]), mi=parseInt(m1[2]);
    const abbr = (s.match(/\((\w+)\)/)||[])[1] || MONTH_ABBR[mi-1];
    return { label:abbr, monthIdx:mi, year:yr };
  }
  return { label:s, monthIdx:null, year:null };
}

function detectAndParse(wb, fileName) {
  const sheets = wb.SheetNames;
  if(sheets.some(s=>/^Unit \d/i.test(s))) return parseAccurate(wb, fileName);
  const fr = toRows(wb, sheets[0]);
  if(fr.some(r=>r&&r[0]&&String(r[0]).match(/Year|\d{4}/i))) return parseKPI(wb, sheets[0], fileName);
  return null;
}

function parseKPI(wb, sheet, fileName) {
  const rows = toRows(wb, sheet);

  // Find header row
  const hIdx = rows.findIndex(r=>r&&r[0]&&String(r[0]).match(/Year|Month/i));
  if(hIdx<0) return {type:"error",fileName,error:"No header row found. First column must contain a date or 'Year & Month'."};
  const rawHeaders = rows[hIdx].map(h=>h===null?"":String(h));

  // Find month column
  const monthCol = rawHeaders.findIndex(h=>h.toLowerCase().includes("year")||h.toLowerCase().includes("month"));

  // Data rows
  const dataRows = rows.slice(hIdx+1).filter(r=>r&&r[monthCol]&&String(r[monthCol]).match(/\d{4}/));
  if(!dataRows.length) return {type:"error",fileName,error:"No data rows found. Rows must start with a date like '2025-03 (Mar)'."};

  // ── Parse all column headers ──────────────────────────────────────────────────
  // col → { metric_base, variant("current"|"ly"|"stly"), field, unitId, colIdx }
  const colMeta = rawHeaders.map((h, ci) => {
    const { metric, unitId } = parseHeader(h);
    const { base, variant }  = parseVariant(metric);
    const field              = metricToField(base);
    return { metric: base, variant, field, unitId, ci };
  });

  // ── Determine format ──────────────────────────────────────────────────────────
  // Multi-unit: any current column has a non-null unitId (parenthesis present)
  // Single-unit: no parenthesis anywhere → all columns for one portfolio
  const hasParenthesis = colMeta.some(c=>c.variant==="current" && c.field && c.unitId);
  const hasLYCols      = colMeta.some(c=>c.variant==="ly" && c.field);

  // ── Build unit registry ───────────────────────────────────────────────────────
  // unitRegistry: Map<unitId_string, {key, label}>
  // For single-unit: one entry with key "U1"
  // For multi-unit: one entry per unique unitId, assigned keys U1,U2... in first-seen order
  const unitRegistry = new Map(); // unitId → {key, label}

  if(hasParenthesis) {
    colMeta.forEach(c=>{
      if(c.variant!=="current"||!c.field||!c.unitId) return;
      if(!unitRegistry.has(c.unitId)) {
        const key   = "U" + (unitRegistry.size + 1);
        const label = unitLabel(c.unitId);
        unitRegistry.set(c.unitId, {key, label});
      }
    });
  } else {
    // Single unit: use file name as label
    const label = fileName.replace(/\.xlsx?$/i,"").replace(/[_-]+/g," ").trim() || "Portfolio";
    unitRegistry.set("__single__", {key:"U1", label});
  }

  const unitKeys = [...unitRegistry.values()].map(u=>u.key);

  // ── Validate required metrics ─────────────────────────────────────────────────
  // Build a set of fields present per unit for current cols
  const presentPerUnit = {};
  unitKeys.forEach(k=>{ presentPerUnit[k]=new Set(); });

  colMeta.forEach(c=>{
    if(c.variant!=="current"||!c.field) return;
    const uid = hasParenthesis ? c.unitId : "__single__";
    const entry = unitRegistry.get(uid);
    if(entry) presentPerUnit[entry.key].add(c.field);
  });

  const REQUIRED = ["rADR","mADR","mOcc"];
  const missing = [];
  unitKeys.forEach(uk=>{
    const present = presentPerUnit[uk]||new Set();
    REQUIRED.forEach(f=>{
      if(!present.has(f)){
        const names={rADR:"Rental ADR",mADR:"Market ADR",mOcc:"Market Occupancy %"};
        missing.push(uk + ": missing column " + names[f]);
      }
    });
    const hasRevPAR = present.has("rRevPAR") && present.has("mRevPAR");
    const hasIndex  = present.has("rpi");
    if(!hasRevPAR && !hasIndex) missing.push(uk + ": needs Rental RevPAR + Market RevPAR, or RevPAR Index");
  });
  if(missing.length) return {type:"error",fileName,error:"Missing required columns",details:missing};

  // ── Build column index maps: unit key → field → colIdx (current and LY) ───────
  const currentCols = {}; // uk → {field: colIdx}
  const lyCols      = {}; // uk → {field: colIdx}
  unitKeys.forEach(k=>{ currentCols[k]={}; lyCols[k]={}; });

  colMeta.forEach(c=>{
    if(!c.field||(c.variant!=="current"&&c.variant!=="ly")) return;
    const uid = hasParenthesis ? c.unitId : "__single__";
    const entry = unitRegistry.get(uid);
    if(!entry) return;
    const uk  = entry.key;
    const map = c.variant==="current" ? currentCols[uk] : lyCols[uk];
    if(!(c.field in map)) map[c.field] = c.ci; // first match wins
  });

  // ── Extract data ──────────────────────────────────────────────────────────────
  const n = (row, ci) => (ci!==undefined&&row[ci]!==null&&row[ci]!==undefined&&row[ci]!=="") ? +row[ci] : 0;
  const FIELDS = ["rADR","mADR","mOcc","rOcc","rBW","mBW","MPI","adrIdx","rpi","rRevPAR","mRevPAR"];

  const allRows = dataRows.map(row=>{
    const dateInfo = parseDateVal(row[monthCol]);
    const cur={}, ly={};
    unitKeys.forEach(uk=>{
      cur[uk]={}; ly[uk]={};
      FIELDS.forEach(f=>{ cur[uk][f] = n(row, currentCols[uk][f]); });
      FIELDS.forEach(f=>{ ly[uk][f]  = n(row, lyCols[uk][f]);      });
    });
    return {dateInfo, cur, ly};
  });

  // ── Rolling 12 selection ──────────────────────────────────────────────────────
  const now        = new Date();
  const todayYear  = now.getFullYear();
  const todayMonth = now.getMonth() + 1; // 1-indexed

  // Detect the file's primary year (most frequent year in date column)
  const yearCounts = {};
  allRows.forEach(r=>{ const yr=r.dateInfo.year; if(yr) yearCounts[yr]=(yearCounts[yr]||0)+1; });
  const fileYear = Object.keys(yearCounts).length
    ? +Object.entries(yearCounts).sort((a,b)=>b[1]-a[1])[0][0]
    : todayYear;

  // Is the file year already fully in the past?
  // If fileYear < todayYear: ALL months are complete — no LY substitution needed
  // If fileYear === todayYear: use today's month to split complete vs incomplete
  // If fileYear > todayYear: ALL months are future — ALL use LY (forward planning)
  const fileYearIsPast   = fileYear < todayYear;
  const fileYearIsFuture = fileYear > todayYear;

  // Completeness check: relative to today, is this month fully over?
  const isComplete = (yr, mi) => yr < todayYear || (yr === todayYear && mi < todayMonth);

  // Evaluation context label (shown in the dashboard header)
  const evalContext = fileYearIsPast
    ? "Evaluating "+fileYear+" (past year — all months complete)"
    : fileYearIsFuture
      ? "Evaluating "+fileYear+" (forward planning — using LY data for all months)"
      : "Evaluating "+fileYear+" (current year — "+
        (()=>{ let c=0; allRows.forEach(r=>{ if(r.dateInfo.year===fileYear&&isComplete(r.dateInfo.year,r.dateInfo.monthIdx)) c++; }); return c; })()+
        " months complete as of today)";

  let selectedRows;

  if(hasLYCols) {
    // Classify each row as complete (use CY data) or future slot (use LY data)
    // Works for multi-year reports (e.g. Apr 2025–Mar 2026) and full-year reports
    const completeRows = [], lySlots = [];
    allRows.forEach(r=>{
      const {year, monthIdx} = r.dateInfo;
      if(!year||!monthIdx) return;
      if(isComplete(year, monthIdx)) completeRows.push(r);
      else                           lySlots.push(r);
    });
    const rowOrder = r => r.dateInfo.year * 100 + r.dateInfo.monthIdx;
    completeRows.sort((a,b)=>rowOrder(a)-rowOrder(b));
    lySlots.sort((a,b)=>rowOrder(a)-rowOrder(b));
    const combined = [...lySlots, ...completeRows];
    selectedRows = combined.slice(-12).map(r=>{
      const {year, monthIdx, label} = r.dateInfo;
      const isLY       = lySlots.includes(r);
      const actualYear = isLY ? year - 1 : year;
      const days       = daysInMonth(monthIdx, actualYear);
      const vals       = isLY ? r.ly : r.cur;
      const dispLabel  = isLY
        ? label+" "+actualYear+" \u2192 "+label+" "+year
        : label+" "+year;
      return {label, year:actualYear, monthIdx, days, vals, isLY, dispLabel};
    });
  } else {
    // No LY cols: file already contains the rolling period as current data
    // Use all rows as-is — the exporter has already filtered to the desired window
    selectedRows = allRows.map(r=>{
      const {year, monthIdx, label} = r.dateInfo;
      const days = daysInMonth(monthIdx||1, year||todayYear);
      return {
        label:     label||"",
        year:      year||todayYear,
        monthIdx:  monthIdx||1,
        days,
        vals:      r.cur,
        isLY:      false,
        dispLabel: label&&year ? label+" "+year : label
      };
    });
  }

  // Sort chronologically (browser XLSX.js may return rows in a different order)
  selectedRows.sort((a,b)=>(a.year*100+a.monthIdx)-(b.year*100+b.monthIdx));

  // ── Build raw ─────────────────────────────────────────────────────────────────
  const raw = {months:[], monthDays:[], isLYArr:[], displayLabels:[], units:{}, hasLYCols};
  unitKeys.forEach(uk=>{
    const entry = [...unitRegistry.values()].find(e=>e.key===uk);
    raw.units[uk] = {
      label: entry?.label || uk,
      rADR:[],mADR:[],mOcc:[],rOcc:[],rBW:[],mBW:[],MPI:[],adrIdx:[],rpi:[],rRevPAR:[],mRevPAR:[],
      // Current-year index columns (always from cur, never LY) — used for Indexes tab
      MPI_cur:[],adrIdx_cur:[],rpi_cur:[]
    };
  });

  // Build a lookup from monthIdx → allRow for current-year index lookup
  const curRowByMonthIdx = {};
  allRows.forEach(r=>{ if(r.dateInfo.monthIdx) curRowByMonthIdx[r.dateInfo.monthIdx] = r; });

  selectedRows.forEach(r=>{
    raw.months.push(r.label);
    raw.monthDays.push(r.days);
    raw.isLYArr.push(r.isLY);
    raw.displayLabels.push(r.dispLabel);
    unitKeys.forEach(uk=>{
      const v = r.vals[uk]||{};
      FIELDS.forEach(f=>{ raw.units[uk][f].push(v[f]||0); });
      // Current-year indexes: always use cur data for this monthIdx
      const curRow = curRowByMonthIdx[r.monthIdx];
      const curV = curRow?.cur?.[uk]||{};
      raw.units[uk].MPI_cur.push(curV.MPI||0);
      raw.units[uk].adrIdx_cur.push(curV.adrIdx||0);
      raw.units[uk].rpi_cur.push(curV.rpi||0);
    });
  });

  return {type:"kpi", fileName, raw, unitKeys, evalContext, fileYear};
}

function parseAccurate(wb, fileName) {
  const result = {type:"accurate", fileName, units:{}};
  wb.SheetNames.filter(s=>/^Unit \d/i.test(s)).forEach(sheetName=>{
    const m = sheetName.match(/Unit\s+(\d+)/i); if(!m) return;
    const uk = "U"+m[1];
    const rows = toRows(wb, sheetName);
    const hIdx = rows.findIndex(r=>r&&r[0]==="Month"); if(hIdx<0) return;
    const data = rows.slice(hIdx+1).filter(r=>r&&r[0]&&MONTH_ABBR.includes(String(r[0]).trim()));
    result.units[uk] = {months:[],rOcc:[],mOcc:[],occGap:[],rRevPAR:[],mRevPAR:[],bwGap:[]};
    data.forEach(row=>{
      const n = c=>(row[c]!==null&&row[c]!==undefined)?+row[c]:null;
      result.units[uk].months.push(String(row[0]).trim());
      result.units[uk].rOcc.push(n(ACC_COLS.rOcc));   result.units[uk].mOcc.push(n(ACC_COLS.mOcc));
      result.units[uk].occGap.push(n(ACC_COLS.occGap));result.units[uk].rRevPAR.push(n(ACC_COLS.rRevPAR));
      result.units[uk].mRevPAR.push(n(ACC_COLS.mRevPAR));result.units[uk].bwGap.push(n(ACC_COLS.bwGap));
    });
  });
  return result;
}

function computeAnalytics(parsedFiles) {
  const kpi = parsedFiles.find(f=>f.type==="kpi");
  const acc = parsedFiles.find(f=>f.type==="accurate");
  if(!kpi) return null;
  const months      = kpi.raw.months;
  const monthDays   = kpi.raw.monthDays  || months.map(()=>30);
  const isLYArr     = kpi.raw.isLYArr    || months.map(()=>false);
  const dispLabels  = kpi.raw.displayLabels || months;
  const unitKeys    = kpi.unitKeys;
  const len = months.length, nil = ()=>Array(len).fill(null);
  const units = {};

  unitKeys.forEach(uk=>{
    const raw = kpi.raw.units[uk];

    // ── RevPAR ────────────────────────────────────────────────────────────────
    const hasDirect = raw.rRevPAR.some(v=>v>0) && raw.mRevPAR.some(v=>v>0);
    let rRevPAR, mRevPAR;
    if(hasDirect) {
      rRevPAR = raw.rRevPAR.map(v=>v>0?v:null);
      mRevPAR = raw.mRevPAR.map(v=>v>0?v:null);
    } else {
      // mOcc stored as percentage (e.g. 51.2) — divide by 100
      mRevPAR = raw.mADR.map((a,i)=>a>0&&raw.mOcc[i]>0 ? a*(raw.mOcc[i]/100) : null);
      rRevPAR = raw.rpi.map((rpi,i)=>rpi>0&&mRevPAR[i] ? rpi/100*mRevPAR[i] : null);
    }

    const validationFlags = rRevPAR.map((r,i)=>r!==null&&mRevPAR[i]!==null&&r<mRevPAR[i]?"rental<market":null);

    // ── Annual averages ───────────────────────────────────────────────────────
    const rV = rRevPAR.filter(v=>v&&v>0), mV = mRevPAR.filter(v=>v&&v>0);
    const rAvg = rV.length ? rV.reduce((a,b)=>a+b)/rV.length : null;
    const mAvg = mV.length ? mV.reduce((a,b)=>a+b)/mV.length : null;

    // ── Deviations & Gap ─────────────────────────────────────────────────────
    const rDev   = rRevPAR.map(v=>v&&v>0&&rAvg?+((v-rAvg)/rAvg*100).toFixed(1):null);
    const mDev   = mRevPAR.map(v=>v&&v>0&&mAvg?+((v-mAvg)/mAvg*100).toFixed(1):null);
    const devGap = rDev.map((rd,i)=>rd!==null&&mDev[i]!==null?+(rd-mDev[i]).toFixed(1):null);
    const gapCls = devGap.map(g=>classifyGap(g));

    // ── Seasonal multipliers (RevPAR-based) ───────────────────────────────────
    const rADRv = raw.rADR.filter(v=>v>0), mADRv = raw.mADR.filter(v=>v>0);
    const baseR = rADRv.length ? rADRv.reduce((a,b)=>a+b)/rADRv.length : null;
    const baseM = mADRv.length ? mADRv.reduce((a,b)=>a+b)/mADRv.length : null;
    const rMult = rRevPAR.map(v=>v&&v>0&&rAvg?+(v/rAvg).toFixed(4):null);
    const mMult = mRevPAR.map(v=>v&&v>0&&mAvg?+(v/mAvg).toFixed(4):null);
    const tMult = devGap.map((g,i)=>{
      if(g===null||rMult[i]===null) return null;
      return +calcTargetMult(classifyGap(g), rMult[i], mMult[i]??rMult[i]).toFixed(4);
    });
    const tADR = tMult.map((t,i)=>{
      if(t===null||rMult[i]===null||raw.rADR[i]===0) return null;
      return +(raw.rADR[i]*(t/rMult[i])).toFixed(2);
    });
    const dADR = tADR.map((t,i)=>t&&raw.rADR[i]>0?+(t-raw.rADR[i]).toFixed(2):null);

    // ── Occupancy ─────────────────────────────────────────────────────────────
    const rentalOcc = raw.rOcc.some(v=>v>0) ? raw.rOcc.map(v=>v>0?v:null)
      : raw.MPI.map((mpi,i)=>mpi>0&&raw.mOcc[i]>0?(mpi/100*raw.mOcc[i]):null);

    // ── Revenue impact projections ────────────────────────────────────────────
    const revNeutral = dADR.map((d,i)=>{
      if(d===null) return null;
      const occ = raw.mOcc[i]>0 ? raw.mOcc[i]/100 : 0.5;
      return Math.round(d * occ * monthDays[i]);
    });
    const revOptimistic = dADR.map((d,i)=>{
      if(d===null) return null;
      const occ = rentalOcc[i]!==null ? rentalOcc[i]/100 : (raw.mOcc[i]>0 ? raw.mOcc[i]/100 : 0.5);
      return Math.round(d * occ * monthDays[i]);
    });

    // ── Indexes ───────────────────────────────────────────────────────────────
    // Always use current-year index values (MPI_cur, adrIdx_cur, rpi_cur)
    // These are the actual competitive position columns from the file, never LY substitutes
    // Zero values = month not yet reported; shown as "—" in the Indexes tab
    const MPI_raw      = raw.MPI_cur    || raw.MPI;
    const adrIdx_raw   = raw.adrIdx_cur || raw.adrIdx;
    const rpi_raw      = raw.rpi_cur    || raw.rpi;
    const MPI      = MPI_raw.map(v=>v>0?v:null);
    const adrIdx   = adrIdx_raw.map(v=>v>0?v:null);
    const revparIdx= rpi_raw.map(v=>v>0?v:null);

    const accU = acc?.units?.[uk];
    const bwGap = accU?.bwGap || raw.rBW.map((v,i)=>v&&raw.mBW[i]?+(v-raw.mBW[i]).toFixed(1):null);
    const totalDelta = dADR.filter(v=>v!==null).reduce((a,b)=>a+b, 0);

    units[uk] = {
      label: raw.label,
      rentalADR:raw.rADR, marketADR:raw.mADR, marketOcc:raw.mOcc, rentalOcc,
      MPI, adrIdx, revparIdx,
      mRevPAR, rRevPAR, rAvg, mAvg, rDev, mDev, devGap, gapCls,
      rentalMult:rMult, marketMult:mMult, targetMult:tMult, targetADR:tADR, deltaADR:dADR,
      baseRentalADR:baseR, baseMarketADR:baseM,
      occGap:accU?.occGap||nil(), bwGap, validationFlags,
      monthsToAdjust:gapCls.filter(c=>c.key!=="b"&&c.key!=="na").length,
      totalDeltaADR:totalDelta,
      premiumRatio:baseR&&baseM?(baseR/baseM).toFixed(2):null,
      isLYArr, monthDays, displayLabels:dispLabels,
      revNeutral, revOptimistic,
    };
  });

  return {months, displayLabels:dispLabels, unitKeys, units, evalContext:kpi.evalContext, fileYear:kpi.fileYear};
}


// ── Mini chart using Canvas ────────────────────────────────────────────────────
function LineChart({ datasets, labels, height=160, yLabel="" }) {
  const ref = useRef();
  useEffect(()=>{
    const canvas=ref.current; if(!canvas) return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width, H=canvas.height;
    const pad={t:20,r:20,b:30,l:48};
    const cW=W-pad.l-pad.r, cH=H-pad.t-pad.b;
    ctx.clearRect(0,0,W,H);
    const allVals=datasets.flatMap(d=>d.data.filter(v=>v!==null));
    if(!allVals.length) return;
    const mn=Math.min(...allVals), mx=Math.max(...allVals);
    const range=mx-mn||1;
    const toX=i=>pad.l+i/(labels.length-1)*cW;
    const toY=v=>pad.t+cH-(v-mn)/range*cH;
    // grid
    ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=0.5;
    [0,0.25,0.5,0.75,1].forEach(f=>{
      const y=pad.t+cH*f;
      ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
      const val=(mx-range*f).toFixed(0);
      ctx.fillStyle="#6b7280"; ctx.font="9px system-ui"; ctx.textAlign="right";
      ctx.fillText(val,pad.l-4,y+3);
    });
    // zero line if in range
    if(mn<0&&mx>0){
      const y=toY(0); ctx.strokeStyle="#d1d5db"; ctx.lineWidth=1;
      ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cW,y); ctx.stroke();
      ctx.setLineDash([]);
    }
    // x labels
    ctx.fillStyle="#6b7280"; ctx.font="9px system-ui"; ctx.textAlign="center";
    labels.forEach((l,i)=>ctx.fillText(l,toX(i),H-6));
    // lines
    datasets.forEach(ds=>{
      ctx.strokeStyle=ds.color; ctx.lineWidth=1.5; ctx.setLineDash(ds.dash||[]);
      ctx.beginPath();
      let first=true;
      ds.data.forEach((v,i)=>{
        if(v===null) return;
        const x=toX(i),y=toY(v);
        if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);
      });
      ctx.stroke(); ctx.setLineDash([]);
      // dots
      ds.data.forEach((v,i)=>{
        if(v===null) return;
        ctx.beginPath(); ctx.arc(toX(i),toY(v),2.5,0,Math.PI*2);
        ctx.fillStyle=ds.color; ctx.fill();
      });
    });
  },[datasets,labels,height]);
  return (
    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
      <canvas ref={ref} width={520} height={height} style={{display:"block",height,minWidth:520}} />
    </div>
  );
}

function BarChart({ datasets, labels, height=140 }) {
  const ref=useRef();
  useEffect(()=>{
    const canvas=ref.current; if(!canvas) return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    const pad={t:16,r:16,b:28,l:44};
    const cW=W-pad.l-pad.r,cH=H-pad.t-pad.b;
    ctx.clearRect(0,0,W,H);
    const allVals=datasets.flatMap(d=>d.data.filter(v=>v!==null));
    if(!allVals.length) return;
    const mn=Math.min(0,...allVals),mx=Math.max(0,...allVals);
    const range=mx-mn||1;
    const toY=v=>pad.t+cH-(v-mn)/range*cH;
    const zero=toY(0);
    // grid
    ctx.strokeStyle="#e5e7eb";ctx.lineWidth=0.5;
    [0,0.5,1].forEach(f=>{
      const y=pad.t+cH*f; ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cW,y);ctx.stroke();
      ctx.fillStyle="#6b7280";ctx.font="9px system-ui";ctx.textAlign="right";
      ctx.fillText((mx-range*f).toFixed(0),pad.l-4,y+3);
    });
    // zero line
    ctx.strokeStyle="#d1d5db";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,zero);ctx.lineTo(pad.l+cW,zero);ctx.stroke();
    // bars
    const n=datasets.length,total=labels.length;
    const slotW=cW/total,bW=Math.min(slotW*0.7/n,18);
    datasets.forEach((ds,di)=>{
      ds.data.forEach((v,i)=>{
        if(v===null) return;
        const x=pad.l+slotW*(i+0.15)+di*bW;
        const y=toY(Math.max(0,v)),h=Math.abs(toY(0)-toY(v));
        ctx.fillStyle=ds.color+(v>=0?"cc":"99");
        ctx.fillRect(x,y,bW-1,h);
      });
    });
    // x labels
    ctx.fillStyle="#6b7280";ctx.font="9px system-ui";ctx.textAlign="center";
    labels.forEach((l,i)=>ctx.fillText(l,pad.l+slotW*(i+0.5),H-5));
  },[datasets,labels,height]);
  return (
    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
      <canvas ref={ref} width={520} height={height} style={{display:"block",height,minWidth:520}} />
    </div>
  );
}

// ── Heat map cell ─────────────────────────────────────────────────────────────
const HEAT_COLORS = {
  r:{ bg:"#fde8e8", text:"#991b1b" },
  o:{ bg:"#fef3e2", text:"#92400e" },
  b:{ bg:"#e0f0ff", text:"#1e40af" },
  g:{ bg:"#dcfce7", text:"#15803d" },
  p:{ bg:"#f3e8ff", text:"#6b21a8" },
  na:{ bg:"#f3f4f6", text:"#9ca3af" },
};

const Pill = ({cls})=>(
  <span style={{display:"inline-block",fontSize:10,fontWeight:600,padding:"2px 8px",
    borderRadius:20,background:cls.bg,color:cls.text,border:`1px solid ${cls.col}44`}}>
    {cls.label}
  </span>
);

const fS=(v,d=1)=>v!==null&&!isNaN(v)?(+v>=0?"+":(+v<0?"-":""))+Math.abs(+v).toFixed(d):"—";
// Export-safe: no + prefix, plain ASCII minus, no % suffix — Google Sheets parses cleanly
const fE=(v,d=1)=>v!==null&&!isNaN(v)?((+v<0?"-":"")+Math.abs(+v).toFixed(d)):"";
const f$=(v,d=0)=>v!==null&&!isNaN(v)&&+v!==0?"$"+Math.abs(+v).toFixed(d):"—";

// ── Main App ──────────────────────────────────────────────────────────────────
export default function SeasonalityAnalytics() {
  const [files,     setFiles]     = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [drag,      setDrag]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [errors,    setErrors]    = useState([]);
  const [tab,       setTab]       = useState("summary");
  const [unit,      setUnit]      = useState("U1");
  const [showExp,      setShowExp]      = useState(false);
  const [hoverCell,    setHoverCell]    = useState(null);
  const [savedEvals,   setSavedEvals]   = useState([]);
  const [saveModal,    setSaveModal]    = useState(false);
  const [saveName,     setSaveName]     = useState('');
  const [shareCopied,  setShareCopied]  = useState(null);
  const fileRef = useRef();

  // ── Share encode / decode (URL hash, no server needed) ──────────────────────
  function encodeShare(data) {
    try {
      const json = JSON.stringify(data);
      const bytes = new TextEncoder().encode(json);
      const binStr = Array.from(bytes, b => String.fromCharCode(b)).join('');
      return btoa(binStr).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    } catch { return null; }
  }
  function decodeShare(b64) {
    try {
      const padded = b64.replace(/-/g,'+').replace(/_/g,'/');
      const binStr = atob(padded);
      const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }

  // ── Saved evals helpers ─────────────────────────────────────────────────────
  function loadFromStorage() {
    try { return JSON.parse(localStorage.getItem('seasonality_saves') || '[]'); }
    catch { return []; }
  }
  function persistEvals(list) {
    localStorage.setItem('seasonality_saves', JSON.stringify(list));
    setSavedEvals(list);
  }

  // Load saved list + check URL hash for shared eval on mount
  useEffect(() => {
    setSavedEvals(loadFromStorage());
    const hash = window.location.hash;
    if (hash.startsWith('#share=')) {
      const data = decodeShare(hash.slice(7));
      if (data?.analytics) {
        setAnalytics(data.analytics);
        setFiles(data.fileNames?.map(n => ({ fileName: n })) || []);
        if (data.analytics.unitKeys?.[0]) setUnit(data.analytics.unitKeys[0]);
        setTab('summary');
        // Clean hash from URL without reload
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveEvaluation() {
    if (!analytics) return;
    const name = saveName.trim() || `Evaluation ${new Date().toLocaleDateString()}`;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = {
      id, name,
      savedAt: new Date().toISOString(),
      analytics,
      fileNames: files.map(f => f.fileName),
      unitKeys: analytics.unitKeys,
      fileYear: analytics.fileYear,
    };
    persistEvals([entry, ...loadFromStorage()].slice(0, 20));
    setSaveModal(false);
    setSaveName('');
  }

  function loadEvaluation(entry) {
    setAnalytics(entry.analytics);
    setFiles(entry.fileNames?.map(n => ({ fileName: n })) || []);
    if (entry.analytics.unitKeys?.[0]) setUnit(entry.analytics.unitKeys[0]);
    setTab('summary');
    setErrors([]);
  }

  function deleteEvaluation(id) {
    persistEvals(loadFromStorage().filter(e => e.id !== id));
  }

  function copyShareUrl(entry) {
    const b64 = encodeShare({ analytics: entry.analytics, fileNames: entry.fileNames });
    if (!b64) return;
    const url = window.location.origin + window.location.pathname + '#share=' + b64;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(entry.id);
      setTimeout(() => setShareCopied(null), 2500);
    }).catch(() => {
      // Fallback: prompt
      window.prompt('Copy share link:', url);
    });
  }

  const processFile = useCallback(async file=>{
    return new Promise(res=>{
      const r=new FileReader();
      r.onload=e=>{
        try {
          const wb=XLSX.read(e.target.result,{type:"array"});
          const p=detectAndParse(wb,file.name);
          if(!p) res({error:`${file.name}: unrecognised format — no date column found`});
          else if(p.type==="error") res({error:p.error, details:p.details, fileName:p.fileName});
          else res(p);
        } catch(err){res({error:`${file.name}: ${err.message}`});}
      };
      r.readAsArrayBuffer(file);
    });
  },[]);

  const handleFiles=useCallback(async fileList=>{
    if(!fileList?.length) return;
    setLoading(true); setErrors([]);
    const results=await Promise.all(Array.from(fileList).map(processFile));
    const good=results.filter(r=>!r.error);
    setErrors(results.filter(r=>r.error).map(r=>({error:r.error,details:r.details,fileName:r.fileName})));
    const merged=[...files];
    good.forEach(g=>{ const i=merged.findIndex(m=>m.type===g.type); i>=0?merged[i]=g:merged.push(g); });
    setFiles(merged);
    const a=computeAnalytics(merged);
    if(a){setAnalytics(a); setTab("summary"); setUnit(a.unitKeys?.[0]||"U1");}
    setLoading(false);
  },[files,processFile]);

  const reset=()=>{setFiles([]);setAnalytics(null);setErrors([]);setShowExp(false);};
  const onDrop=e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files);};

  // ── DESIGN TOKENS ──────────────────────────────────────────────────────────
  const F = "system-ui,-apple-system,'Segoe UI',sans-serif";
  const BG    = "#f8f9fc";
  const WHITE = "#ffffff";
  const BORDER = "1px solid #e5e7eb";
  const RADIUS = 12;
  const SHADOW = "0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.04)";

  const TH = {
    padding:"9px 12px", textAlign:"left", color:"#6b7280", fontWeight:600,
    fontSize:11, textTransform:"uppercase", letterSpacing:".06em",
    borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap", background:"#f9fafb",
  };
  const TD = { padding:"9px 12px", borderBottom:"1px solid #f3f4f6", verticalAlign:"middle", fontSize:13 };
  const CARD = {
    background:WHITE, border:BORDER, borderRadius:RADIUS,
    padding:"16px 20px", boxShadow:SHADOW,
  };

  const tabSt = k => ({
    padding:"7px 16px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:F,
    border: activeTab===k ? "1.5px solid #6366f1" : "1px solid #e5e7eb",
    background: activeTab===k ? "#6366f1" : WHITE,
    color: activeTab===k ? "#fff" : "#374151",
    fontWeight: activeTab===k ? 600 : 400,
    transition:"all .15s",
  });
  const activeTab = tab;

  const unitSt = k => ({
    padding:"6px 14px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:F,
    border: unit===k ? `1.5px solid ${getUnitColor(k, DKEYS)}` : "1px solid #e5e7eb",
    background: activeUnit===k ? getUnitColor(k, DKEYS)+"18" : WHITE,
    color: activeUnit===k ? getUnitColor(k, DKEYS) : "#6b7280",
    fontWeight: activeUnit===k ? 600 : 400,
    transition:"all .15s",
  });

  const MONO = "'SF Mono','Fira Code',monospace";
  const pos = "#15803d", neg = "#dc2626", neu = "#6b7280";

  // ── DROP ZONE ──────────────────────────────────────────────────────────────
  if(!analytics) return (
    <div style={{minHeight:"100vh",background:BG,fontFamily:F,padding:"48px 24px"}}>

      {/* Header */}
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:11,letterSpacing:".15em",color:"#9ca3af",textTransform:"uppercase",
          marginBottom:12,fontWeight:600}}>Rental Analytics Engine</div>
        <div style={{fontSize:30,fontWeight:700,color:"#111827",letterSpacing:"-.03em",lineHeight:1.2,
          marginBottom:10}}>Drop your KPI report.</div>
        <div style={{fontSize:14,color:"#6b7280",lineHeight:1.7}}>
          Any number of units · columns in any order · months in any order
        </div>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",display:"flex",flexDirection:"column",gap:20}}>

        {/* Drop target */}
        <div onDrop={onDrop} onDragOver={e=>{e.preventDefault();setDrag(true);}}
          onDragLeave={()=>setDrag(false)} onClick={()=>fileRef.current.click()}
          style={{cursor:"pointer",borderRadius:16,padding:"40px 32px",textAlign:"center",
            transition:"all .2s",border:`2px dashed ${drag?"#6366f1":"#d1d5db"}`,
            background:drag?"#eef2ff":WHITE,boxShadow:drag?"0 0 0 4px #e0e7ff":SHADOW}}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple
            style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
          {loading
            ?<div style={{color:"#6366f1",fontSize:14,fontWeight:500}}>Computing analytics…</div>
            :<>
              <div style={{fontSize:36,marginBottom:10}}>📂</div>
              <div style={{fontSize:16,fontWeight:600,color:"#111827",marginBottom:4}}>
                Drop file here or click to browse
              </div>
              <div style={{fontSize:13,color:"#9ca3af"}}>Accepts .xlsx · .xls</div>
            </>}
        </div>

        {/* ── Saved Evaluations ── */}
        {savedEvals.length > 0 && (
          <div style={{background:WHITE,border:"1px solid #e5e7eb",borderRadius:14,
            boxShadow:"0 1px 3px rgba(0,0,0,.06)",overflow:"hidden"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid #f3f4f6",
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>Saved Evaluations</div>
              <div style={{fontSize:11,color:"#9ca3af"}}>{savedEvals.length} saved</div>
            </div>
            <div style={{display:"flex",flexDirection:"column"}}>
              {savedEvals.map((ev, idx) => (
                <div key={ev.id} style={{padding:"12px 20px",display:"flex",alignItems:"center",
                  gap:12,borderBottom:idx<savedEvals.length-1?"1px solid #f9fafb":undefined,
                  background:idx%2===0?WHITE:"#fafafa"}}>
                  <div style={{fontSize:18,flexShrink:0}}>📊</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#111827",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.name}</div>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:2,display:"flex",gap:10,flexWrap:"wrap"}}>
                      {ev.fileYear && <span>📅 {ev.fileYear}</span>}
                      {ev.unitKeys?.length > 0 && <span>{ev.unitKeys.length} unit{ev.unitKeys.length>1?"s":""}</span>}
                      {ev.savedAt && <span>Saved {new Date(ev.savedAt).toLocaleDateString()}</span>}
                      {ev.fileNames?.length > 0 && <span style={{color:"#c4b5fd"}}>{ev.fileNames.join(', ')}</span>}
                    </div>
                  </div>
                  <button onClick={() => loadEvaluation(ev)}
                    style={{padding:"6px 14px",borderRadius:8,border:"1.5px solid #6366f1",
                      background:"#eef2ff",color:"#6366f1",fontSize:12,fontWeight:600,
                      cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                    Load ↗
                  </button>
                  <button onClick={() => copyShareUrl(ev)}
                    style={{padding:"6px 14px",borderRadius:8,
                      border:`1.5px solid ${shareCopied===ev.id?"#059669":"#e5e7eb"}`,
                      background:shareCopied===ev.id?"#f0fdf4":"#f9fafb",
                      color:shareCopied===ev.id?"#059669":"#6b7280",
                      fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                    {shareCopied===ev.id?"✓ Copied!":"🔗 Share"}
                  </button>
                  <button onClick={() => deleteEvaluation(ev.id)}
                    style={{padding:"6px 10px",borderRadius:8,border:"1px solid #fee2e2",
                      background:"#fff5f5",color:"#dc2626",fontSize:12,cursor:"pointer",flexShrink:0}}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {errors.map((e,i)=>(
          <div key={i} style={{fontSize:12,color:"#dc2626",padding:"12px 16px",
            background:"#fef2f2",borderRadius:10,border:"1px solid #fecaca",lineHeight:1.8}}>
            <strong>⚠ {typeof e==="object"?e.error:e}</strong>
            {typeof e==="object"&&e.details&&(
              <ul style={{margin:"6px 0 0 16px",fontSize:11,color:"#b91c1c"}}>
                {e.details.map((d,di)=><li key={di}>{d}</li>)}
              </ul>
            )}
          </div>
        ))}

        {/* Requirements */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

          {/* KPIs */}
          <div style={{background:WHITE,border:"1px solid #e5e7eb",borderRadius:14,
            boxShadow:SHADOW,overflow:"hidden"}}>
            <div style={{background:"#4338ca",padding:"16px 22px"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:3}}>
                Required KPIs
              </div>
              <div style={{fontSize:12,color:"#c7d2fe",lineHeight:1.6}}>
                All columns must be present. One column per unit per metric.
                Any number of units supported.
              </div>
            </div>
            <div style={{padding:"20px 22px"}}>
              {[
                {
                  kpi:"Rental ADR",
                  col:"Rental ADR",
                  desc:"Your actual nightly rate charged per unit per month.",
                  why:"Base for seasonal multiplier and target ADR calculation."
                },
                {
                  kpi:"Market ADR",
                  col:"Market ADR",
                  desc:"Comp set average nightly rate for each unit's market segment.",
                  why:"Used to compute market premium ratio and market multiplier."
                },
                {
                  kpi:"Market Occupancy %",
                  col:"Market Occupancy %",
                  desc:"Market segment occupancy as a percentage value (e.g. 51.2, not 0.512).",
                  why:"Combined with Market ADR to derive Market RevPAR."
                },
                {
                  kpi:"RevPAR Index",
                  col:"RevPAR Index",
                  desc:"Your RevPAR divided by market RevPAR x 100. Above 100 = outperforming.",
                  why:"Used to derive Rental RevPAR."
                },
                {
                  kpi:"Rental RevPAR",
                  col:"Rental RevPAR",
                  desc:"Your RevPAR per available night.",
                  why:"Used directly for deviation and gap calculations — more accurate than derived value."
                },
                {
                  kpi:"Market RevPAR",
                  col:"Market RevPAR",
                  desc:"Market RevPAR per available night.",
                  why:"Used directly for market deviation and gap calculations."
                },
                {
                  kpi:"Occupancy %",
                  col:"Occupancy %",
                  desc:"Your rental occupancy percentage per unit per month.",
                  why:"Enables accurate revenue impact estimates in the Action Plan."
                },
                {
                  kpi:"Market Penetration Index %",
                  col:"Market Penetration Index %",
                  desc:"Your occupancy divided by market occupancy x 100.",
                  why:"Displayed in the Indexes tab as the occupancy competitiveness metric."
                },
                {
                  kpi:"ADR Index",
                  col:"ADR Index",
                  desc:"Your ADR divided by market ADR x 100.",
                  why:"Displayed in the Indexes tab as the rate competitiveness metric."
                },
              ].map(({kpi,col,desc,why})=>(
                <div key={kpi} style={{marginBottom:16,paddingBottom:16,
                  borderBottom:"1px solid #f3f4f6"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:"#4338ca",
                      display:"inline-block",flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:700,color:"#111827"}}>{kpi}</span>
                  </div>
                  <div style={{paddingLeft:16}}>
                    <div style={{fontSize:12,color:"#374151",marginBottom:3,lineHeight:1.5}}>
                      {desc}
                    </div>
                    <div style={{fontSize:11,color:"#9ca3af",marginBottom:5,lineHeight:1.5}}>
                      <em>Used for: </em>{why}
                    </div>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,
                      background:"#f1f5f9",color:"#475569",fontFamily:"monospace"}}>
                      Column header must contain: "{col}"
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Format rules + what gets computed */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Format rules */}
            <div style={{background:WHITE,border:"1px solid #e5e7eb",borderRadius:14,
              boxShadow:SHADOW,padding:"18px 22px"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#111827",marginBottom:14}}>
                File format rules
              </div>
              {[
                {
                  icon:"📅",
                  title:"Month column",
                  desc:'First column should contain month values — any format works. Examples: "2025-03 (Mar)", "Mar-25", "March 2025". Months can be in any order.'
                },
                {
                  icon:"🏠",
                  title:"Unit identification",
                  desc:'Column headers must include a unit identifier in the format "Unit N -- Name". Example: "Rental ADR (Unit 1 -- Private Garden)". Any number of units supported.'
                },
                {
                  icon:"📊",
                  title:"One row per month",
                  desc:"Each row represents one month. Typically 12 rows (full year). Partial years work — averages and deviations are computed from whatever months are present."
                },
                {
                  icon:"🔢",
                  title:"Market Occupancy values",
                  desc:"Must be stored as a percentage number, not a decimal. Use 51.2 not 0.512. The engine detects this automatically and divides by 100 before calculating."
                },
              ].map(({icon,title,desc})=>(
                <div key={title} style={{display:"flex",gap:12,marginBottom:14,
                  paddingBottom:14,borderBottom:"1px solid #f3f4f6"}}>
                  <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{icon}</span>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:3}}>{title}</div>
                    <div style={{fontSize:11,color:"#6b7280",lineHeight:1.6}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* What gets calculated */}
            <div style={{background:WHITE,border:"1px solid #e5e7eb",borderRadius:14,
              boxShadow:SHADOW,padding:"18px 22px"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#111827",marginBottom:14}}>
                What the engine calculates
              </div>
              {[
                ["Rental RevPAR","(RevPAR Index / 100) x Market RevPAR"],
                ["Market RevPAR","Market ADR x Market Occ%"],
                ["Annual averages","Mean of all non-zero months per unit"],
                ["Deviation %","(Monthly - Avg) / Avg x 100"],
                ["Dev Gap","Rental Dev% - Market Dev%"],
                ["Seasonal multiplier","Monthly RevPAR / Annual avg RevPAR"],
                ["Target ADR","Current ADR x (target mult / current mult)"],
                ["Revenue impact","Delta ADR x estimated occupied nights"],
              ].map(([metric,formula])=>(
                <div key={metric} style={{display:"flex",gap:8,marginBottom:7,
                  paddingBottom:7,borderBottom:"1px solid #f9fafb"}}>
                  <span style={{fontSize:11,fontWeight:600,color:"#374151",
                    minWidth:130,flexShrink:0}}>{metric}</span>
                  <span style={{fontSize:11,color:"#9ca3af",fontFamily:"monospace",lineHeight:1.5}}>
                    = {formula}
                  </span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* ── Save Evaluation Modal ── */}
      {saveModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:200,
          display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}
          onClick={e=>{ if(e.target===e.currentTarget) setSaveModal(false); }}>
          <div style={{background:"#fff",borderRadius:16,padding:"28px",width:"100%",maxWidth:400,
            boxShadow:"0 20px 60px rgba(0,0,0,.2)",fontFamily:F}}>
            <div style={{fontSize:16,fontWeight:700,color:"#111827",marginBottom:4}}>
              💾 Save Evaluation
            </div>
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:18,lineHeight:1.6}}>
              Give this evaluation a name to find it later. Saved evaluations are stored in your browser and can be shared via link.
            </div>
            <input
              value={saveName}
              onChange={e=>setSaveName(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") saveEvaluation(); if(e.key==="Escape") setSaveModal(false); }}
              placeholder={`e.g. ${analytics?.fileYear || ''} Portfolio Review`}
              autoFocus
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #d1d5db",
                fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:F,
                transition:"border .15s"}}
              onFocus={e=>{ e.target.style.borderColor="#6366f1"; }}
              onBlur={e=>{ e.target.style.borderColor="#d1d5db"; }}
            />
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button onClick={()=>setSaveModal(false)}
                style={{padding:"8px 18px",borderRadius:8,border:"1px solid #e5e7eb",
                  background:"#f9fafb",color:"#6b7280",fontSize:12,cursor:"pointer",fontFamily:F}}>
                Cancel
              </button>
              <button onClick={saveEvaluation}
                style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#6366f1",
                  color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:F}}>
                Save evaluation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  const {months, displayLabels, unitKeys:UKEYS, units, evalContext, fileYear}=analytics;
  const DLABELS = displayLabels||months;
  // Chart labels: short month abbrev, show year suffix on Jan or year-boundary
  const CLABELS = months.map((m,i)=>{
    const dl = DLABELS[i]||m;
    const yr  = (dl.match(/\d{4}/)||[])[0];
    const prevYr = i>0 ? ((DLABELS[i-1]||months[i-1]).match(/\d{4}/)||[])[0] : null;
    return (i===0 || m==="Jan" || yr!==prevYr) && yr ? m+"'"+yr.slice(2) : m;
  });
  const DKEYS = UKEYS||UNIT_KEYS;
  const activeUnit = (unit && units[unit]) ? unit : DKEYS[0];
  const u = units[activeUnit] || {};
  if(unit !== activeUnit) setTimeout(()=>setUnit(activeUnit),0);



  const TABS=[
    ["summary","Summary"],["deviations","Deviations"],
    ["heatmap","GAP Heatmap"],["opportunities","Opportunities"],
    ["multipliers","Multipliers"],["indexes","Indexes"],
    ["actions","Action Plan"],
  ];

  return (
    <div style={{minHeight:"100vh",background:BG,fontFamily:F,color:"#111827"}}>

      {/* ── TOP BAR ── */}
      <div style={{background:WHITE,borderBottom:BORDER,padding:"14px 24px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,letterSpacing:"-.02em",color:"#111827"}}>
              Portfolio Analytics
            </div>
            <div style={{fontSize:11,color:"#9ca3af",marginTop:1}}>
              {files.map(f=>f.fileName).join(" + ")}
            </div>
          </div>
          {fileYear && (()=>{
            const cy = new Date().getFullYear();
            const cm = new Date().getMonth(); // 0-indexed, = complete months this year
            const isPast   = fileYear < cy;
            const isFuture = fileYear > cy;
            const bg     = isPast?"#f0fdf4":isFuture?"#fef3c7":"#eef2ff";
            const col    = isPast?"#15803d":isFuture?"#92400e":"#4338ca";
            const border = isPast?"#bbf7d0":isFuture?"#fde68a":"#c7d2fe";
            const icon   = isPast?"📅":isFuture?"🔭":"📊";
            const sub    = isPast?"Past year — all months complete"
              :isFuture?"Forward planning — LY data for all months"
              :cm+" of 12 months complete as of today";
            return (
              <div style={{padding:"6px 14px",borderRadius:10,border:"1px solid "+border,
                background:bg,lineHeight:1.5}}>
                <div style={{fontSize:13,fontWeight:700,color:col}}>{icon} Evaluating {fileYear}</div>
                <div style={{fontSize:10,color:col,opacity:.8}}>{sub}</div>
              </div>
            );
          })()}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>setShowExp(v=>!v)}
            style={{padding:"7px 16px",borderRadius:8,border:"1.5px solid #6366f1",
              background:showExp?"#6366f1":WHITE,color:showExp?WHITE:"#6366f1",
              fontSize:12,cursor:"pointer",fontFamily:F,fontWeight:600}}>
            {showExp?"✕ Close export":"⬇ Export"}
          </button>
          <button onClick={()=>{ setSaveName(files.map(f=>f.fileName).filter(Boolean).join(', ') || ''); setSaveModal(true); }}
            style={{padding:"7px 16px",borderRadius:8,border:"1.5px solid #059669",
              background:"#f0fdf4",color:"#059669",
              fontSize:12,cursor:"pointer",fontFamily:F,fontWeight:600}}>
            💾 Save
          </button>
          <button onClick={()=>fileRef.current.click()}
            style={{padding:"7px 14px",borderRadius:8,border:BORDER,
              background:WHITE,color:"#374151",fontSize:12,cursor:"pointer",fontFamily:F}}>
            + Add file
          </button>
          <button onClick={reset}
            style={{padding:"7px 14px",borderRadius:8,border:BORDER,
              background:WHITE,color:"#374151",fontSize:12,cursor:"pointer",fontFamily:F}}>
            Reset
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple
            style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
        </div>
      </div>

      <div style={{padding:"24px"}}>
        {/* ── UNIT SELECTOR ── */}
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {DKEYS.map(k=>(
            <button key={k} style={unitSt(k)} onClick={()=>setUnit(k)}>
              <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",
                background:getUnitColor(k, DKEYS),marginRight:6,verticalAlign:"middle"}}/>
              {k} — {units[k]?.label||k}
            </button>
          ))}
        </div>

        {/* ── SUMMARY CARDS ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",
          gap:12,marginBottom:24}}>
          {[
            {lbl:"Base ADR",        val:u.baseRentalADR?"$"+u.baseRentalADR.toFixed(0):"—", sub:"Annual avg"},
            {lbl:"Market premium",  val:u.premiumRatio?u.premiumRatio+"×":"—",              sub:"vs market"},
            {lbl:"Months to adjust",val:`${u.monthsToAdjust} of ${months.length}`,           sub:"pricing action needed"},
            {lbl:"Cumulative Δ ADR",val:(u.totalDeltaADR>=0?"+":"-")+"$"+Math.abs(u.totalDeltaADR).toFixed(0),
             color:u.totalDeltaADR>=0?pos:neg, sub:"target vs current"},
          ].map((c,i)=>(
            <div key={i} style={CARD}>
              <div style={{fontSize:11,color:"#9ca3af",fontWeight:600,
                textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>{c.lbl}</div>
              <div style={{fontSize:22,fontWeight:700,color:c.color||"#111827",
                letterSpacing:"-.02em"}}>{c.val}</div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:3}}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── TAB NAV ── */}
        <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
          {TABS.map(([k,l])=>(
            <button key={k} style={tabSt(k)} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ════ SUMMARY ════ */}
        {tab==="summary" && (
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {/* Validation */}
            {DKEYS.some(uk=>units[uk]?.validationFlags?.some(f=>f))
              ?<div style={{padding:"10px 16px",background:"#fef2f2",border:"1px solid #fecaca",
                  borderRadius:10,fontSize:12,color:"#dc2626"}}>
                ⚠ Validation: some months show rental RevPAR below market — check anomaly months
               </div>
              :<div style={{padding:"10px 16px",background:"#f0fdf4",border:"1px solid #bbf7d0",
                  borderRadius:10,fontSize:12,color:"#15803d"}}>
                ✓ Validation passed — rental RevPAR exceeds market RevPAR in all revenue months
               </div>
            }

            {/* Portfolio table */}
            <div style={CARD}>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:14}}>
                Portfolio overview — all units
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:"#f9fafb"}}>
                      {["Unit","Base ADR","Mkt ADR","Premium","Avg RevPAR","Avg Mkt RevPAR",
                        "RevPAR vs Mkt","Months Adj","Cum Δ ADR"].map(h=>(
                        <th key={h} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DKEYS.map(uk=>{
                      const d=units[uk];
                      const rV=d.rRevPAR.filter(v=>v&&v>0),mV=d.mRevPAR.filter(v=>v);
                      const aR=rV.length?rV.reduce((a,b)=>a+b)/rV.length:null;
                      const aM=mV.length?mV.reduce((a,b)=>a+b)/mV.length:null;
                      const pct=aR&&aM?((aR/aM-1)*100).toFixed(0):null;
                      return (
                        <tr key={uk} style={{background:unit===uk?"#f5f3ff":"transparent",
                          cursor:"pointer"}} onClick={()=>setUnit(uk)}>
                          <td style={{...TD,fontWeight:600}}>
                            <span style={{display:"inline-block",width:9,height:9,borderRadius:"50%",
                              background:getUnitColor(uk, DKEYS),marginRight:8,verticalAlign:"middle"}}/>
                            {uk} {units[uk]?.label||uk}
                          </td>
                          <td style={{...TD,fontFamily:MONO}}>{d.baseRentalADR?"$"+d.baseRentalADR.toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:neu}}>{d.baseMarketADR?"$"+d.baseMarketADR.toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:"#6366f1",fontWeight:600}}>{d.premiumRatio?d.premiumRatio+"×":"—"}</td>
                          <td style={{...TD,fontFamily:MONO}}>{aR?"$"+aR.toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:neu}}>{aM?"$"+aM.toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,fontWeight:600,color:pct>=0?pos:neg}}>
                            {pct!==null?(pct>=0?"+":"")+pct+"%":"—"}
                          </td>
                          <td style={{...TD,fontWeight:600,color:d.monthsToAdjust>6?neg:d.monthsToAdjust>3?"#d97706":pos}}>
                            {d.monthsToAdjust}/{months.length}
                          </td>
                          <td style={{...TD,fontFamily:MONO,fontWeight:600,
                            color:d.totalDeltaADR>=0?pos:neg}}>
                            {(d.totalDeltaADR>=0?"+":"-")+"$"+Math.abs(d.totalDeltaADR).toFixed(0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={CARD}>
                <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:10}}>
                  RevPAR — {unit}
                </div>
                <LineChart labels={CLABELS} height={170} datasets={[
                  {label:"Rental",color:getUnitColor(activeUnit, DKEYS),data:u.rRevPAR.map(v=>v?+v.toFixed(0):null)},
                  {label:"Market",color:"#d1d5db",dash:[4,4],data:u.mRevPAR.map(v=>v?+v.toFixed(0):null)},
                ]}/>
                <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#9ca3af"}}>
                  <span><span style={{display:"inline-block",width:16,height:2,background:getUnitColor(activeUnit, DKEYS),verticalAlign:"middle",marginRight:4}}/> Rental</span>
                  <span><span style={{display:"inline-block",width:16,height:2,background:"#d1d5db",verticalAlign:"middle",marginRight:4}}/> Market</span>
                </div>
              </div>
              <div style={CARD}>
                <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:10}}>
                  Dev Gap by month — all units
                </div>
                <BarChart labels={CLABELS} height={170} datasets={
                  DKEYS.map(k=>({label:k,color:getUnitColor(k, DKEYS)||(Object.values(UNIT_COLORS)[Object.keys(UNIT_COLORS).indexOf(k)%4])||"#6366f1",data:units[k].devGap}))
                }/>
                <div style={{display:"flex",gap:12,marginTop:8,fontSize:11,color:"#9ca3af",flexWrap:"wrap"}}>
                  {DKEYS.map(k=>(
                    <span key={k}><span style={{display:"inline-block",width:10,height:10,
                      borderRadius:3,background:getUnitColor(k, DKEYS),verticalAlign:"middle",marginRight:4}}/>{k}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ DEVIATIONS ════ */}
        {tab==="deviations" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={CARD}>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:10,lineHeight:1.8}}>
                <strong style={{color:"#374151"}}>Calculation:</strong> Market RevPAR = Mkt ADR × Mkt Occ% → Rental RevPAR = (RevPAR Index ÷ 100) × Mkt RevPAR → Dev% = (monthly - avg) ÷ avg × 100 → Gap = Rental Dev% - Market Dev%
              </div>
              <LineChart labels={CLABELS} height={170} datasets={[
                {label:"Rental Dev%",color:getUnitColor(activeUnit, DKEYS),data:u.rDev},
                {label:"Market Dev%",color:"#d1d5db",dash:[4,4],data:u.mDev},
                {label:"Gap",color:"#f87171",dash:[2,3],data:u.devGap},
              ]}/>
              <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#9ca3af"}}>
                <span style={{color:getUnitColor(activeUnit, DKEYS)}}>— Rental Dev%</span>
                <span style={{color:"#9ca3af"}}>-- Market Dev%</span>
                <span style={{color:"#f87171"}}>-- Gap</span>
              </div>
            </div>
            <div style={CARD}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#f9fafb"}}>{
                    ["Month","Rental RevPAR","Mkt RevPAR","Rental Dev%","Market Dev%","Dev Gap","Classification","Action"].map(h=><th key={h} style={TH}>{h}</th>)
                  }</tr></thead>
                  <tbody>
                    {months.map((m,i)=>{
                      const g=u.devGap[i],cls=u.gapCls[i];
                      return (
                        <tr key={m} style={{background:i%2===0?WHITE:"#fafafa"}}>
                          <td style={{...TD,fontWeight:600}}>{m}</td>
                          <td style={{...TD,fontFamily:MONO}}>
                            {u.rRevPAR[i]?"$"+u.rRevPAR[i].toFixed(0):<span style={{color:"#9ca3af"}}>anomaly</span>}
                          </td>
                          <td style={{...TD,fontFamily:MONO,color:neu}}>{u.mRevPAR[i]?"$"+u.mRevPAR[i].toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,fontWeight:600,color:u.rDev[i]===null?neu:u.rDev[i]>=0?pos:neg}}>
                            {u.rDev[i]!==null?fS(u.rDev[i])+"%":"—"}
                          </td>
                          <td style={{...TD,fontFamily:MONO,color:neu}}>{u.mDev[i]!==null?fS(u.mDev[i])+"%":"—"}</td>
                          <td style={{...TD,fontFamily:MONO,fontWeight:700,color:g===null?neu:g>=0?pos:neg}}>
                            {g!==null?(g>=0?"+":"")+g.toFixed(1):"—"}
                          </td>
                          <td style={TD}><Pill cls={cls}/></td>
                          <td style={{...TD,fontSize:12,color:"#6b7280"}}>{cls.action}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#f9fafb",borderTop:"2px solid #e5e7eb"}}>
                      <td style={{...TD,fontWeight:600,color:"#374151"}}>Annual avg</td>
                      <td style={{...TD,fontFamily:MONO,fontWeight:600}}>{u.rAvg?"$"+u.rAvg.toFixed(0):"—"}</td>
                      <td style={{...TD,fontFamily:MONO,color:neu}}>{u.mAvg?"$"+u.mAvg.toFixed(0):"—"}</td>
                      <td colSpan={5} style={{...TD,fontSize:11,color:"#9ca3af"}}>Deviations computed relative to these annual averages</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ HEATMAP ════ */}
        {tab==="heatmap" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[["r",-20],["o",-5],["b",5],["g",15],["p",25]].map(([k,g])=>{
                const cls=classifyGap(g); const hc=HEAT_COLORS[k];
                return <span key={k} style={{fontSize:11,fontWeight:600,padding:"4px 12px",
                  borderRadius:20,background:hc.bg,color:hc.text}}>{cls.label}</span>;
              })}
            </div>
            <div style={CARD}>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",minWidth:560,width:"100%"}}>
                  <thead><tr style={{background:"#f9fafb"}}>
                    <th style={{...TH,minWidth:120}}>Unit</th>
                    {months.map(m=><th key={m} style={{...TH,textAlign:"center",minWidth:54}}>{m}</th>)}
                  </tr></thead>
                  <tbody>
                    {DKEYS.map(uk=>{
                      const d=units[uk];
                      return (
                        <tr key={uk}>
                          <td style={{...TD,fontWeight:600}}>
                            <span style={{display:"inline-block",width:9,height:9,borderRadius:"50%",
                              background:getUnitColor(uk, DKEYS),marginRight:8,verticalAlign:"middle"}}/>
                            {uk}
                          </td>
                          {months.map((m,i)=>{
                            const g=d.devGap[i],cls=d.gapCls[i];
                            const hc=HEAT_COLORS[cls.key];
                            const isHov=hoverCell?.u===uk&&hoverCell?.i===i;
                            return (
                              <td key={m}
                                onMouseEnter={()=>setHoverCell({u:uk,i,m,g,cls,rd:d.rDev[i],md:d.mDev[i]})}
                                onMouseLeave={()=>setHoverCell(null)}
                                style={{textAlign:"center",fontFamily:MONO,fontWeight:700,
                                  fontSize:12,cursor:"default",minWidth:54,padding:"8px 4px",
                                  borderBottom:"1px solid #f3f4f6",
                                  background:isHov?"#f0f0ff":hc.bg,color:hc.text,
                                  border:isHov?"2px solid #6366f1":"1px solid #f3f4f6",
                                  transition:"all .1s",borderRadius:isHov?4:0}}>
                                {g!==null?(g>=0?"+":"")+g.toFixed(1):"—"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {hoverCell && (
              <div style={{...CARD,border:`1.5px solid ${hoverCell.cls.col}88`,fontSize:13,lineHeight:1.9}}>
                <strong style={{color:getUnitColor(hoverCell.u, DKEYS)}}>{hoverCell.u} — {units[hoverCell.u]?.label||hoverCell.u}</strong>
                &nbsp;·&nbsp; <strong>{hoverCell.m}</strong> &nbsp;&nbsp;<Pill cls={hoverCell.cls}/>
                <br/>
                <span style={{color:"#6b7280"}}>Dev Gap: </span>
                <strong style={{color:hoverCell.g>=0?pos:neg}}>
                  {hoverCell.g!==null?(hoverCell.g>=0?"+":"")+hoverCell.g.toFixed(1)+"pts":"—"}
                </strong>
                &nbsp;&nbsp;
                <span style={{color:"#6b7280"}}>Rental Dev: </span><strong>{hoverCell.rd!==null?fS(hoverCell.rd)+"%":"—"}</strong>
                &nbsp;&nbsp;
                <span style={{color:"#6b7280"}}>Market Dev: </span><strong>{hoverCell.md!==null?fS(hoverCell.md)+"%":"—"}</strong>
                <br/>
                <span style={{color:"#6b7280"}}>Action: </span>{hoverCell.cls.action}
              </div>
            )}
          </div>
        )}

        {/* ════ OPPORTUNITIES ════ */}
        {tab==="opportunities" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {[
              {key:"r",label:"Seasonal misalign — align multiplier to market",emoji:"🔴"},
              {key:"o",label:"Slight misalign — nudge halfway",emoji:"🟠"},
              {key:"b",label:"Aligned — hold strategy",emoji:"🔵"},
              {key:"g",label:"Outperforming — raise base 5%",emoji:"🟢"},
              {key:"p",label:"Strong outperform — raise base 10%",emoji:"🟣"},
            ].map(({key,label,emoji})=>{
              const rows=[];
              DKEYS.forEach(uk=>{
                units[uk].devGap.forEach((g,i)=>{
                  if(units[uk].gapCls[i].key===key) {
                    const mOcc = units[uk].marketOcc[i] || 0;
                    const rOcc = units[uk].rentalOcc[i];
                    rows.push({uk,m:months[i],g,rd:units[uk].rDev[i],md:units[uk].mDev[i],
                      cls:units[uk].gapCls[i],curADR:units[uk].rentalADR[i],
                      tADR:units[uk].targetADR[i],dADR:units[uk].deltaADR[i],
                      revNeutral:units[uk].revNeutral[i],
                      revOptimistic:units[uk].revOptimistic[i],
                      days:units[uk].monthDays[i] || 30,
                      mOccPct:Math.round(mOcc),
                      rOccPct:rOcc!==null&&rOcc>0 ? Math.round(rOcc) : Math.round(mOcc),
                    });
                  }
                });
              });
              if(!rows.length) return null;
              const hc=HEAT_COLORS[key];
              return (
                <div key={key} style={CARD}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <span style={{fontSize:14}}>{emoji}</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#374151"}}>{label}</span>
                    <span style={{fontSize:11,color:"#9ca3af",marginLeft:4}}>({rows.length} month-units)</span>
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr style={{background:"#f9fafb"}}>{
                        ["Unit","Month","Dev Gap","Direction","Curr ADR","Target ADR","Mult change","Rev impact (neutral)","Rev impact (optimistic)"].map(h=>(
                          <th key={h} style={TH}>{h}</th>))
                      }</tr></thead>
                      <tbody>
                        {rows.map((r,i)=>(
                          <tr key={i} style={{background:i%2===0?WHITE:"#fafafa"}}>
                            <td style={{...TD,fontWeight:600}}>
                              <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",
                                background:getUnitColor(r.uk, DKEYS),marginRight:6,verticalAlign:"middle"}}/>
                              {r.uk}
                            </td>
                            <td style={{...TD,fontWeight:500}}>{r.m}</td>
                            <td style={{...TD,fontFamily:MONO,fontWeight:700,color:r.g>=0?pos:neg}}>
                              {r.g!==null?(r.g>=0?"+":"")+r.g.toFixed(1):"—"}
                            </td>
                            <td style={{...TD,fontFamily:MONO,color:r.rd>=0?pos:neg}}>{r.rd!==null?fS(r.rd)+"%":"—"}</td>
                            <td style={{...TD,fontFamily:MONO,color:neu}}>{r.md!==null?fS(r.md)+"%":"—"}</td>
                            <td style={{...TD,fontFamily:MONO}}>{r.curADR>0?"$"+r.curADR.toFixed(0):"—"}</td>
                            <td style={{...TD,fontFamily:MONO,fontWeight:600}}>{r.tADR?"$"+r.tADR.toFixed(0):"—"}</td>
                            <td style={{...TD,fontFamily:MONO,fontWeight:700,color:r.dADR>=0?pos:neg}}>
                              {r.dADR!==null?(r.dADR>=0?"+":"-")+"$"+Math.abs(r.dADR).toFixed(0):"—"}
                            </td>
                            <td style={{...TD,fontFamily:MONO,fontSize:11}}>
                              <div style={{color:typeof r.revNeutral==="number"?(r.revNeutral>=0?pos:neg):neu,fontWeight:600}}>
                                {typeof r.revNeutral==="number"?(r.revNeutral>=0?"+":"-")+"$"+Math.abs(r.revNeutral):"—"}
                              </div>
                              <div style={{color:"#9ca3af",fontSize:10}}>{r.mOccPct}% mkt occ × {r.days}d</div>
                            </td>
                            <td style={{...TD,fontFamily:MONO,fontSize:11}}>
                              <div style={{color:typeof r.revOptimistic==="number"?(r.revOptimistic>=0?pos:neg):neu,fontWeight:600}}>
                                {typeof r.revOptimistic==="number"?(r.revOptimistic>=0?"+":"-")+"$"+Math.abs(r.revOptimistic):"—"}
                              </div>
                              <div style={{color:"#9ca3af",fontSize:10}}>{r.rOccPct}% rental occ × {r.days}d</div>
                            </td>

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

        {/* ════ MULTIPLIERS ════ */}
        {tab==="multipliers" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={CARD}>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:10,lineHeight:1.8}}>
                <strong style={{color:"#374151"}}>Multiplier</strong> = Monthly RevPAR ÷ Annual avg RevPAR
                (rental avg: {u.rAvg?"$"+u.rAvg.toFixed(0):"—"} · market avg: {u.mAvg?"$"+u.mAvg.toFixed(0):"—"}).
                RevPAR captures both rate and occupancy — a truer signal of seasonal demand strength than ADR alone.
                Target multiplier reshapes your seasonal curve to track market rhythm while preserving your {u.premiumRatio}× revenue premium.
                Marker = 1.0× (annual avg).
              </div>
              <LineChart labels={CLABELS} height={170} datasets={[
                {label:"Current",color:getUnitColor(activeUnit, DKEYS),data:u.rentalMult},
                {label:"Market", color:"#9ca3af",dash:[4,4],data:u.marketMult},
                {label:"Target", color:"#22c55e",data:u.targetMult},
              ]}/>
              <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#9ca3af"}}>
                <span style={{color:getUnitColor(activeUnit, DKEYS)}}>— Current</span>
                <span>-- Market</span>
                <span style={{color:"#22c55e"}}>— Target</span>
              </div>
            </div>
            <div style={CARD}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#f9fafb"}}>{
                    ["Month","Dev Gap","Curr ADR","Curr Mult (RevPAR)","Mkt Mult (RevPAR)","Target Mult","Target ADR","Δ ADR","Action"].map(h=>(
                      <th key={h} style={TH}>{h}</th>))
                  }</tr></thead>
                  <tbody>
                    {months.map((m,i)=>{
                      const g=u.devGap[i],cls=u.gapCls[i],delta=u.deltaADR[i];
                      return (
                        <tr key={m} style={{background:i%2===0?WHITE:"#fafafa"}}>
                          <td style={{...TD,fontWeight:600,fontSize:12}}>{DLABELS[i]||m}</td>
                          <td style={TD}>
                            {g!==null?<span style={{fontFamily:MONO,fontWeight:700,color:cls.col}}>
                              {(g>=0?"+":"")+g.toFixed(1)}</span>:<span style={{color:neu}}>—</span>}
                          </td>
                          <td style={{...TD,fontFamily:MONO}}>
                            {u.rentalADR[i]>0?"$"+u.rentalADR[i].toFixed(0):<span style={{color:neu}}>anomaly</span>}
                          </td>
                          <td style={{...TD,fontFamily:MONO,color:neu}}>{u.rentalMult[i]!==null?u.rentalMult[i].toFixed(3):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:"#6b7280"}}>{u.marketMult[i]!==null?u.marketMult[i].toFixed(3):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,fontWeight:700,color:"#111827"}}>{u.targetMult[i]!==null?u.targetMult[i].toFixed(3):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:"#374151"}}>{u.targetADR[i]?"$"+u.targetADR[i].toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,fontWeight:700,color:delta!==null?(delta>=0?pos:neg):neu}}>
                            {delta!==null?(delta>=0?"+":"-")+"$"+Math.abs(delta).toFixed(0):"—"}
                          </td>
                          <td style={{...TD,fontSize:12,color:"#6b7280"}}>{cls.action}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#f9fafb",borderTop:"2px solid #e5e7eb"}}>
                      <td colSpan={7} style={{...TD,fontWeight:600,color:"#374151"}}>Cumulative Δ ADR</td>
                      <td style={{...TD,fontFamily:MONO,fontWeight:700,color:u.totalDeltaADR>=0?pos:neg}}>
                        {(u.totalDeltaADR>=0?"+":"-")+"$"+Math.abs(u.totalDeltaADR).toFixed(0)}
                      </td>
                      <td style={TD}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ INDEXES ════ */}
        {tab==="indexes" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={CARD}>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:10,lineHeight:1.8}}>
                <strong style={{color:"#374151"}}>MPI</strong> = your occ ÷ market occ × 100 &nbsp;·&nbsp;
                <strong style={{color:"#374151"}}>ADR Index</strong> = your ADR ÷ market ADR × 100 &nbsp;·&nbsp;
                <strong style={{color:"#374151"}}>RevPAR Index</strong> = your RevPAR ÷ market RevPAR × 100.
                100 = parity. Always shows current-year data — months not yet reported show —.
              </div>
              <LineChart labels={CLABELS} height={160} datasets={
                DKEYS.map(k=>({label:k,color:getUnitColor(k, DKEYS)||(Object.values(UNIT_COLORS)[Object.keys(UNIT_COLORS).indexOf(k)%4])||"#6366f1",data:units[k].revparIdx}))
              }/>
              <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#9ca3af",flexWrap:"wrap"}}>
                {DKEYS.map(k=><span key={k} style={{color:getUnitColor(k, DKEYS)||(Object.values(UNIT_COLORS)[Object.keys(UNIT_COLORS).indexOf(k)%4])||"#6366f1"}}>— {k}</span>)}
              </div>
            </div>
            <div style={CARD}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#f9fafb"}}>{
                    ["Month","MPI","ADR Index","RevPAR Index","Rental ADR","Market ADR","Mkt Occ%","BW Gap"].map(h=>(
                      <th key={h} style={TH}>{h}</th>))
                  }</tr></thead>
                  <tbody>
                    {months.map((m,i)=>{
                      const Idx=({v})=>{
                        if(!v) return <span style={{color:neu}}>—</span>;
                        const above=v>=100;
                        return (
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontFamily:MONO,fontWeight:700,minWidth:36,fontSize:12,
                              color:above?pos:neg}}>{v.toFixed(0)}</span>
                            <div style={{flex:1,height:5,background:"#f3f4f6",borderRadius:3,
                              position:"relative",minWidth:40,overflow:"hidden"}}>
                              <div style={{width:`${Math.min(100,v/350*100)}%`,height:"100%",
                                background:above?"#22c55e":"#ef4444",opacity:.6,borderRadius:3}}/>
                              <div style={{position:"absolute",top:0,left:`${100/350*100}%`,
                                width:1.5,height:"100%",background:"#d1d5db"}}/>
                            </div>
                          </div>
                        );
                      };
                      return (
                        <tr key={m} style={{background:i%2===0?WHITE:"#fafafa"}}>
                          <td style={{...TD,fontWeight:600}}>{m}</td>
                          <td style={{...TD,minWidth:120}}><Idx v={u.MPI[i]}/></td>
                          <td style={{...TD,minWidth:120}}><Idx v={u.adrIdx[i]}/></td>
                          <td style={{...TD,minWidth:120}}><Idx v={u.revparIdx[i]}/></td>
                          <td style={{...TD,fontFamily:MONO}}>{u.rentalADR[i]>0?"$"+u.rentalADR[i].toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:neu}}>{u.marketADR[i]>0?"$"+u.marketADR[i].toFixed(0):"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:neu}}>{u.marketOcc[i]>0?u.marketOcc[i].toFixed(1)+"%":"—"}</td>
                          <td style={{...TD,fontFamily:MONO,color:u.bwGap[i]!==null?(u.bwGap[i]>=0?pos:neg):neu}}>
                            {u.bwGap[i]!==null?fS(u.bwGap[i])+"d":"—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ ACTIONS ════ */}
        {tab==="actions" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{...CARD,borderLeft:"3px solid #6366f1",paddingLeft:18}}>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:4}}>
                How to read this plan
              </div>
              <div style={{fontSize:12,color:"#6b7280",lineHeight:1.8}}>
                Each row is a month × unit combination with a concrete pricing action.
                <strong style={{color:"#374151"}}> Direction</strong> = raise / lower / hold your base seasonal rate.
                <strong style={{color:"#374151"}}> Multiplier change</strong> = how much to shift (target ÷ current).
                <strong style={{color:"#374151"}}> Expected outcome</strong> = what improves: occupancy (if you lower into demand), ADR (if you raise on strength), or stability (hold).
                <strong style={{color:"#374151"}}> Revenue impact</strong> = Δ ADR × estimated occupancy nights (30 days avg).
              </div>
            </div>

            {DKEYS.map(uk=>{
              const d=units[uk];
              const rows=months.map((m,i)=>{
                const g=d.devGap[i], cls=d.gapCls[i];
                const curADR=d.rentalADR[i], tADR=d.targetADR[i], dADR=d.deltaADR[i];
                const curMult=d.rentalMult[i], tMult=d.targetMult[i];
                const multChange=curMult&&tMult?+((tMult/curMult-1)*100).toFixed(1):null;

                // Direction based on tMult vs curMult (what the engine actually recommends)
                // NOT based on gap sign — gap<-10 can mean raise or lower depending on which side market is
                const multDiff = (tMult&&curMult) ? tMult - curMult : null;
                let direction="—", outcome="—", priority=0;
                if(cls.key==="na"){
                  direction="—"; priority=0; outcome="No data";
                } else if(cls.key==="b"){
                  direction="Hold"; priority=0;
                  outcome="Aligned — current seasonal curve matches market rhythm";
                } else if(multDiff===null){
                  direction="—"; priority=0; outcome="Insufficient data";
                } else if(cls.key==="r"){
                  // Seasonal misalign — align to market curve (could be up or down)
                  direction = multDiff>0.02 ? "Raise to market" : multDiff<-0.02 ? "Lower to market" : "Align to market";
                  priority=3;
                  outcome="Seasonal curve out of step with market — adjust multiplier to match market rhythm";
                } else if(cls.key==="o"){
                  direction = multDiff>0 ? "Nudge up" : "Nudge down";
                  priority=2;
                  outcome="Minor misalignment — half-step adjustment toward market multiplier";
                } else if(cls.key==="g"){
                  direction="Raise rate"; priority=2;
                  outcome="Outperforming market — occupancy strong, room to capture more ADR";
                } else if(cls.key==="p"){
                  direction="Raise aggressively"; priority=3;
                  outcome="Strongly outperforming — significant ADR ceiling, test higher base rate";
                }

                // Revenue impact: Δ ADR × occupancy fraction × days in month
                // All values guarded against null/NaN/undefined
                const safeNum = v => (typeof v==="number" && isFinite(v) && !isNaN(v)) ? v : null;
                const mOccRaw   = safeNum(d.marketOcc?.[i]);
                const rOccRaw   = safeNum(d.rentalOcc?.[i]);
                // mOcc stored as % (e.g. 51.2); divide by 100 for fraction
                const mOccFrac  = mOccRaw!==null && mOccRaw>0 ? mOccRaw/100 : 0.45;
                const rOccFrac  = rOccRaw!==null && rOccRaw>0 ? rOccRaw/100 : mOccFrac;
                const days      = safeNum(d.monthDays?.[i]) || 30;
                const safeDADR  = safeNum(dADR);
                const revNeutral    = safeDADR!==null ? Math.round(safeDADR * mOccFrac * days) : null;
                const revOptimistic = safeDADR!==null ? Math.round(safeDADR * rOccFrac * days) : null;
                const mOccPct = Math.round(mOccFrac*100);
                const rOccPct = Math.round(rOccFrac*100);


                return {m:DLABELS[i]||m,i,g,cls,curADR,tADR,dADR:safeDADR,curMult,tMult,multChange,
                  direction,outcome,priority,revNeutral,revOptimistic,days,mOccPct,rOccPct};
              }).filter(r=>r.cls.key!=="na");

              const hasData = rows.some(r=>r.curADR>0);
              if(!hasData) return null;

              return (
                <div key={uk} style={CARD}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,
                    paddingBottom:12,borderBottom:"1px solid #f3f4f6"}}>
                    <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",
                      background:getUnitColor(uk, DKEYS)}}/>
                    <span style={{fontSize:14,fontWeight:700,color:"#111827"}}>
                      {uk} — {units[uk]?.label||uk}
                    </span>
                    <span style={{fontSize:11,color:"#9ca3af"}}>
                      Base ADR ${d.baseRentalADR?d.baseRentalADR.toFixed(0):"—"}
                      &nbsp;·&nbsp; {d.monthsToAdjust} months need action
                    </span>
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr style={{background:"#f9fafb"}}>
                        {["Month","Dev Gap","Direction","Curr ADR","Target ADR",
                          "Mult change","Est nights","Rev impact","Expected outcome"].map(h=>(
                          <th key={h} style={TH}>{h}</th>))}
                      </tr></thead>
                      <tbody>
                        {rows.map((r,ri)=>{
                          const dirColor = r.direction.startsWith("Lower")?"#b45309":
                            r.direction.startsWith("Raise")?"#15803d":
                            r.direction==="Hold"?"#6b7280":"#374151";
                          const dirBg = r.direction.startsWith("Lower")?"#fffbeb":
                            r.direction.startsWith("Raise")?"#f0fdf4":
                            r.direction==="Hold"?"#f9fafb":"transparent";
                          return (
                            <tr key={r.m} style={{background:ri%2===0?WHITE:"#fafafa",
                              borderLeft:r.priority===3?`3px solid ${r.cls.col}`:"3px solid transparent"}}>
                              <td style={{...TD,fontWeight:700,paddingLeft:r.priority===3?9:12}}>{r.m}</td>
                              <td style={{...TD,fontFamily:MONO,fontWeight:700,
                                color:r.g===null?neu:r.g>=0?pos:neg}}>
                                {r.g!==null?(r.g>=0?"+":"-")+Math.abs(r.g).toFixed(1):"—"}
                              </td>
                              <td style={{...TD}}>
                                <span style={{fontSize:12,fontWeight:600,padding:"2px 10px",
                                  borderRadius:20,background:dirBg,color:dirColor}}>
                                  {r.direction}
                                </span>
                              </td>
                              <td style={{...TD,fontFamily:MONO}}>
                                {r.curADR>0?"$"+r.curADR.toFixed(0):<span style={{color:neu}}>anomaly</span>}
                              </td>
                              <td style={{...TD,fontFamily:MONO,fontWeight:600}}>
                                {r.tADR?"$"+r.tADR.toFixed(0):"—"}
                              </td>
                              <td style={{...TD,fontFamily:MONO,
                                color:r.multChange===null?neu:r.multChange>0?pos:r.multChange<0?"#b45309":neu}}>
                                {r.multChange!==null?(r.multChange>=0?"+":"")+r.multChange+"%":"—"}
                              </td>
                              <td style={{...TD,fontFamily:MONO,fontSize:12}}>
                                <div style={{color:typeof r.revNeutral==="number"?(r.revNeutral>=0?pos:neg):neu,fontWeight:600}}>
                                  {typeof r.revNeutral==="number"?(r.revNeutral>=0?"+":"-")+"$"+Math.abs(r.revNeutral):"—"}
                                </div>
                                <div style={{color:"#9ca3af",fontSize:10}}>{r.mOccPct}% mkt · {r.days}d</div>
                              </td>
                              <td style={{...TD,fontFamily:MONO,fontSize:12}}>
                                <div style={{color:typeof r.revOptimistic==="number"?(r.revOptimistic>=0?pos:neg):neu,fontWeight:600}}>
                                  {typeof r.revOptimistic==="number"?(r.revOptimistic>=0?"+":"-")+"$"+Math.abs(r.revOptimistic):"—"}
                                </div>
                                <div style={{color:"#9ca3af",fontSize:10}}>{r.rOccPct}% rental · {r.days}d</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{background:"#f9fafb",borderTop:"2px solid #e5e7eb"}}>
                          <td colSpan={6} style={{...TD,fontWeight:600,color:"#374151"}}>
                            Total estimated revenue impact
                          </td>
                          <td style={{...TD,fontFamily:MONO,fontWeight:700,
                            color:"#374151"}}>
                            {(()=>{
                              const tN=rows.reduce((s,r)=>s+(typeof r.revNeutral==="number"?r.revNeutral:0),0);
                              const tO=rows.reduce((s,r)=>s+(typeof r.revOptimistic==="number"?r.revOptimistic:0),0);
                              return "Neutral: "+(tN>=0?"+":"-")+"$"+Math.abs(tN)+" · Optimistic: "+(tO>=0?"+":"-")+"$"+Math.abs(tO);
                            })()}
                          </td>
                          <td style={TD}/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ════ EXPORT PANEL ════ */}
        {showExp && (
          <div style={{...CARD,marginTop:24,border:"1.5px solid #6366f1"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#111827",marginBottom:2}}>Export report</div>
                <div style={{fontSize:11,color:"#9ca3af"}}>{new Date().toISOString().slice(0,10)} · Paste directly into Google Sheets</div>
              </div>
              <button id="copy-btn"
                onClick={()=>{
                  const sel=window.getSelection();
                  const range=document.createRange();
                  const el=document.getElementById('export-content');
                  if(!el) return;
                  range.selectNodeContents(el);
                  sel.removeAllRanges(); sel.addRange(range);
                  document.execCommand('copy');
                  sel.removeAllRanges();
                  const btn=document.getElementById('copy-btn');
                  btn.textContent='✓ Copied — paste into Google Sheets';
                  btn.style.background='#f0fdf4'; btn.style.color='#15803d'; btn.style.borderColor='#86efac';
                  setTimeout(()=>{btn.textContent='📋 Copy all';btn.style.background='#eef2ff';btn.style.color='#4338ca';btn.style.borderColor='#c7d2fe';},3000);
                }}
                style={{padding:"8px 18px",borderRadius:8,border:"1px solid #c7d2fe",
                  background:"#eef2ff",color:"#4338ca",fontSize:12,cursor:"pointer",
                  fontFamily:F,fontWeight:600}}>
                📋 Copy all
              </button>
            </div>

            <div id="export-content">
              {/* Executive summary */}
              <div style={{fontSize:12,fontWeight:700,color:"#6366f1",marginBottom:8,
                textTransform:"uppercase",letterSpacing:".06em"}}>Executive Summary</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:24,
                border:"1px solid #e5e7eb",borderRadius:8,overflow:"hidden"}}>
                <thead><tr style={{background:"#f9fafb"}}>
                  {["Unit","Base ADR","Mkt ADR","Premium","Avg RevPAR","Avg Mkt RevPAR","Months Adj","Cum Δ ADR"].map(h=>(
                    <th key={h} style={{...TH,border:"1px solid #e5e7eb"}}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {DKEYS.map(uk=>{
                    const d=units[uk];
                    const rV=d.rRevPAR.filter(v=>v&&v>0),mV=d.mRevPAR.filter(v=>v);
                    const aR=rV.length?rV.reduce((a,b)=>a+b)/rV.length:null;
                    const aM=mV.length?mV.reduce((a,b)=>a+b)/mV.length:null;
                    const etd={padding:"7px 12px",border:"1px solid #e5e7eb",fontSize:12};
                    return (
                      <tr key={uk}>
                        <td style={{...etd,fontWeight:600}}>{uk} {units[uk]?.label||uk}</td>
                        <td style={{...etd,fontFamily:MONO}}>{d.baseRentalADR?"$"+d.baseRentalADR.toFixed(0):""}</td>
                        <td style={{...etd,fontFamily:MONO}}>{d.baseMarketADR?"$"+d.baseMarketADR.toFixed(0):""}</td>
                        <td style={{...etd,fontFamily:MONO}}>{d.premiumRatio?d.premiumRatio+"x":""}</td>
                        <td style={{...etd,fontFamily:MONO}}>{aR?"$"+aR.toFixed(0):""}</td>
                        <td style={{...etd,fontFamily:MONO}}>{aM?"$"+aM.toFixed(0):""}</td>
                        <td style={{...etd}}>{d.monthsToAdjust}/{months.length}</td>
                        <td style={{...etd,fontFamily:MONO}}>{(d.totalDeltaADR>=0?"":"-")+"$"+Math.abs(d.totalDeltaADR).toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {DKEYS.map(uk=>{
                const d=units[uk];
                const etd=(bg)=>({padding:"6px 12px",border:"1px solid #e5e7eb",fontSize:12,background:bg||WHITE});
                const eth={...TH,border:"1px solid #e5e7eb",background:"#f9fafb"};
                return (
                  <div key={uk} style={{marginBottom:32}}>
                    <div style={{fontSize:13,fontWeight:700,color:getUnitColor(uk, DKEYS),
                      marginBottom:12,paddingLeft:10,borderLeft:`3px solid ${getUnitColor(uk, DKEYS)}`}}>
                      {uk} — {units[uk]?.label||uk}
                      <span style={{fontSize:11,color:"#9ca3af",fontWeight:400,marginLeft:8}}>
                        Base ADR ${d.baseRentalADR?d.baseRentalADR.toFixed(0):"—"} · Premium {d.premiumRatio}x
                      </span>
                    </div>
                    {/* Section A */}
                    <div style={{fontSize:11,color:"#6366f1",fontWeight:700,marginBottom:6,
                      textTransform:"uppercase",letterSpacing:".05em"}}>A — Deviations & GAP</div>
                    <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                      <thead><tr>{["Month","Rental RevPAR","Mkt RevPAR","Rental Dev","Mkt Dev",
                        "Dev Gap","Classification","Action"].map(h=><th key={h} style={eth}>{h}</th>)}</tr></thead>
                      <tbody>
                        {months.map((m,i)=>{
                          const g=d.devGap[i],cls=d.gapCls[i];
                          const hc=HEAT_COLORS[cls.key];
                          return (
                            <tr key={m}>
                              <td style={etd()}><strong>{m}</strong></td>
                              <td style={etd()}>{d.rRevPAR[i]?"$"+d.rRevPAR[i].toFixed(0):"anomaly"}</td>
                              <td style={etd()}>{d.mRevPAR[i]?"$"+d.mRevPAR[i].toFixed(0):""}</td>
                              <td style={etd(d.rDev[i]!==null?(d.rDev[i]>=0?"#f0fdf4":"#fef2f2"):undefined)}>
                                {fE(d.rDev[i])}
                              </td>
                              <td style={etd()}>{fE(d.mDev[i])}</td>
                              <td style={etd(g!==null?(g>=0?"#f0fdf4":"#fef2f2"):undefined)}>
                                {fE(g,1)}
                              </td>
                              <td style={etd(hc.bg)}><span style={{color:hc.text,fontWeight:600}}>{cls.label}</span></td>
                              <td style={etd()}>{cls.action}</td>
                            </tr>
                          );
                        })}
                        <tr style={{background:"#f9fafb",borderTop:"2px solid #e5e7eb"}}>
                          <td style={etd("#f9fafb")}><strong>Annual avg</strong></td>
                          <td style={etd("#f9fafb")}><strong>{d.rAvg?"$"+d.rAvg.toFixed(0):""}</strong></td>
                          <td style={etd("#f9fafb")}>{d.mAvg?"$"+d.mAvg.toFixed(0):""}</td>
                          <td colSpan={5} style={etd("#f9fafb")}></td>
                        </tr>
                      </tbody>
                    </table>
                    {/* Section B */}
                    <div style={{fontSize:11,color:"#6366f1",fontWeight:700,marginBottom:6,
                      textTransform:"uppercase",letterSpacing:".05em"}}>B — Seasonal Multiplier Calendar (RevPAR-based)</div>
                    <table style={{width:"100%",borderCollapse:"collapse",marginBottom:4}}>
                      <thead><tr>{["Month","Dev Gap","Curr ADR","Curr Mult","Mkt Mult",
                        "Target Mult","Target ADR","Delta ADR","Action"].map(h=><th key={h} style={eth}>{h}</th>)}</tr></thead>
                      <tbody>
                        {months.map((m,i)=>{
                          const cls=d.gapCls[i],delta=d.deltaADR[i];
                          return (
                            <tr key={m}>
                              <td style={etd()}><strong>{m}</strong></td>
                              <td style={etd()}>{fE(d.devGap[i],1)}</td>
                              <td style={etd()}>{d.rentalADR[i]>0?"$"+d.rentalADR[i].toFixed(0):"anomaly"}</td>
                              <td style={etd()}>{d.rentalMult[i]!==null?d.rentalMult[i].toFixed(3):""}</td>
                              <td style={etd()}>{d.marketMult[i]!==null?d.marketMult[i].toFixed(3):""}</td>
                              <td style={{...etd(),fontWeight:600}}>{d.targetMult[i]!==null?d.targetMult[i].toFixed(3):""}</td>
                              <td style={etd()}>{d.targetADR[i]?"$"+d.targetADR[i].toFixed(0):""}</td>
                              <td style={etd(delta!==null?(delta>=0?"#f0fdf4":"#fef2f2"):undefined)}>
                                {delta!==null?(delta>=0?"":"-")+"$"+Math.abs(delta).toFixed(0):""}
                              </td>
                              <td style={etd()}>{cls.action}</td>
                            </tr>
                          );
                        })}
                        <tr style={{background:"#f9fafb",borderTop:"2px solid #e5e7eb"}}>
                          <td colSpan={7} style={etd("#f9fafb")}><strong>Cumulative Delta ADR</strong></td>
                          <td style={etd(d.totalDeltaADR>=0?"#f0fdf4":"#fef2f2")}>
                            <strong>{(d.totalDeltaADR>=0?"":"-")+"$"+Math.abs(d.totalDeltaADR).toFixed(0)}</strong>
                          </td>
                          <td style={etd("#f9fafb")}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}