export type DataClass =
  | 'MEASURED'
  | 'DERIVED'
  | 'LITERATURE'
  | 'ESTIMATED'
  | 'SYNTHETIC'
  | 'MISSING';

export type RankingBasis = 'smooth_dip' | 'terrain_masked';

export interface ProvenanceRecord {
  id: string;
  label: string;
  value: string;
  unit: string;
  dataClass: DataClass;
  source: string;
  processingSteps: string[];
  formula?: string;
  uncertainty?: string;
}

export type SiteProgram =
  | 'Artemis III 2024 Region'
  | 'LOLA Illumination Benchmark'
  | 'Historical Apollo'
  | 'International Mission'
  | 'PSR Benchmark'
  | 'Custom Coordinate';

export interface TerrainFeature {
  name: string;
  azimuthDeg: number;
  angularWidthDeg: number;
  peakElevationDeg: number;
  distanceKm: number;
}

export interface LunarSite {
  id: string;
  name: string;
  region: string;
  program: SiteProgram;
  latDeg: number; // -90 (South Pole) to +90 (North Pole)
  lonDeg: number; // -180 (West) to +180 (East)
  coordinateSource: string;
  coordinateApproximate: boolean;
  elevationM: number; // Relative to 1737.4 km lunar mean sphere
  elevationDataClass: DataClass;
  slopeDeg: number | null; // null represents MISSING
  slopeDataClass: DataClass;
  roughnessM: number | null;
  psrProximityKm: number;
  scienceValueScore: number; // 0-100 baseline resource/science interest
  scienceDataClass: DataClass;
  scienceSource: string;
  horizonDataClass: DataClass;
  horizonSource: string;
  divinerTempRangeK?: [number, number] | null;
  summary: string;
  terrainFeatures: TerrainFeature[];
  /** 72 samples representing every 5 degrees of azimuth (0 = North, 90 = East, 180 = South, 270 = West) */
  horizonMaskDeg: number[];
  isCustom?: boolean;
}

export interface CelestialPosition {
  azimuthDeg: number; // 0 = North, 90 = East, 180 = South, 270 = West
  geometricElevationDeg: number; // Smooth-sphere geometric elevation
  horizonDipDeg: number; // Negative depression angle due to site height on airless Moon
  terrainMaskDeg: number; // Local topographic obstruction elevation at this azimuth
  effectiveHorizonDeg: number; // max(horizonDipDeg, terrainMaskDeg)
  apparentAboveTerrainDeg: number; // geometricElevationDeg - effectiveHorizonDeg
  apparentSmoothSphereDeg: number; // geometricElevationDeg - horizonDipDeg
  isVisible: boolean;
  isVisibleSmoothSphere: boolean;
  isVisibleSmoothNoDip: boolean;
}

export interface InstantEphemeris {
  timestampMs: number;
  isoUtc: string;
  subsolarLatDeg: number;
  subsolarLonDeg: number;
  earthSubLatDeg: number;
  earthSubLonDeg: number;
  earthMoonDistanceKm: number;
  lunarPhaseFraction: number; // 0 = New Moon, 0.5 = Full Moon
  sun: CelestialPosition;
  earth: CelestialPosition;
  solarIrradianceWm2: number;
  horizontalIrradianceWm2: number;
  hoursToSunsetOrSunrise: number | null;
  hoursToEarthsetOrEarthrise: number | null;
}

export interface TimelineSample {
  offsetHours: number;
  timestampMs: number;
  sunElevationAboveTerrainDeg: number;
  sunElevationSmoothSphereDeg: number;
  earthElevationAboveTerrainDeg: number;
  earthElevationSmoothSphereDeg: number;
  sunAzimuthDeg: number;
  earthAzimuthDeg: number;
  earthMoonDistanceKm: number;
  sunVisible: boolean;
  sunVisibleSmoothSphere: boolean;
  sunVisibleSmoothNoDip: boolean;
  earthVisible: boolean;
  earthVisibleSmoothSphere: boolean;
  horizontalIrradianceWm2: number;
}

export interface WindowMetrics {
  durationHours: number;
  sunlightPercent: number; // Terrain-masked
  sunlightPercentSmoothSphere: number; // Smooth-sphere WITH horizon dip
  sunlightPercentSmoothNoDip: number; // Smooth-sphere WITHOUT horizon dip
  sunlightHours: number;
  earthVisibilityPercent: number; // Terrain-masked
  earthVisibilityPercentSmoothSphere: number; // Smooth-sphere WITH dip
  earthVisibilityHours: number;
  simultaneousPowerAndCommsPercent: number;
  maxContinuousDarkHours: number;
  maxContinuousDarkHoursSmoothSphere: number;
  maxContinuousDteBlackoutHours: number;
  meanSolarElevationDeg: number;
  peakSolarElevationDeg: number;
  meanEarthElevationDeg: number;
  meanEarthDistanceKm: number;
  minEarthDistanceKm: number;
  maxEarthDistanceKm: number;
  darkInterruptions: number;
  samples: TimelineSample[];
}

export interface MissionPriorities {
  sunlight: number; // 0 - 100
  earthComms: number; // 0 - 100
  continuity: number; // 0 - 100
  terrainSafety: number; // 0 - 100
  scienceIce: number; // 0 - 100
}

export type WeightElicitationMode = 'sliders' | 'ahp' | 'rank';
export type MissingDataPolicy = 'conservative' | 'neutral' | 'optimistic';

export interface MissionConstraints {
  minSunlightPercent: number;
  minEarthCommsPercent: number;
  maxContinuousDarkHours: number;
  maxSlopeDeg: number;
}

export interface MissionProfile {
  id: string;
  name: string;
  description: string;
  priorities: MissionPriorities;
  constraints: MissionConstraints;
}

export interface CriterionBreakdown {
  key: keyof MissionPriorities;
  label: string;
  rawScore: number; // 0 - 100
  normalizedWeight: number; // 0 - 1
  weightedPoints: number;
  dataClass: DataClass;
}

export type ConstraintStatus = 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA';

export interface ConstraintCheckResult {
  name: string;
  status: ConstraintStatus;
  actualValue: number | null;
  thresholdValue: number;
  actualLabel: string;
  thresholdLabel: string;
  gapLabel: string;
  normalizedRatio: number; // 1.0 = exactly on threshold, <1 failing, >=1 passing
  dataClass: DataClass;
  reason?: string;
}

export interface EvaluatedSite {
  site: LunarSite;
  metrics: WindowMetrics;
  instant: InstantEphemeris;
  rankingBasis: RankingBasis;
  activeSunlightPct: number;
  activeEarthPct: number;
  activeMaxDarkHours: number;
  passesConstraints: boolean;
  constraintChecks: ConstraintCheckResult[];
  failedConstraints: string[];
  missingDataWarnings: string[];
  totalScore: number; // WSM 0 - 100
  topsisScore: number | null; // TOPSIS 0 - 100 (null if < 2 viable sites)
  rank: number | null; // WSM rank (1-based for viable sites)
  topsisRank: number | null;
  breakdown: CriterionBreakdown[];
  strengths: string[];
  weaknesses: string[];
  tradeOffNote: string;
  evidenceQuality: 'Strong' | 'Moderate' | 'Limited' | 'Insufficient';
  dataCompletenessPercent: number;
  dataMixDerivedPct: number;
  dataMixSyntheticPct: number;
}

export interface ExactFlipThreshold {
  criterionKey: keyof MissionPriorities;
  criterionLabel: string;
  currentWeightPct: number;
  flipWeightPct: number | null; // null if unreachable in [0, 100%]
  deltaWeightPct: number | null;
  challengerSiteId: string;
  challengerSiteName: string;
  summary: string;
}

export interface FlipAnalysisResult {
  status: 'no_viable' | 'sole_viable' | 'dominant' | 'flippable';
  displayLabel: string;
  topSiteId: string | null;
  topSiteName: string | null;
  runnerUpSiteId: string | null;
  runnerUpSiteName: string | null;
  runnerUpMargin: number;
  minL1ChangeToFlipPct: number | null;
  minL1ChallengerName: string | null;
  exactThresholds: ExactFlipThreshold[];
}

export interface ClosestFeasibleResult {
  closestSiteId: string;
  closestSiteName: string;
  relaxationSteps: string[];
  relaxedConstraints: MissionConstraints;
  constraintFailCounts: { name: string; failCount: number }[];
}

export interface DecisionHistoryEntry {
  id: string;
  timestampIso: string;
  trigger: string;
  winnerBefore: string | null;
  winnerAfter: string | null;
  topSiteId: string | null;
  topSiteName: string | null;
  topScore: number;
  flipped: boolean;
}

export interface TernaryCell {
  wA: number;
  wB: number;
  wC: number;
  winnerId: string;
  winnerName: string;
  margin: number;
}

export interface SiteStabilityMetric {
  siteId: string;
  siteName: string;
  firstPlaceFreqPct: number;
  top3FreqPct: number;
  meanRank: number;
  rankStdDev: number;
  eligibilityFreqPct: number;
  worstScenarioName: string;
  maxRegret: number;
  expectedRegret: number;
}

export interface StabilitySimulationResult {
  seed: number;
  numScenarios: number;
  kendallW: number;
  bestNowSiteName: string | null;
  mostConsistentSiteName: string | null;
  strictResilientSiteName: string | null;
  minimaxRegretSiteName: string | null;
  minimaxRegretValue: number | null;
  minExpectedRegretSiteName: string | null;
  recommendationsAgree: boolean;
  siteMetrics: SiteStabilityMetric[];
  namedScenarios: {
    scenarioName: string;
    ranksBySiteId: Record<string, number | null>;
    winnerName: string | null;
  }[];
}

export interface VoiItem {
  id: string;
  siteId: string;
  siteName: string;
  parameterLabel: string;
  uncertaintyRange: string;
  winnerFlipProbabilityPct: number;
  expectedScoreRegret: number;
  recommendation: string;
}

export interface ParetoAnalysisResult {
  xLabel: string;
  yLabel: string;
  points: {
    siteId: string;
    siteName: string;
    x: number;
    y: number;
    isParetoOptimal: boolean;
    dominatedByNames: string[];
    explanation: string;
  }[];
}

export interface EnergyModelParams {
  panelAreaM2: number;
  cellEfficiencyPct: number;
  dustLossPct: number;
  degradationPct: number;
  conversionEffPct: number;
  continuousLoadW: number;
  batteryCapacityWh: number;
  panelOrientation: 'vertical_tracking' | 'horizontal_fixed';
}

export interface EnergySimulationResult {
  totalSolarYieldKwh: number;
  meanPowerW: number;
  minBatterySocPct: number;
  survivesLongestNight: boolean;
  hoursUntilDepletion: number | null;
  requiredBatteryKwhForNight: number;
  initialSocPct: number;
  socSamples: { offsetHours: number; socPct: number; netPowerW: number; sunVisible: boolean }[];
}

export interface LinkBudgetParams {
  frequencyGhz: number;
  txPowerDbw: number;
  landerAntennaGainDbi: number;
  earthDishGainDbi: number;
  systemNoiseTempK: number;
  implementationLossDb: number;
  lowElevationPenaltyDb: number;
  dataRateKbps: number;
  requiredEbN0Db: number;
  relayEnabled: boolean;
  relayCoveragePct: number;
}

export interface LinkBudgetResult {
  meanDistanceKm: number;
  minDistanceKm: number;
  maxDistanceKm: number;
  freeSpacePathLossDb: number;
  receivedCNoDbHz: number;
  achievedEbN0Db: number;
  linkMarginDb: number;
  linkAvailablePct: number;
  effectiveCommsWithRelayPct: number;
}

export interface ThermalEstimateParams {
  albedo: number;
  emissivity: number;
  solarConstantWm2: number;
  nightFloorTempK: number;
  survivalMinTempK: number;
}

export interface ThermalEstimateResult {
  minTempK: number;
  maxTempK: number;
  meanTempK: number;
  hoursBelowSurvival: number;
  samples: { offsetHours: number; tempK: number }[];
}

export interface DispersionParams {
  semiMajorM: number;
  semiMinorM: number;
  orientationDeg: number;
  numSamples: number;
  seed: number;
}

export interface DispersionSamplePoint {
  dxM: number;
  dyM: number;
  slopeDeg: number | null;
  score: number;
  passes: boolean;
}

export interface DispersionResult {
  feasibilityPct: number;
  p10Score: number;
  medianScore: number;
  p90Score: number;
  pointBaselineScore: number;
  samples: DispersionSamplePoint[];
}

export interface StakeholderRole {
  id: string;
  name: string;
  priorities: MissionPriorities;
}

export interface StakeholderRoomResult {
  roles: {
    id: string;
    name: string;
    winnerSiteId: string | null;
    winnerSiteName: string | null;
    ranksBySiteId: Record<string, number | null>;
  }[];
  groupWinnerWeightedAvg: string | null;
  groupWinnerBorda: string | null;
  compromiseSiteName: string | null;
  compromiseWorstRank: number | null;
  kendallW: number | null;
  mostContestedCriterion: string;
}

export interface ConstraintRelaxationSeries {
  constraintKey: keyof MissionConstraints;
  label: string;
  bottleneckNote: string;
  steps: { thresholdLabel: string; viableCount: number }[];
}

export interface SitePairResult {
  siteAId: string;
  siteAName: string;
  siteBId: string;
  siteBName: string;
  distanceKm: number;
  isFeasibleDistance: boolean;
  combinedSunPercent: number;
  combinedDtePercent: number;
  maxAllDarkHours: number;
  gainOverBestSingleSunPct: number;
}

export interface DatasetRecord {
  id: string;
  organization: string;
  name: string;
  identifier: string;
  url: string;
  dataType: string;
  units: string;
  spatialCoverage: string;
  spatialResolution: string;
  temporalCoverage: string;
  status: 'INGESTED_ANALYTICAL' | 'SYNTHETIC_BASELINE' | 'LINKED_NOT_INGESTED';
  usedByCriteria: string;
  limitations: string;
}

export interface SelfTestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}
