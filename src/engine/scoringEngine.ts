import {
  ClosestFeasibleResult,
  ConstraintCheckResult,
  CriterionBreakdown,
  DataClass,
  EvaluatedSite,
  LunarSite,
  MissingDataPolicy,
  MissionConstraints,
  MissionPriorities,
  RankingBasis,
} from '../types/lunar';
import { computeInstantEphemeris, simulateMissionWindow } from './lunarEphemeris';

export const CRITERION_KEYS: (keyof MissionPriorities)[] = [
  'sunlight',
  'earthComms',
  'continuity',
  'terrainSafety',
  'scienceIce',
];

export const CRITERION_LABELS: Record<keyof MissionPriorities, string> = {
  sunlight: 'Solar Power',
  earthComms: 'Earth DTE Comms',
  continuity: 'Ops Continuity',
  terrainSafety: 'Terrain Safety',
  scienceIce: 'Science & Ice',
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function normalizePriorities(priorities: MissionPriorities): Record<keyof MissionPriorities, number> {
  const sum =
    priorities.sunlight +
    priorities.earthComms +
    priorities.continuity +
    priorities.terrainSafety +
    priorities.scienceIce;
  const denom = sum > 0 ? sum : 1;
  return {
    sunlight: priorities.sunlight / denom,
    earthComms: priorities.earthComms / denom,
    continuity: priorities.continuity / denom,
    terrainSafety: priorities.terrainSafety / denom,
    scienceIce: priorities.scienceIce / denom,
  };
}

/**
 * Computes Analytic Hierarchy Process (AHP) weights and Consistency Ratio (CR)
 * from a 5x5 upper-triangular pairwise matrix (Saaty 1..9 scale).
 */
export function computeAhpWeights(matrix: number[][]): {
  priorities: MissionPriorities;
  consistencyRatio: number;
  lambdaMax: number;
} {
  const n = 5;
  const geomMeans = matrix.map((row) => {
    const prod = row.reduce((acc, v) => acc * v, 1);
    return Math.pow(prod, 1 / n);
  });
  const sumGm = geomMeans.reduce((a, b) => a + b, 0) || 1;
  const w = geomMeans.map((g) => g / sumGm);

  let lambdaMax = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += matrix[i][j] * w[j];
    }
    lambdaMax += rowSum / Math.max(1e-9, w[i]);
  }
  lambdaMax /= n;

  const ci = (lambdaMax - n) / (n - 1);
  const ri5 = 1.12;
  const consistencyRatio = Math.max(0, ci / ri5);

  return {
    priorities: {
      sunlight: Math.round(w[0] * 100),
      earthComms: Math.round(w[1] * 100),
      continuity: Math.round(w[2] * 100),
      terrainSafety: Math.round(w[3] * 100),
      scienceIce: Math.round(w[4] * 100),
    },
    consistencyRatio: Number(consistencyRatio.toFixed(3)),
    lambdaMax: Number(lambdaMax.toFixed(3)),
  };
}

/**
 * Rank-Order Centroid (ROC) weights from user-ordered criterion keys (most -> least important).
 */
export function computeRocWeights(orderedKeys: (keyof MissionPriorities)[]): MissionPriorities {
  const n = orderedKeys.length;
  const result: MissionPriorities = {
    sunlight: 20,
    earthComms: 20,
    continuity: 20,
    terrainSafety: 20,
    scienceIce: 20,
  };

  orderedKeys.forEach((key, idx) => {
    const rank = idx + 1;
    let sum = 0;
    for (let j = rank; j <= n; j++) {
      sum += 1 / j;
    }
    result[key] = Math.round((sum / n) * 100);
  });

  return result;
}

/**
 * Evaluates a single site with 3-state Hard Constraint checking (PASS / FAIL / INSUFFICIENT_DATA),
 * explicit smooth-sphere + dip (DERIVED) vs terrain-masked (SYNTHETIC/MEASURED) ranking basis,
 * data-mix accounting, and WSM breakdown.
 */
export function evaluateSite(
  site: LunarSite,
  startTimestampMs: number,
  durationHours: number,
  priorities: MissionPriorities,
  constraints: MissionConstraints,
  missingDataPolicy: MissingDataPolicy = 'conservative',
  relayBoostPct = 0,
  rankingBasis: RankingBasis = 'smooth_dip'
): EvaluatedSite {
  const stepHours = durationHours > 720 ? 4 : 2;
  const metrics = simulateMissionWindow(site, startTimestampMs, durationHours, stepHours);
  const instant = computeInstantEphemeris(site, startTimestampMs, true);

  // Use terrain mask if globally selected OR if real LOLA/MEASURED horizon profile has been imported for this site
  const useTerrainMask = rankingBasis === 'terrain_masked' || site.horizonDataClass === 'MEASURED';
  const effectiveBasis: RankingBasis = useTerrainMask ? 'terrain_masked' : 'smooth_dip';

  const activeSunlightPct = useTerrainMask ? metrics.sunlightPercent : metrics.sunlightPercentSmoothSphere;
  const rawActiveEarthPct = useTerrainMask
    ? metrics.earthVisibilityPercent
    : metrics.earthVisibilityPercentSmoothSphere;
  const activeMaxDarkHours = useTerrainMask
    ? metrics.maxContinuousDarkHours
    : metrics.maxContinuousDarkHoursSmoothSphere;

  const activeEarthPct =
    relayBoostPct > 0
      ? Number(((1 - (1 - rawActiveEarthPct / 100) * (1 - relayBoostPct / 100)) * 100).toFixed(1))
      : rawActiveEarthPct;

  const ephemDataClass: DataClass = useTerrainMask
    ? site.horizonDataClass === 'MEASURED'
      ? 'DERIVED'
      : 'SYNTHETIC'
    : 'DERIVED';

  const constraintChecks: ConstraintCheckResult[] = [];
  const missingDataWarnings: string[] = [];

  // 1. Min Sunlight
  const sunGap = activeSunlightPct - constraints.minSunlightPercent;
  constraintChecks.push({
    name: 'Min Sunlight Availability',
    status: sunGap >= 0 ? 'PASS' : 'FAIL',
    actualValue: Number(activeSunlightPct.toFixed(1)),
    thresholdValue: constraints.minSunlightPercent,
    actualLabel: `${activeSunlightPct.toFixed(1)}%`,
    thresholdLabel: `>= ${constraints.minSunlightPercent}%`,
    gapLabel: `${sunGap >= 0 ? '+' : ''}${sunGap.toFixed(1)}%`,
    normalizedRatio:
      constraints.minSunlightPercent > 0 ? activeSunlightPct / constraints.minSunlightPercent : 2,
    dataClass: ephemDataClass,
    reason: sunGap < 0 ? `Below min solar (${activeSunlightPct.toFixed(1)}% vs ${constraints.minSunlightPercent}%)` : undefined,
  });

  // 2. Min Earth DTE
  const earthGap = activeEarthPct - constraints.minEarthCommsPercent;
  constraintChecks.push({
    name: 'Min Earth DTE Visibility',
    status: earthGap >= 0 ? 'PASS' : 'FAIL',
    actualValue: Number(activeEarthPct.toFixed(1)),
    thresholdValue: constraints.minEarthCommsPercent,
    actualLabel: `${activeEarthPct.toFixed(1)}%`,
    thresholdLabel: `>= ${constraints.minEarthCommsPercent}%`,
    gapLabel: `${earthGap >= 0 ? '+' : ''}${earthGap.toFixed(1)}%`,
    normalizedRatio:
      constraints.minEarthCommsPercent > 0 ? activeEarthPct / constraints.minEarthCommsPercent : 2,
    dataClass: ephemDataClass,
    reason: earthGap < 0 ? `Below min DTE (${activeEarthPct.toFixed(1)}% vs ${constraints.minEarthCommsPercent}%)` : undefined,
  });

  // 3. Max Continuous Darkness
  const darkGap = constraints.maxContinuousDarkHours - activeMaxDarkHours;
  constraintChecks.push({
    name: 'Max Continuous Darkness',
    status: darkGap >= 0 ? 'PASS' : 'FAIL',
    actualValue: activeMaxDarkHours,
    thresholdValue: constraints.maxContinuousDarkHours,
    actualLabel: `${activeMaxDarkHours} h`,
    thresholdLabel: `<= ${constraints.maxContinuousDarkHours} h`,
    gapLabel: `${darkGap >= 0 ? '+' : ''}${darkGap} h margin`,
    normalizedRatio:
      activeMaxDarkHours > 0 ? constraints.maxContinuousDarkHours / activeMaxDarkHours : 2,
    dataClass: ephemDataClass,
    reason: darkGap < 0 ? `Darkness ${activeMaxDarkHours}h > ${constraints.maxContinuousDarkHours}h limit` : undefined,
  });

  // 4. Max Landing Slope (supports INSUFFICIENT_DATA if null)
  if (site.slopeDeg === null || site.slopeDataClass === 'MISSING') {
    missingDataWarnings.push('Local slope data is MISSING.');
    constraintChecks.push({
      name: 'Max Landing Slope',
      status: 'INSUFFICIENT_DATA',
      actualValue: null,
      thresholdValue: constraints.maxSlopeDeg,
      actualLabel: 'MISSING',
      thresholdLabel: `<= ${constraints.maxSlopeDeg}°`,
      gapLabel: 'N/A',
      normalizedRatio: 0,
      dataClass: 'MISSING',
      reason: `Missing slope data (${missingDataPolicy} policy)`,
    });
  } else {
    const slopeGap = constraints.maxSlopeDeg - site.slopeDeg;
    constraintChecks.push({
      name: 'Max Landing Slope',
      status: slopeGap >= 0 ? 'PASS' : 'FAIL',
      actualValue: site.slopeDeg,
      thresholdValue: constraints.maxSlopeDeg,
      actualLabel: `${site.slopeDeg.toFixed(1)}°`,
      thresholdLabel: `<= ${constraints.maxSlopeDeg}°`,
      gapLabel: `${slopeGap >= 0 ? '+' : ''}${slopeGap.toFixed(1)}°`,
      normalizedRatio: site.slopeDeg > 0 ? constraints.maxSlopeDeg / site.slopeDeg : 2,
      dataClass: site.slopeDataClass,
      reason: slopeGap < 0 ? `Slope ${site.slopeDeg.toFixed(1)}° > ${constraints.maxSlopeDeg}° limit` : undefined,
    });
  }

  if (!site.divinerTempRangeK) {
    missingDataWarnings.push('Diviner bolometric temperature is MISSING.');
  }

  const failedConstraints = constraintChecks
    .filter((c) => {
      if (c.status === 'FAIL') return true;
      if (c.status === 'INSUFFICIENT_DATA' && missingDataPolicy === 'conservative') return true;
      return false;
    })
    .map((c) => c.reason || `${c.name} (${c.status})`);

  const passesConstraints = failedConstraints.length === 0;

  // Criterion raw scores (0 - 100) using active ranking basis
  const sunlightRaw = clamp01(activeSunlightPct / 95) * 100;
  const earthCommsRaw = clamp01(activeEarthPct / 95) * 100;
  const darkPenalty = clamp01(activeMaxDarkHours / 360);
  const blackoutPenalty = clamp01(metrics.maxContinuousDteBlackoutHours / 360);
  const continuityRaw = (1 - 0.65 * darkPenalty - 0.35 * blackoutPenalty) * 100;

  const slopeVal =
    site.slopeDeg ?? (missingDataPolicy === 'optimistic' ? 4 : missingDataPolicy === 'neutral' ? 10 : 18);
  const roughVal = site.roughnessM ?? 1.5;
  const terrainSafetyRaw =
    (clamp01(1 - slopeVal / 20) * 0.75 + clamp01(1 - (roughVal - 0.5) / 3.0) * 0.25) * 100;
  const scienceIceRaw = site.scienceValueScore;

  const normW = normalizePriorities(priorities);
  const entries: { key: keyof MissionPriorities; raw: number; dataClass: DataClass }[] = [
    { key: 'sunlight', raw: sunlightRaw, dataClass: ephemDataClass },
    { key: 'earthComms', raw: earthCommsRaw, dataClass: ephemDataClass },
    { key: 'continuity', raw: continuityRaw, dataClass: ephemDataClass },
    { key: 'terrainSafety', raw: terrainSafetyRaw, dataClass: site.slopeDataClass },
    { key: 'scienceIce', raw: scienceIceRaw, dataClass: site.scienceDataClass },
  ];

  const breakdown: CriterionBreakdown[] = entries.map((e) => {
    const w = normW[e.key];
    return {
      key: e.key,
      label: CRITERION_LABELS[e.key],
      rawScore: Number(e.raw.toFixed(1)),
      normalizedWeight: w,
      weightedPoints: Number((e.raw * w).toFixed(2)),
      dataClass: e.dataClass,
    };
  });

  const totalScore = Number(breakdown.reduce((acc, b) => acc + b.weightedPoints, 0).toFixed(1));

  // Honest Data Mix breakdown (criteria weights derived/measured/literature vs synthetic/missing)
  let derivedShare = 0;
  let syntheticShare = 0;
  for (const b of breakdown) {
    if (b.dataClass === 'DERIVED' || b.dataClass === 'MEASURED' || b.dataClass === 'LITERATURE') {
      derivedShare += b.normalizedWeight;
    } else {
      syntheticShare += b.normalizedWeight;
    }
  }
  const dataMixDerivedPct = Math.round(derivedShare * 100);
  const dataMixSyntheticPct = Math.max(0, 100 - dataMixDerivedPct);
  void syntheticShare;

  // Data completeness & Evidence-quality classification
  const measuredOrLitCount = [
    site.elevationDataClass,
    site.slopeDataClass,
    site.horizonDataClass,
    site.divinerTempRangeK ? 'MEASURED' : 'MISSING',
  ].filter((c) => c === 'MEASURED' || c === 'LITERATURE').length;

  const nonMissingCount = [
    site.elevationDataClass,
    site.slopeDataClass,
    site.horizonDataClass,
    site.divinerTempRangeK ? 'MEASURED' : 'MISSING',
  ].filter((c) => c !== 'MISSING').length;

  const dataCompletenessPercent = Math.round((nonMissingCount / 4) * 100);
  const evidenceQuality: EvaluatedSite['evidenceQuality'] =
    measuredOrLitCount >= 3
      ? 'Strong'
      : measuredOrLitCount >= 1 || (!site.coordinateApproximate && nonMissingCount >= 3)
      ? 'Moderate'
      : nonMissingCount >= 2
      ? 'Limited'
      : 'Insufficient';

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (activeSunlightPct >= 75) strengths.push(`High illumination (${activeSunlightPct.toFixed(0)}%)`);
  else if (activeSunlightPct < 45) weaknesses.push(`Limited sunlight (${activeSunlightPct.toFixed(0)}%)`);

  if (activeEarthPct >= 80) strengths.push(`Strong DTE link (${activeEarthPct.toFixed(0)}%)`);
  else if (activeEarthPct < 30) weaknesses.push(`Low Earth visibility (${activeEarthPct.toFixed(0)}%)`);

  if (activeMaxDarkHours <= 84) strengths.push(`Short dark gaps (${activeMaxDarkHours}h max)`);
  else if (activeMaxDarkHours >= 180) weaknesses.push(`Long dark stretch (${activeMaxDarkHours}h)`);

  if (site.slopeDeg !== null && site.slopeDeg <= 6) strengths.push(`Gentle terrain (${site.slopeDeg.toFixed(1)}° slope)`);
  else if (site.slopeDeg !== null && site.slopeDeg >= 10) weaknesses.push(`Steep slope (${site.slopeDeg.toFixed(1)}°)`);

  if (site.psrProximityKm <= 6) strengths.push(`Near PSR cold traps (${site.psrProximityKm} km)`);
  else if (site.psrProximityKm > 50) weaknesses.push(`Far from polar PSRs`);

  if (strengths.length === 0) strengths.push('Balanced intermediate metrics');
  if (weaknesses.length === 0) weaknesses.push('No major single-axis deficiency');

  let tradeOffNote = '';
  if (!passesConstraints) {
    tradeOffNote = `Not eligible under current constraints: ${failedConstraints.join('; ')}.`;
  } else if (activeSunlightPct >= 75 && (site.slopeDeg ?? 0) >= 9) {
    tradeOffNote = 'Gains sustained solar illumination while accepting steeper crater-rim landing slopes.';
  } else if (activeEarthPct >= 85 && site.psrProximityKm > 10) {
    tradeOffNote = 'Gains high Direct-to-Earth link continuity at greater traverse distance from polar PSRs.';
  } else if ((site.slopeDeg ?? 99) <= 5.5 && activeSunlightPct >= 55) {
    tradeOffNote = 'Prioritizes flat touchdown margins and moderate illumination over immediate PSR adjacency.';
  } else {
    tradeOffNote = 'Balanced trade-off across illumination, Direct-to-Earth comms, and polar resource proximity.';
  }

  return {
    site,
    metrics: {
      ...metrics,
      earthVisibilityPercent:
        relayBoostPct > 0 && useTerrainMask ? activeEarthPct : metrics.earthVisibilityPercent,
    },
    instant,
    rankingBasis: effectiveBasis,
    activeSunlightPct,
    activeEarthPct,
    activeMaxDarkHours,
    passesConstraints,
    constraintChecks,
    failedConstraints,
    missingDataWarnings,
    totalScore,
    topsisScore: null,
    rank: null,
    topsisRank: null,
    breakdown,
    strengths,
    weaknesses,
    tradeOffNote,
    evidenceQuality,
    dataCompletenessPercent,
    dataMixDerivedPct,
    dataMixSyntheticPct,
  };
}

/**
 * Computes TOPSIS closeness coefficients across viable sites (requires >= 2 viable),
 * plus Spearman rho & Kendall tau agreement (requires >= 3 ranked sites).
 */
export function rankLunarSites(
  sites: LunarSite[],
  startTimestampMs: number,
  durationHours: number,
  priorities: MissionPriorities,
  constraints: MissionConstraints,
  missingDataPolicy: MissingDataPolicy = 'conservative',
  relayBoostPct = 0,
  rankingBasis: RankingBasis = 'smooth_dip'
): {
  ranked: EvaluatedSite[];
  spearmanRho: number | null;
  kendallTau: number | null;
  methodDisagreementNote: string;
} {
  const evaluated = sites.map((site) =>
    evaluateSite(
      site,
      startTimestampMs,
      durationHours,
      priorities,
      constraints,
      missingDataPolicy,
      relayBoostPct,
      rankingBasis
    )
  );

  const viable = evaluated.filter((e) => e.passesConstraints);
  const rejected = evaluated.filter((e) => !e.passesConstraints);

  // Sort WSM
  viable.sort((a, b) => b.totalScore - a.totalScore);
  viable.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  // Compute TOPSIS strictly when viable.length >= 2 (otherwise degenerate)
  if (viable.length >= 2) {
    const kCount = CRITERION_KEYS.length;
    const normDenominators = CRITERION_KEYS.map((key) => {
      const sqSum = viable.reduce((acc, item) => {
        const val = item.breakdown.find((b) => b.key === key)?.rawScore ?? 0;
        return acc + val * val;
      }, 0);
      return Math.sqrt(sqSum) || 1;
    });

    const weightedMat = viable.map((item) =>
      CRITERION_KEYS.map((key, idx) => {
        const b = item.breakdown.find((x) => x.key === key)!;
        return (b.rawScore / normDenominators[idx]) * b.normalizedWeight;
      })
    );

    const idealBest = Array.from({ length: kCount }, (_, j) =>
      Math.max(...weightedMat.map((row) => row[j]))
    );
    const idealWorst = Array.from({ length: kCount }, (_, j) =>
      Math.min(...weightedMat.map((row) => row[j]))
    );

    viable.forEach((item, i) => {
      let dPlus = 0;
      let dMinus = 0;
      for (let j = 0; j < kCount; j++) {
        dPlus += Math.pow(weightedMat[i][j] - idealBest[j], 2);
        dMinus += Math.pow(weightedMat[i][j] - idealWorst[j], 2);
      }
      dPlus = Math.sqrt(dPlus);
      dMinus = Math.sqrt(dMinus);
      const cc = dPlus + dMinus > 0 ? dMinus / (dPlus + dMinus) : 0.5;
      item.topsisScore = Number((cc * 100).toFixed(1));
    });

    const byTopsis = [...viable].sort((a, b) => (b.topsisScore ?? 0) - (a.topsisScore ?? 0));
    byTopsis.forEach((item, idx) => {
      item.topsisRank = idx + 1;
    });
  } else if (viable.length === 1) {
    viable[0].topsisScore = null;
    viable[0].topsisRank = null;
  }

  rejected.sort((a, b) => b.totalScore - a.totalScore);

  let spearmanRho: number | null = null;
  let kendallTau: number | null = null;
  let methodDisagreementNote = 'No viable candidate satisfies current hard constraints.';

  if (viable.length === 1) {
    methodDisagreementNote =
      'Single viable site — TOPSIS and rank correlation require ≥ 2 / ≥ 3 viable candidates.';
  } else if (viable.length === 2) {
    const topsisWinner = viable.find((v) => v.topsisRank === 1);
    methodDisagreementNote =
      topsisWinner && topsisWinner.site.id !== viable[0].site.id
        ? `WSM selects ${viable[0].site.name} while TOPSIS selects ${topsisWinner.site.name}. Rank correlation requires ≥ 3 sites.`
        : `Both WSM and TOPSIS select ${viable[0].site.name}. Rank correlation (ρ, τ) requires ≥ 3 viable sites.`;
  } else if (viable.length >= 3) {
    const n = viable.length;
    const dSqSum = viable.reduce((acc, e) => {
      const diff = (e.rank ?? n) - (e.topsisRank ?? n);
      return acc + diff * diff;
    }, 0);
    spearmanRho = Number((1 - (6 * dSqSum) / (n * (n * n - 1))).toFixed(3));

    let concordant = 0;
    let discordant = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const wDiff = (viable[i].rank ?? 0) - (viable[j].rank ?? 0);
        const tDiff = (viable[i].topsisRank ?? 0) - (viable[j].topsisRank ?? 0);
        if (wDiff * tDiff > 0) concordant++;
        else if (wDiff * tDiff < 0) discordant++;
      }
    }
    const pairs = (n * (n - 1)) / 2;
    kendallTau = pairs > 0 ? Number(((concordant - discordant) / pairs).toFixed(3)) : 1;

    const topsisWinner = viable.find((v) => v.topsisRank === 1);
    if (topsisWinner && topsisWinner.site.id !== viable[0].site.id) {
      methodDisagreementNote = `WSM selects ${viable[0].site.name} while TOPSIS selects ${topsisWinner.site.name} because TOPSIS penalizes extreme single-criterion deficits via Euclidean distance.`;
    } else if (spearmanRho < 0.95) {
      methodDisagreementNote = `Both methods agree on #1 (${viable[0].site.name}), with minor mid-table swaps due to TOPSIS ideal-distance scaling.`;
    } else {
      methodDisagreementNote = 'WSM and TOPSIS agree on the top-ranked candidate.';
    }
  }

  return {
    ranked: [...viable, ...rejected],
    spearmanRho,
    kendallTau,
    methodDisagreementNote,
  };
}

/**
 * When 0 sites qualify, computes per-constraint failure counts and identifies
 * the closest-to-feasible site (smallest normalized violation) along with the exact minimal relaxation.
 */
export function computeClosestFeasibleRelaxation(
  evaluatedSites: EvaluatedSite[],
  constraints: MissionConstraints
): ClosestFeasibleResult | null {
  if (evaluatedSites.length === 0) return null;

  const constraintNames = [
    'Min Sunlight Availability',
    'Min Earth DTE Visibility',
    'Max Continuous Darkness',
    'Max Landing Slope',
  ];

  const constraintFailCounts = constraintNames.map((name) => ({
    name,
    failCount: evaluatedSites.filter((e) =>
      e.constraintChecks.some((c) => c.name === name && c.status !== 'PASS')
    ).length,
  }));

  let bestSite: EvaluatedSite | null = null;
  let smallestViolation = Infinity;

  for (const ev of evaluatedSites) {
    let violation = 0;
    if (ev.activeSunlightPct < constraints.minSunlightPercent) {
      violation += (constraints.minSunlightPercent - ev.activeSunlightPct) / 100;
    }
    if (ev.activeEarthPct < constraints.minEarthCommsPercent) {
      violation += (constraints.minEarthCommsPercent - ev.activeEarthPct) / 100;
    }
    if (ev.activeMaxDarkHours > constraints.maxContinuousDarkHours) {
      violation += (ev.activeMaxDarkHours - constraints.maxContinuousDarkHours) / 400;
    }
    if (ev.site.slopeDeg === null) {
      violation += 2.0; // penalize missing slope relative to numeric violations
    } else if (ev.site.slopeDeg > constraints.maxSlopeDeg) {
      violation += (ev.site.slopeDeg - constraints.maxSlopeDeg) / 20;
    }

    if (violation < smallestViolation) {
      smallestViolation = violation;
      bestSite = ev;
    }
  }

  if (!bestSite) return null;

  const relaxed = { ...constraints };
  const relaxationSteps: string[] = [];

  if (bestSite.activeSunlightPct < constraints.minSunlightPercent) {
    const nextSun = Math.max(0, Math.floor(bestSite.activeSunlightPct));
    relaxationSteps.push(
      `Lower Min Sunlight from ${constraints.minSunlightPercent}% to ${nextSun}%`
    );
    relaxed.minSunlightPercent = nextSun;
  }

  if (bestSite.activeEarthPct < constraints.minEarthCommsPercent) {
    const nextEarth = Math.max(0, Math.floor(bestSite.activeEarthPct));
    relaxationSteps.push(
      `Lower Min Earth DTE from ${constraints.minEarthCommsPercent}% to ${nextEarth}%`
    );
    relaxed.minEarthCommsPercent = nextEarth;
  }

  if (bestSite.activeMaxDarkHours > constraints.maxContinuousDarkHours) {
    const nextDark = Math.ceil(bestSite.activeMaxDarkHours);
    relaxationSteps.push(
      `Raise Max Continuous Darkness from ${constraints.maxContinuousDarkHours} h to ${nextDark} h`
    );
    relaxed.maxContinuousDarkHours = nextDark;
  }

  if (bestSite.site.slopeDeg !== null && bestSite.site.slopeDeg > constraints.maxSlopeDeg) {
    const nextSlope = Math.ceil(bestSite.site.slopeDeg);
    relaxationSteps.push(
      `Raise Max Landing Slope from ${constraints.maxSlopeDeg}° to ${nextSlope}°`
    );
    relaxed.maxSlopeDeg = nextSlope;
  }

  if (relaxationSteps.length === 0) {
    relaxationSteps.push('Switch Missing-Data Policy to Neutral or Optimistic for incomplete slope records.');
  }

  return {
    closestSiteId: bestSite.site.id,
    closestSiteName: bestSite.site.name,
    relaxationSteps,
    relaxedConstraints: relaxed,
    constraintFailCounts,
  };
}
