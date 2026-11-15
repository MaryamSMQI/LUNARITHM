import React, { useMemo, useState } from 'react';
import { CalendarClock, GitCompare, Plus, X } from 'lucide-react';
import { EvaluatedSite, LunarSite } from '../types/lunar';
import { simulateMissionWindow } from '../engine/lunarEphemeris';
import { DataBadge } from './DataBadge';

interface SiteComparisonViewProps {
  allSites: LunarSite[];
  evaluatedSites: EvaluatedSite[];
  baseTimestampMs: number;
  windowHours: number;
  selectedSiteId: string;
  onSelectPrimarySite: (siteId: string) => void;
}

const SERIES_COLORS = ['#F5B83D', '#c9e8ff', '#b9f0d7', '#b8baff'];

export const SiteComparisonView: React.FC<SiteComparisonViewProps> = ({
  allSites,
  evaluatedSites,
  baseTimestampMs,
  windowHours,
  selectedSiteId,
  onSelectPrimarySite,
}) => {
  const [compareMode, setCompareMode] = useState<'sites' | 'dates'>('sites');
  const [comparedIds, setComparedIds] = useState<string[]>(() => {
    const initial = [selectedSiteId, 'malapert-massif', 'mons-mouton-plateau', 'connecting-ridge', 'haworth'];
    return Array.from(new Set(initial)).slice(0, 4);
  });

  // Ensure valid site ids
  const activeIds = useMemo(() => {
    const valid = comparedIds.filter((id) => allSites.some((s) => s.id === id));
    return valid.length > 0 ? valid : [allSites[0].id];
  }, [comparedIds, allSites]);

  const siteScenarios = useMemo(() => {
    return activeIds.map((id, idx) => {
      const ev = evaluatedSites.find((e) => e.site.id === id) ?? evaluatedSites[0];
      return {
        key: ev.site.id,
        label: ev.site.name,
        sublabel: `${Math.abs(ev.site.latDeg).toFixed(2)}°${ev.site.latDeg < 0 ? 'S' : 'N'}, ${Math.abs(ev.site.lonDeg).toFixed(1)}°${ev.site.lonDeg < 0 ? 'W' : 'E'}`,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        site: ev.site,
        metrics: ev.metrics,
        evaluated: ev,
      };
    });
  }, [activeIds, evaluatedSites]);

  const dateShiftOffsets = [
    { label: 'Nominal Epoch', days: 0 },
    { label: '+7 Days (Slip)', days: 7 },
    { label: '+14 Days (Half-Day)', days: 14 },
    { label: '+30 Days (Next Month)', days: 30 },
  ];

  const primarySite = allSites.find((s) => s.id === selectedSiteId) ?? allSites[0];

  const dateScenarios = useMemo(() => {
    return dateShiftOffsets.map((d, idx) => {
      const ts = baseTimestampMs + d.days * 86400000;
      const metrics = simulateMissionWindow(primarySite, ts, windowHours, windowHours > 720 ? 4 : 2);
      return {
        key: `date-${d.days}`,
        label: d.label,
        sublabel: new Date(ts).toISOString().slice(0, 10),
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        site: primarySite,
        metrics,
        evaluated: null as EvaluatedSite | null,
      };
    });
  }, [primarySite, baseTimestampMs, windowHours]);

  const scenarios = compareMode === 'sites' ? siteScenarios : dateScenarios;

  // Overlaid Solar Elevation Chart geometry
  const W = 800;
  const H = 220;
  const PAD_L = 44;
  const PAD_R = 18;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const allElevs = scenarios.flatMap((sc) =>
    sc.metrics.samples.map((s) => s.sunElevationAboveTerrainDeg)
  );
  const maxEl = Math.max(10, Math.ceil(Math.max(...allElevs) / 5) * 5);
  const minEl = Math.min(-10, Math.floor(Math.min(...allElevs) / 5) * 5);

  const xOf = (h: number) => PAD_L + (h / windowHours) * plotW;
  const yOf = (el: number) => {
    const norm = (el - minEl) / Math.max(1, maxEl - minEl);
    return PAD_T + plotH * (1 - Math.max(0, Math.min(1, norm)));
  };

  const toggleSiteInComparison = (id: string) => {
    setComparedIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      if (prev.length >= 4) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-4 animate-panel-in">
      {/* Header & Mode Switch */}
      <div className="lunar-panel rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">
            Rapid Scenario Comparison Workspace
          </h2>
          <p className="text-xs text-[#7392B5]">
            Compare multiple candidate landing sites side-by-side or evaluate launch-date schedule slips at a single site.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0c0c16] border border-[#272d47] rounded-md">
          <button
            type="button"
            onClick={() => setCompareMode('sites')}
            className={`lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
              compareMode === 'sites' ? 'bg-[#c9e8ff] text-[#0c0c16]' : 'text-[#7392B5] hover:text-white'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            Compare Sites (up to 4)
          </button>
          <button
            type="button"
            onClick={() => setCompareMode('dates')}
            className={`lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
              compareMode === 'dates' ? 'bg-[#c9e8ff] text-[#0c0c16]' : 'text-[#7392B5] hover:text-white'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Launch Date Slip ({primarySite.name})
          </button>
        </div>
      </div>

      {/* Candidate Picker (in Sites mode) */}
      {compareMode === 'sites' ? (
        <div className="lunar-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-slate-200">
              Active Comparison Slots ({activeIds.length}/4 selected)
            </span>
            <span className="text-xs text-[#7392B5]">Click any site below to add or remove from comparison</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allSites.map((s) => {
              const activeIdx = activeIds.indexOf(s.id);
              const isSelected = activeIdx >= 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSiteInComparison(s.id)}
                  className={`lunar-btn inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-[#1a1d30] border-[#7392B5] text-white'
                      : 'bg-[#0c0c16] border-[#272d47] text-[#7392B5] hover:text-white hover:border-[#7392B5]'
                  }`}
                >
                  {isSelected ? (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: SERIES_COLORS[activeIdx % SERIES_COLORS.length] }}
                    />
                  ) : (
                    <Plus className="w-3 h-3 text-[#7392B5]" />
                  )}
                  <span>{s.name}</span>
                  {isSelected && activeIds.length > 1 && <X className="w-3 h-3 text-[#7392B5]" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="lunar-panel rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-200">
            Evaluating launch schedule delays for <span className="font-semibold text-white">{primarySite.name}</span> starting{' '}
            <span className="font-mono text-[#c9e8ff]">{new Date(baseTimestampMs).toISOString().slice(0, 10)}</span>
          </div>
          <select
            value={selectedSiteId}
            onChange={(e) => onSelectPrimarySite(e.target.value)}
            aria-label="Select site for launch date slip comparison"
            className="bg-[#0c0c16] border border-[#272d47] text-xs text-slate-100 rounded px-3 py-1.5 focus:outline-none focus:border-[#c9e8ff]"
          >
            {allSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({Math.abs(s.latDeg).toFixed(1)}°{s.latDeg < 0 ? 'S' : 'N'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Side-by-Side KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {scenarios.map((sc) => (
          <div
            key={sc.key}
            className="lunar-panel lunar-card-interactive rounded-lg p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: sc.color }}
                  />
                  <h3 className="text-sm font-semibold text-white truncate">{sc.label}</h3>
                </div>
                {sc.evaluated && (
                  <span
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded shrink-0 ${
                      sc.evaluated.rank
                        ? 'text-[#b9f0d7] bg-[#b9f0d7]/10'
                        : 'text-[#7392B5] bg-[#0c0c16] border border-[#272d47]'
                    }`}
                  >
                    {sc.evaluated.rank ? `Rank #${sc.evaluated.rank}` : 'Not eligible'}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-xs text-[#7392B5] font-mono">{sc.sublabel}</p>
                <DataBadge dataClass={sc.site.horizonDataClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#272d47] font-mono text-xs">
              <div>
                <div className="text-[11px] text-[#7392B5]">Sunlight (Terrain)</div>
                <div className="text-base font-semibold text-[#F5B83D]">
                  {sc.metrics.sunlightPercent.toFixed(1)}%
                </div>
                <div className="text-[10px] text-[#7392B5]">
                  Smooth {sc.metrics.sunlightPercentSmoothSphere.toFixed(0)}% · {sc.metrics.sunlightHours.toFixed(0)}h
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7392B5]">Earth DTE</div>
                <div className="text-base font-semibold text-[#c9e8ff]">
                  {sc.metrics.earthVisibilityPercent.toFixed(1)}%
                </div>
                <div className="text-[10px] text-[#7392B5]">
                  Smooth {sc.metrics.earthVisibilityPercentSmoothSphere.toFixed(0)}% · {sc.metrics.earthVisibilityHours.toFixed(0)}h
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7392B5]">Max Darkness</div>
                <div className="text-sm font-semibold text-white">
                  {sc.metrics.maxContinuousDarkHours} h
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7392B5]">Mean / Peak Sun</div>
                <div className="text-sm font-semibold text-white">
                  {sc.metrics.meanSolarElevationDeg.toFixed(1)}° / {sc.metrics.peakSolarElevationDeg.toFixed(1)}°
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7392B5]">Dual Power+DTE</div>
                <div className="text-sm font-semibold text-[#b9f0d7]">
                  {sc.metrics.simultaneousPowerAndCommsPercent.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7392B5]">Dark Drops / Slope</div>
                <div className="text-sm font-semibold text-white">
                  {sc.metrics.darkInterruptions} · {sc.site.slopeDeg !== null ? `${sc.site.slopeDeg.toFixed(1)}°` : 'MISSING'}
                </div>
              </div>
            </div>

            {sc.evaluated && (
              <div className="pt-2 border-t border-[#272d47] text-xs text-[#7392B5] leading-relaxed">
                {sc.evaluated.tradeOffNote}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Overlaid Solar Elevation Curve Comparison */}
      <div className="bg-[#131524] border border-[#272d47] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Overlaid Solar Elevation Above Local Terrain ({Math.round(windowHours / 24)}-Day Window)
            </h3>
            <p className="text-xs text-[#7392B5]">
              Curves above 0° indicate active sunlight; dips below 0° show crater-rim shadowing or lunar night.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {scenarios.map((sc) => (
              <span key={sc.key} className="flex items-center gap-1.5 text-slate-200">
                <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: sc.color }} />
                {sc.label}
              </span>
            ))}
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="#0c0c16" stroke="#272d47" />
          <line x1={PAD_L} y1={yOf(0)} x2={W - PAD_R} y2={yOf(0)} stroke="#7392B5" strokeDasharray="4 4" strokeOpacity="0.65" />
          <text x={PAD_L - 6} y={yOf(0) + 3} textAnchor="end" className="fill-[#7392B5] text-[10px] font-mono">
            0°
          </text>
          <text x={PAD_L - 6} y={PAD_T + 10} textAnchor="end" className="fill-[#7392B5] text-[10px] font-mono">
            +{maxEl}°
          </text>
          <text x={PAD_L - 6} y={PAD_T + plotH - 2} textAnchor="end" className="fill-[#7392B5] text-[10px] font-mono">
            {minEl}°
          </text>

          {[0, 7, 14, 21, 28].filter((d) => d * 24 <= windowHours).map((d) => (
            <g key={d}>
              <line x1={xOf(d * 24)} y1={PAD_T} x2={xOf(d * 24)} y2={PAD_T + plotH} stroke="#1a1d30" />
              <text x={xOf(d * 24)} y={H - 8} textAnchor="middle" className="fill-[#7392B5] text-[10px] font-mono">
                Day {d}
              </text>
            </g>
          ))}

          {scenarios.map((sc) => {
            const pathD = sc.metrics.samples
              .map(
                (s, i) =>
                  `${i === 0 ? 'M' : 'L'} ${xOf(s.offsetHours).toFixed(1)},${yOf(s.sunElevationAboveTerrainDeg).toFixed(1)}`
              )
              .join(' ');
            return <path key={sc.key} d={pathD} fill="none" stroke={sc.color} strokeWidth="1.8" />;
          })}
        </svg>
      </div>
    </div>
  );
};
