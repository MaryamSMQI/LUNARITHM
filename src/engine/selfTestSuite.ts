import { CURATED_LUNAR_SITES } from '../data/lunarSites';
import { MISSION_PROFILES } from '../data/datasetRegistry';
import { DEFAULT_DEMO_PRESET, STEP_5_COMMS_SURGE_PRESET } from '../data/demoPresets';
import {
  computeHorizonDipDeg,
  computeSelenographicVectors,
  selenographicToTopocentric,
} from './lunarEphemeris';
import {
  computeDteLinkBudget,
  computeGeodesicDistanceKm,
  computeSimpleThermalEstimate,
  evaluateSitePairs,
  simulateSolarEnergyAndBattery,
} from './physicsModels';
import {
  computeAhpWeights,
  computeClosestFeasibleRelaxation,
  computeRocWeights,
  normalizePriorities,
  rankLunarSites,
} from './scoringEngine';
import {
  computeFlipAnalysis,
  computeMinimaxRegretFromMatrix,
  computeParetoFrontier,
  evaluateStakeholderRoom,
  runLandingDispersionAnalysis,
  runStabilitySimulation,
} from './decisionIntelligence';
import { SelfTestResult, StakeholderRole, TimelineSample } from '../types/lunar';

export function runAllEngineSelfTests(): SelfTestResult[] {
  const results: SelfTestResult[] = [];

  // 1. Subsolar latitude range from astronomy-engine over 1 year
  const baseTs = Date.UTC(2026, 0, 1, 12, 0, 0);
  let minSubLat = 90;
  let maxSubLat = -90;
  for (let d = 0; d < 365; d += 10) {
    const v = computeSelenographicVectors(baseTs + d * 86400000);
    if (v.subsolarLatDeg < minSubLat) minSubLat = v.subsolarLatDeg;
    if (v.subsolarLatDeg > maxSubLat) maxSubLat = v.subsolarLatDeg;
  }
  const subLatOk = minSubLat >= -1.65 && maxSubLat <= 1.65 && maxSubLat - minSubLat > 2.4;
  results.push({
    id: 'ephemeris-subsolar-lat',
    name: 'Astronomy-Engine Subsolar Latitude Range',
    passed: subLatOk,
    expected: 'Within [-1.6°, +1.6°] over 1 year (~±1.54° lunar obliquity)',
    actual: `[${minSubLat.toFixed(2)}°, +${maxSubLat.toFixed(2)}°]`,
    details: 'Verifies Cassini 3rd-law axial obliquity coupling with SunPosition().',
  });

  // 2. Geodesic antipodal distance on R = 1737.4 km
  const antipodeKm = computeGeodesicDistanceKm(-90, 0, 90, 0);
  const expectedHalfCirc = Math.PI * 1737.4;
  results.push({
    id: 'geodesic-pole-to-pole',
    name: 'Geodesic Sphere Distance (Pole-to-Pole)',
    passed: Math.abs(antipodeKm - expectedHalfCirc) < 0.01,
    expected: `${expectedHalfCirc.toFixed(2)} km`,
    actual: `${antipodeKm.toFixed(2)} km`,
    details: 'Great-circle haversine distance at R = 1737.4 km.',
  });

  // 3. Horizon dip for known height (h = 5000 m -> -sqrt(2*5/1737.4) rad ≈ -4.34°)
  const dip5k = computeHorizonDipDeg(5000);
  const expectedDip = -Math.acos(1737.4 / 1742.4) * (180 / Math.PI);
  results.push({
    id: 'horizon-dip-5km',
    name: 'Airless Horizon Dip Angle (h = 5,000 m)',
    passed: Math.abs(dip5k - expectedDip) < 0.001 && dip5k < -4.0,
    expected: `${expectedDip.toFixed(3)}°`,
    actual: `${dip5k.toFixed(3)}°`,
    details: 'Verifies dip = -acos(R / (R + h)) on airless R = 1737.4 km sphere.',
  });

  // 4. Apollo 11 historical illumination sanity check (1969-07-20T20:17Z -> morning Sun in East)
  const apollo11 = CURATED_LUNAR_SITES.find((s) => s.id === 'apollo-11')!;
  const a11Ts = Date.UTC(1969, 6, 20, 20, 17, 0);
  const a11Vec = computeSelenographicVectors(a11Ts);
  const a11Sun = selenographicToTopocentric(apollo11, a11Vec.subsolarLatDeg, a11Vec.subsolarLonDeg, 0);
  const a11Ok = a11Sun.geometricElevationDeg > 5 && a11Sun.geometricElevationDeg < 25;
  results.push({
    id: 'apollo11-epoch',
    name: 'Apollo 11 Touchdown Solar Elevation Check',
    passed: a11Ok,
    expected: 'Low morning Sun (+5° to +25° above eastern horizon)',
    actual: `+${a11Sun.geometricElevationDeg.toFixed(2)}° @ Az ${a11Sun.azimuthDeg.toFixed(1)}°`,
    details: 'Validates selenographic subsolar longitude sign and phase alignment on 1969-07-20.',
  });

  // 5. All Mission Profiles & Guided Demo Presets yield >= 3 viable sites, and Step 5 flips #1
  const testTs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const profileCounts = MISSION_PROFILES.map((p) => {
    const r = rankLunarSites(CURATED_LUNAR_SITES, testTs, 708, p.priorities, p.constraints, 'conservative', 0, 'smooth_dip');
    return { name: p.name, count: r.ranked.filter((e) => e.passesConstraints).length };
  });
  const demoBase = rankLunarSites(
    CURATED_LUNAR_SITES,
    testTs,
    DEFAULT_DEMO_PRESET.windowHours,
    DEFAULT_DEMO_PRESET.priorities,
    DEFAULT_DEMO_PRESET.constraints,
    'conservative',
    0,
    DEFAULT_DEMO_PRESET.rankingBasis
  );
  const demoFlip = rankLunarSites(
    CURATED_LUNAR_SITES,
    testTs,
    STEP_5_COMMS_SURGE_PRESET.windowHours,
    STEP_5_COMMS_SURGE_PRESET.priorities,
    STEP_5_COMMS_SURGE_PRESET.constraints,
    'conservative',
    0,
    STEP_5_COMMS_SURGE_PRESET.rankingBasis
  );
  const baseWinner = demoBase.ranked.find((e) => e.passesConstraints)?.site.id;
  const flipWinner = demoFlip.ranked.find((e) => e.passesConstraints)?.site.id;
  const allViableOk =
    profileCounts.every((c) => c.count >= 3) &&
    demoBase.ranked.filter((e) => e.passesConstraints).length >= 3 &&
    Boolean(baseWinner && flipWinner && baseWinner !== flipWinner);
  results.push({
    id: 'profiles-and-demo-flip',
    name: 'All Profiles >= 3 Viable Sites & Guided Demo Step 5 Flip',
    passed: allViableOk,
    expected: 'Every profile >= 3 viable sites AND Step 5 changes #1 winner',
    actual: `Min viable=${Math.min(...profileCounts.map((c) => c.count))}, Step1=${baseWinner} -> Step5=${flipWinner}`,
    details: 'Prevents empty "None Viable" default states and verifies real winner flip during demo.',
  });

  // 6. 0-viable and 1-viable honest N/A checks + Closest-to-feasible relaxation
  const zeroRes = rankLunarSites(
    CURATED_LUNAR_SITES,
    testTs,
    708,
    DEFAULT_DEMO_PRESET.priorities,
    { minSunlightPercent: 99, minEarthCommsPercent: 99, maxContinuousDarkHours: 1, maxSlopeDeg: 1 },
    'conservative',
    0,
    'smooth_dip'
  );
  const zeroFlip = computeFlipAnalysis(zeroRes.ranked, DEFAULT_DEMO_PRESET.priorities);
  const closestZero = computeClosestFeasibleRelaxation(zeroRes.ranked, {
    minSunlightPercent: 99,
    minEarthCommsPercent: 99,
    maxContinuousDarkHours: 1,
    maxSlopeDeg: 1,
  });
  // Single site list -> 1 viable
  const oneRes = rankLunarSites(
    [CURATED_LUNAR_SITES[0]],
    testTs,
    708,
    DEFAULT_DEMO_PRESET.priorities,
    { minSunlightPercent: 10, minEarthCommsPercent: 10, maxContinuousDarkHours: 400, maxSlopeDeg: 20 },
    'conservative',
    0,
    'smooth_dip'
  );
  const oneFlip = computeFlipAnalysis(oneRes.ranked, DEFAULT_DEMO_PRESET.priorities);
  const degenerateOk =
    zeroRes.spearmanRho === null &&
    zeroRes.kendallTau === null &&
    zeroFlip.status === 'no_viable' &&
    closestZero !== null &&
    oneRes.spearmanRho === null &&
    oneRes.ranked[0].topsisScore === null &&
    oneFlip.status === 'sole_viable';
  results.push({
    id: 'zero-one-viable-na',
    name: '0-Viable & 1-Viable N/A Safeguards (ρ, τ, TOPSIS, Flip)',
    passed: degenerateOk,
    expected: 'null Spearman/Kendall/TOPSIS and non-fabricated Flip labels',
    actual: `0-viable=${zeroFlip.displayLabel}; 1-viable=${oneFlip.displayLabel}`,
    details: 'Ensures degenerate 0/1-site rankings never display misleading ρ=1 or TOPSIS=50.',
  });

  // 7. Analytic Flip Threshold vs Direct Re-Ranking Brute Force Verification
  const testPriorities = { sunlight: 85, earthComms: 80, continuity: 75, terrainSafety: 65, scienceIce: 70 };
  const testConstraints = { minSunlightPercent: 35, minEarthCommsPercent: 15, maxContinuousDarkHours: 240, maxSlopeDeg: 15 };
  const { ranked } = rankLunarSites(CURATED_LUNAR_SITES, testTs, 336, testPriorities, testConstraints, 'conservative', 0, 'smooth_dip');
  const flipRes = computeFlipAnalysis(ranked, testPriorities);
  const firstReachable = flipRes.exactThresholds.find((t) => t.flipWeightPct !== null);
  let bruteForceVerified = true;
  let flipDetail = 'No reachable single-axis flip in current set.';
  if (firstReachable && firstReachable.flipWeightPct !== null) {
    const dir = (firstReachable.deltaWeightPct ?? 0) >= 0 ? 1.0 : -1.0;
    const wTarget = Math.max(0, Math.min(100, firstReachable.flipWeightPct + dir)) / 100;
    const baseNorm = normalizePriorities(testPriorities);
    const k = firstReachable.criterionKey;
    const restSum = 1 - baseNorm[k];
    const nextP = { ...testPriorities };
    (Object.keys(baseNorm) as (keyof typeof baseNorm)[]).forEach((key) => {
      nextP[key] = key === k ? wTarget * 1000 : ((baseNorm[key] / Math.max(1e-9, restSum)) * (1 - wTarget)) * 1000;
    });
    const { ranked: reRanked } = rankLunarSites(CURATED_LUNAR_SITES, testTs, 336, nextP, testConstraints, 'conservative', 0, 'smooth_dip');
    const newTop = reRanked.find((e) => e.passesConstraints);
    bruteForceVerified = Boolean(newTop && newTop.site.id !== flipRes.topSiteId);
    flipDetail = `Threshold ${firstReachable.criterionLabel}=${firstReachable.flipWeightPct}% -> new #1 is ${newTop?.site.name}.`;
  }
  results.push({
    id: 'analytic-flip-verification',
    name: 'Analytic Flip Threshold vs. Brute-Force Re-Score',
    passed: bruteForceVerified,
    expected: 'Winner changes immediately past analytic threshold',
    actual: bruteForceVerified ? 'Verified flip match' : 'Mismatch',
    details: flipDetail,
  });

  // 8. Weight normalization + ROC & AHP Consistency Ratio
  const roc = computeRocWeights(['sunlight', 'earthComms', 'continuity', 'terrainSafety', 'scienceIce']);
  const norm = normalizePriorities(roc);
  const sumNorm = Object.values(norm).reduce((a, b) => a + b, 0);
  const ahpPerfect = computeAhpWeights([
    [1, 2, 3, 4, 5],
    [1 / 2, 1, 1.5, 2, 2.5],
    [1 / 3, 2 / 3, 1, 4 / 3, 5 / 3],
    [1 / 4, 1 / 2, 3 / 4, 1, 1.25],
    [1 / 5, 2 / 5, 3 / 5, 4 / 5, 1],
  ]);
  results.push({
    id: 'ahp-roc-weights',
    name: 'ROC Weight Monotonicity & AHP Consistency Ratio',
    passed: Math.abs(sumNorm - 1) < 1e-6 && roc.sunlight > roc.earthComms && ahpPerfect.consistencyRatio < 0.01,
    expected: 'Sum = 1.000, CR < 0.01',
    actual: `Sum=${sumNorm.toFixed(4)}, CR=${ahpPerfect.consistencyRatio.toFixed(4)}`,
    details: 'Verifies Rank-Order Centroid and Saaty geometric-mean AHP eigenvector.',
  });

  // 9. Energy & Battery SoC Night Survival Arithmetic (372h * 400W = 148.8 kWh)
  const mockSamples: TimelineSample[] = Array.from({ length: 20 }, (_, i) => ({
    offsetHours: i * 2,
    timestampMs: testTs + i * 7200000,
    sunElevationAboveTerrainDeg: i < 10 ? 5 : -5,
    sunElevationSmoothSphereDeg: i < 10 ? 5 : -5,
    earthElevationAboveTerrainDeg: 5,
    earthElevationSmoothSphereDeg: 5,
    sunAzimuthDeg: i * 18,
    earthAzimuthDeg: 0,
    earthMoonDistanceKm: 384400,
    sunVisible: i < 10,
    sunVisibleSmoothSphere: i < 10,
    sunVisibleSmoothNoDip: i < 10,
    earthVisible: true,
    earthVisibleSmoothSphere: true,
    horizontalIrradianceWm2: i < 10 ? 118 : 0,
  }));
  const energyRes = simulateSolarEnergyAndBattery(
    mockSamples,
    2,
    {
      panelAreaM2: 3.5,
      cellEfficiencyPct: 28,
      dustLossPct: 5,
      degradationPct: 2,
      conversionEffPct: 90,
      continuousLoadW: 400,
      batteryCapacityWh: 160000,
      panelOrientation: 'vertical_tracking',
    },
    372
  );
  results.push({
    id: 'energy-battery-soc',
    name: 'Solar Energy & Battery Night Survival Math (372h × 400W)',
    passed: Math.abs(energyRes.requiredBatteryKwhForNight - 148.8) < 0.01 && energyRes.survivesLongestNight,
    expected: '400W * 372h = 148.80 kWh required; 160 kWh battery survives',
    actual: `Req=${energyRes.requiredBatteryKwhForNight} kWh, MinSoC=${energyRes.minBatterySocPct}%`,
    details: 'Verifies night energy draw vs. battery state-of-charge integration.',
  });

  // 10. Link Budget FSPL sanity at 384,400 km, 8.4 GHz (X-band ~ 222.63 dB FSPL)
  const linkRes = computeDteLinkBudget(80, 384400, {
    frequencyGhz: 8.4,
    txPowerDbw: 10,
    landerAntennaGainDbi: 22,
    earthDishGainDbi: 68,
    systemNoiseTempK: 135,
    implementationLossDb: 1.5,
    lowElevationPenaltyDb: 2.5,
    dataRateKbps: 256,
    requiredEbN0Db: 4.5,
    relayEnabled: false,
    relayCoveragePct: 0,
  });
  results.push({
    id: 'link-budget-fspl',
    name: 'X-Band DTE Free-Space Path Loss (384,400 km)',
    passed: Math.abs(linkRes.freeSpacePathLossDb - 222.63) < 0.2 && linkRes.linkMarginDb > 0,
    expected: 'FSPL ≈ 222.63 dB at 8.4 GHz, positive margin',
    actual: `FSPL=${linkRes.freeSpacePathLossDb} dB, Margin=${linkRes.linkMarginDb} dB`,
    details: 'Verifies Friis free-space loss and Boltzmann kTB link margin.',
  });

  // 11. Simple Thermal Estimate Stefan-Boltzmann sanity (subsolar high Sun eq. ~390K at A=0.12, eps=0.95)
  const thermalSample: TimelineSample[] = [
    { ...mockSamples[0], sunVisible: true, sunElevationAboveTerrainDeg: 90 },
    { ...mockSamples[0], sunVisible: false, sunElevationAboveTerrainDeg: -10 },
  ];
  const thermalRes = computeSimpleThermalEstimate(thermalSample, 2, {
    albedo: 0.12,
    emissivity: 0.95,
    solarConstantWm2: 1361,
    nightFloorTempK: 95,
    survivalMinTempK: 150,
  });
  const expectedNoonK = Math.pow(((1 - 0.12) * 1361) / (0.95 * 5.670374419e-8), 0.25);
  results.push({
    id: 'thermal-stefan-boltzmann',
    name: 'Radiative Equilibrium Thermal Estimate Formula',
    passed: Math.abs(thermalRes.maxTempK - expectedNoonK) < 0.5 && thermalRes.minTempK === 95,
    expected: `Max ≈ ${expectedNoonK.toFixed(1)} K, Min = 95 K floor`,
    actual: `Max=${thermalRes.maxTempK} K, Min=${thermalRes.minTempK} K`,
    details: 'Verifies Stefan-Boltzmann radiative equilibrium T^4 balance + night assumption.',
  });

  // 12. Minimax Regret verification on hand-computed 3x3 matrix
  // S1: [90, 60, 70], S2: [80, 82, 78], S3: [70, 90, 60]
  // Best per scenario = [90, 90, 78] -> Regrets: S1=[0, 30, 8] max 30; S2=[10, 8, 0] max 10; S3=[20, 0, 18] max 20.
  const regretCheck = computeMinimaxRegretFromMatrix(
    ['Site A', 'Site B', 'Site C'],
    ['Scen 1', 'Scen 2', 'Scen 3'],
    [
      [90, 60, 70],
      [80, 82, 78],
      [70, 90, 60],
    ]
  );
  results.push({
    id: 'minimax-regret-3x3',
    name: 'Minimax Regret (Hand-Computed 3×3 Matrix)',
    passed: regretCheck.minimaxRegretSiteName === 'Site B' && regretCheck.minimaxRegretValue === 10,
    expected: 'Minimax regret winner = Site B with max regret = 10.0',
    actual: `Winner=${regretCheck.minimaxRegretSiteName}, R=${regretCheck.minimaxRegretValue}`,
    details: 'Verifies regret(site, scenario) = best_in_scenario - score and minimax selection.',
  });

  // 13. Dispersion Analysis zero-size ellipse + Stakeholder Room identical-weights check
  const topEv = ranked.find((e) => e.passesConstraints)!;
  const zeroDisp = runLandingDispersionAnalysis(
    topEv,
    { semiMajorM: 0, semiMinorM: 0, orientationDeg: 0, numSamples: 50, seed: 101 },
    testPriorities,
    testConstraints,
    'conservative'
  );
  const identRoles: StakeholderRole[] = [
    { id: 'r1', name: 'Role 1', priorities: testPriorities },
    { id: 'r2', name: 'Role 2', priorities: testPriorities },
    { id: 'r3', name: 'Role 3', priorities: testPriorities },
  ];
  const stRes = evaluateStakeholderRoom(ranked, identRoles);
  results.push({
    id: 'dispersion-stakeholder-checks',
    name: 'Dispersion Zero-Ellipse & Stakeholder Kendall W = 1.0',
    passed:
      zeroDisp.medianScore === topEv.totalScore &&
      zeroDisp.feasibilityPct === 100 &&
      stRes.kendallW === 1 &&
      stRes.groupWinnerWeightedAvg === topEv.site.name,
    expected: `Zero-ellipse score=${topEv.totalScore}, Identical-roles W=1`,
    actual: `Disp=${zeroDisp.medianScore}, W=${stRes.kendallW}, GroupTop=${stRes.groupWinnerWeightedAvg}`,
    details: 'Verifies zero-dispersion point identity and perfect multi-role agreement W = 1.',
  });

  // 14. Seeded Stability Reproducibility & Outpost Pair maxSeparationKm enforcement
  const stabA = runStabilitySimulation(ranked, testPriorities, testConstraints, 2026, 60, 0.4);
  const stabB = runStabilitySimulation(ranked, testPriorities, testConstraints, 2026, 60, 0.4);
  const samplesMap: Record<string, TimelineSample[]> = {};
  ranked.forEach((e) => (samplesMap[e.site.id] = e.metrics.samples));
  const pairs = evaluateSitePairs(CURATED_LUNAR_SITES, samplesMap, 2, 20, false);
  const pairCheckOk = pairs.every((p) => p.isFeasibleDistance === (p.distanceKm <= 20));
  const pareto = computeParetoFrontier(ranked, 'sunlight', 'earthComms');
  results.push({
    id: 'stability-pairs-pareto',
    name: 'Stability Seed Reproducibility, Pair 20km Limit & Pareto',
    passed:
      stabA.kendallW === stabB.kendallW &&
      stabA.minimaxRegretSiteName === stabB.minimaxRegretSiteName &&
      pairCheckOk &&
      pareto.points.some((p) => p.isParetoOptimal),
    expected: 'Deterministic seed output, accurate <=20km feasibility flag, valid Pareto frontier',
    actual: `W=${stabA.kendallW}, Minimax=${stabA.minimaxRegretSiteName}, Pairs=${pairs.length}`,
    details: 'Verifies Mulberry32 seed isolation, pair distance bounds, and Pareto non-dominance.',
  });

  return results;
}
