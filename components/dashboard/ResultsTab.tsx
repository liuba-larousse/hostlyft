// @ts-nocheck
"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, Minus, Loader2, Calendar } from 'lucide-react';

/* ---------- Helpers ---------- */

const parseMDY = (mdy: string) => {
  if (!mdy) return null;
  const [m, d, y] = mdy.split('/').map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
};

const toISO = (date: Date) => date.toISOString().split('T')[0];

const addDays = (date: Date, n: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const fmtMoney = (v: any) => v == null ? '—' : `$${Math.round(Number(v)).toLocaleString('en-US')}`;
const fmtPct = (v: any) => v == null ? '—' : `${Number(v).toFixed(1)}%`;

// Map affectedGroup to portfolioReports segment key
const resolveSegment = (group: string) => {
  if (!group) return 'all';
  const g = group.trim().toLowerCase();
  if (['account', 'all', 'portfolio', ''].includes(g)) return 'all';
  if (g === 'ph') return 'ph';
  if (g === 'excl ph' || g === 'exclph') return 'exclPh';
  return null; // building name — look in byBuilding
};

// Extract KPIs from a portfolio report for matching month(s)
const extractKPIs = (report: any, affectedDates: string) => {
  if (!report?.months || report.months.length === 0) return null;

  // Try to match month from affectedDates (e.g. "Jun 2026", "May 2026 · Week 23")
  const monthMatch = affectedDates?.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})/i);
  let months = report.months;

  if (monthMatch) {
    const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const targetM = monthNames.indexOf(monthMatch[1].toLowerCase()) + 1;
    const targetY = parseInt(monthMatch[2]);
    const filtered = months.filter((m: any) => m.m === targetM && m.y === targetY);
    if (filtered.length > 0) months = filtered;
  }

  // Aggregate across matched months
  let totalRev = 0, totalOcc = 0, totalAdr = 0, totalRevpar = 0, count = 0;
  months.forEach((m: any) => {
    if (m.rentalRevenue != null) totalRev += Number(m.rentalRevenue);
    if (m.occupancy != null) { totalOcc += Number(m.occupancy); count++; }
    if (m.rentalADR != null) totalAdr += Number(m.rentalADR);
    if (m.rentalRevPAR != null) totalRevpar += Number(m.rentalRevPAR);
  });

  if (count === 0) return null;

  return {
    occ: totalOcc / count,
    adr: totalAdr / count,
    revpar: totalRevpar / count,
    revenue: totalRev,
  };
};

// Extract KPIs from a building-level report
// Tries exact match first, then partial match on building number prefix
const extractBuildingKPIs = (report: any, buildingGroup: string, affectedDates: string) => {
  if (!report?.byBuilding) return null;

  // Exact match
  if (report.byBuilding[buildingGroup]) {
    const fakeReport = { months: report.byBuilding[buildingGroup] };
    return extractKPIs(fakeReport, affectedDates);
  }

  // Partial match: extract building number (e.g. "29" from "29.Millenium")
  const buildingNum = buildingGroup.split('.')[0];
  if (buildingNum) {
    const matchKey = Object.keys(report.byBuilding).find(k =>
      k.startsWith(buildingNum + '.') || k === buildingNum
    );
    if (matchKey) {
      const fakeReport = { months: report.byBuilding[matchKey] };
      return extractKPIs(fakeReport, affectedDates);
    }
  }
  return null;
};

// Extract KPIs from weeks report for a specific week number
const extractWeekKPIs = (weeksReport: any, affectedDates: string) => {
  if (!weeksReport?.weeks || !affectedDates) return null;
  // Match "Week 23" from affectedDates
  const weekMatch = affectedDates.match(/Week\s*(\d+)/i);
  if (!weekMatch) return null;
  const weekNum = parseInt(weekMatch[1]);
  const week = weeksReport.weeks.find((w: any) => w.w === weekNum);
  if (!week) return null;

  return {
    occ: week.occupancy != null ? Number(week.occupancy) : null,
    adr: week.rentalADR != null ? Number(week.rentalADR) : null,
    revpar: week.rentalRevPAR != null ? Number(week.rentalRevPAR) : null,
    revenue: week.rentalRevenueSTLY != null ? Number(week.rentalRevenueSTLY) : null, // weeks don't have TY revenue, use STLY as reference
  };
};

// Find the best report for a given date + segment
// Falls back to nearest available date within 2 days
const findReport = (portfolioReports: any, dateISO: string, segment: string | null, buildingGroup: string) => {
  // Try exact date first, then +/- 1 day, then +/- 2 days
  const datesToTry = [dateISO];
  const base = new Date(dateISO + 'T00:00:00');
  for (let offset = 1; offset <= 2; offset++) {
    datesToTry.push(toISO(addDays(base, -offset)));
    datesToTry.push(toISO(addDays(base, offset)));
  }

  for (const d of datesToTry) {
    const dayData = portfolioReports[d];
    if (!dayData) continue;

    if (segment) {
      if (dayData[segment]) return dayData[segment];
      continue;
    }
    // Building — look in 'building' report's byBuilding
    const buildingReport = dayData['building'];
    if (buildingReport?.byBuilding?.[buildingGroup]) {
      return buildingReport;
    }
  }
  return null;
};

/* ---------- KPI Cell ---------- */

interface KPIs { occ: number; adr: number; revpar: number; revenue: number }

const KPICell = ({ kpis, baseline }: { kpis: KPIs | null; baseline?: KPIs | null }) => {
  if (!kpis) return <td className="px-2 py-2 text-center text-stone-300 text-[10px]" colSpan={4}>—</td>;

  const delta = (val: number, base: number | undefined) => {
    if (base == null || base === 0) return null;
    return ((val - base) / Math.abs(base)) * 100;
  };

  const renderMetric = (value: number, fmt: (v: any) => string, baseValue?: number) => {
    const d = baseline ? delta(value, baseValue) : null;
    return (
      <div className="text-center">
        <div className="text-[11px] mono font-medium text-stone-900">{fmt(value)}</div>
        {d != null && (
          <div className={`text-[9px] mono ${d > 0 ? 'text-emerald-700' : d < 0 ? 'text-rose-700' : 'text-stone-400'}`}>
            {d > 0 ? '▲' : d < 0 ? '▼' : '–'}{Math.abs(d).toFixed(1)}%
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <td className="px-1 py-2">{renderMetric(kpis.occ, fmtPct, baseline?.occ)}</td>
      <td className="px-1 py-2">{renderMetric(kpis.adr, fmtMoney, baseline?.adr)}</td>
      <td className="px-1 py-2">{renderMetric(kpis.revpar, fmtMoney, baseline?.revpar)}</td>
      <td className="px-1 py-2">{renderMetric(kpis.revenue, fmtMoney, baseline?.revenue)}</td>
    </>
  );
};

/* ---------- Main Component ---------- */

interface ResultsTabProps {
  rows: any[];
  states: Record<string, any>;
  portfolioReports: Record<string, Record<string, any>>;
}

export default function ResultsTab({ rows, states, portfolioReports }: ResultsTabProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [bookingsCache, setBookingsCache] = useState<Record<string, any[]>>({});
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Sort rows by date descending
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = parseMDY(a.date);
      const db = parseMDY(b.date);
      if (!da || !db) return 0;
      return db.getTime() - da.getTime();
    });
  }, [rows]);

  // Parse affected dates to get stay date range for booking filtering
  // Handles formats like: "Jun 2026 · Week 23 · 2026 (Jun 1-7, 2026)"
  //                        "May 2026 · Week 20 (May 11-17, 2026)"
  //                        "Aug 2026"
  //                        "All"
  //                        "2026-05-10 → 2026-05-16"
  const parseStayDates = (affectedDates: string, actionDate: Date | null) => {
    if (!affectedDates) return { stayFrom: '', stayTo: '' };
    // Try ISO date range: "2026-05-10 → 2026-05-16"
    const isoMatch = affectedDates.match(/(\d{4}-\d{2}-\d{2})\s*[→\-–]\s*(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return { stayFrom: isoMatch[1], stayTo: isoMatch[2] };
    // Try "Mon D-D, YYYY" format from week ranges: "Jun 1-7, 2026"
    const dateRangeMatch = affectedDates.match(/(\w+ \d+)[–\-](\d+),?\s*(\d{4})/);
    if (dateRangeMatch) {
      const start = new Date(`${dateRangeMatch[1]}, ${dateRangeMatch[3]}`);
      const end = new Date(start);
      end.setDate(parseInt(dateRangeMatch[2]));
      if (!isNaN(start.getTime())) return { stayFrom: toISO(start), stayTo: toISO(end) };
    }
    // Try "Week N" — compute ISO week start/end dates
    const weekMatch = affectedDates.match(/Week\s*(\d+)/i);
    if (weekMatch) {
      // Extract year from nearby context: "Aug 2026 · Week 36 · 2026"
      const yearMatch = affectedDates.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      const weekNum = parseInt(weekMatch[1]);
      // ISO week to date: Jan 4 is always in week 1
      const jan4 = new Date(year, 0, 4);
      const dayOfWeek = jan4.getDay() || 7; // Mon=1..Sun=7
      const weekStart = new Date(jan4);
      weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNum - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return { stayFrom: toISO(weekStart), stayTo: toISO(weekEnd) };
    }
    // Try month: "Jun 2026" or "Aug 2026"
    const monthMatch = affectedDates.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
    if (monthMatch) {
      const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const m = monthNames.indexOf(monthMatch[1].toLowerCase());
      const y = parseInt(monthMatch[2]);
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { stayFrom: toISO(start), stayTo: toISO(end) };
    }
    return { stayFrom: '', stayTo: '' };
  };

  // Preload bookings for all rows on mount
  // Deduplicate: rows with same group + dates share the same booking set
  React.useEffect(() => {
    if (rows.length === 0 || Object.keys(bookingsCache).length > 0) return;
    setLoadingBookings(true);

    // Build unique fetch keys to avoid duplicate API calls
    const fetchMap: Record<string, { rows: any[]; params: URLSearchParams }> = {};
    rows.forEach(row => {
      const actionDate = parseMDY(row.date);
      const since = actionDate ? toISO(actionDate) : '';
      const group = row.affectedGroup || '';
      const { stayFrom, stayTo } = parseStayDates(row.affectedDates, actionDate);
      const key = `${group}|${since}|${stayFrom}|${stayTo}`;
      if (!fetchMap[key]) {
        const params = new URLSearchParams({ group, since });
        if (stayFrom) params.set('stayFrom', stayFrom);
        if (stayTo) params.set('stayTo', stayTo);
        fetchMap[key] = { rows: [], params };
      }
      fetchMap[key].rows.push(row);
    });

    (async () => {
      const cache: Record<string, any[]> = {};
      for (const [, { rows: matchingRows, params }] of Object.entries(fetchMap)) {
        try {
          const res = await fetch(`/api/action-log/bookings?${params.toString()}`);
          const data = await res.json();
          const bookings = data.bookings || [];
          matchingRows.forEach(row => { cache[row.id] = bookings; });
        } catch {
          matchingRows.forEach(row => { cache[row.id] = []; });
        }
      }
      setBookingsCache(cache);
      setLoadingBookings(false);
    })();
  }, [rows]);

  const toggleRow = useCallback((row: any) => {
    setExpandedRow(prev => prev === row.id ? null : row.id);
  }, []);

  // Compute KPIs for a row at a given day offset
  // For follow-up offsets (> 0), only return data if the target date has actually passed
  const getKPIs = useCallback((row: any, dayOffset: number): KPIs | null => {
    const actionDate = parseMDY(row.date);
    if (!actionDate) return null;
    const targetDate = addDays(actionDate, dayOffset);
    const targetISO = toISO(targetDate);

    // Don't show follow-up data for future dates — the report hasn't happened yet
    if (dayOffset > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (targetDate > today) return null;
    }

    // Try weeks report first if affected dates reference a specific week
    if (row.affectedDates?.match(/Week\s*\d+/i)) {
      const weeksReport = findReport(portfolioReports, targetISO, 'weeks', '');
      if (weeksReport) {
        const weekKPIs = extractWeekKPIs(weeksReport, row.affectedDates);
        if (weekKPIs && (weekKPIs.occ > 0 || weekKPIs.adr > 0)) return weekKPIs;
      }
    }

    const segment = resolveSegment(row.affectedGroup);
    const report = findReport(portfolioReports, targetISO, segment, row.affectedGroup);

    if (segment && report) {
      return extractKPIs(report, row.affectedDates);
    }

    // Building-level: use building report only — don't fall back to 'all'
    // (portfolio averages would show misleading deltas for building actions)
    if (!segment && report) {
      return extractBuildingKPIs(report, row.affectedGroup, row.affectedDates);
    }

    // Only fall back to 'all' for portfolio-wide actions (Account, All)
    if (segment === 'all') {
      const allReport = findReport(portfolioReports, targetISO, 'all', '');
      if (allReport) return extractKPIs(allReport, row.affectedDates);
    }

    return null;
  }, [portfolioReports]);

  // Get "before" KPIs — prefer state capture, fall back to portfolio report
  const getBeforeKPIs = useCallback((row: any): KPIs | null => {
    const stateMetrics = states[row.id]?.before?.metrics;
    if (stateMetrics) {
      return {
        occ: stateMetrics.occupancy ?? stateMetrics.occ ?? null,
        adr: stateMetrics.adr ?? null,
        revpar: stateMetrics.revpar ?? null,
        revenue: stateMetrics.revenue ?? stateMetrics.rentalRevenue ?? null,
      };
    }
    return getKPIs(row, 0);
  }, [states, getKPIs]);

  if (rows.length === 0) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 py-12 text-center">
        <Calendar className="w-8 h-8 text-stone-300 mx-auto mb-3" />
        <div className="text-stone-700 font-medium mb-1">No actions recorded yet</div>
        <div className="text-[12px] text-stone-500">Actions from the Action Log will appear here with follow-up KPIs and post-action bookings.</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="mb-4">
        <p className="text-[12px] text-stone-600">
          Each action shows KPI snapshots at the time of action and at +1, +3, +7 day follow-ups. Deltas compare against the "Before" baseline. Expand a row to see post-action bookings.
        </p>
      </div>

      <div className="border border-stone-300 rounded-sm bg-white overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-stone-100 border-b border-stone-200">
              <th className="text-left px-2 py-2 font-semibold text-stone-700 sticky left-0 bg-stone-100 z-10" rowSpan={2}>Date</th>
              <th className="text-left px-2 py-2 font-semibold text-stone-700" rowSpan={2}>Group</th>
              <th className="text-left px-2 py-2 font-semibold text-stone-700" rowSpan={2}>Dates</th>
              <th className="text-left px-2 py-2 font-semibold text-stone-700 max-w-[180px]" rowSpan={2}>Action</th>
              <th className="text-center px-1 py-1 font-semibold text-stone-500 border-l border-stone-200" colSpan={4}>Before</th>
              <th className="text-center px-1 py-1 font-semibold text-emerald-700 border-l border-stone-200" colSpan={4}>+1 Day</th>
              <th className="text-center px-1 py-1 font-semibold text-emerald-700 border-l border-stone-200" colSpan={4}>+3 Days</th>
              <th className="text-center px-1 py-1 font-semibold text-emerald-700 border-l border-stone-200" colSpan={4}>+7 Days</th>
              <th className="text-center px-2 py-2 font-semibold text-stone-700 border-l border-stone-200" rowSpan={2}>Bookings</th>
            </tr>
            <tr className="bg-stone-50 border-b border-stone-200 text-[9px] uppercase tracking-wider text-stone-500">
              {[0, 1, 2, 3].map(i => (
                <React.Fragment key={i}>
                  <th className={`px-1 py-1 text-center ${i > 0 ? '' : 'border-l border-stone-200'}`}>Occ</th>
                  <th className="px-1 py-1 text-center">ADR</th>
                  <th className="px-1 py-1 text-center">RevPAR</th>
                  <th className="px-1 py-1 text-center">Rev</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => {
              const beforeKPIs = getBeforeKPIs(row);
              const day1KPIs = getKPIs(row, 1);
              const day3KPIs = getKPIs(row, 3);
              const day7KPIs = getKPIs(row, 7);
              const isExpanded = expandedRow === row.id;
              const bookings = bookingsCache[row.id] || [];
              const isRowLoading = loadingBookings;
              const bookingRevenue = bookings.reduce((s, b) => s + (Number(b.rental_revenue) || Number(b.total_revenue) || 0), 0);

              return (
                <React.Fragment key={row.id}>
                  <tr className={`border-b border-stone-100 hover:bg-stone-50/50 ${idx % 2 === 1 ? 'bg-stone-50/30' : ''}`}>
                    <td className="px-2 py-2 mono text-stone-700 whitespace-nowrap sticky left-0 bg-inherit z-10">
                      {row.date}
                    </td>
                    <td className="px-2 py-2 text-stone-800 font-medium">{row.affectedGroup || '—'}</td>
                    <td className="px-2 py-2 text-stone-600 text-[10px] max-w-[120px] truncate" title={row.affectedDates}>{row.affectedDates || '—'}</td>
                    <td className="px-2 py-2 text-stone-700 max-w-[180px]" title={row.action}>
                      <div className="truncate">{row.action || '—'}</div>
                      {(row.valueBefore || row.valueAfter) && (
                        <div className="text-[9px] text-stone-400 truncate">{row.valueBefore || '?'} → {row.valueAfter || '?'}</div>
                      )}
                    </td>

                    <KPICell kpis={beforeKPIs} />
                    <KPICell kpis={day1KPIs} baseline={beforeKPIs} />
                    <KPICell kpis={day3KPIs} baseline={beforeKPIs} />
                    <KPICell kpis={day7KPIs} baseline={beforeKPIs} />

                    <td className="px-2 py-2 border-l border-stone-200">
                      <button
                        onClick={() => toggleRow(row)}
                        className="flex items-center gap-1 text-[10px] text-stone-600 hover:text-stone-900 transition-colors"
                      >
                        {isRowLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                        <span>
                          <span className="font-medium">{bookings.length}</span>
                          {bookingRevenue > 0 && <span className="text-emerald-700 ml-1">{fmtMoney(bookingRevenue)}</span>}
                        </span>
                      </button>
                    </td>
                  </tr>

                  {/* Expanded bookings row */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={20} className="px-0 py-0 bg-stone-50 border-b border-stone-200">
                        {isRowLoading ? (
                          <div className="px-6 py-4 text-[11px] text-stone-400 flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                          </div>
                        ) : bookings.length === 0 ? (
                          <div className="px-6 py-4 text-[11px] text-stone-400 italic">
                            No bookings found for {row.affectedGroup || 'this group'} since {row.date}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="bg-stone-100 text-stone-500">
                                  <th className="text-left px-3 py-1.5 font-semibold">Listing</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Booked</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Check-in</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Check-out</th>
                                  <th className="text-right px-2 py-1.5 font-semibold">LOS</th>
                                  <th className="text-right px-2 py-1.5 font-semibold">ADR</th>
                                  <th className="text-right px-2 py-1.5 font-semibold">Revenue</th>
                                  <th className="text-left px-2 py-1.5 font-semibold">Source</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bookings.map((b, bi) => (
                                  <tr key={b.reservation_id || bi} className={`border-t border-stone-100 ${bi % 2 === 1 ? 'bg-stone-50/50' : ''}`}>
                                    <td className="px-3 py-1.5 text-stone-800 font-medium truncate max-w-[200px]" title={b.listing_name}>{b.listing_name || '—'}</td>
                                    <td className="px-2 py-1.5 mono text-stone-600">{b.booked_date || '—'}</td>
                                    <td className="px-2 py-1.5 mono text-stone-600">{b.checkin_date || '—'}</td>
                                    <td className="px-2 py-1.5 mono text-stone-600">{b.checkout_date || '—'}</td>
                                    <td className="px-2 py-1.5 text-right mono text-stone-700">{b.los ?? '—'}</td>
                                    <td className="px-2 py-1.5 text-right mono text-stone-700">{b.adr != null ? fmtMoney(b.adr) : '—'}</td>
                                    <td className="px-2 py-1.5 text-right mono text-emerald-800 font-medium">{fmtMoney(b.rental_revenue || b.total_revenue)}</td>
                                    <td className="px-2 py-1.5 text-stone-600">{b.booking_source || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-stone-300 bg-stone-100 font-semibold">
                                  <td className="px-3 py-1.5 text-stone-900">Total ({bookings.length})</td>
                                  <td colSpan={5}></td>
                                  <td className="px-2 py-1.5 text-right mono text-emerald-900">{fmtMoney(bookingRevenue)}</td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
