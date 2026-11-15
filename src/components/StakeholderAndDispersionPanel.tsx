import React, { useMemo, useState } from 'react';
import { Layers, Radar, RotateCcw, Users } from 'lucide-react';
import {
  DispersionParams,
  EvaluatedSite,
  MissingDataPolicy,
  MissionConstraints,
  MissionPriorities,
  StakeholderRole,
} from '../types/lunar';
import {
  computeConstraintRelaxationFrontier,
  evaluateStakeholderRoom,
  runLandingDispersionAnalysis,
} from '../engine/decisionIntelligence';
import { CRITERION_KEYS, CRITERION_LABELS } from '../engine/scoringEngine';

export const DEFAULT_STAKEHOLDER_ROLES: StakeholderRole[] = [
  { id: 'science', name: 'Science Lead', priorities: { sunlight: 50, earthComms: 45, continuity: 50, terrainSafety: 55, scienceIce: 100 } },
  { id: 'ops', name: 'Surface Ops', priorities: { sunlight: 85, earthComms: 75, continuity: 100, terrainSafety: 70, scienceIce: 50 } },
  { id: 'comms', name: 'Comms Lead', priorities: { sunlight: 55, earthComms: 100, continuity: 80, terrainSafety: 60, scienceIce: 40 } },
  { id: 'power', name: 'Power Lead', priorities: { sunlight: 100, earthComms: 50, continuity: 95, terrainSafety: 55, scienceIce: 40 } },
  { id: 'safety', name: 'Safety Officer', priorities: { sunlight: 65, earthComms: 65, continuity: 70, terrainSafety: 100, scienceIce: 45 } },
];

interface StakeholderAndDispersionPanelProps {
  evaluatedSites: EvaluatedSite[];
  activeEval: EvaluatedSite;
  priorities: MissionPriorities;
  constraints: MissionConstraints;
  missingDataPolicy: MissingDataPolicy;
  roles: StakeholderRole[];
  onChangeRoles: (next: StakeholderRole[]) => void;
  onSelectSite: (siteId: string) => void;
}

export const StakeholderAndDispersionPanel: React.FC<StakeholderAndDispersionPanelProps> = ({
  evaluatedSites,
  activeEval,
  priorities,
  constraints,
  missingDataPolicy,
  roles,
  onChangeRoles,
  onSelectSite,
}) => {
  const [dispParams, setDispParams] = useState<DispersionParams>({
    semiMajorM: 250,
    semiMinorM: 150,
    orientationDeg: 30,
    numSamples: 500,
    seed: 2026,
  });

  const dispersion = useMemo(() => {
    return runLandingDispersionAnalysis(
      activeEval,
      dispParams,
      priorities,
      constraints,
      missingDataPolicy
    );
  }, [activeEval, dispParams, priorities, constraints, missingDataPolicy]);

  const stakeholderRoom = useMemo(() => {
    return evaluateStakeholderRoom(evaluatedSites, roles);
  }, [evaluatedSites, roles]);

  const frontier = useMemo(() => {
    return computeConstraintRelaxationFrontier(evaluatedSites, constraints, missingDataPolicy);
  }, [evaluatedSites, constraints, missingDataPolicy]);

  const viableSites = evaluatedSites.filter((e) => e.passesConstraints).slice(0, 6);

  const handleRoleWeightChange = (
    roleId: string,
    key: keyof MissionPriorities,
    value: number
  ) => {
    onChangeRoles(
      roles.map((r) =>
        r.id === roleId ? { ...r, priorities: { ...r.priorities, [key]: value } } : r
      )
    );
  };

  // Dispersion SVG geometry
  const W = 320;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2;
  const scaleSpan = Math.max(120, dispParams.semiMajorM * 1.25, dispParams.semiMinorM * 1.25);
  const mToPx = 92 / scaleSpan;

  return (
    <div className="space-y-4 animate-panel-in">
      {/* 1. Landing Dispersion ("Score the ellipse, not the dot") */}
      <div className="lunar-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Radar className="w-4 h-4 text-[#b9f0d7]" />
              Landing Dispersion Analysis (&ldquo;Score the ellipse, not the dot&rdquo;) — {activeEval.site.name}
            </h3>
            <p className="text-xs text-[#7392B5]">
              Samples touchdown uncertainty across an oriented landing ellipse. Depends on terrain resolution; illustrative with SYNTHETIC terrain.
            </p>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-[#b8baff]/35 bg-[#b8baff]/10 text-[#b8baff]">
            {activeEval.site.slopeDataClass} TERRAIN · N={dispParams.numSamples}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-[#7392B5]">Semi-Major (m)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={dispParams.semiMajorM}
                  onChange={(e) => setDispParams({ ...dispParams, semiMajorM: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#7392B5]">Semi-Minor (m)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={dispParams.semiMinorM}
                  onChange={(e) => setDispParams({ ...dispParams, semiMinorM: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#7392B5]">Orientation (°)</label>
                <input
                  type="number"
                  min={0}
                  max={180}
                  step={15}
                  value={dispParams.orientationDeg}
                  onChange={(e) => setDispParams({ ...dispParams, orientationDeg: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#7392B5]">Monte Carlo Seed</label>
                <input
                  type="number"
                  value={dispParams.seed}
                  onChange={(e) => setDispParams({ ...dispParams, seed: Number(e.target.value) })}
                  className="w-full mt-0.5 bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 font-mono text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs pt-1">
              <div className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded">
                <div className="text-[10px] text-[#7392B5]">Landing Feasibility %</div>
                <div
                  className={`text-lg font-bold ${
                    dispersion.feasibilityPct >= 85
                      ? 'text-[#b9f0d7]'
                      : dispersion.feasibilityPct >= 50
                      ? 'text-[#F5B83D]'
                      : 'text-[#F25F5C]'
                  }`}
                >
                  {dispersion.feasibilityPct}%
                </div>
              </div>
              <div className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded">
                <div className="text-[10px] text-[#7392B5]">P10 / Median / P90 Score</div>
                <div className="text-sm font-bold text-[#c9e8ff] mt-1">
                  {dispersion.p10Score} / {dispersion.medianScore} / {dispersion.p90Score}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col items-center">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full max-w-[380px] bg-[#0c0c16] border border-[#272d47] rounded"
            >
              <line x1={12} y1={cy} x2={W - 12} y2={cy} stroke="#1a1d30" />
              <line x1={cx} y1={12} x2={cx} y2={H - 12} stroke="#1a1d30" />
              <ellipse
                cx={cx}
                cy={cy}
                rx={Math.max(2, dispParams.semiMajorM * mToPx)}
                ry={Math.max(2, dispParams.semiMinorM * mToPx)}
                transform={`rotate(${-dispParams.orientationDeg} ${cx} ${cy})`}
                fill="none"
                stroke="#7392B5"
                strokeDasharray="4 3"
              />
              {dispersion.samples.slice(0, 260).map((pt, idx) => (
                <circle
                  key={idx}
                  cx={cx + pt.dxM * mToPx}
                  cy={cy - pt.dyM * mToPx}
                  r={2.1}
                  fill={pt.passes ? '#b9f0d7' : '#F25F5C'}
                  fillOpacity={0.75}
                />
              ))}
              <circle cx={cx} cy={cy} r={3.5} fill="#c9e8ff" stroke="#0c0c16" strokeWidth="1" />
              <text x={14} y={18} className="fill-[#7392B5] text-[9px] font-mono">
                Mint = Feasible touchdown · Coral = Fails constraints
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* 2. Multi-Stakeholder Decision Room */}
      <div className="lunar-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#c9e8ff]" />
              Multi-Stakeholder Decision Room (5 Mission Roles)
            </h3>
            <p className="text-xs text-[#7392B5]">
              Adjust priorities per discipline to compare individual winners against Borda count and the Minimax-Rank Compromise candidate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChangeRoles(DEFAULT_STAKEHOLDER_ROLES)}
            className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#0c0c16] border border-[#272d47] rounded text-[#7392B5] hover:text-white"
          >
            <RotateCcw className="w-3 h-3" /> Reset Roles
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 font-mono text-xs">
          <div className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded">
            <div className="text-[10px] text-[#7392B5]">GROUP WEIGHTED AVG</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {stakeholderRoom.groupWinnerWeightedAvg ?? 'N/A'}
            </div>
          </div>
          <div className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded">
            <div className="text-[10px] text-[#7392B5]">MINIMAX COMPROMISE SITE</div>
            <div className="text-sm font-bold text-[#b9f0d7] mt-0.5">
              {stakeholderRoom.compromiseSiteName ?? 'N/A'}
              {stakeholderRoom.compromiseWorstRank && (
                <span className="text-[11px] font-normal text-[#7392B5] ml-1.5">
                  (worst #{stakeholderRoom.compromiseWorstRank})
                </span>
              )}
            </div>
          </div>
          <div className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded">
            <div className="text-[10px] text-[#7392B5]">CONSENSUS (KENDALL&apos;S W)</div>
            <div className="text-sm font-bold text-[#c9e8ff] mt-0.5">
              {stakeholderRoom.kendallW !== null ? stakeholderRoom.kendallW.toFixed(3) : 'N/A'}
            </div>
          </div>
          <div className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded">
            <div className="text-[10px] text-[#7392B5]">MOST CONTESTED CRITERION</div>
            <div className="text-sm font-bold text-[#F5B83D] mt-0.5">
              {stakeholderRoom.mostContestedCriterion}
            </div>
          </div>
        </div>

        {/* Role Priority Sliders + Rank Matrix */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-6 space-y-2">
            {roles.map((role) => (
              <div key={role.id} className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{role.name}</span>
                  <span className="font-mono text-[11px] text-[#c9e8ff]">
                    #1: {stakeholderRoom.roles.find((r) => r.id === role.id)?.winnerSiteName ?? 'None'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-[10px] text-[#7392B5]">
                  {CRITERION_KEYS.map((k) => (
                    <label key={k} className="block">
                      <span className="truncate block">{CRITERION_LABELS[k].split(' ')[0]} {role.priorities[k]}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={role.priorities[k]}
                        onChange={(e) => handleRoleWeightChange(role.id, k, Number(e.target.value))}
                        className="lunar-slider w-full"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="xl:col-span-6 overflow-x-auto">
            {viableSites.length === 0 ? (
              <div className="p-4 bg-[#0c0c16] border border-[#272d47] rounded text-xs text-[#7392B5]">
                At least 1 viable site is required to populate the role-by-site rank matrix.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#272d47] font-mono text-[11px] text-[#7392B5]">
                    <th className="py-2 pr-2">Viable Site</th>
                    {stakeholderRoom.roles.map((r) => (
                      <th key={r.id} className="py-2 px-1.5 text-center">
                        {r.name.split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viableSites.map((ev) => (
                    <tr
                      key={ev.site.id}
                      onClick={() => onSelectSite(ev.site.id)}
                      className="border-b border-[#272d47]/50 hover:bg-[#1a1d30] cursor-pointer transition-colors"
                    >
                      <td className="py-2 pr-2 font-medium text-slate-200">{ev.site.name}</td>
                      {stakeholderRoom.roles.map((r) => {
                        const rank = r.ranksBySiteId[ev.site.id];
                        return (
                          <td key={r.id} className="py-1.5 px-1.5 text-center font-mono">
                            <span
                              className={`inline-block w-7 py-0.5 rounded text-[11px] ${
                                rank === 1
                                  ? 'bg-[#b9f0d7]/20 text-[#b9f0d7] font-bold'
                                  : rank !== null && rank <= 3
                                  ? 'bg-[#c9e8ff]/15 text-[#c9e8ff]'
                                  : 'bg-[#0c0c16] text-slate-400'
                              }`}
                            >
                              {rank ? `#${rank}` : '-'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 3. Constraint Relaxation Frontier */}
      <div className="lunar-panel rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#F5B83D]" />
          <h3 className="text-sm font-semibold text-white">
            Constraint Relaxation Frontier (Bottleneck Diagnostic)
          </h3>
        </div>
        <p className="text-xs text-[#7392B5]">
          Shows how many candidate sites become viable as each hard constraint is relaxed independently while holding all others fixed.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {frontier.map((series) => (
            <div key={series.constraintKey} className="p-3 bg-[#0c0c16] border border-[#272d47] rounded space-y-2">
              <div className="text-xs font-semibold text-white">{series.label}</div>
              <div className="text-[11px] text-[#7392B5]">{series.bottleneckNote}</div>
              <div className="space-y-1 font-mono text-[11px]">
                {series.steps.map((st) => (
                  <div key={st.thresholdLabel} className="flex items-center gap-2">
                    <span className="w-10 text-[#7392B5] shrink-0">{st.thresholdLabel}</span>
                    <div className="flex-1 h-2 bg-[#131524] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#c9e8ff] transition-all duration-200"
                        style={{ width: `${(st.viableCount / Math.max(1, evaluatedSites.length)) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-[#b9f0d7]">{st.viableCount}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
