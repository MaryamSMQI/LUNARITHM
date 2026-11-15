import React, { useMemo, useState } from 'react';
import { BatteryCharging, Link2, Network, Radio, Thermometer } from 'lucide-react';
import {
  EnergyModelParams,
  EvaluatedSite,
  LinkBudgetParams,
  LunarSite,
  ThermalEstimateParams,
} from '../types/lunar';
import {
  computeDteLinkBudget,
  computeSimpleThermalEstimate,
  evaluateSitePairs,
  simulateSolarEnergyAndBattery,
} from '../engine/physicsModels';

interface PhysicsLabPanelProps {
  activeEval: EvaluatedSite;
  allEvaluated: EvaluatedSite[];
  allSites: LunarSite[];
  relayBoostPct: number;
  onChangeRelayBoostPct: (pct: number) => void;
}

export const PhysicsLabPanel: React.FC<PhysicsLabPanelProps> = ({
  activeEval,
  allEvaluated,
  allSites,
  relayBoostPct,
  onChangeRelayBoostPct,
}) => {
  const [energyParams, setEnergyParams] = useState<EnergyModelParams>({
    panelAreaM2: 3.5,
    cellEfficiencyPct: 28,
    dustLossPct: 6,
    degradationPct: 3,
    conversionEffPct: 90,
    continuousLoadW: 180,
    batteryCapacityWh: 18000,
    panelOrientation: 'vertical_tracking',
  });

  const [linkParams, setLinkParams] = useState<LinkBudgetParams>({
    frequencyGhz: 8.4,
    txPowerDbw: 11,
    landerAntennaGainDbi: 24,
    earthDishGainDbi: 68,
    systemNoiseTempK: 135,
    implementationLossDb: 1.5,
    lowElevationPenaltyDb: 2.5,
    dataRateKbps: 512,
    requiredEbN0Db: 4.5,
    relayEnabled: relayBoostPct > 0,
    relayCoveragePct: relayBoostPct > 0 ? relayBoostPct : 65,
  });

  const [thermalParams, setThermalParams] = useState<ThermalEstimateParams>({
    albedo: 0.12,
    emissivity: 0.95,
    solarConstantWm2: 1361,
    nightFloorTempK: 100,
    survivalMinTempK: 150,
  });

  const [maxPairSepKm, setMaxPairSepKm] = useState<number>(20);
  const [includeCustomPairs, setIncludeCustomPairs] = useState<boolean>(false);

  const stepHours =
    activeEval.metrics.samples.length > 1
      ? activeEval.metrics.samples[1].offsetHours - activeEval.metrics.samples[0].offsetHours
      : 2;

  const energyResult = useMemo(() => {
    return simulateSolarEnergyAndBattery(
      activeEval.metrics.samples,
      stepHours,
      energyParams,
      activeEval.activeMaxDarkHours
    );
  }, [activeEval.metrics.samples, stepHours, energyParams, activeEval.activeMaxDarkHours]);

  const linkResult = useMemo(() => {
    return computeDteLinkBudget(
      activeEval.activeEarthPct,
      activeEval.metrics.meanEarthDistanceKm,
      {
        ...linkParams,
        relayEnabled: relayBoostPct > 0,
        relayCoveragePct: relayBoostPct,
      },
      activeEval.metrics.samples
    );
  }, [activeEval.activeEarthPct, activeEval.metrics.meanEarthDistanceKm, activeEval.metrics.samples, linkParams, relayBoostPct]);

  const thermalResult = useMemo(() => {
    return computeSimpleThermalEstimate(activeEval.metrics.samples, stepHours, thermalParams);
  }, [activeEval.metrics.samples, stepHours, thermalParams]);

  const sitePairs = useMemo(() => {
    const map: Record<string, typeof activeEval.metrics.samples> = {};
    allEvaluated.forEach((ev) => {
      map[ev.site.id] = ev.metrics.samples;
    });
    return evaluateSitePairs(allSites, map, stepHours, maxPairSepKm, includeCustomPairs).slice(0, 6);
  }, [allSites, allEvaluated, stepHours, maxPairSepKm, includeCustomPairs]);

  // SoC curve SVG with shaded dark streaks and day markers
  const W = 540;
  const H = 148;
  const PAD = 34;
  const plotW = W - PAD - 12;
  const plotH = H - 36;
  const totalS = Math.max(1, energyResult.socSamples.length - 1);
  const totalDays = Math.round(activeEval.metrics.durationHours / 24);

  const socPath = energyResult.socSamples
    .map((s, idx) => {
      const x = PAD + (idx / totalS) * plotW;
      const y = H - 22 - (s.socPct / 100) * plotH;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Thermal curve SVG
  const TW = 540;
  const TH = 110;
  const TPAD = 34;
  const tMinPlot = 50;
  const tMaxPlot = 400;
  const thermalPath = thermalResult.samples
    .map((s, idx) => {
      const x = TPAD + (idx / Math.max(1, thermalResult.samples.length - 1)) * (TW - TPAD - 12);
      const frac = Math.max(0, Math.min(1, (s.tempK - tMinPlot) / (tMaxPlot - tMinPlot)));
      const y = TH - 20 - frac * (TH - 32);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const survFrac = Math.max(0, Math.min(1, (thermalParams.survivalMinTempK - tMinPlot) / (tMaxPlot - tMinPlot)));
  const survY = TH - 20 - survFrac * (TH - 32);

  return (
    <div className="space-y-4 animate-panel-in">
      {/* 1. Smooth-Sphere (No Dip vs +Dip) vs Terrain-Masked Baseline */}
      <div className="lunar-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Terrain Impact: 3-Baseline Comparison ({activeEval.site.name})
            </h3>
            <p className="text-xs text-[#7392B5]">
              Separates analytical smooth sphere (no dip), airless sphere horizon dip (dip ≈ −√(2h/R)), and local horizon mask occlusion.
            </p>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-[#272d47] bg-[#0c0c16] text-[#b8baff]">
            Mask Class: {activeEval.site.horizonDataClass}
          </span>
        </div>

        {activeEval.site.horizonDataClass === 'SYNTHETIC' && (
          <div className="px-3 py-2 rounded bg-[#b8baff]/10 border border-[#b8baff]/30 text-[11px] text-[#b8baff]">
            Uses SYNTHETIC horizon — illustrative until real LOLA-derived horizons are imported in Data &amp; Reports.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
          <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded space-y-1">
            <div className="text-[#7392B5] text-[11px]">Sunlight Availability (3 Baselines)</div>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-400">No Dip:</span>
              <span className="text-slate-200">{activeEval.metrics.sunlightPercentSmoothNoDip.toFixed(1)}%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[#c9e8ff]">Smooth (+Dip):</span>
              <span className="text-[#c9e8ff] font-semibold">{activeEval.metrics.sunlightPercentSmoothSphere.toFixed(1)}%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[#F5B83D]">With Terrain:</span>
              <span className="text-[#F5B83D] font-bold">{activeEval.metrics.sunlightPercent.toFixed(1)}%</span>
            </div>
          </div>

          <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded space-y-1">
            <div className="text-[#7392B5] text-[11px]">Earth DTE Visibility</div>
            <div className="flex items-baseline justify-between">
              <span className="text-[#c9e8ff]">Smooth (+Dip):</span>
              <span className="text-slate-200">{activeEval.metrics.earthVisibilityPercentSmoothSphere.toFixed(1)}%</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[#b9f0d7]">With Terrain:</span>
              <span className="text-[#b9f0d7] font-bold">{activeEval.metrics.earthVisibilityPercent.toFixed(1)}%</span>
            </div>
            <div className="text-[11px] text-[#7392B5] pt-0.5">
              Terrain delta:{' '}
              {(activeEval.metrics.earthVisibilityPercent - activeEval.metrics.earthVisibilityPercentSmoothSphere).toFixed(1)}%
            </div>
          </div>

          <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded space-y-1">
            <div className="text-[#7392B5] text-[11px]">Max Continuous Darkness</div>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-300">Smooth (+Dip):</span>
              <span className="text-slate-200">{activeEval.metrics.maxContinuousDarkHoursSmoothSphere}h</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-white">With Terrain:</span>
              <span className="text-white font-bold">{activeEval.metrics.maxContinuousDarkHours}h</span>
            </div>
            <div className="text-[11px] text-[#7392B5] pt-0.5">
              Dark interruptions: {activeEval.metrics.darkInterruptions}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Solar Energy & Battery SoC + Link Budget */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Solar Energy & Battery SoC */}
        <div className="xl:col-span-7 lunar-panel rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-[#b9f0d7]" />
              <h3 className="text-sm font-semibold text-white">
                Simplified Solar Power &amp; Battery SoC Simulation
              </h3>
            </div>
            <span
              className={`font-mono text-xs font-semibold ${
                energyResult.survivesLongestNight ? 'text-[#b9f0d7]' : 'text-[#F25F5C]'
              }`}
            >
              {energyResult.survivesLongestNight ? 'PASS: Survives Longest Night' : 'FAIL: Battery Depletes'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="sm:col-span-1">
              <label className="text-[11px] text-[#7392B5]">Orientation</label>
              <select
                value={energyParams.panelOrientation}
                onChange={(e) =>
                  setEnergyParams({
                    ...energyParams,
                    panelOrientation: e.target.value as EnergyModelParams['panelOrientation'],
                  })
                }
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-1.5 py-1 text-[11px] text-slate-100"
              >
                <option value="vertical_tracking">Vertical tracking</option>
                <option value="horizontal_fixed">Horizontal fixed</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Panel Area (m²)</label>
              <input
                type="number"
                step="0.5"
                min={0.5}
                max={50}
                value={energyParams.panelAreaM2}
                onChange={(e) => setEnergyParams({ ...energyParams, panelAreaM2: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Dust Loss (%)</label>
              <input
                type="number"
                step="1"
                min={0}
                max={40}
                value={energyParams.dustLossPct}
                onChange={(e) => setEnergyParams({ ...energyParams, dustLossPct: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Load Power (W)</label>
              <input
                type="number"
                step="20"
                min={20}
                max={5000}
                value={energyParams.continuousLoadW}
                onChange={(e) => setEnergyParams({ ...energyParams, continuousLoadW: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Battery (kWh)</label>
              <input
                type="number"
                step="2"
                min={1}
                max={200}
                value={energyParams.batteryCapacityWh / 1000}
                onChange={(e) =>
                  setEnergyParams({ ...energyParams, batteryCapacityWh: Number(e.target.value) * 1000 })
                }
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0c0c16] border border-[#272d47] rounded">
            {/* Shaded darkness intervals */}
            {energyResult.socSamples.map((s, idx) => {
              if (s.sunVisible) return null;
              const x = PAD + (idx / totalS) * plotW;
              const w = Math.max(1.5, plotW / totalS);
              return <rect key={idx} x={x} y={14} width={w} height={plotH} fill="#1a1d30" fillOpacity={0.75} />;
            })}

            <line x1={PAD} y1={H - 22} x2={W - 12} y2={H - 22} stroke="#272d47" />
            <line x1={PAD} y1={14 + plotH / 2} x2={W - 12} y2={14 + plotH / 2} stroke="#272d47" strokeDasharray="3 3" />
            <text x={PAD - 4} y={20} textAnchor="end" className="fill-[#7392B5] text-[9px] font-mono">100%</text>
            <text x={PAD - 4} y={17 + plotH / 2} textAnchor="end" className="fill-[#7392B5] text-[9px] font-mono">50%</text>
            <text x={PAD - 4} y={H - 22} textAnchor="end" className="fill-[#7392B5] text-[9px] font-mono">0%</text>

            <text x={PAD} y={H - 7} textAnchor="start" className="fill-[#7392B5] text-[9px] font-mono">Day 0</text>
            <text x={PAD + plotW / 2} y={H - 7} textAnchor="middle" className="fill-[#7392B5] text-[9px] font-mono">
              Day {Math.round(totalDays / 2)} (Shaded = Night/Dark)
            </text>
            <text x={W - 12} y={H - 7} textAnchor="end" className="fill-[#7392B5] text-[9px] font-mono">
              Day {totalDays}
            </text>

            <path
              d={socPath}
              fill="none"
              stroke={energyResult.survivesLongestNight ? '#b9f0d7' : '#F25F5C'}
              strokeWidth="1.9"
            />
          </svg>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs pt-1">
            <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
              <div className="text-[10px] text-[#7392B5]">Mean Array Power</div>
              <div className="text-sm font-bold text-[#F5B83D]">{energyResult.meanPowerW} W</div>
            </div>
            <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
              <div className="text-[10px] text-[#7392B5]">Min SoC (Init {energyResult.initialSocPct}%)</div>
              <div className="text-sm font-bold text-white">{energyResult.minBatterySocPct}%</div>
            </div>
            <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
              <div className="text-[10px] text-[#7392B5]">Depletion Time</div>
              <div className={`text-sm font-bold ${energyResult.hoursUntilDepletion === null ? 'text-[#b9f0d7]' : 'text-[#F25F5C]'}`}>
                {energyResult.hoursUntilDepletion === null ? 'Never' : `T+${energyResult.hoursUntilDepletion}h`}
              </div>
            </div>
            <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
              <div className="text-[10px] text-[#7392B5]">Min Battery Needed</div>
              <div className="text-sm font-bold text-[#c9e8ff]">{energyResult.requiredBatteryKwhForNight} kWh</div>
            </div>
          </div>
        </div>

        {/* Simplified Link Budget & Optional Relay Toggle */}
        <div className="xl:col-span-5 lunar-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#c9e8ff]" />
              <h3 className="text-sm font-semibold text-white">Simplified DTE Link Budget</h3>
            </div>
            <span className={`font-mono text-xs ${linkResult.linkMarginDb >= 3 ? 'text-[#b9f0d7]' : 'text-[#F5B83D]'}`}>
              Margin {linkResult.linkMarginDb >= 0 ? '+' : ''}
              {linkResult.linkMarginDb} dB
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <label className="text-[11px] text-[#7392B5]">TX Power (dBW)</label>
              <input
                type="number"
                value={linkParams.txPowerDbw}
                onChange={(e) => setLinkParams({ ...linkParams, txPowerDbw: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Data Rate (kbps)</label>
              <input
                type="number"
                min={10}
                step={64}
                value={linkParams.dataRateKbps}
                onChange={(e) => setLinkParams({ ...linkParams, dataRateKbps: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Dish Gain (DSN 34m)</label>
              <input
                type="number"
                min={30}
                max={80}
                value={linkParams.earthDishGainDbi}
                onChange={(e) => setLinkParams({ ...linkParams, earthDishGainDbi: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Impl. Loss (dB)</label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={10}
                value={linkParams.implementationLossDb}
                onChange={(e) => setLinkParams({ ...linkParams, implementationLossDb: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#7392B5]">Low-El Penalty (&lt;5°)</label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={12}
                value={linkParams.lowElevationPenaltyDb}
                onChange={(e) => setLinkParams({ ...linkParams, lowElevationPenaltyDb: Number(e.target.value) })}
                className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-1.5 font-mono text-xs bg-[#0c0c16] border border-[#272d47] rounded p-3">
            <div className="flex justify-between">
              <span className="text-[#7392B5]">Earth–Moon Range</span>
              <span className="text-slate-200">
                {linkResult.minDistanceKm.toLocaleString()}–{linkResult.maxDistanceKm.toLocaleString()} km (mean {linkResult.meanDistanceKm.toLocaleString()})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7392B5]">Free-Space Path Loss ({linkParams.frequencyGhz} GHz)</span>
              <span className="text-slate-200">{linkResult.freeSpacePathLossDb} dB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7392B5]">Achieved Eb/N0 (Req {linkParams.requiredEbN0Db} dB)</span>
              <span className="text-[#c9e8ff]">{linkResult.achievedEbN0Db} dB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7392B5]">Link Available % (Margin ≥ 3 dB)</span>
              <span className="text-[#b9f0d7] font-bold">{linkResult.linkAvailablePct}%</span>
            </div>
          </div>

          {/* Optional Relay Satellite Simulation */}
          <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={relayBoostPct > 0}
                  onChange={(e) => onChangeRelayBoostPct(e.target.checked ? 65 : 0)}
                  className="accent-[#c9e8ff]"
                />
                <span>Assume Lunar Relay Satellite</span>
              </label>
              <span className="font-mono text-[#b8baff]">
                {relayBoostPct > 0 ? `+${relayBoostPct}% relay pass` : 'Off (Pure DTE)'}
              </span>
            </div>
            {relayBoostPct > 0 && (
              <input
                type="range"
                min={20}
                max={95}
                step={5}
                value={relayBoostPct}
                onChange={(e) => onChangeRelayBoostPct(Number(e.target.value))}
                className="lunar-slider w-full"
              />
            )}
            <p className="text-[11px] text-[#7392B5]">
              Geometric Earth visibility ≠ guaranteed communication; low-elevation multipath &amp; grazing penalties further restrict RF links.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Simple Radiative Surface Thermal Estimate (ESTIMATED) */}
      <div className="lunar-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-[#F5B83D]" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                Simple Radiative Equilibrium Surface Thermal Estimate
              </h3>
              <p className="text-xs text-[#7392B5]">
                Stefan-Boltzmann sunlit equilibrium combined with an explicit assumed lunar night floor (distinct from uningested Diviner DLRE measurements).
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-[#c9e8ff]/35 bg-[#c9e8ff]/10 text-[#c9e8ff]">
            ESTIMATED MODEL
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-[#7392B5]">Albedo</label>
                <input
                  type="number"
                  step="0.02"
                  min={0.05}
                  max={0.4}
                  value={thermalParams.albedo}
                  onChange={(e) => setThermalParams({ ...thermalParams, albedo: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#7392B5]">Emissivity</label>
                <input
                  type="number"
                  step="0.02"
                  min={0.7}
                  max={1.0}
                  value={thermalParams.emissivity}
                  onChange={(e) => setThermalParams({ ...thermalParams, emissivity: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#7392B5]">Assumed night floor (K)</label>
                <input
                  type="number"
                  step="5"
                  min={35}
                  max={140}
                  value={thermalParams.nightFloorTempK}
                  onChange={(e) => setThermalParams({ ...thermalParams, nightFloorTempK: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#7392B5]">Survival Min (K)</label>
                <input
                  type="number"
                  step="10"
                  min={80}
                  max={250}
                  value={thermalParams.survivalMinTempK}
                  onChange={(e) => setThermalParams({ ...thermalParams, survivalMinTempK: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 font-mono text-xs">
              <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
                <div className="text-[10px] text-[#7392B5]">Min K</div>
                <div className="text-sm font-bold text-[#c9e8ff]">{thermalResult.minTempK} K</div>
              </div>
              <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
                <div className="text-[10px] text-[#7392B5]">Max K</div>
                <div className="text-sm font-bold text-[#F5B83D]">{thermalResult.maxTempK} K</div>
              </div>
              <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
                <div className="text-[10px] text-[#7392B5]">Mean K</div>
                <div className="text-sm font-bold text-white">{thermalResult.meanTempK} K</div>
              </div>
              <div className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
                <div className="text-[10px] text-[#7392B5]">&lt; Survival</div>
                <div className="text-sm font-bold text-[#b8baff]">{thermalResult.hoursBelowSurvival}h</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <svg viewBox={`0 0 ${TW} ${TH}`} className="w-full h-auto bg-[#0c0c16] border border-[#272d47] rounded">
              <line x1={TPAD} y1={survY} x2={TW - 12} y2={survY} stroke="#b8baff" strokeDasharray="3 3" strokeOpacity={0.6} />
              <text x={TPAD + 4} y={survY - 4} className="fill-[#b8baff] text-[9px] font-mono">
                Survival threshold ({thermalParams.survivalMinTempK} K)
              </text>
              <text x={TPAD - 4} y={18} textAnchor="end" className="fill-[#7392B5] text-[9px] font-mono">400K</text>
              <text x={TPAD - 4} y={TH - 20} textAnchor="end" className="fill-[#7392B5] text-[9px] font-mono">50K</text>
              <line x1={TPAD} y1={TH - 20} x2={TW - 12} y2={TH - 20} stroke="#272d47" />
              <path d={thermalPath} fill="none" stroke="#F5B83D" strokeWidth="1.8" />
            </svg>
          </div>
        </div>
      </div>

      {/* 4. Site Network / Pair Optimizer */}
      <div className="lunar-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-[#c9e8ff]" />
            <h3 className="text-sm font-semibold text-white">
              Outpost Pair / Network Optimizer (Geometry-Based Union)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-[#7392B5]">
              <span>Max separation (km)</span>
              <input
                type="number"
                min={2}
                max={200}
                step={5}
                value={maxPairSepKm}
                onChange={(e) => setMaxPairSepKm(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-0.5 font-mono text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCustomPairs}
                onChange={(e) => setIncludeCustomPairs(e.target.checked)}
                className="accent-[#c9e8ff]"
              />
              <span>Include custom sites</span>
            </label>
          </div>
        </div>
        <p className="text-xs text-[#7392B5]">
          Evaluates pairs of polar sites whose sunlit intervals complement each other; pairs separated by more than {maxPairSepKm} km are flagged as infeasible for rover/cable linkage.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {sitePairs.map((pair) => (
            <div
              key={`${pair.siteAId}-${pair.siteBId}`}
              className={`p-3 bg-[#0c0c16] border rounded text-xs space-y-1.5 ${
                pair.isFeasibleDistance ? 'border-[#272d47]' : 'border-[#F5B83D]/35'
              }`}
            >
              <div className="flex items-center justify-between gap-2 font-semibold text-slate-100">
                <span className="truncate flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-[#c9e8ff] shrink-0" />
                  {pair.siteAName} + {pair.siteBName}
                </span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    pair.isFeasibleDistance
                      ? 'bg-[#b9f0d7]/15 text-[#b9f0d7]'
                      : 'bg-[#F5B83D]/15 text-[#F5B83D]'
                  }`}
                >
                  {pair.isFeasibleDistance ? 'Feasible Link' : `>${maxPairSepKm} km`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                <span className="text-[#F5B83D]">Union Sun: {pair.combinedSunPercent}%</span>
                <span className="text-[#c9e8ff]">Union DTE: {pair.combinedDtePercent}%</span>
                <span className="text-[#b9f0d7]">All-Dark Max: {pair.maxAllDarkHours}h</span>
                <span className={pair.isFeasibleDistance ? 'text-[#7392B5]' : 'text-[#F5B83D]'}>
                  Dist: {pair.distanceKm} km
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
