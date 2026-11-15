import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { MISSION_PROFILES } from '../data/datasetRegistry';
import {
  CRITERION_KEYS,
  CRITERION_LABELS,
  computeAhpWeights,
  computeClosestFeasibleRelaxation,
  computeRocWeights,
  normalizePriorities,
} from '../engine/scoringEngine';
import {
  DecisionHistoryEntry,
  EvaluatedSite,
  FlipAnalysisResult,
  MissingDataPolicy,
  MissionConstraints,
  MissionPriorities,
  ProvenanceRecord,
  RankingBasis,
  StakeholderRole,
  WeightElicitationMode,
} from '../types/lunar';
import { DataBadge } from './DataBadge';
import { WeightSpaceTernary } from './WeightSpaceTernary';
import { StabilityAndVoiPanel } from './StabilityAndVoiPanel';
import { StakeholderAndDispersionPanel } from './StakeholderAndDispersionPanel';

interface DecisionStabilityViewProps {
  evaluatedSites: EvaluatedSite[];
  spearmanRho: number | null;
  kendallTau: number | null;
  methodDisagreementNote: string;
  flipAnalysis: FlipAnalysisResult;
  history: DecisionHistoryEntry[];
  activeProfileId: string;
  onSelectProfile: (profileId: string) => void;
  priorities: MissionPriorities;
  constraints: MissionConstraints;
  missingDataPolicy: MissingDataPolicy;
  rankingBasis: RankingBasis;
  learnMode?: boolean;
  stakeholderRoles: StakeholderRole[];
  onChangeStakeholderRoles: (next: StakeholderRole[]) => void;
  onChangePriorities: (next: MissionPriorities, reason?: string) => void;
  onChangeConstraints: (next: MissionConstraints, reason?: string) => void;
  onChangeMissingDataPolicy: (policy: MissingDataPolicy) => void;
  onRelaxToNearestFeasible?: (next: MissionConstraints) => void;
  onSelectSite: (siteId: string) => void;
  selectedSiteId: string;
  onInspectProvenance: (record: ProvenanceRecord) => void;
  initialSubView?: 'ranking' | 'flip' | 'stability' | 'dispersion_room';
}

export const DecisionStabilityView: React.FC<DecisionStabilityViewProps> = ({
  evaluatedSites,
  spearmanRho,
  kendallTau,
  methodDisagreementNote,
  flipAnalysis,
  history,
  activeProfileId,
  onSelectProfile,
  priorities,
  constraints,
  missingDataPolicy,
  rankingBasis,
  learnMode = false,
  stakeholderRoles,
  onChangeStakeholderRoles,
  onChangePriorities,
  onChangeConstraints,
  onChangeMissingDataPolicy,
  onRelaxToNearestFeasible,
  onSelectSite,
  selectedSiteId,
  onInspectProvenance,
  initialSubView = 'ranking',
}) => {
  const [subView, setSubView] = useState<'ranking' | 'flip' | 'stability' | 'dispersion_room'>(
    initialSubView
  );
  useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  const [elicitationMode, setElicitationMode] = useState<WeightElicitationMode>('sliders');
  const [showRejected, setShowRejected] = useState<boolean>(false);
  const [rocOrder, setRocOrder] = useState<(keyof MissionPriorities)[]>([
    'sunlight',
    'earthComms',
    'continuity',
    'scienceIce',
    'terrainSafety',
  ]);
  const [ahpPairs, setAhpPairs] = useState<{
    sunVsEarth: number;
    sunVsCont: number;
    sunVsSafe: number;
    sunVsSci: number;
  }>({
    sunVsEarth: 1,
    sunVsCont: 2,
    sunVsSafe: 3,
    sunVsSci: 2,
  });

  const viable = useMemo(() => evaluatedSites.filter((e) => e.passesConstraints), [evaluatedSites]);
  const rejected = useMemo(() => evaluatedSites.filter((e) => !e.passesConstraints), [evaluatedSites]);
  const norm = normalizePriorities(priorities);

  const selectedEval =
    evaluatedSites.find((e) => e.site.id === selectedSiteId) ?? viable[0] ?? evaluatedSites[0];

  // "Why This Site?" strictly explains a viable candidate (#1 viable fallback if user clicked an eliminated site)
  const explainedViableEval =
    selectedEval && selectedEval.passesConstraints ? selectedEval : viable[0] ?? null;

  const closestFeasible = useMemo(() => {
    if (viable.length > 0) return null;
    return computeClosestFeasibleRelaxation(evaluatedSites, constraints);
  }, [viable.length, evaluatedSites, constraints]);

  const applyAhp = (nextPairs: typeof ahpPairs) => {
    setAhpPairs(nextPairs);
    const v = [1, nextPairs.sunVsEarth, nextPairs.sunVsCont, nextPairs.sunVsSafe, nextPairs.sunVsSci];
    const ratios = v.map((s) => (s >= 1 ? s : 1 / Math.max(1, 2 - s)));
    const matrix: number[][] = Array.from({ length: 5 }, (_, i) =>
      Array.from({ length: 5 }, (_, j) => ratios[j] / ratios[i])
    );
    const res = computeAhpWeights(matrix);
    onChangePriorities(res.priorities, `AHP pairwise update (CR=${res.consistencyRatio})`);
  };

  const moveRocItem = (idx: number, dir: -1 | 1) => {
    const next = [...rocOrder];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setRocOrder(next);
    onChangePriorities(computeRocWeights(next), 'Rank-Order (ROC) weight update');
  };

  const ahpCheck = (() => {
    const ratios = [1, ahpPairs.sunVsEarth, ahpPairs.sunVsCont, ahpPairs.sunVsSafe, ahpPairs.sunVsSci].map((s) =>
      s >= 1 ? s : 1 / Math.max(1, 2 - s)
    );
    const matrix = Array.from({ length: 5 }, (_, i) =>
      Array.from({ length: 5 }, (_, j) => ratios[j] / ratios[i])
    );
    return computeAhpWeights(matrix);
  })();

  return (
    <div className="space-y-4 animate-panel-in">
      {/* Sub-view Bar */}
      <div className="lunar-panel rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ranking', label: 'WSM vs. TOPSIS Ranking & Why This Site?' },
            { id: 'flip', label: 'Decision Flip Detector & Weight-Space Map' },
            { id: 'stability', label: 'Stability, Minimax Regret, VoI & Pareto' },
            { id: 'dispersion_room', label: 'Stakeholder Room, Dispersion & Frontier' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubView(tab.id as typeof subView)}
              className={`lunar-btn px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subView === tab.id
                  ? 'bg-[#c9e8ff] text-[#0c0c16]'
                  : 'bg-[#0c0c16] text-[#7392B5] hover:text-white border border-[#272d47]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="font-mono text-xs text-[#7392B5]">
          {spearmanRho !== null && kendallTau !== null ? (
            <>
              Agreement: Spearman ρ = <span className="text-[#b9f0d7]">{spearmanRho}</span> · Kendall τ ={' '}
              <span className="text-[#c9e8ff]">{kendallTau}</span>
            </>
          ) : (
            <span>Agreement: N/A (needs ≥ 3 ranked sites)</span>
          )}
        </div>
      </div>

      {subView === 'flip' && (
        <WeightSpaceTernary
          ranked={evaluatedSites}
          priorities={priorities}
          flipAnalysis={flipAnalysis}
          history={history}
          onApplyTernaryWeights={(kA, kB, kC, wA, wB, wC) => {
            const fixedSum = CRITERION_KEYS.filter((k) => k !== kA && k !== kB && k !== kC).reduce(
              (acc, k) => acc + norm[k],
              0
            );
            const subSum = Math.max(0.05, 1 - fixedSum);
            const next = { ...priorities };
            next[kA] = Math.round(wA * subSum * 100);
            next[kB] = Math.round(wB * subSum * 100);
            next[kC] = Math.round(wC * subSum * 100);
            onChangePriorities(next, 'Weight-Space Ternary Map click');
          }}
        />
      )}

      {subView === 'stability' && (
        <StabilityAndVoiPanel
          evaluatedSites={evaluatedSites}
          priorities={priorities}
          constraints={constraints}
          onSelectSite={onSelectSite}
        />
      )}

      {subView === 'dispersion_room' && selectedEval && (
        <StakeholderAndDispersionPanel
          evaluatedSites={evaluatedSites}
          activeEval={selectedEval}
          priorities={priorities}
          constraints={constraints}
          missingDataPolicy={missingDataPolicy}
          roles={stakeholderRoles}
          onChangeRoles={onChangeStakeholderRoles}
          onSelectSite={onSelectSite}
        />
      )}

      {subView === 'ranking' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Mission Profiles, Weight Elicitation & Hard Constraints */}
          <div className="lg:col-span-4 space-y-4">
            <div className="lunar-panel rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#c9e8ff]" />
                  <h2 className="text-sm font-semibold text-white">Mission Profile &amp; Weights</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectProfile('balanced-artemis')}
                  className="lunar-btn inline-flex items-center gap-1 text-xs text-[#7392B5] hover:text-white"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              <select
                value={activeProfileId}
                onChange={(e) => onSelectProfile(e.target.value)}
                aria-label="Select mission profile"
                className="w-full bg-[#0c0c16] border border-[#272d47] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-[#c9e8ff]"
              >
                {MISSION_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="custom">Custom Mission Weights</option>
              </select>
              <p className="text-[11px] text-[#7392B5]">
                {learnMode
                  ? 'Why it matters: Different mission architectures (short CLPS lander vs. multi-month outpost) trade power, comms, and slope differently.'
                  : 'Default profile weights are illustrative starting points, not objective physical truths.'}
              </p>

              {/* Elicitation Mode Switch */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0c0c16] border border-[#272d47] rounded">
                {(
                  [
                    { id: 'sliders', label: 'Sliders' },
                    { id: 'ahp', label: 'AHP Matrix' },
                    { id: 'rank', label: 'Rank (ROC)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setElicitationMode(m.id)}
                    className={`py-1 text-[11px] font-medium rounded transition-colors ${
                      elicitationMode === m.id ? 'bg-[#1a1d30] text-[#c9e8ff]' : 'text-[#7392B5] hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {elicitationMode === 'sliders' && (
                <div className="space-y-2.5 pt-1">
                  {CRITERION_KEYS.map((key) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-200">{CRITERION_LABELS[key]}</span>
                        <span className="font-mono text-[#c9e8ff]">
                          {priorities[key]} ({(norm[key] * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={priorities[key]}
                        onChange={(e) =>
                          onChangePriorities(
                            { ...priorities, [key]: Number(e.target.value) },
                            `${CRITERION_LABELS[key]} slider`
                          )
                        }
                        className="lunar-slider w-full"
                      />
                    </div>
                  ))}
                </div>
              )}

              {elicitationMode === 'ahp' && (
                <div className="space-y-2.5 pt-1 text-xs">
                  <div className="text-[11px] text-[#7392B5]">
                    Pairwise ratio relative to Solar Power (Saaty 1–5 scale):
                  </div>
                  {(
                    [
                      { key: 'sunVsEarth', label: 'Solar vs Earth DTE' },
                      { key: 'sunVsCont', label: 'Solar vs Continuity' },
                      { key: 'sunVsSafe', label: 'Solar vs Terrain Safety' },
                      { key: 'sunVsSci', label: 'Solar vs Science/Ice' },
                    ] as const
                  ).map((item) => (
                    <div key={item.key} className="space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-slate-200">{item.label}</span>
                        <span className="font-mono text-[#c9e8ff]">{ahpPairs[item.key]}×</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={0.5}
                        value={ahpPairs[item.key]}
                        onChange={(e) => applyAhp({ ...ahpPairs, [item.key]: Number(e.target.value) })}
                        className="lunar-slider w-full"
                      />
                    </div>
                  ))}
                  <div
                    className={`p-2 rounded border font-mono text-[11px] ${
                      ahpCheck.consistencyRatio > 0.1
                        ? 'bg-[#F25F5C]/10 border-[#F25F5C]/40 text-[#F25F5C]'
                        : 'bg-[#b9f0d7]/10 border-[#b9f0d7]/30 text-[#b9f0d7]'
                    }`}
                  >
                    AHP Consistency Ratio (CR): {ahpCheck.consistencyRatio}{' '}
                    {ahpCheck.consistencyRatio > 0.1 ? '(Warning: CR > 0.10)' : '(Consistent <= 0.10)'}
                  </div>
                </div>
              )}

              {elicitationMode === 'rank' && (
                <div className="space-y-1.5 pt-1 text-xs">
                  <div className="text-[11px] text-[#7392B5] mb-1">
                    Order criteria from #1 (most important) to #5 to compute Rank-Order Centroid (ROC) weights:
                  </div>
                  {rocOrder.map((key, idx) => (
                    <div
                      key={key}
                      className="flex items-center justify-between px-2.5 py-1.5 bg-[#0c0c16] border border-[#272d47] rounded"
                    >
                      <span className="text-slate-200">
                        <span className="font-mono text-[#c9e8ff] mr-2">#{idx + 1}</span>
                        {CRITERION_LABELS[key]}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveRocItem(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-[#7392B5] hover:text-white disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRocItem(idx, 1)}
                          disabled={idx === rocOrder.length - 1}
                          className="p-1 text-[#7392B5] hover:text-white disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hard Constraints & Missing-Data Policy */}
            <div className="lunar-panel rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Hard Mission Constraints</h3>
                <select
                  value={missingDataPolicy}
                  onChange={(e) => onChangeMissingDataPolicy(e.target.value as MissingDataPolicy)}
                  aria-label="Missing data policy"
                  className="bg-[#0c0c16] border border-[#272d47] rounded px-2 py-0.5 text-[11px] font-mono text-[#b8baff]"
                >
                  <option value="conservative">Missing: Conservative (Fail)</option>
                  <option value="neutral">Missing: Neutral (Flag)</option>
                  <option value="optimistic">Missing: Optimistic (Pass)</option>
                </select>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Min Sunlight</span>
                    <span className="font-mono text-[#F5B83D]">{constraints.minSunlightPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={85}
                    step={5}
                    value={constraints.minSunlightPercent}
                    onChange={(e) =>
                      onChangeConstraints(
                        { ...constraints, minSunlightPercent: Number(e.target.value) },
                        'Min Sunlight threshold'
                      )
                    }
                    className="lunar-slider w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Min Earth DTE</span>
                    <span className="font-mono text-[#c9e8ff]">{constraints.minEarthCommsPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={85}
                    step={5}
                    value={constraints.minEarthCommsPercent}
                    onChange={(e) =>
                      onChangeConstraints(
                        { ...constraints, minEarthCommsPercent: Number(e.target.value) },
                        'Min Earth DTE threshold'
                      )
                    }
                    className="lunar-slider w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Max Continuous Darkness</span>
                    <span className="font-mono text-slate-200">{constraints.maxContinuousDarkHours} h</span>
                  </div>
                  <input
                    type="range"
                    min={48}
                    max={400}
                    step={12}
                    value={constraints.maxContinuousDarkHours}
                    onChange={(e) =>
                      onChangeConstraints(
                        { ...constraints, maxContinuousDarkHours: Number(e.target.value) },
                        'Max Darkness threshold'
                      )
                    }
                    className="lunar-slider w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Max Landing Slope</span>
                    <span className="font-mono text-slate-200">{constraints.maxSlopeDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={20}
                    step={1}
                    value={constraints.maxSlopeDeg}
                    onChange={(e) =>
                      onChangeConstraints(
                        { ...constraints, maxSlopeDeg: Number(e.target.value) },
                        'Max Slope threshold'
                      )
                    }
                    className="lunar-slider w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Dual WSM/TOPSIS Ranking + "Why This Site?" + Collapsible Rejected Sites */}
          <div className="lg:col-span-8 space-y-4">
            {/* Method Agreement Banner */}
            <div className="lunar-panel rounded-lg p-4 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">
                  Dual-Method Suitability Ranking (WSM vs. TOPSIS · Basis:{' '}
                  {rankingBasis === 'smooth_dip' ? 'Smooth-Sphere+Dip' : 'Terrain Mask'})
                </h3>
                <span className="text-[11px] font-mono text-[#7392B5]">
                  Suitability score = decision-support metric, not mission success probability.
                </span>
              </div>
              <p className="text-xs text-[#c9e8ff]">{methodDisagreementNote}</p>
              {learnMode && (
                <p className="text-[11px] text-[#7392B5]">
                  Why it matters: Weighted Sum (WSM) allows high solar power to compensate for lower science score, while TOPSIS penalizes any extreme single-axis weakness via distance from an ideal site.
                </p>
              )}
            </div>

            {/* Viable Ranked Sites */}
            <div className="lunar-panel rounded-lg p-4 space-y-2.5">
              {viable.length === 0 ? (
                <div className="p-5 text-center text-xs text-[#F25F5C] border border-dashed border-[#272d47] rounded">
                  All {evaluatedSites.length} candidate sites fail current hard constraints. Inspect the Closest-to-Feasible diagnostic below.
                </div>
              ) : (
                viable.map((ev) => {
                  const isSel = selectedEval && ev.site.id === selectedEval.site.id;
                  return (
                    <div
                      key={ev.site.id}
                      onClick={() => onSelectSite(ev.site.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onSelectSite(ev.site.id);
                      }}
                      className={`lunar-card-interactive p-3 rounded-md border cursor-pointer ${
                        isSel
                          ? 'bg-[#1a1d30] border-[#c9e8ff]/70'
                          : 'bg-[#0c0c16] border-[#272d47]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-[#b9f0d7]">WSM #{ev.rank}</span>
                            <span className="font-mono text-xs text-[#b8baff]">
                              {ev.topsisRank ? `TOPSIS #${ev.topsisRank}` : 'TOPSIS N/A'}
                            </span>
                            <span className="text-sm font-semibold text-white">{ev.site.name}</span>
                            <DataBadge dataClass={ev.site.horizonDataClass} />
                          </div>
                          <div className="text-[11px] font-mono text-[#7392B5] mt-0.5">
                            Sun {ev.activeSunlightPct.toFixed(1)}% · DTE {ev.activeEarthPct.toFixed(1)}% · Dark{' '}
                            {ev.activeMaxDarkHours}h · Slope {ev.site.slopeDeg ?? 'MISSING'}° · Mix {ev.dataMixDerivedPct}% Derived / {ev.dataMixSyntheticPct}% Synth
                          </div>
                        </div>

                        <div className="flex items-center gap-4 font-mono shrink-0 text-right">
                          <div>
                            <div className="text-base font-bold text-white">{ev.totalScore.toFixed(1)}</div>
                            <div className="text-[10px] text-[#7392B5]">WSM</div>
                          </div>
                          <div>
                            <div className="text-base font-bold text-[#b8baff]">
                              {ev.topsisScore !== null ? ev.topsisScore.toFixed(1) : 'N/A'}
                            </div>
                            <div className="text-[10px] text-[#7392B5]">TOPSIS</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* "Why This Site?" (ALWAYS explains viable site) OR "Why No Site Qualifies" */}
            {viable.length === 0 && closestFeasible ? (
              <div className="lunar-panel rounded-lg p-4 space-y-3 border-[#F25F5C]/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Why No Site Qualifies</h3>
                    <p className="text-xs text-[#7392B5]">
                      Closest to feasible: <strong className="text-[#c9e8ff]">{closestFeasible.closestSiteName}</strong>
                    </p>
                  </div>
                  {onRelaxToNearestFeasible && (
                    <button
                      type="button"
                      onClick={() => onRelaxToNearestFeasible(closestFeasible.relaxedConstraints)}
                      className="lunar-btn px-3 py-1.5 text-xs font-semibold bg-[#c9e8ff] text-[#0c0c16] rounded hover:brightness-110"
                    >
                      Relax to nearest feasible
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                  {closestFeasible.constraintFailCounts.map((cf) => (
                    <div key={cf.name} className="p-2 bg-[#0c0c16] border border-[#272d47] rounded">
                      <div className="text-[10px] text-[#7392B5] truncate">{cf.name}</div>
                      <div className="text-sm font-bold text-[#F25F5C] mt-0.5">{cf.failCount} sites fail</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-slate-200">Smallest relaxation to unlock {closestFeasible.closestSiteName}:</div>
                  <ul className="list-disc list-inside text-[#c9e8ff] font-mono text-[11px]">
                    {closestFeasible.relaxationSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              explainedViableEval && (
                <div className="lunar-panel rounded-lg p-4 space-y-3">
                  {selectedEval && !selectedEval.passesConstraints && (
                    <div className="p-2.5 bg-[#0c0c16] border border-[#7392B5]/40 rounded text-xs text-[#c9e8ff] flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Viewing details for <strong>{selectedEval.site.name}</strong> (Not eligible:{' '}
                        {selectedEval.failedConstraints.join('; ')}) — showing #1 viable candidate below.
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectSite(viable[0].site.id)}
                        className="text-[11px] font-mono underline text-[#b9f0d7]"
                      >
                        Select #1 ({viable[0].site.name})
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Why This Site? — #{explainedViableEval.rank} {explainedViableEval.site.name}
                      </h3>
                      <p className="text-xs text-[#7392B5]">{explainedViableEval.tradeOffNote}</p>
                    </div>
                    <span className="font-mono text-xs text-[#b8baff]">
                      Mix: {explainedViableEval.dataMixDerivedPct}% Derived / {explainedViableEval.dataMixSyntheticPct}% Synth
                    </span>
                  </div>

                  {/* Contribution Waterfall Breakdown */}
                  <div className="space-y-2">
                    {explainedViableEval.breakdown.map((b) => (
                      <div key={b.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 text-slate-200">
                            {b.label}
                            <DataBadge
                              dataClass={b.dataClass}
                              provenance={{
                                id: `${explainedViableEval.site.id}-${b.key}`,
                                label: `${explainedViableEval.site.name} — ${b.label}`,
                                value: b.rawScore.toFixed(1),
                                unit: '/ 100 normalized',
                                dataClass: b.dataClass,
                                source: explainedViableEval.site.horizonSource,
                                processingSteps: [
                                  'Simulate hourly Sun/Earth topocentric geometry via astronomy-engine.',
                                  `Apply active ranking basis (${explainedViableEval.rankingBasis}).`,
                                  `Normalize criterion score and multiply by ${(b.normalizedWeight * 100).toFixed(1)}% weight.`,
                                ],
                                formula: `weighted_points = raw_score (${b.rawScore}) * weight (${b.normalizedWeight.toFixed(3)}) = ${b.weightedPoints}`,
                              }}
                              onInspect={onInspectProvenance}
                            />
                          </span>
                          <span className="font-mono text-[#c9e8ff]">
                            Raw {b.rawScore.toFixed(1)} × {(b.normalizedWeight * 100).toFixed(1)}% = +
                            {b.weightedPoints.toFixed(1)} pts
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-[#0c0c16] rounded overflow-hidden">
                          <div
                            className="h-full bg-[#c9e8ff] transition-all duration-300"
                            style={{ width: `${Math.min(100, b.rawScore)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-[#272d47] text-xs">
                    <div className="text-[#b9f0d7] flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>Strengths: {explainedViableEval.strengths.join(' · ')}</span>
                    </div>
                    <div className="text-[#F5B83D] flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>Limitations: {explainedViableEval.weaknesses.join(' · ')}</span>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Collapsible Rejected Sites (Neutral surface, coral strictly on failing numbers/bars) */}
            {rejected.length > 0 && (
              <div className="lunar-panel rounded-lg p-3.5 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setShowRejected((v) => !v)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    {showRejected ? (
                      <ChevronDown className="w-4 h-4 text-[#7392B5]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#7392B5]" />
                    )}
                    <span className="text-xs font-semibold text-slate-200">
                      Not eligible under current constraints ({rejected.length})
                    </span>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#0c0c16] border border-[#272d47] text-[#7392B5]">
                    {showRejected ? 'Hide details' : 'Expand constraint gaps'}
                  </span>
                </button>

                {showRejected && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                    {rejected.map((item) => (
                      <div
                        key={item.site.id}
                        onClick={() => onSelectSite(item.site.id)}
                        className="p-3 bg-[#0c0c16] border border-[#272d47] rounded cursor-pointer hover:border-[#7392B5] transition-colors space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-white truncate">{item.site.name}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#131524] border border-[#272d47] text-[#7392B5]">
                            Not eligible
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {item.constraintChecks
                            .filter((c) => c.status !== 'PASS')
                            .map((c) => (
                              <div key={c.name} className="text-[11px] font-mono space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[#7392B5]">{c.name}</span>
                                  <span className="text-[#F25F5C]">
                                    {c.actualLabel} (req {c.thresholdLabel})
                                  </span>
                                </div>
                                <div className="h-1 w-full bg-[#131524] rounded overflow-hidden">
                                  <div
                                    className="h-full bg-[#F25F5C]"
                                    style={{ width: `${Math.max(8, Math.min(100, c.normalizedRatio * 100))}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
