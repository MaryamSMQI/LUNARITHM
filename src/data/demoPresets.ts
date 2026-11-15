import { MISSION_PROFILES } from './datasetRegistry';
import { MissionConstraints, MissionPriorities, RankingBasis } from '../types/lunar';

export interface DemoStepPreset {
  epochIso: string;
  windowHours: number;
  profileId: string;
  priorities: MissionPriorities;
  constraints: MissionConstraints;
  rankingBasis: RankingBasis;
  seed: number;
}

const OUTPOST = MISSION_PROFILES.find((p) => p.id === 'long-duration-outpost') ?? MISSION_PROFILES[0];

export const DEFAULT_DEMO_PRESET: DemoStepPreset = {
  epochIso: '2026-11-15T12:00',
  windowHours: 708,
  profileId: OUTPOST.id,
  priorities: { sunlight: 95, earthComms: 45, continuity: 90, terrainSafety: 55, scienceIce: 85 },
  constraints: { minSunlightPercent: 45, minEarthCommsPercent: 35, maxContinuousDarkHours: 192, maxSlopeDeg: 14 },
  rankingBasis: 'smooth_dip',
  seed: 2026,
};

export const STEP_5_COMMS_SURGE_PRESET: DemoStepPreset = {
  ...DEFAULT_DEMO_PRESET,
  profileId: 'custom',
  priorities: { sunlight: 35, earthComms: 100, continuity: 55, terrainSafety: 75, scienceIce: 30 },
};
