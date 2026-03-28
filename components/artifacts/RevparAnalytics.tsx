import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

// Types
interface MonthData {
  ms: string;
  days: number;
  // Portfolio
  pOccTY: number;
  pOccSTLY: number;
  pOccChg: number | null;
  pAdrTY: number;
  pAdrSTLY: number;
  pAdrChg: number | null;
  pRevparTY: number;
  pRevparSTLY: number;
  pRevparLY: number;
  pRevparChg: number | null;
  pOccCon: number | null;
  pAdrCon: number | null;
  pDrv: string | null;
  // Market
  mOccTY: number;
  mOccSTLY: number;
  mOccChg: number | null;
  mAdrTY: number;
  mAdrSTLY: number;
  mAdrChg: number | null;
  mRevparTY: number;
  mRevparSTLY: number;
  mRevparLY: number;
  mRevparChg: number | null;
  mOccCon: number | null;
  mAdrCon: number | null;
  mDrv: string | null;
  mMult: number | null;
  // Revenue
  fRental: number | null;
  actRental: number;
  actTotal: number;
  rentalLY: number;
  totalLY: number;
  // Calculated
  targetRev?: number | null;
  usingFallback?: boolean;
}

type TabType = 'summary' | 'portfolio' | 'market';
type ForecastBaseType = 'ly' | 'market';
type QualityModeType = 'actual' | '0' | '0.125' | '0.25' | '0.4';

const DAYS: Record<string, number> = {
  '01': 31, '02': 28, '03': 31, '04': 30, '05': 31, '06': 30,
  '07': 31, '08': 31, '09': 30, '10': 31, '11': 30, '12': 31
};

const MONTHS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
};

const RevparAnalytics: React.FC = () => {
  const [data, setData] = useState<MonthData[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [goalPct, setGoalPct] = useState<number>(0);
  const [currentTab, setCurrentTab] = useState<TabType>('summary');
  const [forecastBase, setForecastBase] = useState<ForecastBaseType>('ly');
  const [qualityMode, setQualityMode] = useState<QualityModeType>('actual');
  const [isDragging, setIsDragging] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process raw data from Excel
  const processData = useCallback((raw: any[]): MonthData[] => {
    return raw.map(r => {
      const m = (r['Year & Month'] || '').match(/\d{4}-(\d{2})/);
      const mn = m ? m[1] : '01';
      const days = DAYS[mn] || 30;

      // Portfolio
      const pOccTY = +r['Occupancy %'] || 0;
      const pOccSTLY = +r['Occupancy % STLY'] || 0;
      const pAdrTY = +r['Rental ADR'] || 0;
      const pAdrSTLY = +r['Rental ADR STLY'] || 0;
      const pRevparTY = +r['Rental RevPAR'] || 0;
      const pRevparSTLY = +r['Rental RevPAR STLY'] || 0;
      const pRevparLY = +r['Rental RevPAR LY'] || 0;
      const actRental = +r['Rental Revenue'] || 0;
      const actTotal = +r['Total Revenue'] || 0;
      const rentalLY = +r['Rental Revenue LY'] || 0;
      const totalLY = +r['Total Revenue LY'] || 0;

      const pOccChg = pOccSTLY > 0 && pOccTY > 0 ? (pOccTY - pOccSTLY) / pOccSTLY : null;
      const pAdrChg = pAdrSTLY > 0 && pAdrTY > 0 ? (pAdrTY - pAdrSTLY) / pAdrSTLY : null;
      const pRevparChg = pRevparSTLY > 0 && pRevparTY > 0 ? (pRevparTY - pRevparSTLY) / pRevparSTLY : null;

      const pOccCon = pOccSTLY > 0 && pOccTY > 0 ? (pOccTY / 100 - pOccSTLY / 100) * pAdrSTLY : null;
      const pAdrCon = pAdrSTLY > 0 && pAdrTY > 0 ? (pAdrTY - pAdrSTLY) * (pOccSTLY / 100) : null;
      const pDrv = pOccCon !== null && pAdrCon !== null ? (Math.abs(pOccCon) > Math.abs(pAdrCon) ? 'OCC' : 'ADR') : null;

      // Market
      const mOccTY = +r['Market Occupancy %'] || 0;
      const mOccSTLY = +r['Market Occupancy % STLY'] || 0;
      const mAdrTY = +r['Market ADR'] || 0;
      const mAdrSTLY = +r['Market ADR STLY'] || 0;
      const mRevparTY = +r['Market RevPAR'] || 0;
      const mRevparSTLY = +r['Market RevPAR STLY'] || 0;
      const mRevparLY = +r['Market RevPAR LY'] || 0;

      const mOccChg = mOccSTLY > 0 && mOccTY > 0 ? (mOccTY - mOccSTLY) / mOccSTLY : null;
      const mAdrChg = mAdrSTLY > 0 && mAdrTY > 0 ? (mAdrTY - mAdrSTLY) / mAdrSTLY : null;
      const mRevparChg = mRevparSTLY > 0 && mRevparTY > 0 ? (mRevparTY - mRevparSTLY) / mRevparSTLY : null;

      const mOccCon = mOccSTLY > 0 && mOccTY > 0 ? (mOccTY / 100 - mOccSTLY / 100) * mAdrSTLY : null;
      const mAdrCon = mAdrSTLY > 0 && mAdrTY > 0 ? (mAdrTY - mAdrSTLY) * (mOccSTLY / 100) : null;
      const mDrv = mOccCon !== null && mAdrCon !== null ? (Math.abs(mOccCon) > Math.abs(mAdrCon) ? 'OCC' : 'ADR') : null;
      const mMult = mRevparChg !== null ? 1 + mRevparChg : null;

      const fRental = pRevparLY > 0 && mMult ? pRevparLY * mMult * days : null;

      return {
        ms: MONTHS[mn],
        days,
        pOccTY, pOccSTLY, pOccChg,
        pAdrTY, pAdrSTLY, pAdrChg,
        pRevparTY, pRevparSTLY, pRevparLY, pRevparChg,
        pOccCon, pAdrCon, pDrv,
        mOccTY, mOccSTLY, mOccChg,
        mAdrTY, mAdrSTLY, mAdrChg,
        mRevparTY, mRevparSTLY, mRevparLY, mRevparChg,
        mOccCon, mAdrCon, mDrv, mMult,
        fRental, actRental, actTotal, rentalLY, totalLY
      };
    });
  }, []);

  // Handle file
  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (result) {
        const wb = XLSX.read(result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);
        setData(processData(rawData));
      }
    };
    reader.readAsArrayBuffer(file);
  }, [processData]);

  // Calculate premium and processed data
  const calculateMetrics = useCallback(() => {
    if (data.length === 0) return { processedData: [], metrics: null };

    // Calculate Premium LY
    const monthsWithBothLY = data.filter(r => r.pRevparLY > 0 && r.mRevparLY > 0);
    let calculatedPremium = 0;
    if (monthsWithBothLY.length > 0) {
      const avgPortRevparLY = monthsWithBothLY.reduce((a, r) => a + r.pRevparLY, 0) / monthsWithBothLY.length;
      const avgMktRevparLY = monthsWithBothLY.reduce((a, r) => a + r.mRevparLY, 0) / monthsWithBothLY.length;
      if (avgMktRevparLY > 0) {
        calculatedPremium = (avgPortRevparLY / avgMktRevparLY) - 1;
      }
    }

    const qualityOffset = qualityMode === 'actual' ? calculatedPremium : parseFloat(qualityMode);

    // Calculate Target Revenue
    const calcTarget = (r: MonthData): number | null => {
      const goalMult = 1 + (goalPct / 100);

      if (forecastBase === 'ly') {
        if (r.pRevparLY > 0 && r.mMult) {
          return r.pRevparLY * r.mMult * goalMult * r.days;
        }
        if (r.mRevparLY > 0 && r.mMult) {
          return r.mRevparLY * r.mMult * (1 + calculatedPremium) * goalMult * r.days;
        }
        return null;
      } else {
        if (r.mRevparLY > 0 && r.mMult) {
          return r.mRevparLY * r.mMult * (1 + qualityOffset) * goalMult * r.days;
        }
        return null;
      }
    };

    const processedData = data.map(r => ({
      ...r,
      usingFallback: forecastBase === 'ly' && r.pRevparLY <= 0,
      targetRev: calcTarget(r)
    }));

    const totRentalLY = processedData.reduce((s, r) => s + (r.rentalLY || 0), 0);
    const totTotalLY = processedData.reduce((s, r) => s + (r.totalLY || 0), 0);
    const ratio = totTotalLY > 0 ? (totRentalLY / totTotalLY) * 100 : 0;
    const totTargetRental = processedData.reduce((s, r) => s + (r.targetRev || 0), 0);
    const totTargetTotal = ratio > 0 ? totTargetRental / (ratio / 100) : 0;
    const totActRental = processedData.reduce((s, r) => s + (r.actRental || 0), 0);
    const variance = totTargetRental > 0 ? ((totActRental - totTargetRental) / totTargetRental) * 100 : 0;

    return {
      processedData,
      metrics: {
        totRentalLY,
        totTotalLY,
        ratio,
        totTargetRental,
        totTargetTotal,
        totActRental,
        variance,
        calculatedPremium,
        qualityOffset
      }
    };
  }, [data, goalPct, forecastBase, qualityMode]);

  const { processedData, metrics } = calculateMetrics();

  // Copy table
  const copyTable = useCallback(() => {
    if (!metrics) return;

    let tsv = '';
    const getQualityLabel = () => {
      if (qualityMode === 'actual') {
        const pct = (metrics.calculatedPremium * 100).toFixed(1);
        return metrics.calculatedPremium >= 0 ? `+${pct}%` : `${pct}%`;
      }
      const labels: Record<string, string> = { '0': '0%', '0.125': '+12.5%', '0.25': '+25%', '0.4': '+40%' };
      return labels[qualityMode] || '0%';
    };

    if (currentTab === 'summary') {
      const multLabel = forecastBase === 'ly' ? 'Mkt Mult' : 'Premium';
      const goalLabel = goalPct > 0 ? ` +${goalPct}%` : '';
      tsv = `Month\tRevPAR TY\tPort Driver\tMkt Driver\t${multLabel}\tTarget Rev${goalLabel}\tActual Rev\tVariance\n`;
      processedData.forEach(r => {
        const multVal = forecastBase === 'ly' ? (r.mMult ? r.mMult.toFixed(3) : '') : getQualityLabel();
        let variance = '';
        if (r.targetRev && r.actRental > 0) {
          const rowVar = ((r.actRental - r.targetRev) / r.targetRev) * 100;
          variance = rowVar.toFixed(1) + '%';
        }
        tsv += `${r.ms}\t${r.pRevparTY > 0 ? r.pRevparTY.toFixed(0) : ''}\t${r.pDrv || ''}\t${r.mDrv || ''}\t${multVal}\t${r.targetRev ? Math.round(r.targetRev) : ''}\t${r.actRental > 0 ? Math.round(r.actRental) : ''}\t${variance}\n`;
      });
      const totT = processedData.reduce((s, r) => s + (r.targetRev || 0), 0);
      const totA = processedData.reduce((s, r) => s + (r.actRental || 0), 0);
      let totVar = '';
      if (totT > 0 && totA > 0) {
        totVar = (((totA - totT) / totT) * 100).toFixed(1) + '%';
      }
      tsv += `TOTAL\t\t\t\t\t${Math.round(totT)}\t${Math.round(totA)}\t${totVar}\n`;
    } else if (currentTab === 'portfolio') {
      tsv = 'Month\tOcc TY\tOcc STLY\tOcc Δ\tADR TY\tADR STLY\tADR Δ\tRevPAR TY\tRevPAR STLY\tRevPAR Δ\tOcc Contrib\tADR Contrib\tDriver\n';
      processedData.forEach(r => {
        tsv += `${r.ms}\t${r.pOccTY > 0 ? r.pOccTY.toFixed(1) : ''}\t${r.pOccSTLY > 0 ? r.pOccSTLY.toFixed(1) : ''}\t${r.pOccChg !== null ? (r.pOccChg * 100).toFixed(1) : ''}\t${r.pAdrTY > 0 ? r.pAdrTY.toFixed(2) : ''}\t${r.pAdrSTLY > 0 ? r.pAdrSTLY.toFixed(2) : ''}\t${r.pAdrChg !== null ? (r.pAdrChg * 100).toFixed(1) : ''}\t${r.pRevparTY > 0 ? r.pRevparTY.toFixed(2) : ''}\t${r.pRevparSTLY > 0 ? r.pRevparSTLY.toFixed(2) : ''}\t${r.pRevparChg !== null ? (r.pRevparChg * 100).toFixed(1) : ''}\t${r.pOccCon !== null ? r.pOccCon.toFixed(2) : ''}\t${r.pAdrCon !== null ? r.pAdrCon.toFixed(2) : ''}\t${r.pDrv || ''}\n`;
      });
    } else if (currentTab === 'market') {
      tsv = 'Month\tOcc TY\tOcc STLY\tOcc Δ\tADR TY\tADR STLY\tADR Δ\tRevPAR TY\tRevPAR STLY\tRevPAR Δ\tOcc Contrib\tADR Contrib\tDriver\tMultiplier\n';
      processedData.forEach(r => {
        tsv += `${r.ms}\t${r.mOccTY > 0 ? r.mOccTY.toFixed(1) : ''}\t${r.mOccSTLY > 0 ? r.mOccSTLY.toFixed(1) : ''}\t${r.mOccChg !== null ? (r.mOccChg * 100).toFixed(1) : ''}\t${r.mAdrTY > 0 ? r.mAdrTY.toFixed(2) : ''}\t${r.mAdrSTLY > 0 ? r.mAdrSTLY.toFixed(2) : ''}\t${r.mAdrChg !== null ? (r.mAdrChg * 100).toFixed(1) : ''}\t${r.mRevparTY > 0 ? r.mRevparTY.toFixed(2) : ''}\t${r.mRevparSTLY > 0 ? r.mRevparSTLY.toFixed(2) : ''}\t${r.mRevparChg !== null ? (r.mRevparChg * 100).toFixed(1) : ''}\t${r.mOccCon !== null ? r.mOccCon.toFixed(2) : ''}\t${r.mAdrCon !== null ? r.mAdrCon.toFixed(2) : ''}\t${r.mDrv || ''}\t${r.mMult ? r.mMult.toFixed(3) : ''}\n`;
      });
    }

    navigator.clipboard.writeText(tsv).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = tsv;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }, [currentTab, forecastBase, goalPct, metrics, processedData, qualityMode]);

  // Clear data
  const clearData = () => {
    setData([]);
    setFileName('');
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // Helpers
  const formatCurrency = (v: number | null | undefined): string =>
    v !== null && v !== undefined ? '$' + Math.round(v).toLocaleString() : '—';

  const formatMult = (v: number | null): string =>
    v !== null ? v.toFixed(3) + 'x' : '—';

  const formatChange = (v: number | null): JSX.Element =>
    v !== null ? (
      <span className={v >= 0 ? 'text-green-600' : 'text-red-600'}>
        {(v * 100).toFixed(1)}%
      </span>
    ) : <span>—</span>;

  const renderDriver = (d: string | null): JSX.Element => {
    if (!d) return <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-400">—</span>;
    const colors = d === 'OCC' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800';
    return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${colors}`}>{d}</span>;
  };

  const getQualityLabel = (): string => {
    if (!metrics) return '0%';
    if (qualityMode === 'actual') {
      const pct = (metrics.calculatedPremium * 100).toFixed(1);
      return (metrics.calculatedPremium >= 0 ? '+' : '') + pct + '%';
    }
    const labels: Record<string, string> = { '0': '0%', '0.125': '+12.5%', '0.25': '+25%', '0.4': '+40%' };
    return labels[qualityMode] || '0%';
  };

  // Render drop zone if no data
  if (data.length === 0) {
    return (
      <div
        className={`max-w-lg mx-auto mt-20 border-2 border-dashed rounded-2xl p-12 text-center bg-white transition-all cursor-pointer ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <h1 className="text-xl font-semibold text-gray-800 mb-2">📊 RevPAR KPI Calculator</h1>
        <p className="text-gray-500 text-sm mb-4">Drop your metrics report (.xlsx, .csv)</p>
        <button className="px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>
    );
  }

  const hasFallback = processedData.some(r => r.usingFallback && r.targetRev);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold">📊 RevPAR KPI Calculator</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm bg-gray-100 px-3 py-1.5 rounded-md">{fileName}</span>
          <button
            onClick={clearData}
            className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-md text-sm hover:bg-gray-50 hover:text-gray-700"
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {metrics && (
        <div className="mb-5">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Revenue Overview</div>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Rental Revenue LY</div>
              <div className="text-xl font-bold text-cyan-600">{formatCurrency(metrics.totRentalLY)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Revenue LY</div>
              <div className="text-xl font-bold text-green-600">{formatCurrency(metrics.totTotalLY)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Rental / Total Ratio</div>
              <div className="text-xl font-bold text-gray-500">{metrics.ratio.toFixed(1)}%</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Portfolio Premium (LY)</div>
              <div className={`text-xl font-bold ${metrics.calculatedPremium >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(metrics.calculatedPremium >= 0 ? '+' : '') + (metrics.calculatedPremium * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Target Rental Rev</div>
              <div className="text-xl font-bold text-purple-600">{formatCurrency(metrics.totTargetRental)}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Target Total Rev</div>
              <div className="text-xl font-bold text-purple-600">{formatCurrency(metrics.totTargetTotal)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Actual Rental Rev</div>
              <div className="text-xl font-bold text-green-600">{formatCurrency(metrics.totActRental)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Target vs Actual</div>
              <div className={`text-xl font-bold ${metrics.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {metrics.totActRental > 0 ? ((metrics.variance >= 0 ? '+' : '') + metrics.variance.toFixed(1) + '%') : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls Row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {/* Tabs */}
          <div className="flex gap-1 bg-white p-1 rounded-lg border border-gray-200">
            {(['summary', 'portfolio', 'market'] as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => setCurrentTab(tab)}
                className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentTab === tab ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'summary' ? 'Summary' : tab === 'portfolio' ? 'Portfolio Details' : 'Market Details'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Goal Input */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-200">
            <label className="text-sm font-medium text-gray-600">Add&apos;l Goal:</label>
            <input
              type="number"
              value={goalPct}
              onChange={(e) => setGoalPct(parseFloat(e.target.value) || 0)}
              min={0}
              max={100}
              className="w-16 px-2 py-1 border border-gray-200 rounded-md text-center font-semibold focus:outline-none focus:border-purple-500"
            />
            <span className="text-xs text-gray-400">% on top</span>
          </div>

          {/* Forecast Base */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-200">
            <label className="text-sm font-medium text-gray-600">Forecast Base:</label>
            <select
              value={forecastBase}
              onChange={(e) => setForecastBase(e.target.value as ForecastBaseType)}
              className="px-2 py-1 border border-gray-200 rounded-md text-sm font-medium bg-white cursor-pointer focus:outline-none focus:border-blue-500"
            >
              <option value="ly">Portfolio LY (+ Market fallback)</option>
              <option value="market">Market RevPAR only</option>
            </select>
          </div>

          {/* Quality Tier (only show when Market mode) */}
          {forecastBase === 'market' && (
            <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-200">
              <label className="text-sm font-medium text-gray-600">Quality Tier:</label>
              <select
                value={qualityMode}
                onChange={(e) => setQualityMode(e.target.value as QualityModeType)}
                className="px-2 py-1 border border-gray-200 rounded-md text-sm font-medium bg-white cursor-pointer focus:outline-none focus:border-blue-500"
              >
                <option value="actual">Actual Premium</option>
                <option value="0">Medium (0%)</option>
                <option value="0.125">Med-High (+12.5%)</option>
                <option value="0.25">High (+25%)</option>
                <option value="0.4">Luxury+ (+40%)</option>
              </select>
              {metrics && (
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  metrics.calculatedPremium >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>
                  {(metrics.calculatedPremium >= 0 ? '+' : '') + (metrics.calculatedPremium * 100).toFixed(1)}% (LY)
                </span>
              )}
            </div>
          )}

          {/* Copy Button */}
          <button
            onClick={copyTable}
            className={`flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm font-medium transition-colors ${
              copySuccess ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {copySuccess ? '✓ Copied!' : 'Copy Table'}
          </button>
        </div>
      </div>

      {/* Tables */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        {/* Summary Table */}
        {currentTab === 'summary' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Month</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide bg-green-50 text-green-700">RevPAR TY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide bg-green-50 text-green-700">Port Driver</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide bg-blue-50 text-blue-700">Mkt Driver</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide bg-blue-50 text-blue-700">
                  {forecastBase === 'ly' ? 'Mkt Mult' : 'Premium'}
                </th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide bg-purple-50 text-purple-700">
                  Target Rev{goalPct > 0 ? ` +${goalPct}%` : ''}
                </th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase tracking-wide bg-amber-50 text-amber-700">Actual Rev</th>
                <th className="px-2 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Variance</th>
              </tr>
            </thead>
            <tbody>
              {processedData.map((r, i) => {
                const multDisplay = forecastBase === 'ly' ? formatMult(r.mMult) : getQualityLabel();
                const rowVariance = r.targetRev && r.actRental > 0
                  ? ((r.actRental - r.targetRev) / r.targetRev) * 100
                  : null;

                return (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold text-gray-800">{r.ms}</td>
                    <td className="px-2 py-2 text-center text-gray-400">
                      {r.pRevparTY > 0 ? '$' + r.pRevparTY.toFixed(0) : '—'}
                    </td>
                    <td className="px-2 py-2 text-center">{renderDriver(r.pDrv)}</td>
                    <td className="px-2 py-2 text-center">{renderDriver(r.mDrv)}</td>
                    <td className="px-2 py-2 text-center text-blue-600 font-medium">{multDisplay}</td>
                    <td className={`px-2 py-2 text-center text-purple-600 font-semibold ${r.usingFallback ? 'italic' : ''}`}>
                      {formatCurrency(r.targetRev)}{r.usingFallback ? '*' : ''}
                    </td>
                    <td className="px-2 py-2 text-center text-green-600 font-semibold">
                      {r.actRental > 0 ? formatCurrency(r.actRental) : '—'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {rowVariance !== null ? (
                        <span className={rowVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {(rowVariance >= 0 ? '+' : '') + rowVariance.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Total Row */}
              {metrics && (
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                  <td className="px-4 py-2 text-gray-800">TOTAL</td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-center text-purple-600">{formatCurrency(metrics.totTargetRental)}</td>
                  <td className="px-2 py-2 text-center text-green-600">{formatCurrency(metrics.totActRental)}</td>
                  <td className="px-2 py-2 text-center">
                    {metrics.totActRental > 0 ? (
                      <span className={metrics.variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {(metrics.variance >= 0 ? '+' : '') + metrics.variance.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )}
            </tbody>
            {hasFallback && (
              <tfoot>
                <tr>
                  <td colSpan={8} className="px-4 py-2 text-xs text-gray-500 italic">
                    * Using Market RevPAR LY × Mkt Mult × Premium (Portfolio RevPAR LY not available)
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* Portfolio Table */}
        {currentTab === 'portfolio' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase">Month</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ TY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ STLY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ Δ</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR TY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR STLY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR Δ</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">RevPAR TY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">RevPAR STLY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">RevPAR Δ</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ Contrib</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR Contrib</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Driver</th>
              </tr>
            </thead>
            <tbody>
              {processedData.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-semibold text-gray-800">{r.ms}</td>
                  <td className="px-2 py-2 text-center">{r.pOccTY > 0 ? r.pOccTY.toFixed(1) + '%' : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.pOccSTLY > 0 ? r.pOccSTLY.toFixed(1) + '%' : '—'}</td>
                  <td className="px-2 py-2 text-center">{formatChange(r.pOccChg)}</td>
                  <td className="px-2 py-2 text-center">{r.pAdrTY > 0 ? '$' + r.pAdrTY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.pAdrSTLY > 0 ? '$' + r.pAdrSTLY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{formatChange(r.pAdrChg)}</td>
                  <td className="px-2 py-2 text-center">{r.pRevparTY > 0 ? '$' + r.pRevparTY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.pRevparSTLY > 0 ? '$' + r.pRevparSTLY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{formatChange(r.pRevparChg)}</td>
                  <td className="px-2 py-2 text-center">{r.pOccCon !== null ? '$' + r.pOccCon.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.pAdrCon !== null ? '$' + r.pAdrCon.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{renderDriver(r.pDrv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Market Table */}
        {currentTab === 'market' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase">Month</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ TY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ STLY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ Δ</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR TY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR STLY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR Δ</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">RevPAR TY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">RevPAR STLY</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">RevPAR Δ</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Occ Contrib</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">ADR Contrib</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Driver</th>
                <th className="px-2 py-2.5 font-semibold text-xs uppercase">Multiplier</th>
              </tr>
            </thead>
            <tbody>
              {processedData.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-semibold text-gray-800">{r.ms}</td>
                  <td className="px-2 py-2 text-center">{r.mOccTY > 0 ? r.mOccTY.toFixed(1) + '%' : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.mOccSTLY > 0 ? r.mOccSTLY.toFixed(1) + '%' : '—'}</td>
                  <td className="px-2 py-2 text-center">{formatChange(r.mOccChg)}</td>
                  <td className="px-2 py-2 text-center">{r.mAdrTY > 0 ? '$' + r.mAdrTY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.mAdrSTLY > 0 ? '$' + r.mAdrSTLY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{formatChange(r.mAdrChg)}</td>
                  <td className="px-2 py-2 text-center">{r.mRevparTY > 0 ? '$' + r.mRevparTY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.mRevparSTLY > 0 ? '$' + r.mRevparSTLY.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{formatChange(r.mRevparChg)}</td>
                  <td className="px-2 py-2 text-center">{r.mOccCon !== null ? '$' + r.mOccCon.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{r.mAdrCon !== null ? '$' + r.mAdrCon.toFixed(2) : '—'}</td>
                  <td className="px-2 py-2 text-center">{renderDriver(r.mDrv)}</td>
                  <td className="px-2 py-2 text-center text-blue-600 font-medium">{formatMult(r.mMult)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RevparAnalytics;
