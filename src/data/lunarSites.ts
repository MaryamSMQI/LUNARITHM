import { LunarSite, TerrainFeature } from '../types/lunar';

/**
 * Generates a deterministic 72-point (5-degree azimuth resolution) synthetic
 * demo horizon mask by topography class:
 * - Summits/ridges/rims: low base relief (-0.8° to +0.3°)
 * - Plateaus/plains: moderate relief (0° to +1.0°)
 * - Crater floors / PSRs: steep enclosing walls (+10° to +12.5°)
 * Explicitly labeled SYNTHETIC until replaced via per-site LOLA CSV import.
 */
export function buildHorizonMask(
  baseReliefDeg: number,
  features: TerrainFeature[],
  seed: number
): number[] {
  const mask: number[] = [];
  for (let i = 0; i < 72; i++) {
    const az = i * 5;
    const undulation =
      Math.sin(((az + seed * 37) * Math.PI) / 180 * 2) * 0.55 +
      Math.cos(((az - seed * 19) * Math.PI) / 180 * 3) * 0.35 +
      Math.sin(((az + seed * 71) * Math.PI) / 180 * 5) * 0.18;

    let elev = baseReliefDeg + undulation;

    for (const feat of features) {
      let diff = Math.abs(az - feat.azimuthDeg);
      if (diff > 180) diff = 360 - diff;
      const sigma = Math.max(8, feat.angularWidthDeg * 0.48);
      const contribution = feat.peakElevationDeg * Math.exp(-(diff * diff) / (2 * sigma * sigma));
      elev = Math.max(elev, baseReliefDeg * 0.4 + contribution);
    }

    mask.push(Number(elev.toFixed(2)));
  }
  return mask;
}

type RawSiteDef = Omit<LunarSite, 'horizonMaskDeg'> & { baseReliefDeg: number; seed: number };

const RAW_SITES: RawSiteDef[] = [
  {
    id: 'malapert-massif',
    name: 'Malapert Massif',
    region: 'Malapert Mountain Summit',
    program: 'Artemis III 2024 Region',
    latDeg: -85.98,
    lonDeg: -2.1,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 4950,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 8.8,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.6,
    psrProximityKm: 14.5,
    scienceValueScore: 86,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic summit-class mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'High-elevation south polar massif near 0° longitude, offering strong Direct-to-Earth line-of-sight geometry and broad south-polar visibility.',
    terrainFeatures: [
      { name: 'Haworth Rim', azimuthDeg: 175, angularWidthDeg: 55, peakElevationDeg: 1.1, distanceKm: 42 },
      { name: 'Cabeus Escarpment', azimuthDeg: 255, angularWidthDeg: 45, peakElevationDeg: 0.9, distanceKm: 58 },
      { name: 'South Spur', azimuthDeg: 110, angularWidthDeg: 35, peakElevationDeg: 1.2, distanceKm: 29 },
    ],
    baseReliefDeg: -0.75,
    seed: 23,
  },
  {
    id: 'mons-mouton-plateau',
    name: 'Mons Mouton Plateau',
    region: 'Leibnitz Beta Plateau (Upper)',
    program: 'Artemis III 2024 Region',
    latDeg: -84.6,
    lonDeg: 31.2,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 5210,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 4.2,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 0.9,
    psrProximityKm: 18.0,
    scienceValueScore: 82,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic plateau-class mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Broad flat-topped highland massif prioritized for gentle landing slopes, favorable Earth visibility, and multi-day solar windows.',
    terrainFeatures: [
      { name: 'Nobile Outer Rim', azimuthDeg: 95, angularWidthDeg: 46, peakElevationDeg: 1.0, distanceKm: 46 },
      { name: 'Shoemaker Ridge', azimuthDeg: 215, angularWidthDeg: 52, peakElevationDeg: 1.2, distanceKm: 52 },
    ],
    baseReliefDeg: -0.7,
    seed: 31,
  },
  {
    id: 'mons-mouton',
    name: 'Mons Mouton',
    region: 'Mons Mouton Western Flank',
    program: 'Artemis III 2024 Region',
    latDeg: -84.85,
    lonDeg: 27.6,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 4680,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 5.5,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.1,
    psrProximityKm: 13.8,
    scienceValueScore: 84,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic plateau-flank mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Elevated massif flank adjacent to shadowed depressions with balanced touchdown slopes and Earth-facing terrain geometry.',
    terrainFeatures: [
      { name: 'Mouton Crest', azimuthDeg: 75, angularWidthDeg: 48, peakElevationDeg: 1.4, distanceKm: 16 },
      { name: 'Nobile Rim', azimuthDeg: 160, angularWidthDeg: 44, peakElevationDeg: 1.1, distanceKm: 39 },
    ],
    baseReliefDeg: -0.45,
    seed: 35,
  },
  {
    id: 'nobile-rim-1',
    name: 'Nobile Rim 1',
    region: 'Nobile Crater Western Rim',
    program: 'Artemis III 2024 Region',
    latDeg: -85.2,
    lonDeg: 53.5,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 1840,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 6.9,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.4,
    psrProximityKm: 5.8,
    scienceValueScore: 91,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic crater-rim mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Western crest of Nobile Crater balancing moderate landing slopes with proximity to permanently shadowed cold traps.',
    terrainFeatures: [
      { name: 'Amundsen Highlands', azimuthDeg: 125, angularWidthDeg: 56, peakElevationDeg: 2.3, distanceKm: 33 },
      { name: 'Faustini Massif', azimuthDeg: 235, angularWidthDeg: 42, peakElevationDeg: 1.8, distanceKm: 41 },
    ],
    baseReliefDeg: 0.1,
    seed: 59,
  },
  {
    id: 'nobile-rim-2',
    name: 'Nobile Rim 2',
    region: 'Nobile Crater Southern Rim',
    program: 'Artemis III 2024 Region',
    latDeg: -86.1,
    lonDeg: 57.8,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 1620,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 8.1,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.5,
    psrProximityKm: 4.4,
    scienceValueScore: 92,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic crater-rim mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Southern rim sector of Nobile Crater offering close traverse access to cold traps with moderate eastern horizon obstruction.',
    terrainFeatures: [
      { name: 'Amundsen Ridge', azimuthDeg: 105, angularWidthDeg: 62, peakElevationDeg: 2.6, distanceKm: 28 },
      { name: 'Scott Rim', azimuthDeg: 210, angularWidthDeg: 48, peakElevationDeg: 2.0, distanceKm: 36 },
    ],
    baseReliefDeg: 0.25,
    seed: 61,
  },
  {
    id: 'haworth',
    name: 'Haworth',
    region: 'Haworth–Shoemaker Massif',
    program: 'Artemis III 2024 Region',
    latDeg: -87.45,
    lonDeg: -5.17,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 1120,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 9.6,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.7,
    psrProximityKm: 2.6,
    scienceValueScore: 93,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic massif mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Sub-polar ridge overlooking Haworth PSR. Experiences seasonal winter solar interruptions cast by neighboring Malapert Massif.',
    terrainFeatures: [
      { name: 'Malapert Massif Ridge', azimuthDeg: 5, angularWidthDeg: 46, peakElevationDeg: 3.4, distanceKm: 44 },
      { name: 'Shoemaker Wall', azimuthDeg: 145, angularWidthDeg: 52, peakElevationDeg: 2.2, distanceKm: 26 },
    ],
    baseReliefDeg: 0.15,
    seed: 67,
  },
  {
    id: 'de-gerlache-rim-2',
    name: 'de Gerlache Rim 2',
    region: 'de Gerlache Crater Crest',
    program: 'Artemis III 2024 Region',
    latDeg: -88.3,
    lonDeg: -68.4,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 2240,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 10.4,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.8,
    psrProximityKm: 2.1,
    scienceValueScore: 95,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic crest-class mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'High-latitude crater crest near 88°S with strong solar illumination and immediate proximity to cold-trap interiors.',
    terrainFeatures: [
      { name: 'de Gerlache Far Wall', azimuthDeg: 245, angularWidthDeg: 58, peakElevationDeg: 1.9, distanceKm: 22 },
      { name: 'Sverdrup Ridge', azimuthDeg: 325, angularWidthDeg: 44, peakElevationDeg: 1.5, distanceKm: 30 },
    ],
    baseReliefDeg: -0.25,
    seed: 71,
  },
  {
    id: 'peak-near-cabeus-b',
    name: 'Peak near Cabeus B',
    region: 'Cabeus–Malapert Highland Ridge',
    program: 'Artemis III 2024 Region',
    latDeg: -82.7,
    lonDeg: -49.5,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 3420,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 7.2,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.4,
    psrProximityKm: 11.2,
    scienceValueScore: 87,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic highland peak mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Elevated peak bordering Cabeus crater (LCROSS volatile impact region), offering strong western-hemisphere Earth visibility.',
    terrainFeatures: [
      { name: 'Cabeus Rim South', azimuthDeg: 185, angularWidthDeg: 54, peakElevationDeg: 1.8, distanceKm: 34 },
      { name: 'Drygalski Ridge', azimuthDeg: 270, angularWidthDeg: 42, peakElevationDeg: 1.4, distanceKm: 48 },
    ],
    baseReliefDeg: -0.5,
    seed: 75,
  },
  {
    id: 'slater-plain',
    name: 'Slater Plain',
    region: 'Slater Crater Highlands',
    program: 'Artemis III 2024 Region',
    latDeg: -87.9,
    lonDeg: 112.4,
    coordinateSource: 'NASA Artemis III 2024 Region Centroid (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 1350,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 4.8,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.0,
    psrProximityKm: 7.4,
    scienceValueScore: 89,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic plain-class mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Relatively smooth high-latitude plain beyond 90°E longitude, trading constrained Earth visibility for flat landing terrain.',
    terrainFeatures: [
      { name: 'Slater Rim West', azimuthDeg: 295, angularWidthDeg: 62, peakElevationDeg: 2.2, distanceKm: 26 },
      { name: 'Shackleton Massif', azimuthDeg: 205, angularWidthDeg: 48, peakElevationDeg: 1.8, distanceKm: 39 },
    ],
    baseReliefDeg: 0.2,
    seed: 77,
  },
  {
    id: 'connecting-ridge',
    name: 'Connecting Ridge',
    region: 'Shackleton–de Gerlache Saddle',
    program: 'LOLA Illumination Benchmark',
    latDeg: -89.45,
    lonDeg: -137.4,
    coordinateSource: 'Mazarico et al. (2011) Polar Illumination Benchmark (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: 1480,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 7.4,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 1.3,
    psrProximityKm: 3.2,
    scienceValueScore: 95,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'LUNARITHM heuristic baseline from PSR distance',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic polar ridge mask (illustrative until LOLA CSV imported)',
    divinerTempRangeK: null,
    summary:
      'Benchmark ridge connecting Shackleton and de Gerlache craters, well known in LOLA illumination studies for extended solar persistence.',
    terrainFeatures: [
      { name: 'Shackleton Rim Massif', azimuthDeg: 195, angularWidthDeg: 48, peakElevationDeg: 1.6, distanceKm: 18 },
      { name: 'de Gerlache Ridge', azimuthDeg: 35, angularWidthDeg: 42, peakElevationDeg: 1.4, distanceKm: 24 },
    ],
    baseReliefDeg: -0.45,
    seed: 11,
  },
  {
    id: 'shackleton-floor-psr',
    name: 'Shackleton Interior (PSR)',
    region: 'Shackleton Crater Floor',
    program: 'PSR Benchmark',
    latDeg: -89.67,
    lonDeg: 129.78,
    coordinateSource: 'LOLA Shackleton Crater Center (Approximate — verify)',
    coordinateApproximate: true,
    elevationM: -4200,
    elevationDataClass: 'SYNTHETIC',
    slopeDeg: 16.5,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 2.8,
    psrProximityKm: 0.0,
    scienceValueScore: 100,
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'PSR Benchmark maximum volatile-trap reference',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic 12° circumferential crater wall mask',
    divinerTempRangeK: null,
    summary:
      'Permanently shadowed cold-trap floor benchmark. High scientific interest, but ~12° crater walls block both Sun and Direct-to-Earth links.',
    terrainFeatures: [
      { name: 'Northern Crater Wall', azimuthDeg: 0, angularWidthDeg: 180, peakElevationDeg: 12.2, distanceKm: 10 },
      { name: 'Southern Crater Wall', azimuthDeg: 180, angularWidthDeg: 180, peakElevationDeg: 12.4, distanceKm: 10 },
    ],
    baseReliefDeg: 11.8,
    seed: 83,
  },
  {
    id: 'apollo-11',
    name: 'Apollo 11 — Tranquility Base',
    region: 'Mare Tranquillitatis',
    program: 'Historical Apollo',
    latDeg: 0.674,
    lonDeg: 23.473,
    coordinateSource: 'NASA Apollo 11 Lunar Surface Journal / LROC Pinpoint',
    coordinateApproximate: false,
    elevationM: -1900,
    elevationDataClass: 'LITERATURE',
    slopeDeg: 2.1,
    slopeDataClass: 'LITERATURE',
    roughnessM: 0.6,
    psrProximityKm: 2700,
    scienceValueScore: 68,
    scienceDataClass: 'LITERATURE',
    scienceSource: 'Historical basaltic mare sample return benchmark',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic flat mare horizon mask',
    divinerTempRangeK: null,
    summary:
      'Equatorial mare contrast site: 14.7 days of high Sun followed by 14.7 days of continuous night, with Earth remaining near zenith.',
    terrainFeatures: [
      { name: 'Distant Mare Wrinkle Ridge', azimuthDeg: 105, angularWidthDeg: 40, peakElevationDeg: 0.8, distanceKm: 38 },
    ],
    baseReliefDeg: 0.15,
    seed: 91,
  },
  {
    id: 'change-4',
    name: "Chang'e-4 — Von Kármán",
    region: 'South Pole–Aitken Basin (Farside)',
    program: 'International Mission',
    latDeg: -45.457,
    lonDeg: 177.588,
    coordinateSource: 'CNSA / LROC Chang’e-4 Landing Coordinates',
    coordinateApproximate: false,
    elevationM: -5900,
    elevationDataClass: 'LITERATURE',
    slopeDeg: 3.4,
    slopeDataClass: 'SYNTHETIC',
    roughnessM: 0.8,
    psrProximityKm: 1350,
    scienceValueScore: 84,
    scienceDataClass: 'LITERATURE',
    scienceSource: 'Farside South Pole–Aitken mantle-sampling mission literature',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthetic basin horizon mask',
    divinerTempRangeK: null,
    summary:
      'Farside reference site demonstrating 0% Direct-to-Earth visibility without a relay satellite such as Queqiao.',
    terrainFeatures: [
      { name: 'Von Kármán Rim', azimuthDeg: 320, angularWidthDeg: 130, peakElevationDeg: 4.5, distanceKm: 70 },
      { name: 'Finsen Ejecta Ridge', azimuthDeg: 60, angularWidthDeg: 90, peakElevationDeg: 3.4, distanceKm: 55 },
    ],
    baseReliefDeg: 1.8,
    seed: 103,
  },
];

export const CURATED_LUNAR_SITES: LunarSite[] = RAW_SITES.map(({ baseReliefDeg, seed, ...site }) => ({
  ...site,
  horizonMaskDeg: buildHorizonMask(baseReliefDeg, site.terrainFeatures, seed),
}));

export function createCustomLunarSite(params: {
  name: string;
  latDeg: number;
  lonDeg: number;
  elevationM: number;
  slopeDeg: number | null;
  reliefRoughnessDeg?: number;
}): LunarSite {
  const { name, latDeg, lonDeg, elevationM, slopeDeg, reliefRoughnessDeg = 1.2 } = params;
  const absLat = Math.abs(latDeg);
  const psrProximityKm = absLat >= 82 ? Math.max(1.0, (90 - absLat) * 4.5) : (90 - absLat) * 30;
  const baseRelief = elevationM > 1500 ? -0.4 : elevationM < -1500 ? 1.8 : 0.4;
  const features: TerrainFeature[] = [
    {
      name: 'Local Ridge Peak',
      azimuthDeg: Math.round(((lonDeg + 360) * 1.7) % 360),
      angularWidthDeg: 55,
      peakElevationDeg: Number((reliefRoughnessDeg * 1.6).toFixed(1)),
      distanceKm: 25,
    },
    {
      name: 'Adjacent Crater Rim',
      azimuthDeg: Math.round(((lonDeg + 540) * 2.3) % 360),
      angularWidthDeg: 48,
      peakElevationDeg: Number((reliefRoughnessDeg * 1.2).toFixed(1)),
      distanceKm: 38,
    },
  ];

  const seed = Math.abs(Math.round(latDeg * 13 + lonDeg * 7)) + 5;

  return {
    id: `custom-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name: name.trim() || `Custom (${latDeg.toFixed(2)}°, ${lonDeg.toFixed(2)}°)`,
    region: `${Math.abs(latDeg).toFixed(2)}°${latDeg < 0 ? 'S' : 'N'}, ${Math.abs(lonDeg).toFixed(2)}°${lonDeg < 0 ? 'W' : 'E'}`,
    program: 'Custom Coordinate',
    latDeg,
    lonDeg,
    coordinateSource: 'User-entered custom coordinates',
    coordinateApproximate: false,
    elevationM,
    elevationDataClass: 'ESTIMATED',
    slopeDeg,
    slopeDataClass: slopeDeg === null ? 'MISSING' : 'ESTIMATED',
    roughnessM: slopeDeg === null ? null : Number((0.6 + slopeDeg * 0.11).toFixed(1)),
    psrProximityKm: Number(psrProximityKm.toFixed(1)),
    scienceValueScore: Math.round(Math.min(98, Math.max(45, absLat * 0.95))),
    scienceDataClass: 'SYNTHETIC',
    scienceSource: 'Heuristic estimate from latitude',
    horizonDataClass: 'SYNTHETIC',
    horizonSource: 'Synthesized relief mask from user roughness input',
    divinerTempRangeK: null,
    summary: 'User-defined coordinate site evaluated with live astronomy-engine ephemeris and user-parameterized relief.',
    terrainFeatures: features,
    horizonMaskDeg: buildHorizonMask(baseRelief, features, seed),
    isCustom: true,
  };
}
