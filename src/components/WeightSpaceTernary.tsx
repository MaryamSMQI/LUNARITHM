import React, { useId, useMemo, useState } from 'react';
import { GitCommitHorizontal, Shuffle, Target } from 'lucide-react';
import {
  DecisionHistoryEntry,
  EvaluatedSite,
  FlipAnalysisResult,
  MissionPriorities,
  TernaryCell,
} from '../types/lunar';
import { CRITERION_KEYS, CRITERION_LABELS, normalizePriorities } from '../engine/scoringEngine';
import { generateTernaryMap } from '../engine/decisionIntelligence';

interface WeightSpaceTernaryProps {
  ranked: EvaluatedSite[];
  priorities: MissionPriorities;
  flipAnalysis: FlipAnalysisResult;
  history: DecisionHistoryEntry[];
  onApplyTernaryWeights: (
    keyA: keyof MissionPriorities,
    keyB: keyof MissionPriorities,
    keyC: keyof MissionPriorities,
    wA: number,
    wB: number,
    wC: number
  ) => void;
}

const REGION_PALETTE = [
  '#F5B83D', // Solar Amber
  '#c9e8ff', // Ice Cyan
  '#b9f0d7', // Mint Pass
  '#b8baff', // Lavender
  '#7392B5', // Steel Slate
  '#F25F5C', // Rose
];

export const WeightSpaceTernary: React.FC<WeightSpaceTernaryProps> = ({
  ranked,
  priorities,
  flipAnalysis,
  history,
  onApplyTernaryWeights,
}) => {
  const [keyA, setKeyA] = useState<keyof MissionPriorities>('sunlight');
  const [keyB, setKeyB] = useState<keyof MissionPriorities>('earthComms');
  const [keyC, setKeyC] = useState<keyof MissionPriorities>('scienceIce');
  const [hoveredCell, setHoveredCell] = useState<TernaryCell | null>(null);
  const clipId = useId();

  const viable = useMemo(() => ranked.filter((e) => e.passesConstraints), [ranked]);

  const cells = useMemo(() => {
    if (viable.length < 2) return [];
    return generateTernaryMap(ranked, keyA, keyB, keyC, priorities, 28);
  }, [ranked, viable.length, keyA, keyB, keyC, priorities]);

  const siteColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    viable.forEach((v, idx) => {
      map[v.site.id] = REGION_PALETTE[idx % REGION_PALETTE.length];
    });
    return map;
  }, [viable]);

  const W = 340;
  const H = 300;
  const topV = { x: W / 2, y: 28 };
  const leftV = { x: 38, y: 268 };
  const rightV = { x: W - 38, y: 268 };

  const baryToXY = (wA: number, wB: number, wC: number) => ({
    x: wA * topV.x + wB * leftV.x + wC * rightV.x,
    y: wA * topV.y + wB * leftV.y + wC * rightV.y,
  });

  const norm = normalizePriorities(priorities);
  const subSum = norm[keyA] + norm[keyB] + norm[keyC] || 1;
  const curPt = baryToXY(norm[keyA] / subSum, norm[keyB] / subSum, norm[keyC] / subSum);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (viable.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;

    const det =
      (leftV.y - rightV.y) * (topV.x - rightV.x) +
      (rightV.x - leftV.x) * (topV.y - rightV.y);
    const wA =
      ((leftV.y - rightV.y) * (px - rightV.x) + (rightV.x - leftV.x) * (py - rightV.y)) / det;
    const wB =
      ((rightV.y - topV.y) * (px - rightV.x) + (topV.x - rightV.x) * (py - rightV.y)) / det;
    const wC = 1 - wA - wB;

    if (wA >= -0.04 && wB >= -0.04 && wC >= -0.04) {
      const cA = Math.max(0, wA);
      const cB = Math.max(0, wB);
      const cC = Math.max(0, wC);
      const s = cA + cB + cC || 1;
      onApplyTernaryWeights(keyA, keyB, keyC, cA / s, cB / s, cC / s);
    }
  };

  const uniqueWinnersInMap = useMemo(() => {
    const seen = new Map<string, string>();
    cells.forEach((c) => {
      if (!seen.has(c.winnerId)) seen.set(c.winnerId, c.winnerName);
    });
    return Array.from(seen.entries());
  }, [cells]);

  return (
    <div className="space-y-4 animate-panel-in">
      {/* Top Flip Summary Banner */}
      <div className="lunar-panel rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="md:col-span-2 space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-[#c9e8ff]">
            <Shuffle className="w-3.5 h-3.5" />
            <span>ANALYTICAL DECISION FLIP DETECTOR (WEIGHTED SUM)</span>
          </div>
          {flipAnalysis.status === 'no_viable' ? (
            <div className="text-sm text-[#F25F5C]">
              No viable sites pass current hard constraints. Relax thresholds to evaluate priority flips.
            </div>
          ) : flipAnalysis.status === 'sole_viable' ? (
            <>
              <div className="text-base font-semibold text-white">
                {flipAnalysis.topSiteName} is the sole viable candidate — no challenger passes constraints
              </div>
              <p className="text-xs text-[#7392B5]">
                Relax hard constraints or adjust missing-data policy to compare multiple viable candidates.
              </p>
            </>
          ) : (
            <>
              <div className="text-base font-semibold text-white">
                {flipAnalysis.status === 'flippable'
                  ? `The decision flips if total priorities shift by ${flipAnalysis.minL1ChangeToFlipPct}%`
                  : `${flipAnalysis.topSiteName} Pareto-dominates all viable challengers across all 5 criteria`}
              </div>
              <p className="text-xs text-[#7392B5]">
                Current #1: <span className="text-[#b9f0d7] font-medium">{flipAnalysis.topSiteName}</span>
                {flipAnalysis.runnerUpSiteName && (
                  <>
                    {' '}
                    · Runner-up: <span className="text-slate-200">{flipAnalysis.runnerUpSiteName}</span> (margin{' '}
                    <span className="font-mono text-[#c9e8ff]">+{flipAnalysis.runnerUpMargin.toFixed(2)} pts</span>)
                  </>
                )}
                {flipAnalysis.minL1ChallengerName && (
                  <>
                    {' '}
                    · Closest flip target: <span className="text-[#F5B83D]">{flipAnalysis.minL1ChallengerName}</span>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded-md text-right font-mono">
          <div className="text-[11px] text-[#7392B5]">MIN SHIFT TO FLIP (L1)</div>
          <div className="text-lg font-bold text-[#c9e8ff] mt-0.5">{flipAnalysis.displayLabel}</div>
          <div className="text-[10px] text-[#7392B5]">Matches Mission Context Bar · Larger % = more robust</div>
        </div>
      </div>

      {/* Main Split: Weight-Space Ternary Map + Exact Flip Thresholds */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left: Interactive Weight-Space Ternary Map */}
        <div className="xl:col-span-6 lunar-panel rounded-lg p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#c9e8ff]" />
              Weight-Space Ternary Map
            </h3>
            <p className="text-xs text-[#7392B5]">
              Click anywhere inside the triangle to load those criterion weights live.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            {(
              [
                { label: 'Top Vertex (A)', val: keyA, setter: setKeyA },
                { label: 'Left Vertex (B)', val: keyB, setter: setKeyB },
                { label: 'Right Vertex (C)', val: keyC, setter: setKeyC },
              ] as const
            ).map((ax) => (
              <div key={ax.label}>
                <div className="text-[10px] font-mono text-[#7392B5] mb-0.5">{ax.label}</div>
                <select
                  value={ax.val}
                  onChange={(e) => ax.setter(e.target.value as keyof MissionPriorities)}
                  className="w-full bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#c9e8ff]"
                >
                  {CRITERION_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {CRITERION_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {viable.length < 2 ? (
            <div className="p-8 bg-[#0c0c16] border border-dashed border-[#272d47] rounded text-center text-xs text-[#7392B5]">
              At least 2 viable candidates passing current constraints are needed to compute a Weight-Space Ternary Map.
            </div>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                onClick={handleSvgClick}
                onMouseLeave={() => setHoveredCell(null)}
                className="w-full max-w-[390px] mx-auto block cursor-crosshair select-none bg-[#0c0c16] border border-[#272d47] rounded"
              >
                <defs>
                  <clipPath id={clipId}>
                    <polygon points={`${topV.x},${topV.y} ${leftV.x},${leftV.y} ${rightV.x},${rightV.y}`} />
                  </clipPath>
                </defs>

                {/* Solidly filled barycentric Voronoi tiles clipped cleanly to triangle */}
                <g clipPath={`url(#${clipId})`}>
                  {cells.map((c, idx) => {
                    const p = baryToXY(c.wA, c.wB, c.wC);
                    const fill = siteColorMap[c.winnerId] ?? '#7392B5';
                    return (
                      <circle
                        key={idx}
                        cx={p.x}
                        cy={p.y}
                        r={8.2}
                        fill={fill}
                        fillOpacity={c.margin < 1.5 ? 0.56 : 0.86}
                        onMouseEnter={() => setHoveredCell(c)}
                      />
                    );
                  })}
                </g>

                <polygon
                  points={`${topV.x},${topV.y} ${leftV.x},${leftV.y} ${rightV.x},${rightV.y}`}
                  fill="none"
                  stroke="#7392B5"
                  strokeWidth="1.5"
                />

                <text x={topV.x} y={16} textAnchor="middle" className="fill-[#c9e8ff] text-[10px] font-mono font-semibold">
                  {CRITERION_LABELS[keyA]}
                </text>
                <text x={leftV.x - 4} y={286} textAnchor="start" className="fill-[#c9e8ff] text-[10px] font-mono font-semibold">
                  {CRITERION_LABELS[keyB]}
                </text>
                <text x={rightV.x + 4} y={286} textAnchor="end" className="fill-[#c9e8ff] text-[10px] font-mono font-semibold">
                  {CRITERION_LABELS[keyC]}
                </text>

                {/* Active weight crosshair with subtle pulse ring */}
                <g>
                  <circle
                    cx={curPt.x}
                    cy={curPt.y}
                    r={11}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    className="animate-ring-pulse"
                  />
                  <circle cx={curPt.x} cy={curPt.y} r={8.5} fill="#0c0c16" fillOpacity="0.65" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx={curPt.x} cy={curPt.y} r={3.5} fill="#ffffff" />
                </g>
              </svg>

              <div className="min-h-[22px] px-2.5 py-1 bg-[#0c0c16] border border-[#272d47] rounded text-[11px] font-mono text-[#c9e8ff] flex items-center justify-between">
                {hoveredCell ? (
                  <>
                    <span>
                      Region: <strong className="text-white">{hoveredCell.winnerName}</strong> (+{hoveredCell.margin} pts)
                    </span>
                    <span className="text-[#7392B5]">
                      A:{Math.round(hoveredCell.wA * 100)}% B:{Math.round(hoveredCell.wB * 100)}% C:{Math.round(hoveredCell.wC * 100)}%
                    </span>
                  </>
                ) : (
                  <span className="text-[#7392B5]">Hover over triangle to preview winner &amp; margin; click to apply.</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                {uniqueWinnersInMap.map(([id, name]) => (
                  <span key={id} className="flex items-center gap-1.5 text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: siteColorMap[id] }} />
                    {name}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-white font-mono text-[11px] ml-auto">
                  <span className="w-2 h-2 rounded-full bg-white inline-block" />
                  Current Weights
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right: Exact Analytical Flip Thresholds + Decision History */}
        <div className="xl:col-span-6 space-y-4">
          <div className="lunar-panel rounded-lg p-4 space-y-2.5">
            <h3 className="text-sm font-semibold text-white">Exact Single-Criterion Flip Thresholds</h3>
            <p className="text-xs text-[#7392B5]">
              Analytically solved normalized weight at which a challenger overtakes #1 (other criteria renormalized proportionally).
            </p>

            {flipAnalysis.exactThresholds.length === 0 ? (
              <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded text-xs text-[#7392B5]">
                Requires ≥ 2 viable sites to evaluate single-criterion thresholds.
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {flipAnalysis.exactThresholds.map((t) => (
                  <div
                    key={t.criterionKey}
                    className="p-2.5 bg-[#0c0c16] border border-[#272d47] rounded text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-200 font-medium">{t.criterionLabel}</span>
                      {t.flipWeightPct !== null ? (
                        <span className="text-[#F5B83D]">
                          {t.currentWeightPct}% → {t.flipWeightPct}% ({t.deltaWeightPct! >= 0 ? '+' : ''}
                          {t.deltaWeightPct}%)
                        </span>
                      ) : (
                        <span className="text-[#7392B5]">No flip in [0, 100%]</span>
                      )}
                    </div>
                    <div className="text-[#7392B5]">{t.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lunar-panel rounded-lg p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <GitCommitHorizontal className="w-4 h-4 text-[#b8baff]" />
              <h3 className="text-sm font-semibold text-white">Decision History Timeline</h3>
            </div>
            <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2 bg-[#0c0c16] border border-[#272d47] rounded text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-slate-200 flex flex-wrap items-center gap-1.5">
                      <span className="truncate">{entry.trigger}</span>
                      {entry.flipped && (
                        <span className="px-1.5 py-0.5 rounded bg-[#F5B83D]/15 border border-[#F5B83D]/40 text-[#F5B83D] font-mono text-[10px]">
                          FLIP: {entry.winnerBefore ?? 'None'} → {entry.winnerAfter ?? 'None'}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-[#7392B5]">
                      {entry.timestampIso} · #1 {entry.topSiteName ?? 'None'}
                    </div>
                  </div>
                  <span className="font-mono text-[#b9f0d7] shrink-0">{entry.topScore.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
