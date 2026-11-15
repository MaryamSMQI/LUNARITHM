import React, { useMemo, useState } from 'react';
import { Award, HelpCircle, Microscope, ShieldCheck } from 'lucide-react';
import {
  EvaluatedSite,
  MissionConstraints,
  MissionPriorities,
  StabilitySimulationResult,
  VoiItem,
} from '../types/lunar';
import {
  computeParetoFrontier,
  computeVoiAndUncertainty,
  runStabilitySimulation,
} from '../engine/decisionIntelligence';

interface StabilityAndVoiPanelProps {
  evaluatedSites: EvaluatedSite[];
  priorities: MissionPriorities;
  constraints: MissionConstraints;
  onSelectSite: (siteId: string) => void;
}

export const StabilityAndVoiPanel: React.FC<StabilityAndVoiPanelProps> = ({
  evaluatedSites,
  priorities,
  constraints,
  onSelectSite,
}) => {
  const [seed, setSeed] = useState(2026);
  const [spread, setSpread] = useState(0.45);
  const [paretoX, setParetoX] = useState<'sunlight' | 'earthComms' | 'terrainSafety' | 'scienceIce'>('sunlight');
  const [paretoY, setParetoY] = useState<'sunlight' | 'earthComms' | 'terrainSafety' | 'scienceIce'>('earthComms');

  const stability: StabilitySimulationResult = useMemo(() => {
    return runStabilitySimulation(evaluatedSites, priorities, constraints, seed, 300, spread);
  }, [evaluatedSites, priorities, constraints, seed, spread]);

  const voiItems: VoiItem[] = useMemo(() => {
    return computeVoiAndUncertainty(evaluatedSites, priorities, seed + 2070, 200);
  }, [evaluatedSites, priorities, seed]);

  const pareto = useMemo(() => {
    return computeParetoFrontier(evaluatedSites, paretoX, paretoY);
  }, [evaluatedSites, paretoX, paretoY]);

  const W = 440;
  const H = 260;
  const PAD = 42;

  return (
    <div className="space-y-4 animate-panel-in">
      {/* Robust Recommendation Summary (4 Lenses incl. Minimax Regret) */}
      <div className="lunar-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#b9f0d7]" />
            <h3 className="text-sm font-semibold text-white">
              Decision Stability Engine ({stability.numScenarios} Dirichlet Scenarios · Seed {stability.seed})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2 text-[#7392B5]">
              <span>Spread</span>
              <input
                type="range"
                min={0.15}
                max={0.85}
                step={0.05}
                value={spread}
                onChange={(e) => setSpread(Number(e.target.value))}
                className="lunar-slider w-24"
              />
              <span className="font-mono text-[#c9e8ff]">{Math.round(spread * 100)}%</span>
            </label>
            <button
              type="button"
              onClick={() => setSeed((s) => s + 1)}
              className="lunar-btn px-2.5 py-1 bg-[#0c0c16] border border-[#272d47] rounded font-mono text-[11px] text-[#c9e8ff] hover:border-[#7392B5]"
            >
              Reseed ({seed})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded-md">
            <div className="text-[10px] font-mono text-[#7392B5]">1. BEST NOW (BASELINE)</div>
            <div className="text-sm font-semibold text-white mt-1">{stability.bestNowSiteName ?? 'None'}</div>
            <div className="text-[11px] text-[#7392B5] mt-0.5">Highest weighted score under exact current inputs.</div>
          </div>
          <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded-md">
            <div className="text-[10px] font-mono text-[#7392B5]">2. MOST CONSISTENTLY #1</div>
            <div className="text-sm font-semibold text-[#b9f0d7] mt-1">
              {stability.mostConsistentSiteName ?? 'None'}
            </div>
            <div className="text-[11px] text-[#7392B5] mt-0.5">
              Top #1 frequency across {stability.numScenarios} perturbed weight/limit draws.
            </div>
          </div>
          <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded-md">
            <div className="text-[10px] font-mono text-[#7392B5]">3. STRICT-LIMIT RESILIENT</div>
            <div className="text-sm font-semibold text-[#c9e8ff] mt-1">
              {stability.strictResilientSiteName ?? 'None passes strict limits'}
            </div>
            <div className="text-[11px] text-[#7392B5] mt-0.5">
              {stability.recommendationsAgree
                ? 'All stability lenses agree on the same leader.'
                : 'Lenses diverge—inspect regret & heatmap below.'}
            </div>
          </div>
          <div className="p-3 bg-[#0c0c16] border border-[#b8baff]/35 rounded-md">
            <div className="text-[10px] font-mono text-[#b8baff]">4. MINIMAX REGRET CHOICE</div>
            <div className="text-sm font-semibold text-white mt-1">
              {stability.minimaxRegretSiteName ?? 'None'}{' '}
              {stability.minimaxRegretValue !== null && (
                <span className="font-mono text-xs text-[#b8baff]">({stability.minimaxRegretValue} pts max)</span>
              )}
            </div>
            <div className="text-[11px] text-[#7392B5] mt-0.5">
              {stability.minimaxRegretSiteName && stability.minimaxRegretValue !== null
                ? `Choosing ${stability.minimaxRegretSiteName} keeps you within ${stability.minimaxRegretValue} points of the best choice in every tested scenario.`
                : 'No eligible candidate for minimax regret.'}
            </div>
          </div>
        </div>

        {/* Metrics & Heatmap Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#272d47] text-[11px] font-mono text-[#7392B5]">
                <th className="py-2 pr-3">Candidate Site</th>
                <th
                  className="py-2 px-2"
                  title="Frequency site ranks #1 in perturbed scenarios (consistency, NOT mission success probability)"
                >
                  1st-Place Freq
                </th>
                <th className="py-2 px-2">Top-3 Freq</th>
                <th className="py-2 px-2">Mean Rank</th>
                <th className="py-2 px-2">Eligible %</th>
                <th className="py-2 px-2">Max Regret</th>
                <th className="py-2 px-2">Worst Scenario</th>
                {stability.namedScenarios.map((sc) => (
                  <th key={sc.scenarioName} className="py-2 px-2 text-center">
                    {sc.scenarioName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stability.siteMetrics.slice(0, 9).map((m) => (
                <tr
                  key={m.siteId}
                  onClick={() => onSelectSite(m.siteId)}
                  className="border-b border-[#272d47]/50 hover:bg-[#1a1d30] cursor-pointer transition-colors"
                >
                  <td className="py-2 pr-3 font-medium text-slate-200">{m.siteName}</td>
                  <td className="py-2 px-2 font-mono text-[#b9f0d7]">{m.firstPlaceFreqPct}%</td>
                  <td className="py-2 px-2 font-mono text-[#c9e8ff]">{m.top3FreqPct}%</td>
                  <td className="py-2 px-2 font-mono text-slate-300">
                    {m.meanRank.toFixed(1)} <span className="text-[#7392B5]">(±{m.rankStdDev})</span>
                  </td>
                  <td className="py-2 px-2 font-mono text-slate-300">{m.eligibilityFreqPct}%</td>
                  <td className="py-2 px-2 font-mono text-[#b8baff]">{m.maxRegret} pts</td>
                  <td className="py-2 px-2 text-[11px] text-[#7392B5]">{m.worstScenarioName}</td>
                  {stability.namedScenarios.map((sc) => {
                    const r = sc.ranksBySiteId[m.siteId];
                    return (
                      <td key={sc.scenarioName} className="py-1.5 px-2 text-center font-mono">
                        <span
                          className={`inline-block w-8 py-0.5 rounded text-[11px] ${
                            r === 1
                              ? 'bg-[#b9f0d7]/20 text-[#b9f0d7] font-bold'
                              : r !== null && r <= 3
                              ? 'bg-[#c9e8ff]/15 text-[#c9e8ff]'
                              : r !== null
                              ? 'bg-[#0c0c16] text-slate-400'
                              : 'bg-[#F25F5C]/10 text-[#F25F5C]'
                          }`}
                        >
                          {r !== null ? `#${r}` : 'FAIL'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-[#7392B5] pt-1">
          <span>Kendall&apos;s W concordance across named profiles: {stability.kendallW}</span>
          <span>Note: First-place frequency measures scenario consistency, not mission success probability.</span>
        </div>
      </div>

      {/* Value of Information + Pareto Frontier */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-6 lunar-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Microscope className="w-4 h-4 text-[#b8baff]" />
              <h3 className="text-sm font-semibold text-white">
                Value of Information — &ldquo;What Should We Measure Next?&rdquo;
              </h3>
            </div>
            <span title="Monte Carlo propagation of uncertainty on synthetic/estimated fields to identify measurements with highest decision impact.">
              <HelpCircle className="w-3.5 h-3.5 text-[#7392B5]" />
            </span>
          </div>
          <p className="text-xs text-[#7392B5]">
            Propagates explicit uncertainty on synthetic horizon masks and slopes (200 seeded draws) to rank which observations most reduce winner-flip regret.
          </p>

          <div className="space-y-2">
            {voiItems.length === 0 ? (
              <div className="p-4 bg-[#0c0c16] border border-[#272d47] rounded text-xs text-[#7392B5]">
                At least 2 viable candidates are needed to compute Value of Information regret.
              </div>
            ) : (
              voiItems.map((v, idx) => (
                <div
                  key={v.id}
                  onClick={() => onSelectSite(v.siteId)}
                  className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded hover:border-[#7392B5] cursor-pointer transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-100">
                      {idx + 1}. {v.siteName} — {v.parameterLabel}
                    </span>
                    <span className="font-mono text-[#F5B83D] shrink-0">
                      Flip Prob {v.winnerFlipProbabilityPct}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#7392B5]">
                    <span>Modeled band: {v.uncertaintyRange}</span>
                    <span>Expected regret: {v.expectedScoreRegret} pts</span>
                  </div>
                  <p className="text-[11px] text-slate-300">{v.recommendation}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="xl:col-span-6 lunar-panel rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#F5B83D]" />
              <h3 className="text-sm font-semibold text-white">Pareto Frontier Explorer</h3>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <select
                value={paretoX}
                onChange={(e) => setParetoX(e.target.value as typeof paretoX)}
                className="bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 text-[11px] text-slate-200"
              >
                <option value="sunlight">X: Sunlight %</option>
                <option value="earthComms">X: Earth DTE %</option>
                <option value="terrainSafety">X: Terrain Safety</option>
                <option value="scienceIce">X: Science &amp; Ice</option>
              </select>
              <select
                value={paretoY}
                onChange={(e) => setParetoY(e.target.value as typeof paretoY)}
                className="bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 text-[11px] text-slate-200"
              >
                <option value="earthComms">Y: Earth DTE %</option>
                <option value="sunlight">Y: Sunlight %</option>
                <option value="terrainSafety">Y: Terrain Safety</option>
                <option value="scienceIce">Y: Science &amp; Ice</option>
              </select>
            </div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0c0c16] border border-[#272d47] rounded">
            <line x1={PAD} y1={H - PAD} x2={W - 18} y2={H - PAD} stroke="#272d47" />
            <line x1={PAD} y1={18} x2={PAD} y2={H - PAD} stroke="#272d47" />
            <text x={(W + PAD) / 2} y={H - 10} textAnchor="middle" className="fill-[#7392B5] text-[10px] font-mono">
              {pareto.xLabel} →
            </text>
            <text
              x={14}
              y={H / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${H / 2})`}
              className="fill-[#7392B5] text-[10px] font-mono"
            >
              {pareto.yLabel} →
            </text>

            {(() => {
              const front = pareto.points.filter((p) => p.isParetoOptimal).sort((a, b) => a.x - b.x);
              const px = (v: number) => PAD + (v / 100) * (W - PAD - 24);
              const py = (v: number) => H - PAD - (v / 100) * (H - PAD - 24);
              const d = front.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x)},${py(p.y)}`).join(' ');
              return (
                <>
                  {front.length > 1 && (
                    <path d={d} fill="none" stroke="#b9f0d7" strokeWidth="1.5" strokeDasharray="4 3" />
                  )}
                  {pareto.points.map((p) => {
                    const cx = px(p.x);
                    const cy = py(p.y);
                    return (
                      <g key={p.siteId} onClick={() => onSelectSite(p.siteId)} className="cursor-pointer">
                        <circle
                          cx={cx}
                          cy={cy}
                          r={p.isParetoOptimal ? 5.5 : 4}
                          fill={p.isParetoOptimal ? '#b9f0d7' : '#7392B5'}
                          fillOpacity={p.isParetoOptimal ? 0.95 : 0.55}
                          stroke="#0c0c16"
                          strokeWidth="1"
                        >
                          <title>{`${p.siteName} (${p.x}, ${p.y}) — ${p.explanation}`}</title>
                        </circle>
                        {p.isParetoOptimal && (
                          <text x={cx + 7} y={cy - 4} className="fill-[#c9e8ff] text-[9px] font-mono">
                            {p.siteName.split(' ')[0]}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>

          <div className="text-[11px] text-[#7392B5] flex flex-wrap items-center justify-between gap-2">
            <span>
              Non-dominated frontier ({pareto.points.filter((p) => p.isParetoOptimal).length} sites in mint)
            </span>
            <span>Note: Pareto-optimal ≠ passes all hard mission constraints.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
