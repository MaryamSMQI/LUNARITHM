import {
  ConstraintRelaxationSeries,
  DispersionParams,
  DispersionResult,
  DispersionSamplePoint,
  EvaluatedSite,
  ExactFlipThreshold,
  FlipAnalysisResult,
  MissingDataPolicy,
  MissionConstraints,
  MissionPriorities,
  ParetoAnalysisResult,
  SiteStabilityMetric,
  StabilitySimulationResult,
  StakeholderRole,
  StakeholderRoomResult,
  TernaryCell,
  VoiItem,
} from '../types/lunar';
import { CRITERION_KEYS, CRITERION_LABELS, normalizePriorities } from './scoringEngine';

/**
 * Deterministic Mulberry32 PRNG for reproducible Monte Carlo, Dispersion & Dirichlet sampling.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rawScoresMap(ev: EvaluatedSite): Record<keyof MissionPriorities, number> {
  const out = {} as Record<keyof MissionPriorities, number>;
  for (const k of CRITERION_KEYS) {
    out[k] = ev.breakdown.find((b) => b.key === k)?.rawScore ?? 0;
  }
  return out;
}

function wsmScore(raw: Record<keyof MissionPriorities, number>, w: Record<keyof MissionPriorities, number>): number {
  let total = 0;
  for (const k of CRITERION_KEYS) {
    total += raw[k] * w[k];
  }
  return total;
}

/**
 * Computes exact analytical WSM flip thresholds and minimum L1 priority shift (%)
 * with strictly honest 0-viable, 1-viable, Dominant (true Pareto across all 5 criteria), and flippable states.
 */
export function computeFlipAnalysis(
  ranked: EvaluatedSite[],
  priorities: MissionPriorities
): FlipAnalysisResult {
  const viable = ranked.filter((e) => e.passesConstraints);
  if (viable.length === 0) {
    return {
      status: 'no_viable',
      displayLabel: 'N/A — no viable site',
      topSiteId: null,
      topSiteName: null,
      runnerUpSiteId: null,
      runnerUpSiteName: null,
      runnerUpMargin: 0,
      minL1ChangeToFlipPct: null,
      minL1ChallengerName: null,
      exactThresholds: [],
    };
  }

  if (viable.length === 1) {
    return {
      status: 'sole_viable',
      displayLabel: 'Sole viable site — no challenger',
      topSiteId: viable[0].site.id,
      topSiteName: viable[0].site.name,
      runnerUpSiteId: null,
      runnerUpSiteName: null,
      runnerUpMargin: 100,
      minL1ChangeToFlipPct: null,
      minL1ChallengerName: null,
      exactThresholds: [],
    };
  }

  const w0 = normalizePriorities(priorities);
  const top = viable[0];
  const runnerUp = viable[1];
  const topRaw = rawScoresMap(top);
  const runnerUpMargin = Number((top.totalScore - runnerUp.totalScore).toFixed(2));

  const exactThresholds: ExactFlipThreshold[] = [];

  for (const k of CRITERION_KEYS) {
    const wk0 = w0[k];
    const otherWeightSum = 1 - wk0;

    let bestThreshold: ExactFlipThreshold | null = null;
    let smallestDeltaAbs = Infinity;

    for (const challenger of viable.slice(1)) {
      const cRaw = rawScoresMap(challenger);

      let sTopRest = 0;
      let sChallRest = 0;
      if (otherWeightSum > 1e-9) {
        for (const j of CRITERION_KEYS) {
          if (j === k) continue;
          const relW = w0[j] / otherWeightSum;
          sTopRest += relW * topRaw[j];
          sChallRest += relW * cRaw[j];
        }
      }

      const num = sTopRest - sChallRest;
      const denom = cRaw[k] - topRaw[k] + num;

      if (Math.abs(denom) < 1e-9) continue;
      const wStar = num / denom;

      if (wStar >= 0 && wStar <= 1) {
        const dir = wStar >= wk0 ? 0.0005 : -0.0005;
        const wTest = Math.max(0, Math.min(1, wStar + dir));
        const sTopAtTest = wTest * topRaw[k] + (1 - wTest) * sTopRest;
        const sChalAtTest = wTest * cRaw[k] + (1 - wTest) * sChallRest;

        if (sChalAtTest > sTopAtTest) {
          const deltaAbs = Math.abs(wStar - wk0);
          if (deltaAbs < smallestDeltaAbs) {
            smallestDeltaAbs = deltaAbs;
            const curPct = Number((wk0 * 100).toFixed(1));
            const flipPct = Number((wStar * 100).toFixed(1));
            const deltaPct = Number((flipPct - curPct).toFixed(1));
            bestThreshold = {
              criterionKey: k,
              criterionLabel: CRITERION_LABELS[k],
              currentWeightPct: curPct,
              flipWeightPct: flipPct,
              deltaWeightPct: deltaPct,
              challengerSiteId: challenger.site.id,
              challengerSiteName: challenger.site.name,
              summary:
                deltaPct >= 0
                  ? `${CRITERION_LABELS[k]} weight must rise from ${curPct}% to ${flipPct}% (+${deltaPct}%) for ${challenger.site.name} to win.`
                  : `${CRITERION_LABELS[k]} weight must drop from ${curPct}% to ${flipPct}% (${deltaPct}%) for ${challenger.site.name} to win.`,
            };
          }
        }
      }
    }

    if (bestThreshold) {
      exactThresholds.push(bestThreshold);
    } else {
      exactThresholds.push({
        criterionKey: k,
        criterionLabel: CRITERION_LABELS[k],
        currentWeightPct: Number((wk0 * 100).toFixed(1)),
        flipWeightPct: null,
        deltaWeightPct: null,
        challengerSiteId: runnerUp.site.id,
        challengerSiteName: runnerUp.site.name,
        summary: `No single-criterion shift on ${CRITERION_LABELS[k]} flips #1.`,
      });
    }
  }

  let minShift = Infinity;
  let minChallengerName: string | null = null;

  for (const challenger of viable.slice(1)) {
    const cRaw = rawScoresMap(challenger);
    const diffs = CRITERION_KEYS.map((k) => ({
      key: k,
      d: cRaw[k] - topRaw[k],
      w0: w0[k],
    }));
    const currentGap = top.totalScore - challenger.totalScore;
    if (currentGap <= 0) {
      minShift = 0;
      minChallengerName = challenger.site.name;
      break;
    }

    const maxD = Math.max(...diffs.map((x) => x.d));
    if (maxD <= 0) continue; // Dominated across all criteria

    const sortedAsc = [...diffs].sort((a, b) => a.d - b.d);
    let remainingGap = currentGap;
    let totalMassMoved = 0;

    for (const donor of sortedAsc) {
      const gainPerUnitMass = maxD - donor.d;
      if (gainPerUnitMass <= 1e-9 || donor.w0 <= 1e-9) continue;
      const neededMass = remainingGap / gainPerUnitMass;
      if (neededMass <= donor.w0) {
        totalMassMoved += neededMass;
        remainingGap = 0;
        break;
      } else {
        totalMassMoved += donor.w0;
        remainingGap -= donor.w0 * gainPerUnitMass;
      }
    }

    if (remainingGap <= 1e-6 && totalMassMoved < minShift) {
      minShift = totalMassMoved;
      minChallengerName = challenger.site.name;
    }
  }

  const isParetoDominantAll5 = viable.slice(1).every((challenger) => {
    const cRaw = rawScoresMap(challenger);
    return CRITERION_KEYS.every((k) => topRaw[k] >= cRaw[k]);
  });

  if (!Number.isFinite(minShift) || isParetoDominantAll5) {
    return {
      status: 'dominant',
      displayLabel: 'Dominant',
      topSiteId: top.site.id,
      topSiteName: top.site.name,
      runnerUpSiteId: runnerUp.site.id,
      runnerUpSiteName: runnerUp.site.name,
      runnerUpMargin,
      minL1ChangeToFlipPct: null,
      minL1ChallengerName: null,
      exactThresholds,
    };
  }

  const minPct = Number((minShift * 100).toFixed(1));
  return {
    status: 'flippable',
    displayLabel: `${minPct}% (${minChallengerName})`,
    topSiteId: top.site.id,
    topSiteName: top.site.name,
    runnerUpSiteId: runnerUp.site.id,
    runnerUpSiteName: runnerUp.site.name,
    runnerUpMargin,
    minL1ChangeToFlipPct: minPct,
    minL1ChallengerName: minChallengerName,
    exactThresholds,
  };
}

/**
 * Generates barycentric Ternary Plot samples for any 3 chosen criteria (A, B, C),
 * keeping the remaining 2 criteria fixed at their current normalized ratio.
 */
export function generateTernaryMap(
  ranked: EvaluatedSite[],
  keyA: keyof MissionPriorities,
  keyB: keyof MissionPriorities,
  keyC: keyof MissionPriorities,
  priorities: MissionPriorities,
  steps = 26
): TernaryCell[] {
  const viable = ranked.filter((e) => e.passesConstraints);
  if (viable.length === 0) return [];

  const norm = normalizePriorities(priorities);
  const fixedKeys = CRITERION_KEYS.filter((k) => k !== keyA && k !== keyB && k !== keyC);
  const fixedSum = fixedKeys.reduce((acc, k) => acc + norm[k], 0);
  const subSum = Math.max(0.05, 1 - fixedSum);

  const cells: TernaryCell[] = [];
  const rawBySite = viable.map((e) => ({
    id: e.site.id,
    name: e.site.name,
    raw: rawScoresMap(e),
  }));

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps - i; j++) {
      const k = steps - i - j;
      const bA = i / steps;
      const bB = j / steps;
      const bC = k / steps;

      const w = { ...norm };
      w[keyA] = bA * subSum;
      w[keyB] = bB * subSum;
      w[keyC] = bC * subSum;

      let best = rawBySite[0];
      let bestScore = -1;
      let secondScore = -1;

      for (const s of rawBySite) {
        const sc = wsmScore(s.raw, w);
        if (sc > bestScore) {
          secondScore = bestScore;
          bestScore = sc;
          best = s;
        } else if (sc > secondScore) {
          secondScore = sc;
        }
      }

      cells.push({
        wA: bA,
        wB: bB,
        wC: bC,
        winnerId: best.id,
        winnerName: best.name,
        margin: Number((bestScore - Math.max(0, secondScore)).toFixed(2)),
      });
    }
  }

  return cells;
}

/**
 * Pure helper for Minimax Regret verification (also testable on a 3x3 payoff matrix).
 */
export function computeMinimaxRegretFromMatrix(
  siteNames: string[],
  scenarioNames: string[],
  scoresBySiteScenario: number[][]
): {
  minimaxRegretSiteName: string | null;
  minimaxRegretValue: number;
  minExpectedRegretSiteName: string | null;
  perSite: { name: string; maxRegret: number; expectedRegret: number; worstScenarioName: string }[];
} {
  if (siteNames.length === 0 || scenarioNames.length === 0) {
    return {
      minimaxRegretSiteName: null,
      minimaxRegretValue: 0,
      minExpectedRegretSiteName: null,
      perSite: [],
    };
  }

  const bestPerScenario = scenarioNames.map((_, sIdx) =>
    Math.max(...siteNames.map((_, rIdx) => scoresBySiteScenario[rIdx][sIdx]))
  );

  const perSite = siteNames.map((name, rIdx) => {
    let maxRegret = -1;
    let worstScenarioName = scenarioNames[0];
    let sumRegret = 0;

    for (let sIdx = 0; sIdx < scenarioNames.length; sIdx++) {
      const reg = Math.max(0, bestPerScenario[sIdx] - scoresBySiteScenario[rIdx][sIdx]);
      sumRegret += reg;
      if (reg > maxRegret) {
        maxRegret = reg;
        worstScenarioName = scenarioNames[sIdx];
      }
    }

    return {
      name,
      maxRegret: Number(maxRegret.toFixed(1)),
      expectedRegret: Number((sumRegret / scenarioNames.length).toFixed(2)),
      worstScenarioName,
    };
  });

  const sortedMax = [...perSite].sort((a, b) => a.maxRegret - b.maxRegret);
  const sortedExp = [...perSite].sort((a, b) => a.expectedRegret - b.expectedRegret);

  return {
    minimaxRegretSiteName: sortedMax[0]?.name ?? null,
    minimaxRegretValue: sortedMax[0]?.maxRegret ?? 0,
    minExpectedRegretSiteName: sortedExp[0]?.name ?? null,
    perSite,
  };
}

/**
 * Seeded Dirichlet Weight-Simplex & Constraint Stability Simulation + Minimax Regret.
 */
export function runStabilitySimulation(
  evaluatedSites: EvaluatedSite[],
  priorities: MissionPriorities,
  constraints: MissionConstraints,
  seed = 2026,
  numScenarios = 300,
  spread = 0.45
): StabilitySimulationResult {
  const rng = createSeededRng(seed);
  const baseW = normalizePriorities(priorities);
  const allSites = evaluatedSites;
  const rawList = allSites.map((e) => ({
    id: e.site.id,
    name: e.site.name,
    raw: rawScoresMap(e),
    sunPct: e.activeSunlightPct,
    earthPct: e.activeEarthPct,
    maxDarkH: e.activeMaxDarkHours,
    slopeDeg: e.site.slopeDeg,
  }));

  const stats: Record<
    string,
    {
      firsts: number;
      top3: number;
      eligible: number;
      ranks: number[];
      maxRegret: number;
      worstScenarioName: string;
      sumRegret: number;
    }
  > = {};
  rawList.forEach((s) => {
    stats[s.id] = {
      firsts: 0,
      top3: 0,
      eligible: 0,
      ranks: [],
      maxRegret: 0,
      worstScenarioName: 'Baseline',
      sumRegret: 0,
    };
  });

  const concentration = Math.max(1.5, 12 * (1 - spread));

  for (let sc = 0; sc < numScenarios; sc++) {
    const gammas: Record<keyof MissionPriorities, number> = {
      sunlight: 0,
      earthComms: 0,
      continuity: 0,
      terrainSafety: 0,
      scienceIce: 0,
    };
    let gSum = 0;
    for (const k of CRITERION_KEYS) {
      const alpha = Math.max(0.25, baseW[k] * concentration);
      const u1 = Math.max(1e-6, rng());
      const u2 = Math.max(1e-6, rng());
      const sample = Math.pow(-Math.log(u1), 1 / Math.max(0.5, alpha)) * (0.65 + 0.7 * u2);
      gammas[k] = Math.max(1e-4, sample * (0.2 + baseW[k]));
      gSum += gammas[k];
    }
    const wDraw = {} as Record<keyof MissionPriorities, number>;
    for (const k of CRITERION_KEYS) wDraw[k] = gammas[k] / gSum;

    const sunLimit = Math.max(0, constraints.minSunlightPercent + (rng() - 0.5) * 10);
    const earthLimit = Math.max(0, constraints.minEarthCommsPercent + (rng() - 0.5) * 10);
    const darkLimit = Math.max(48, constraints.maxContinuousDarkHours + (rng() - 0.5) * 24);
    const slopeLimit = Math.max(4, constraints.maxSlopeDeg + (rng() - 0.5) * 2);

    const eligibleScores = rawList
      .filter(
        (s) =>
          s.sunPct >= sunLimit &&
          s.earthPct >= earthLimit &&
          s.maxDarkH <= darkLimit &&
          (s.slopeDeg === null ? false : s.slopeDeg <= slopeLimit)
      )
      .map((s) => ({ id: s.id, score: wsmScore(s.raw, wDraw) }))
      .sort((a, b) => b.score - a.score);

    const bestScoreInDraw =
      eligibleScores[0]?.score ?? Math.max(...rawList.map((s) => wsmScore(s.raw, wDraw)));

    for (const s of rawList) {
      const scVal = wsmScore(s.raw, wDraw);
      const regret = Math.max(0, bestScoreInDraw - scVal);
      stats[s.id].sumRegret += regret;
      if (regret > stats[s.id].maxRegret) {
        stats[s.id].maxRegret = regret;
        stats[s.id].worstScenarioName = `Monte Carlo #${sc + 1}`;
      }
    }

    eligibleScores.forEach((es, idx) => {
      const r = idx + 1;
      stats[es.id].eligible++;
      stats[es.id].ranks.push(r);
      if (r === 1) stats[es.id].firsts++;
      if (r <= 3) stats[es.id].top3++;
    });
  }

  // Named Scenarios Heatmap
  const namedConfigs: { name: string; p: MissionPriorities; strict?: boolean }[] = [
    { name: 'Baseline', p: priorities },
    { name: 'Solar-Priority', p: { sunlight: 100, earthComms: 45, continuity: 90, terrainSafety: 50, scienceIce: 40 } },
    { name: 'Comms-Priority', p: { sunlight: 55, earthComms: 100, continuity: 75, terrainSafety: 65, scienceIce: 40 } },
    { name: 'Balanced', p: { sunlight: 75, earthComms: 75, continuity: 75, terrainSafety: 75, scienceIce: 75 } },
    { name: 'Strict-Limits', p: priorities, strict: true },
  ];

  const namedScenarios = namedConfigs.map((cfg) => {
    const wN = normalizePriorities(cfg.p);
    const sunMin = cfg.strict ? Math.min(85, constraints.minSunlightPercent + 10) : constraints.minSunlightPercent;
    const earthMin = cfg.strict ? Math.min(85, constraints.minEarthCommsPercent + 10) : constraints.minEarthCommsPercent;
    const darkMax = cfg.strict ? Math.max(48, constraints.maxContinuousDarkHours - 24) : constraints.maxContinuousDarkHours;
    const slopeMax = cfg.strict ? Math.max(5, constraints.maxSlopeDeg - 2) : constraints.maxSlopeDeg;

    const scored = rawList
      .filter(
        (s) =>
          s.sunPct >= sunMin &&
          s.earthPct >= earthMin &&
          s.maxDarkH <= darkMax &&
          (s.slopeDeg !== null && s.slopeDeg <= slopeMax)
      )
      .map((s) => ({ id: s.id, name: s.name, score: wsmScore(s.raw, wN) }))
      .sort((a, b) => b.score - a.score);

    const bestNamedScore = scored[0]?.score ?? Math.max(...rawList.map((s) => wsmScore(s.raw, wN)));
    for (const s of rawList) {
      const reg = Math.max(0, bestNamedScore - wsmScore(s.raw, wN));
      if (reg > stats[s.id].maxRegret) {
        stats[s.id].maxRegret = reg;
        stats[s.id].worstScenarioName = cfg.name;
      }
    }

    const ranksBySiteId: Record<string, number | null> = {};
    rawList.forEach((s) => (ranksBySiteId[s.id] = null));
    scored.forEach((sc, idx) => {
      ranksBySiteId[sc.id] = idx + 1;
    });

    return {
      scenarioName: cfg.name,
      ranksBySiteId,
      winnerName: scored[0]?.name ?? null,
    };
  });

  const siteMetrics: SiteStabilityMetric[] = rawList.map((s) => {
    const st = stats[s.id];
    const nR = st.ranks.length;
    const meanRank = nR > 0 ? st.ranks.reduce((a, b) => a + b, 0) / nR : rawList.length;
    const variance =
      nR > 1 ? st.ranks.reduce((acc, r) => acc + Math.pow(r - meanRank, 2), 0) / nR : 0;
    return {
      siteId: s.id,
      siteName: s.name,
      firstPlaceFreqPct: Number(((st.firsts / numScenarios) * 100).toFixed(1)),
      top3FreqPct: Number(((st.top3 / numScenarios) * 100).toFixed(1)),
      meanRank: Number(meanRank.toFixed(2)),
      rankStdDev: Number(Math.sqrt(variance).toFixed(2)),
      eligibilityFreqPct: Number(((st.eligible / numScenarios) * 100).toFixed(1)),
      worstScenarioName: st.worstScenarioName,
      maxRegret: Number(st.maxRegret.toFixed(1)),
      expectedRegret: Number((st.sumRegret / numScenarios).toFixed(2)),
    };
  });

  siteMetrics.sort((a, b) => b.firstPlaceFreqPct - a.firstPlaceFreqPct || a.meanRank - b.meanRank);

  // Kendall's W across named scenarios
  const nSites = rawList.length;
  const rankSums = rawList.map((s) =>
    namedScenarios.reduce((acc, sc) => acc + (sc.ranksBySiteId[s.id] ?? nSites), 0)
  );
  const meanRankSum = rankSums.reduce((a, b) => a + b, 0) / Math.max(1, nSites);
  const sumSqDev = rankSums.reduce((acc, rs) => acc + Math.pow(rs - meanRankSum, 2), 0);
  const m = namedScenarios.length;
  const kendallW =
    nSites > 1 ? Number(Math.min(1, (12 * sumSqDev) / (m * m * (Math.pow(nSites, 3) - nSites))).toFixed(3)) : 1;

  const bestNow = evaluatedSites.find((e) => e.passesConstraints)?.site.name ?? null;
  const mostConsistent = siteMetrics.find((mItem) => mItem.eligibilityFreqPct > 50)?.siteName ?? bestNow;
  const strictResilient = namedScenarios.find((n) => n.scenarioName === 'Strict-Limits')?.winnerName ?? null;

  // Minimax regret among frequently eligible candidates (>= 50% eligible)
  const eligiblePool = siteMetrics.filter((mItem) => mItem.eligibilityFreqPct >= 50);
  const regretPool = eligiblePool.length > 0 ? eligiblePool : siteMetrics;
  const minimaxSorted = [...regretPool].sort((a, b) => a.maxRegret - b.maxRegret);
  const expRegretSorted = [...regretPool].sort((a, b) => a.expectedRegret - b.expectedRegret);

  const minimaxRegretSiteName = minimaxSorted[0]?.siteName ?? null;
  const minimaxRegretValue = minimaxSorted[0]?.maxRegret ?? null;
  const minExpectedRegretSiteName = expRegretSorted[0]?.siteName ?? null;

  return {
    seed,
    numScenarios,
    kendallW,
    bestNowSiteName: bestNow,
    mostConsistentSiteName: mostConsistent,
    strictResilientSiteName: strictResilient,
    minimaxRegretSiteName,
    minimaxRegretValue,
    minExpectedRegretSiteName,
    recommendationsAgree:
      bestNow !== null &&
      bestNow === mostConsistent &&
      (strictResilient === null || bestNow === strictResilient) &&
      bestNow === minimaxRegretSiteName,
    siteMetrics,
    namedScenarios,
  };
}

/**
 * Value of Information (VoI) & Uncertainty Propagation.
 */
export function computeVoiAndUncertainty(
  evaluatedSites: EvaluatedSite[],
  priorities: MissionPriorities,
  seed = 4096,
  draws = 200
): VoiItem[] {
  const viable = evaluatedSites.filter((e) => e.passesConstraints).slice(0, 5);
  if (viable.length < 2) return [];

  const w = normalizePriorities(priorities);
  const baselineTop = viable[0];
  const voiResults: VoiItem[] = [];

  for (const target of viable) {
    const horizonUncPct = target.site.horizonDataClass === 'SYNTHETIC' ? 9.5 : 2.0;
    const slopeUncPts = target.site.slopeDataClass === 'SYNTHETIC' || target.site.slopeDataClass === 'MISSING' ? 14 : 3;

    const paramsToTest = [
      {
        key: 'sunlight' as keyof MissionPriorities,
        label: 'Local Horizon Mask / Illumination Uncertainty',
        range: `±${horizonUncPct.toFixed(1)}% solar window`,
        uncSpan: horizonUncPct,
      },
      {
        key: 'earthComms' as keyof MissionPriorities,
        label: 'Earth Horizon Grazing / Libration Mask',
        range: `±${(horizonUncPct * 0.85).toFixed(1)}% DTE window`,
        uncSpan: horizonUncPct * 0.85,
      },
      {
        key: 'terrainSafety' as keyof MissionPriorities,
        label: 'Touchdown Slope & Roughness Uncertainty',
        range: `±${(slopeUncPts / 5).toFixed(1)}° slope`,
        uncSpan: slopeUncPts,
      },
    ];

    for (const p of paramsToTest) {
      const rng = createSeededRng(seed + target.site.name.length * 17 + p.label.length);
      let flipCount = 0;
      let totalRegret = 0;

      for (let d = 0; d < draws; d++) {
        const pert = (rng() * 2 - 1) * p.uncSpan;
        const rawTarget = rawScoresMap(target);
        rawTarget[p.key] = Math.max(0, Math.min(100, rawTarget[p.key] + pert));
        const perturbedTargetScore = wsmScore(rawTarget, w);

        let bestOtherScore = -1;
        for (const other of viable) {
          if (other.site.id === target.site.id) continue;
          if (other.totalScore > bestOtherScore) bestOtherScore = other.totalScore;
        }

        const newWinnerIsTarget = perturbedTargetScore >= bestOtherScore;
        const baselineWinnerIsTarget = target.site.id === baselineTop.site.id;

        if (newWinnerIsTarget !== baselineWinnerIsTarget) {
          flipCount++;
          totalRegret += Math.abs(perturbedTargetScore - bestOtherScore);
        }
      }

      const flipProbPct = Number(((flipCount / draws) * 100).toFixed(1));
      const expectedRegret = Number((totalRegret / draws).toFixed(2));

      if (flipProbPct > 0 || target.rank === 1 || target.rank === 2) {
        voiResults.push({
          id: `${target.site.id}-${p.key}`,
          siteId: target.site.id,
          siteName: target.site.name,
          parameterLabel: p.label,
          uncertaintyRange: p.range,
          winnerFlipProbabilityPct: flipProbPct,
          expectedScoreRegret: expectedRegret,
          recommendation:
            flipProbPct > 0
              ? `Reducing uncertainty in ${target.site.name}'s ${p.label.toLowerCase()} resolves a ${flipProbPct}% winner-flip probability.`
              : `Current uncertainty in ${target.site.name}'s ${p.label.toLowerCase()} does not overturn #1.`,
        });
      }
    }
  }

  return voiResults
    .sort((a, b) => b.winnerFlipProbabilityPct - a.winnerFlipProbabilityPct || b.expectedScoreRegret - a.expectedScoreRegret)
    .slice(0, 8);
}

/**
 * Computes 2D Pareto frontier (both objectives maximized) across all sites.
 */
export function computeParetoFrontier(
  evaluatedSites: EvaluatedSite[],
  xAxis: 'sunlight' | 'earthComms' | 'terrainSafety' | 'scienceIce',
  yAxis: 'sunlight' | 'earthComms' | 'terrainSafety' | 'scienceIce'
): ParetoAnalysisResult {
  const getVal = (ev: EvaluatedSite, axis: typeof xAxis) => {
    switch (axis) {
      case 'sunlight':
        return ev.activeSunlightPct;
      case 'earthComms':
        return ev.activeEarthPct;
      case 'terrainSafety':
        return ev.breakdown.find((b) => b.key === 'terrainSafety')?.rawScore ?? 0;
      case 'scienceIce':
        return ev.site.scienceValueScore;
    }
  };

  const axisNames: Record<typeof xAxis, string> = {
    sunlight: 'Sunlight Availability (%)',
    earthComms: 'Earth DTE Visibility (%)',
    terrainSafety: 'Terrain Safety Score (0–100)',
    scienceIce: 'Science & Water-Ice Score (0–100)',
  };

  const pts = evaluatedSites.map((ev) => ({
    siteId: ev.site.id,
    siteName: ev.site.name,
    x: Number(getVal(ev, xAxis).toFixed(1)),
    y: Number(getVal(ev, yAxis).toFixed(1)),
  }));

  return {
    xLabel: axisNames[xAxis],
    yLabel: axisNames[yAxis],
    points: pts.map((p) => {
      const dominators = pts.filter(
        (other) =>
          other.siteId !== p.siteId &&
          other.x >= p.x &&
          other.y >= p.y &&
          (other.x > p.x || other.y > p.y)
      );
      const isParetoOptimal = dominators.length === 0;
      return {
        ...p,
        isParetoOptimal,
        dominatedByNames: dominators.map((d) => d.siteName),
        explanation: isParetoOptimal
          ? 'Non-dominated on these two objectives (Note: Pareto-optimal does not guarantee passing hard mission constraints).'
          : `Dominated by ${dominators[0].siteName} (higher or equal on both axes).`,
      };
    }),
  };
}

/**
 * Landing Dispersion Analysis ("Score the ellipse, not the dot").
 * Zero-size ellipse (semiMajorM=0, semiMinorM=0) deterministically reproduces point baseline.
 */
export function runLandingDispersionAnalysis(
  ev: EvaluatedSite,
  params: DispersionParams,
  priorities: MissionPriorities,
  constraints: MissionConstraints,
  missingDataPolicy: MissingDataPolicy
): DispersionResult {
  const normW = normalizePriorities(priorities);
  const rawBase = rawScoresMap(ev);

  if (params.semiMajorM === 0 && params.semiMinorM === 0) {
    const ptCount = Math.max(1, Math.min(20, params.numSamples));
    const samples: DispersionSamplePoint[] = Array.from({ length: ptCount }, () => ({
      dxM: 0,
      dyM: 0,
      slopeDeg: ev.site.slopeDeg,
      score: ev.totalScore,
      passes: ev.passesConstraints,
    }));
    return {
      feasibilityPct: ev.passesConstraints ? 100 : 0,
      p10Score: ev.totalScore,
      medianScore: ev.totalScore,
      p90Score: ev.totalScore,
      pointBaselineScore: ev.totalScore,
      samples,
    };
  }

  const rng = createSeededRng(params.seed);
  const rotRad = (params.orientationDeg * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  const n = Math.max(25, Math.min(1000, params.numSamples));

  const samples: DispersionSamplePoint[] = [];
  let passCount = 0;

  for (let i = 0; i < n; i++) {
    // Uniform-in-area radial + angle jitter inside 3-sigma ellipse
    const r = Math.sqrt(rng());
    const theta = rng() * Math.PI * 2;
    const ux = r * Math.cos(theta) * params.semiMajorM;
    const uy = r * Math.sin(theta) * params.semiMinorM;
    const dxM = ux * cosR - uy * sinR;
    const dyM = ux * sinR + uy * cosR;

    // Spatial micro-relief dispersion scaled by ellipse radial fraction and site roughness
    const rough = ev.site.roughnessM ?? 1.4;
    const spatialWave = Math.sin(dxM * 0.012 + dyM * 0.009) * 0.6 + (rng() - 0.5) * 1.4;
    const slopeDelta = spatialWave * (1 + rough * 0.7) * Math.min(1.5, r + 0.25);
    const localSlope =
      ev.site.slopeDeg !== null ? Math.max(0.5, Number((ev.site.slopeDeg + slopeDelta).toFixed(1))) : null;

    const sunJitter = (Math.cos(dxM * 0.008) - 0.1) * 3.5 * r;
    const earthJitter = (Math.sin(dyM * 0.008) - 0.1) * 3.0 * r;
    const localSun = Math.max(0, Math.min(100, ev.activeSunlightPct + sunJitter));
    const localEarth = Math.max(0, Math.min(100, ev.activeEarthPct + earthJitter));

    const slopeForScore =
      localSlope ?? (missingDataPolicy === 'optimistic' ? 4 : missingDataPolicy === 'neutral' ? 10 : 18);
    const safetyRaw = Math.max(0, Math.min(100, (1 - slopeForScore / 20) * 75 + (1 - (rough - 0.5) / 3.0) * 25));

    const localRaw = {
      ...rawBase,
      sunlight: Math.min(100, (localSun / 95) * 100),
      earthComms: Math.min(100, (localEarth / 95) * 100),
      terrainSafety: safetyRaw,
    };
    const score = Number(wsmScore(localRaw, normW).toFixed(1));

    const slopePasses =
      localSlope !== null
        ? localSlope <= constraints.maxSlopeDeg
        : missingDataPolicy !== 'conservative';

    const passes =
      localSun >= constraints.minSunlightPercent &&
      localEarth >= constraints.minEarthCommsPercent &&
      ev.activeMaxDarkHours <= constraints.maxContinuousDarkHours &&
      slopePasses;

    if (passes) passCount++;
    samples.push({
      dxM: Number(dxM.toFixed(1)),
      dyM: Number(dyM.toFixed(1)),
      slopeDeg: localSlope,
      score,
      passes,
    });
  }

  const sortedScores = [...samples].map((s) => s.score).sort((a, b) => a - b);
  const q = (frac: number) => sortedScores[Math.min(sortedScores.length - 1, Math.floor(frac * sortedScores.length))];

  return {
    feasibilityPct: Number(((passCount / n) * 100).toFixed(1)),
    p10Score: q(0.1),
    medianScore: q(0.5),
    p90Score: q(0.9),
    pointBaselineScore: ev.totalScore,
    samples,
  };
}

/**
 * Multi-Stakeholder Decision Room: computes per-role winners, group weighted avg,
 * Borda count, Minimax-rank compromise candidate, Kendall's W consensus, and most contested criterion.
 */
export function evaluateStakeholderRoom(
  evaluatedSites: EvaluatedSite[],
  roles: StakeholderRole[]
): StakeholderRoomResult {
  const viable = evaluatedSites.filter((e) => e.passesConstraints);
  if (viable.length === 0 || roles.length === 0) {
    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        winnerSiteId: null,
        winnerSiteName: null,
        ranksBySiteId: {},
      })),
      groupWinnerWeightedAvg: null,
      groupWinnerBorda: null,
      compromiseSiteName: null,
      compromiseWorstRank: null,
      kendallW: null,
      mostContestedCriterion: 'N/A',
    };
  }

  const roleResults = roles.map((role) => {
    const w = normalizePriorities(role.priorities);
    const scored = viable
      .map((ev) => ({
        id: ev.site.id,
        name: ev.site.name,
        score: wsmScore(rawScoresMap(ev), w),
      }))
      .sort((a, b) => b.score - a.score);

    const ranksBySiteId: Record<string, number | null> = {};
    scored.forEach((s, idx) => {
      ranksBySiteId[s.id] = idx + 1;
    });
    return {
      id: role.id,
      name: role.name,
      winnerSiteId: scored[0]?.id ?? null,
      winnerSiteName: scored[0]?.name ?? null,
      ranksBySiteId,
      w,
    };
  });

  // Group weighted average
  const avgW = {} as Record<keyof MissionPriorities, number>;
  for (const k of CRITERION_KEYS) {
    avgW[k] = roleResults.reduce((acc, r) => acc + r.w[k], 0) / roleResults.length;
  }
  const byWeightedAvg = [...viable]
    .map((ev) => ({ name: ev.site.name, score: wsmScore(rawScoresMap(ev), avgW) }))
    .sort((a, b) => b.score - a.score);

  // Borda count & Minimax worst rank
  const nSites = viable.length;
  const bordaScores = viable.map((ev) => {
    let borda = 0;
    let worstRank = 1;
    let sumRank = 0;
    for (const r of roleResults) {
      const rank = r.ranksBySiteId[ev.site.id] ?? nSites;
      borda += nSites - rank;
      if (rank > worstRank) worstRank = rank;
      sumRank += rank;
    }
    return { name: ev.site.name, borda, worstRank, sumRank };
  });

  const byBorda = [...bordaScores].sort((a, b) => b.borda - a.borda || a.sumRank - b.sumRank);
  const byMinimax = [...bordaScores].sort((a, b) => a.worstRank - b.worstRank || a.sumRank - b.sumRank);

  // Kendall's W across roles
  let kendallW: number | null = null;
  if (nSites > 1 && roleResults.length > 0) {
    const rankSums = viable.map((ev) =>
      roleResults.reduce((acc, r) => acc + (r.ranksBySiteId[ev.site.id] ?? nSites), 0)
    );
    const meanRS = rankSums.reduce((a, b) => a + b, 0) / nSites;
    const S = rankSums.reduce((acc, rs) => acc + Math.pow(rs - meanRS, 2), 0);
    const m = roleResults.length;
    kendallW = Number(Math.min(1, (12 * S) / (m * m * (Math.pow(nSites, 3) - nSites))).toFixed(3));
  }

  // Most contested criterion (largest spread across roles)
  let mostContested = CRITERION_LABELS.sunlight;
  let maxSpread = -1;
  for (const k of CRITERION_KEYS) {
    const vals = roleResults.map((r) => r.w[k]);
    const sp = Math.max(...vals) - Math.min(...vals);
    if (sp > maxSpread) {
      maxSpread = sp;
      mostContested = CRITERION_LABELS[k];
    }
  }

  return {
    roles: roleResults.map(({ id, name, winnerSiteId, winnerSiteName, ranksBySiteId }) => ({
      id,
      name,
      winnerSiteId,
      winnerSiteName,
      ranksBySiteId,
    })),
    groupWinnerWeightedAvg: byWeightedAvg[0]?.name ?? null,
    groupWinnerBorda: byBorda[0]?.name ?? null,
    compromiseSiteName: byMinimax[0]?.name ?? null,
    compromiseWorstRank: byMinimax[0]?.worstRank ?? null,
    kendallW,
    mostContestedCriterion: mostContested,
  };
}

/**
 * Constraint Relaxation Frontier: sweeps each hard constraint independently
 * while holding the other constraints at their current setting, reporting bottleneck impact.
 */
export function computeConstraintRelaxationFrontier(
  evaluatedSites: EvaluatedSite[],
  constraints: MissionConstraints,
  missingDataPolicy: MissingDataPolicy
): ConstraintRelaxationSeries[] {
  const passesWith = (ev: EvaluatedSite, c: MissionConstraints) => {
    const slopeOk =
      ev.site.slopeDeg !== null ? ev.site.slopeDeg <= c.maxSlopeDeg : missingDataPolicy !== 'conservative';
    return (
      ev.activeSunlightPct >= c.minSunlightPercent &&
      ev.activeEarthPct >= c.minEarthCommsPercent &&
      ev.activeMaxDarkHours <= c.maxContinuousDarkHours &&
      slopeOk
    );
  };

  const sunSteps = [75, 60, 45, 30, 15, 0].map((v) => ({
    thresholdLabel: `${v}%`,
    viableCount: evaluatedSites.filter((e) => passesWith(e, { ...constraints, minSunlightPercent: v })).length,
  }));

  const earthSteps = [75, 60, 45, 30, 15, 0].map((v) => ({
    thresholdLabel: `${v}%`,
    viableCount: evaluatedSites.filter((e) => passesWith(e, { ...constraints, minEarthCommsPercent: v })).length,
  }));

  const darkSteps = [72, 120, 168, 240, 336, 420].map((v) => ({
    thresholdLabel: `${v}h`,
    viableCount: evaluatedSites.filter((e) => passesWith(e, { ...constraints, maxContinuousDarkHours: v })).length,
  }));

  const slopeSteps = [5, 8, 10, 12, 15, 20].map((v) => ({
    thresholdLabel: `${v}°`,
    viableCount: evaluatedSites.filter((e) => passesWith(e, { ...constraints, maxSlopeDeg: v })).length,
  }));

  const baseCount = evaluatedSites.filter((e) => passesWith(e, constraints)).length;

  const noteFor = (steps: { viableCount: number }[], label: string) => {
    const maxGain = Math.max(...steps.map((s) => s.viableCount)) - baseCount;
    return maxGain > 0 ? `+${maxGain} additional site(s) unlocked when relaxed` : `${label} is not currently blocking extra sites`;
  };

  return [
    {
      constraintKey: 'minSunlightPercent',
      label: 'Min Sunlight (%)',
      bottleneckNote: noteFor(sunSteps, 'Min Sunlight'),
      steps: sunSteps,
    },
    {
      constraintKey: 'minEarthCommsPercent',
      label: 'Min Earth DTE (%)',
      bottleneckNote: noteFor(earthSteps, 'Min Earth DTE'),
      steps: earthSteps,
    },
    {
      constraintKey: 'maxContinuousDarkHours',
      label: 'Max Continuous Darkness (h)',
      bottleneckNote: noteFor(darkSteps, 'Max Darkness'),
      steps: darkSteps,
    },
    {
      constraintKey: 'maxSlopeDeg',
      label: 'Max Landing Slope (°)',
      bottleneckNote: noteFor(slopeSteps, 'Max Slope'),
      steps: slopeSteps,
    },
  ];
}
