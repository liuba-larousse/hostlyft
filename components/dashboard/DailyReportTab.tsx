// @ts-nocheck
"use client";

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Flag, Sparkles, Copy, Check } from 'lucide-react';

/* ---------- Helpers ---------- */

const todayISO = () => new Date().toISOString().split('T')[0];

const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const findPriorDate = (reports: any, currentISO: string, segment: string) => {
  const dates = Object.keys(reports).filter(d => d < currentISO && reports[d]?.[segment]).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
};

const findNearestDate = (reports: any, targetISO: string, segment: string) => {
  // Exact match first, then ±1, ±2 days
  for (let offset = 0; offset <= 2; offset++) {
    for (const dir of [0, -1, 1]) {
      const d = offset === 0 && dir === 0 ? targetISO : addDaysISO(targetISO, dir * offset || dir);
      if (reports[d]?.[segment]) return d;
    }
  }
  return null;
};

const fmtMoney = (v: any) => v == null ? '—' : `$${Math.round(Number(v)).toLocaleString('en-US')}`;
const fmtPct = (v: any) => v == null ? '—' : `${Number(v).toFixed(1)}%`;
const fmtSignedMoney = (v: any) => {
  if (v == null) return '—';
  const n = Math.round(Number(v));
  if (n === 0) return '$0';
  return n > 0 ? `+$${n.toLocaleString('en-US')}` : `−$${Math.abs(n).toLocaleString('en-US')}`;
};

const daysToEndOfMonth = (y: number, m: number) => {
  const lastDay = new Date(y, m, 0).getDate();
  const today = new Date();
  if (y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth() + 1)) return 0;
  if (y === today.getFullYear() && m === today.getMonth() + 1) return lastDay - today.getDate() + 1;
  return lastDay;
};

/* ---------- KPI extraction ---------- */

const extractPortfolioKPIs = (report: any) => {
  if (!report?.months) return null;
  const forwardMonths = report.months.filter((m: any) => daysToEndOfMonth(m.y, m.m) > 0);
  if (forwardMonths.length === 0) return null;

  let totalRev = 0, totalOcc = 0, totalAdr = 0, totalRevpar = 0, total3d = 0, total7d = 0, count = 0;
  forwardMonths.forEach((m: any) => {
    totalRev += Number(m.rentalRevenue || 0);
    total3d += Number(m.pickup3d || 0);
    total7d += Number(m.pickup7d || 0);
    if (m.occupancy != null) { totalOcc += Number(m.occupancy); count++; }
    if (m.rentalADR != null) totalAdr += Number(m.rentalADR);
    if (m.rentalRevPAR != null) totalRevpar += Number(m.rentalRevPAR);
  });

  return {
    revenue: totalRev,
    pickup3d: total3d,
    pickup7d: total7d,
    occ: count > 0 ? totalOcc / count : null,
    adr: count > 0 ? totalAdr / count : null,
    revpar: count > 0 ? totalRevpar / count : null,
    months: forwardMonths,
  };
};

/* ---------- Delta display ---------- */

const Delta = ({ current, prior, fmt, suffix = '' }: any) => {
  if (current == null || prior == null) return <span className="text-stone-300">—</span>;
  const diff = Number(current) - Number(prior);
  const pct = prior !== 0 ? (diff / Math.abs(prior)) * 100 : 0;
  const color = diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-stone-400';
  return (
    <span className={`mono text-[10px] ${color}`}>
      {diff > 0 ? '▲' : diff < 0 ? '▼' : '–'}
      {fmt === 'money' ? fmtSignedMoney(Math.abs(diff)) : `${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
};

/* ---------- Component ---------- */

interface DailyReportTabProps {
  portfolioReports: Record<string, Record<string, any>>;
  rows: any[];
  states: Record<string, any>;
}

export default function DailyReportTab({ portfolioReports, rows, states }: DailyReportTabProps) {
  const [copied, setCopied] = React.useState(false);
  const today = todayISO();

  // Find reports for today and comparison days
  const getReport = (segment: string, dayOffset: number) => {
    const target = addDaysISO(today, dayOffset);
    const dateFound = findNearestDate(portfolioReports, target, segment);
    return dateFound ? { date: dateFound, report: portfolioReports[dateFound][segment] } : null;
  };

  // Portfolio KPIs at different time points
  const segments = ['all', 'ph', 'exclPh'];
  const segmentLabels = { all: 'Portfolio', ph: 'PH', exclPh: 'Excl PH' };
  const offsets = [
    { label: 'Today', days: 0 },
    { label: '-1d', days: -1 },
    { label: '-3d', days: -3 },
    { label: '-7d', days: -7 },
  ];

  const portfolioData = useMemo(() => {
    const data: any = {};
    segments.forEach(seg => {
      data[seg] = {};
      offsets.forEach(o => {
        const r = getReport(seg, o.days);
        data[seg][o.label] = r ? extractPortfolioKPIs(r.report) : null;
        data[seg][`${o.label}_date`] = r?.date || null;
      });
    });
    return data;
  }, [portfolioReports]);

  // Building breakdown from most recent building report
  const buildingData = useMemo(() => {
    const todayBuilding = getReport('building', 0);
    if (!todayBuilding?.report?.byBuilding) return [];
    return Object.entries(todayBuilding.report.byBuilding).map(([name, months]: any) => {
      const forward = months.filter((m: any) => daysToEndOfMonth(m.y, m.m) > 0);
      const rev = forward.reduce((s: number, m: any) => s + (Number(m.rentalRevenue) || 0), 0);
      const p3d = forward.reduce((s: number, m: any) => s + (Number(m.pickup3d) || 0), 0);
      const p7d = forward.reduce((s: number, m: any) => s + (Number(m.pickup7d) || 0), 0);
      return { name, revenue: rev, pickup3d: p3d, pickup7d: p7d };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [portfolioReports]);

  // Weeks data
  const weeksData = useMemo(() => {
    const weeksReport = getReport('weeks', 0);
    if (!weeksReport?.report?.weeks) return [];
    return weeksReport.report.weeks
      .filter((w: any) => {
        const end = new Date(w.y, 0, 1 + (w.w - 1) * 7 + 6);
        return end >= new Date();
      })
      .slice(0, 8);
  }, [portfolioReports]);

  // Recent actions (last 7 days)
  const recentActions = useMemo(() => {
    const sevenDaysAgo = addDaysISO(today, -7);
    return rows.filter(r => {
      if (!r.date) return false;
      const [m, d, y] = r.date.split('/').map(Number);
      if (!m || !d || !y) return false;
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return iso >= sevenDaysAgo;
    }).slice(0, 20);
  }, [rows]);

  // Copy report as text
  const copyReport = async () => {
    const lines: string[] = [];
    lines.push(`DAILY PORTFOLIO REPORT — ${today}`);
    lines.push('═'.repeat(50));
    lines.push('');

    // Portfolio KPIs
    segments.forEach(seg => {
      const label = segmentLabels[seg];
      const t = portfolioData[seg]['Today'];
      const y = portfolioData[seg]['-1d'];
      if (!t) return;
      lines.push(`${label}:`);
      lines.push(`  Revenue: ${fmtMoney(t.revenue)}${y ? ` (${fmtSignedMoney(t.revenue - y.revenue)} vs yesterday)` : ''}`);
      lines.push(`  ADR: ${fmtMoney(t.adr)} · Occ: ${fmtPct(t.occ)} · RevPAR: ${fmtMoney(t.revpar)}`);
      lines.push(`  3d Pickup: ${fmtMoney(t.pickup3d)} · 7d Pickup: ${fmtMoney(t.pickup7d)}`);
      lines.push('');
    });

    // Buildings
    if (buildingData.length > 0) {
      lines.push('BUILDINGS (by revenue):');
      buildingData.slice(0, 10).forEach(b => {
        lines.push(`  ${b.name}: ${fmtMoney(b.revenue)} · 3d: ${fmtMoney(b.pickup3d)} · 7d: ${fmtMoney(b.pickup7d)}`);
      });
      lines.push('');
    }

    // Actions
    if (recentActions.length > 0) {
      lines.push(`RECENT ACTIONS (${recentActions.length}):`);
      recentActions.forEach(r => {
        lines.push(`  ${r.date} · ${r.affectedGroup || '—'} · ${r.action || '—'}`);
      });
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Daily Report</h2>
          <p className="text-[11px] text-stone-500">Portfolio snapshot comparing today vs -1d, -3d, -7d</p>
        </div>
        <button onClick={copyReport} className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border border-stone-300 bg-white rounded-sm hover:border-stone-500 transition-colors">
          {copied ? <><Check className="w-3.5 h-3.5 text-emerald-700" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Report</>}
        </button>
      </div>

      {/* Portfolio KPI Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {segments.map(seg => {
          const label = segmentLabels[seg];
          const t = portfolioData[seg]['Today'];
          const y = portfolioData[seg]['-1d'];
          const d3 = portfolioData[seg]['-3d'];
          const d7 = portfolioData[seg]['-7d'];
          const accent = seg === 'all' ? 'emerald' : seg === 'ph' ? 'purple' : 'amber';

          return (
            <div key={seg} className="border border-stone-200 rounded-sm bg-white">
              <div className={`px-4 py-2.5 border-b border-stone-200 bg-${accent}-50`}>
                <div className="text-[13px] font-semibold text-stone-900">{label}</div>
                {portfolioData[seg]['Today_date'] && (
                  <div className="text-[9px] text-stone-400 mono">{portfolioData[seg]['Today_date']}</div>
                )}
              </div>
              <div className="p-4">
                {!t ? (
                  <div className="text-[11px] text-stone-400 italic">No report available</div>
                ) : (
                  <div className="space-y-3">
                    {/* Revenue */}
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-stone-400 mb-0.5">Revenue On Books</div>
                      <div className="text-xl font-semibold text-stone-900 mono">{fmtMoney(t.revenue)}</div>
                      <div className="flex gap-3 mt-1 text-[10px]">
                        {y && <span>vs -1d: <Delta current={t.revenue} prior={y.revenue} fmt="money" /></span>}
                        {d3 && <span>-3d: <Delta current={t.revenue} prior={d3.revenue} fmt="money" /></span>}
                        {d7 && <span>-7d: <Delta current={t.revenue} prior={d7.revenue} fmt="money" /></span>}
                      </div>
                    </div>

                    {/* KPI grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'ADR', val: t.adr, fmt: fmtMoney, prev: [y?.adr, d3?.adr, d7?.adr] },
                        { label: 'Occ', val: t.occ, fmt: fmtPct, prev: [y?.occ, d3?.occ, d7?.occ] },
                        { label: 'RevPAR', val: t.revpar, fmt: fmtMoney, prev: [y?.revpar, d3?.revpar, d7?.revpar] },
                      ].map(kpi => (
                        <div key={kpi.label} className="bg-stone-50 rounded-sm px-2 py-1.5">
                          <div className="text-[9px] uppercase text-stone-400">{kpi.label}</div>
                          <div className="text-[13px] font-semibold mono text-stone-900">{kpi.fmt(kpi.val)}</div>
                          {y && <div className="text-[9px]"><Delta current={kpi.val} prior={kpi.prev[0]} fmt="pct" /></div>}
                        </div>
                      ))}
                    </div>

                    {/* Pickup */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-stone-50 rounded-sm px-2 py-1.5">
                        <div className="text-[9px] uppercase text-stone-400">3d Pickup</div>
                        <div className="text-[13px] font-semibold mono text-emerald-800">{fmtMoney(t.pickup3d)}</div>
                      </div>
                      <div className="bg-stone-50 rounded-sm px-2 py-1.5">
                        <div className="text-[9px] uppercase text-stone-400">7d Pickup</div>
                        <div className="text-[13px] font-semibold mono text-emerald-800">{fmtMoney(t.pickup7d)}</div>
                      </div>
                    </div>

                    {/* Next 3 months breakdown */}
                    {t.months && t.months.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-stone-400 mb-1">Next 3 Months</div>
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-stone-400">
                              <th className="text-left py-0.5 font-medium">Month</th>
                              <th className="text-right py-0.5 font-medium">Revenue</th>
                              <th className="text-right py-0.5 font-medium">ADR</th>
                              <th className="text-right py-0.5 font-medium">Occ</th>
                              <th className="text-right py-0.5 font-medium">BN</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.months.slice(0, 3).map((m: any) => (
                              <tr key={m.iso} className="border-t border-stone-100">
                                <td className="py-1 text-stone-700 font-medium">{m.label?.split(' ')[0] || m.iso}</td>
                                <td className="py-1 text-right mono text-stone-800">{fmtMoney(m.rentalRevenue)}</td>
                                <td className="py-1 text-right mono text-stone-700">{fmtMoney(m.rentalADR)}</td>
                                <td className="py-1 text-right mono text-stone-700">{fmtPct(m.occupancy)}</td>
                                <td className="py-1 text-right mono text-stone-500">{m.bookableNights || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Building Breakdown */}
      {buildingData.length > 0 && (
        <div className="border border-stone-200 rounded-sm bg-white">
          <div className="px-4 py-2.5 border-b border-stone-200 bg-stone-50">
            <div className="text-[12px] font-semibold text-stone-800">Building Revenue & Pickup</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-stone-50 text-stone-500 border-b border-stone-200">
                  <th className="text-left px-3 py-1.5 font-semibold">Building</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Revenue</th>
                  <th className="text-right px-3 py-1.5 font-semibold">3d Pickup</th>
                  <th className="text-right px-3 py-1.5 font-semibold">7d Pickup</th>
                </tr>
              </thead>
              <tbody>
                {buildingData.map((b, i) => (
                  <tr key={b.name} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                    <td className="px-3 py-1.5 font-medium text-stone-800">{b.name}</td>
                    <td className="px-3 py-1.5 text-right mono text-stone-700">{fmtMoney(b.revenue)}</td>
                    <td className={`px-3 py-1.5 text-right mono ${b.pickup3d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-500'}`}>{fmtMoney(b.pickup3d)}</td>
                    <td className={`px-3 py-1.5 text-right mono ${b.pickup7d > 0 ? 'text-emerald-700 font-medium' : 'text-stone-500'}`}>{fmtMoney(b.pickup7d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weeks Overview */}
      {weeksData.length > 0 && (
        <div className="border border-stone-200 rounded-sm bg-white">
          <div className="px-4 py-2.5 border-b border-stone-200 bg-stone-50">
            <div className="text-[12px] font-semibold text-stone-800">Upcoming Weeks</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-stone-50 text-stone-500 border-b border-stone-200">
                  <th className="text-left px-3 py-1.5 font-semibold">Week</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Event</th>
                  <th className="text-right px-3 py-1.5 font-semibold">ADR</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Occ</th>
                  <th className="text-right px-3 py-1.5 font-semibold">RevPAR</th>
                  <th className="text-right px-3 py-1.5 font-semibold">3d</th>
                  <th className="text-right px-3 py-1.5 font-semibold">7d</th>
                  <th className="text-right px-3 py-1.5 font-semibold">MPI</th>
                </tr>
              </thead>
              <tbody>
                {weeksData.map((w: any, i: number) => (
                  <tr key={w.iso} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                    <td className="px-3 py-1.5 font-medium text-stone-800">W{w.w}</td>
                    <td className="px-3 py-1.5 text-stone-600 truncate max-w-[150px]">{w.eventsName || '—'}</td>
                    <td className="px-3 py-1.5 text-right mono text-stone-700">{fmtMoney(w.rentalADR)}</td>
                    <td className="px-3 py-1.5 text-right mono text-stone-700">{fmtPct(w.occupancy)}</td>
                    <td className="px-3 py-1.5 text-right mono text-stone-700">{fmtMoney(w.rentalRevPAR)}</td>
                    <td className={`px-3 py-1.5 text-right mono ${w.pickup3d > 0 ? 'text-emerald-700' : 'text-stone-500'}`}>{fmtSignedMoney(w.pickup3d)}</td>
                    <td className={`px-3 py-1.5 text-right mono ${w.pickup7d > 0 ? 'text-emerald-700' : 'text-stone-500'}`}>{fmtSignedMoney(w.pickup7d)}</td>
                    <td className="px-3 py-1.5 text-right mono text-stone-700">{w.mpi != null ? `${Number(w.mpi).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Actions with KPI tracking */}
      {recentActions.length > 0 && (() => {
        // Helper to get revenue from portfolio report for a segment at a date
        const getRevForAction = (r: any, dayOffset: number) => {
          const [m, d, y] = (r.date || '').split('/').map(Number);
          if (!m || !d || !y) return null;
          const actionDate = new Date(y, m - 1, d);
          const target = new Date(actionDate);
          target.setDate(target.getDate() + dayOffset);
          const targetISO = target.toISOString().split('T')[0];
          // Don't show future data
          if (dayOffset > 0 && target > new Date()) return null;

          const g = (r.affectedGroup || '').trim().toLowerCase();
          const seg = (!g || ['account','all','portfolio'].includes(g)) ? 'all'
            : g === 'ph' ? 'ph'
            : (g === 'excl ph' || g === 'exclph') ? 'exclPh'
            : null;

          const dateFound = findNearestDate(portfolioReports, targetISO, seg || 'all');
          if (!dateFound) return null;
          const report = portfolioReports[dateFound][seg || 'all'];
          if (!report?.months) return null;

          // Match affected month
          const affDates = r.affectedDates || '';
          const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
          const mm = affDates.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
          let months = report.months.filter((mo: any) => daysToEndOfMonth(mo.y, mo.m) > 0);
          if (mm) {
            const mi = monthNames.indexOf(mm[1].toLowerCase()) + 1;
            const yi = parseInt(mm[2]);
            const filtered = months.filter((mo: any) => mo.m === mi && mo.y === yi);
            if (filtered.length > 0) months = filtered;
          }

          let totalRev = 0;
          months.forEach((mo: any) => { totalRev += Number(mo.rentalRevenue || 0); });
          return totalRev;
        };

        return (
        <div className="border border-stone-200 rounded-sm bg-white">
          <div className="px-4 py-2.5 border-b border-stone-200 bg-stone-50">
            <div className="text-[12px] font-semibold text-stone-800">Actions (Last 7 Days) — {recentActions.length}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-stone-50 text-stone-500 border-b border-stone-200">
                  <th className="text-left px-2 py-1.5 font-semibold">Date</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Group</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Action</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-[9px]">Before → After</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Before Rev</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-emerald-700">+1d Rev</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-emerald-700">+3d Rev</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-emerald-700">+7d Rev</th>
                </tr>
              </thead>
              <tbody>
                {recentActions.map((r, i) => {
                  const beforeRev = getRevForAction(r, 0);
                  const d1Rev = getRevForAction(r, 1);
                  const d3Rev = getRevForAction(r, 3);
                  const d7Rev = getRevForAction(r, 7);
                  const pickup1 = beforeRev != null && d1Rev != null ? d1Rev - beforeRev : null;
                  const pickup3 = beforeRev != null && d3Rev != null ? d3Rev - beforeRev : null;
                  const pickup7 = beforeRev != null && d7Rev != null ? d7Rev - beforeRev : null;
                  return (
                  <tr key={r.id} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                    <td className="px-2 py-1.5 mono text-stone-700 whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5 font-medium text-stone-800">{r.affectedGroup || '—'}</td>
                    <td className="px-2 py-1.5 text-stone-700 truncate max-w-[180px]" title={r.action}>{r.action || '—'}</td>
                    <td className="px-2 py-1.5 text-stone-400 text-[9px]">{r.valueBefore || '?'} → {r.valueAfter || '?'}</td>
                    <td className="px-2 py-1.5 text-right mono text-stone-700">{beforeRev != null ? fmtMoney(beforeRev) : '—'}</td>
                    <td className={`px-2 py-1.5 text-right mono ${pickup1 != null && pickup1 > 0 ? 'text-emerald-700' : pickup1 != null && pickup1 < 0 ? 'text-rose-700' : 'text-stone-300'}`}>
                      {pickup1 != null ? fmtSignedMoney(pickup1) : '—'}
                    </td>
                    <td className={`px-2 py-1.5 text-right mono ${pickup3 != null && pickup3 > 0 ? 'text-emerald-700' : pickup3 != null && pickup3 < 0 ? 'text-rose-700' : 'text-stone-300'}`}>
                      {pickup3 != null ? fmtSignedMoney(pickup3) : '—'}
                    </td>
                    <td className={`px-2 py-1.5 text-right mono ${pickup7 != null && pickup7 > 0 ? 'text-emerald-700' : pickup7 != null && pickup7 < 0 ? 'text-rose-700' : 'text-stone-300'}`}>
                      {pickup7 != null ? fmtSignedMoney(pickup7) : '—'}
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

      {/* Per-month breakdown */}
      {portfolioData['all']?.['Today']?.months && (
        <div className="border border-stone-200 rounded-sm bg-white">
          <div className="px-4 py-2.5 border-b border-stone-200 bg-stone-50">
            <div className="text-[12px] font-semibold text-stone-800">Monthly Breakdown (Forward Months)</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-stone-50 text-stone-500 border-b border-stone-200">
                  <th className="text-left px-3 py-1.5 font-semibold">Month</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Revenue</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Rev vs STLY</th>
                  <th className="text-right px-3 py-1.5 font-semibold">3d Pickup</th>
                  <th className="text-right px-3 py-1.5 font-semibold">7d Pickup</th>
                  <th className="text-right px-3 py-1.5 font-semibold">ADR</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Occ</th>
                  <th className="text-right px-3 py-1.5 font-semibold">RevPAR</th>
                </tr>
              </thead>
              <tbody>
                {portfolioData['all']['Today'].months.map((m: any, i: number) => {
                  const revGap = m.rentalRevenue != null && m.rentalRevenueSTLY != null
                    ? Number(m.rentalRevenue) - Number(m.rentalRevenueSTLY) : null;
                  return (
                    <tr key={m.iso} className={`border-b border-stone-100 ${i % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                      <td className="px-3 py-1.5 font-medium text-stone-800">{m.label}</td>
                      <td className="px-3 py-1.5 text-right mono text-stone-900 font-medium">{fmtMoney(m.rentalRevenue)}</td>
                      <td className={`px-3 py-1.5 text-right mono font-medium ${revGap != null && revGap >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {revGap != null ? fmtSignedMoney(revGap) : '—'}
                      </td>
                      <td className={`px-3 py-1.5 text-right mono ${m.pickup3d > 0 ? 'text-emerald-700' : 'text-stone-500'}`}>{fmtMoney(m.pickup3d)}</td>
                      <td className={`px-3 py-1.5 text-right mono ${m.pickup7d > 0 ? 'text-emerald-700' : 'text-stone-500'}`}>{fmtMoney(m.pickup7d)}</td>
                      <td className="px-3 py-1.5 text-right mono text-stone-700">{fmtMoney(m.rentalADR)}</td>
                      <td className="px-3 py-1.5 text-right mono text-stone-700">{fmtPct(m.occupancy)}</td>
                      <td className="px-3 py-1.5 text-right mono text-stone-700">{fmtMoney(m.rentalRevPAR)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
