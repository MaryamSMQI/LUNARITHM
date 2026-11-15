import * as Astronomy from 'astronomy-engine';
import {
  CelestialPosition,
  InstantEphemeris,
  LunarSite,
  TimelineSample,
  WindowMetrics,
} from '../types/lunar';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
export const LUNAR_RADIUS_KM = 1737.4;
export const SOLAR_CONSTANT_WM2 = 1361;

function normalizeDeg360(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

function normalizeDeg180(deg: number): number {
  const d = normalizeDeg360(deg);
  return d > 180 ? d - 360 : d;
}

/**
 * Days since J2000.0 (2000-01-01T12:00:00Z)
 */
export function daysSinceJ2000(timestampMs: number): number {
  const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0);
  return (timestampMs - J2000_MS) / 86400000;
}

/**
 * Computes selenographic subsolar and sub-Earth coordinates using
 * `astronomy-engine` (VSOP87 / ELP2000 / Lunar Libration + Earth-Moon distance).
 */
export function computeSelenographicVectors(timestampMs: number) {
  const date = new Date(timestampMs);
  const d = daysSinceJ2000(timestampMs);

  const lib = Astronomy.Libration(date);
  const sunEcl = Astronomy.SunPosition(date);
  const phaseDeg = Astronomy.MoonPhase(date); // 0=New, 90=1Q, 180=Full, 270=3Q

  // Lunar ascending node longitude (J2000 Cassini's 3rd Law precession)
  const omegaNode = normalizeDeg360(125.04452 - 0.05295377 * d);

  // Earth optical libration from astronomy-engine
  const earthSubLonDeg = lib.elon;
  const earthSubLatDeg = lib.elat;
  const earthMoonDistanceKm = lib.dist_km;

  // Subsolar selenographic latitude: Moon's axial obliquity to the ecliptic is 1.5424 deg
  // By Cassini's 3rd law, lunar equator's ascending node is omegaNode + 180 deg
  const subsolarLatDeg = -1.5424 * Math.sin((sunEcl.elon - omegaNode) * DEG_TO_RAD);

  // Subsolar selenographic longitude in Moon's body-fixed frame
  // At Full Moon (phase=180), Sun is near 0 deg; at 1Q (phase=90), Sun is near +90 deg (East)
  const subsolarLonDeg = normalizeDeg180(180 - phaseDeg + earthSubLonDeg);

  const lunarPhaseFraction = 0.5 * (1 - Math.cos(phaseDeg * DEG_TO_RAD));

  return {
    subsolarLatDeg,
    subsolarLonDeg,
    earthSubLatDeg,
    earthSubLonDeg,
    earthMoonDistanceKm,
    lunarPhaseFraction,
  };
}

/**
 * Helper to compute the instantaneous subsolar latitude (deg) for any ISO epoch string.
 */
export function computeSubsolarLatForIso(isoDate: string): number {
  const ts = Date.parse(isoDate.endsWith('Z') ? isoDate : `${isoDate}:00Z`);
  if (Number.isNaN(ts)) return 0;
  return Number(computeSelenographicVectors(ts).subsolarLatDeg.toFixed(2));
}

/**
 * Interpolates local topographic horizon mask at a given azimuth (0..360 deg).
 */
export function sampleHorizonMask(horizonMaskDeg: number[], azimuthDeg: number): number {
  const az = normalizeDeg360(azimuthDeg);
  const idxFloat = az / 5;
  const idx0 = Math.floor(idxFloat) % 72;
  const idx1 = (idx0 + 1) % 72;
  const frac = idxFloat - Math.floor(idxFloat);
  return horizonMaskDeg[idx0] * (1 - frac) + horizonMaskDeg[idx1] * frac;
}

/**
 * Computes airless horizon depression angle due to site elevation above mean lunar sphere.
 * On the Moon (zero atmosphere), there is no atmospheric refraction:
 * dip = -acos(R / (R + h)) ≈ -sqrt(2h / R) radians.
 */
export function computeHorizonDipDeg(elevationM: number): number {
  if (elevationM <= 0) return 0;
  const hKm = elevationM / 1000;
  const ratio = LUNAR_RADIUS_KM / (LUNAR_RADIUS_KM + hKm);
  return -Math.acos(Math.min(1, ratio)) * RAD_TO_DEG;
}

/**
 * Converts a sub-body selenographic coordinate (subLat, subLon) into
 * local topocentric (azimuth, elevation) at a landing site, returning
 * smooth-sphere without dip, smooth-sphere with dip, and terrain-masked baselines.
 */
export function selenographicToTopocentric(
  site: LunarSite,
  bodySubLatDeg: number,
  bodySubLonDeg: number,
  parallaxDistanceRatio = 0
): CelestialPosition {
  const phi = site.latDeg * DEG_TO_RAD;
  const delta = bodySubLatDeg * DEG_TO_RAD;
  const dLon = (bodySubLonDeg - site.lonDeg) * DEG_TO_RAD;

  const sinAlt =
    Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.cos(dLon);

  const clampedSinAlt = Math.max(-1, Math.min(1, sinAlt));
  let geometricElevationDeg = Math.asin(clampedSinAlt) * RAD_TO_DEG;

  if (parallaxDistanceRatio > 0) {
    geometricElevationDeg -=
      Math.asin(Math.min(1, parallaxDistanceRatio * Math.cos(geometricElevationDeg * DEG_TO_RAD))) *
      RAD_TO_DEG;
  }

  // Azimuth measured clockwise from North (0 = N, 90 = E, 180 = S, 270 = W)
  const y = Math.cos(delta) * Math.sin(dLon);
  const x =
    Math.cos(phi) * Math.sin(delta) -
    Math.sin(phi) * Math.cos(delta) * Math.cos(dLon);
  const azimuthDeg = normalizeDeg360(Math.atan2(y, x) * RAD_TO_DEG);

  const horizonDipDeg = computeHorizonDipDeg(site.elevationM);
  const terrainMaskDeg = sampleHorizonMask(site.horizonMaskDeg, azimuthDeg);
  const effectiveHorizonDeg = Math.max(horizonDipDeg, terrainMaskDeg);
  const apparentAboveTerrainDeg = geometricElevationDeg - effectiveHorizonDeg;
  const apparentSmoothSphereDeg = geometricElevationDeg - horizonDipDeg;

  return {
    azimuthDeg,
    geometricElevationDeg,
    horizonDipDeg,
    terrainMaskDeg,
    effectiveHorizonDeg,
    apparentAboveTerrainDeg,
    apparentSmoothSphereDeg,
    isVisible: apparentAboveTerrainDeg > 0,
    isVisibleSmoothSphere: apparentSmoothSphereDeg > 0,
    isVisibleSmoothNoDip: geometricElevationDeg > 0,
  };
}

/**
 * Evaluates instantaneous Sun & Earth visibility, irradiance, and time-to-transition
 * at a specific UTC timestamp.
 */
export function computeInstantEphemeris(
  site: LunarSite,
  timestampMs: number,
  includeCountdowns = true
): InstantEphemeris {
  const vec = computeSelenographicVectors(timestampMs);
  const sun = selenographicToTopocentric(site, vec.subsolarLatDeg, vec.subsolarLonDeg, 0);
  const parallaxRatio = LUNAR_RADIUS_KM / Math.max(300000, vec.earthMoonDistanceKm);
  const earth = selenographicToTopocentric(site, vec.earthSubLatDeg, vec.earthSubLonDeg, parallaxRatio);

  const solarDiscFactor =
    sun.apparentAboveTerrainDeg >= 0.27
      ? 1
      : sun.apparentAboveTerrainDeg <= -0.27
      ? 0
      : (sun.apparentAboveTerrainDeg + 0.27) / 0.54;

  const solarIrradianceWm2 = SOLAR_CONSTANT_WM2 * solarDiscFactor;
  const sinIncidence = Math.max(0, Math.sin(Math.max(0, sun.geometricElevationDeg) * DEG_TO_RAD));
  const horizontalIrradianceWm2 = solarIrradianceWm2 * sinIncidence;

  let hoursToSunsetOrSunrise: number | null = null;
  let hoursToEarthsetOrEarthrise: number | null = null;

  if (includeCountdowns) {
    hoursToSunsetOrSunrise = findNextVisibilityTransition(site, timestampMs, 'sun', sun.isVisible);
    hoursToEarthsetOrEarthrise = findNextVisibilityTransition(site, timestampMs, 'earth', earth.isVisible);
  }

  return {
    timestampMs,
    isoUtc: new Date(timestampMs).toISOString(),
    subsolarLatDeg: vec.subsolarLatDeg,
    subsolarLonDeg: vec.subsolarLonDeg,
    earthSubLatDeg: vec.earthSubLatDeg,
    earthSubLonDeg: vec.earthSubLonDeg,
    earthMoonDistanceKm: vec.earthMoonDistanceKm,
    lunarPhaseFraction: vec.lunarPhaseFraction,
    sun,
    earth,
    solarIrradianceWm2,
    horizontalIrradianceWm2,
    hoursToSunsetOrSunrise,
    hoursToEarthsetOrEarthrise,
  };
}

function findNextVisibilityTransition(
  site: LunarSite,
  startMs: number,
  body: 'sun' | 'earth',
  initialVisible: boolean
): number | null {
  const MAX_HOURS = 710;
  for (let h = 1; h <= MAX_HOURS; h++) {
    const t = startMs + h * 3600 * 1000;
    const vec = computeSelenographicVectors(t);
    const parallaxRatio = LUNAR_RADIUS_KM / Math.max(300000, vec.earthMoonDistanceKm);
    const pos =
      body === 'sun'
        ? selenographicToTopocentric(site, vec.subsolarLatDeg, vec.subsolarLonDeg, 0)
        : selenographicToTopocentric(site, vec.earthSubLatDeg, vec.earthSubLonDeg, parallaxRatio);

    if (pos.isVisible !== initialVisible) {
      for (let m = 10; m <= 60; m += 10) {
        const tRef = startMs + ((h - 1) * 60 + m) * 60 * 1000;
        const vecRef = computeSelenographicVectors(tRef);
        const pRef = LUNAR_RADIUS_KM / Math.max(300000, vecRef.earthMoonDistanceKm);
        const posRef =
          body === 'sun'
            ? selenographicToTopocentric(site, vecRef.subsolarLatDeg, vecRef.subsolarLonDeg, 0)
            : selenographicToTopocentric(site, vecRef.earthSubLatDeg, vecRef.earthSubLonDeg, pRef);
        if (posRef.isVisible !== initialVisible) {
          return Number((h - 1 + m / 60).toFixed(1));
        }
      }
      return h;
    }
  }
  return null;
}

/**
 * Simulates a multi-day mission window, computing smooth-sphere WITHOUT dip,
 * smooth-sphere WITH dip, and terrain-masked baselines side by side.
 */
export function simulateMissionWindow(
  site: LunarSite,
  startTimestampMs: number,
  durationHours = 708,
  stepHours = 2
): WindowMetrics {
  const samples: TimelineSample[] = [];
  const totalSteps = Math.floor(durationHours / stepHours);

  let sunCount = 0;
  let sunSmoothCount = 0;
  let sunSmoothNoDipCount = 0;
  let earthCount = 0;
  let earthSmoothCount = 0;
  let bothCount = 0;

  let curDarkStreak = 0;
  let maxDarkStreak = 0;
  let curDarkSmoothStreak = 0;
  let maxDarkSmoothStreak = 0;
  let curBlackoutStreak = 0;
  let maxBlackoutStreak = 0;

  let darkInterruptions = 0;
  let prevSunVisible: boolean | null = null;

  let sumSunElev = 0;
  let peakSunElev = -90;
  let sumEarthElev = 0;
  let sumDistKm = 0;
  let minEarthDistanceKm = Infinity;
  let maxEarthDistanceKm = 0;

  for (let i = 0; i <= totalSteps; i++) {
    const offsetHours = i * stepHours;
    const timestampMs = startTimestampMs + offsetHours * 3600 * 1000;
    const instant = computeInstantEphemeris(site, timestampMs, false);

    if (prevSunVisible === true && !instant.sun.isVisible) {
      darkInterruptions++;
    }
    prevSunVisible = instant.sun.isVisible;

    if (instant.sun.isVisible) {
      sunCount++;
      curDarkStreak = 0;
    } else {
      curDarkStreak += stepHours;
      if (curDarkStreak > maxDarkStreak) maxDarkStreak = curDarkStreak;
    }

    if (instant.sun.isVisibleSmoothSphere) {
      sunSmoothCount++;
      curDarkSmoothStreak = 0;
    } else {
      curDarkSmoothStreak += stepHours;
      if (curDarkSmoothStreak > maxDarkSmoothStreak) maxDarkSmoothStreak = curDarkSmoothStreak;
    }

    if (instant.sun.isVisibleSmoothNoDip) {
      sunSmoothNoDipCount++;
    }

    if (instant.earth.isVisible) {
      earthCount++;
      curBlackoutStreak = 0;
    } else {
      curBlackoutStreak += stepHours;
      if (curBlackoutStreak > maxBlackoutStreak) maxBlackoutStreak = curBlackoutStreak;
    }

    if (instant.earth.isVisibleSmoothSphere) {
      earthSmoothCount++;
    }

    if (instant.sun.isVisible && instant.earth.isVisible) {
      bothCount++;
    }

    sumSunElev += instant.sun.apparentAboveTerrainDeg;
    if (instant.sun.apparentAboveTerrainDeg > peakSunElev) {
      peakSunElev = instant.sun.apparentAboveTerrainDeg;
    }
    sumEarthElev += instant.earth.apparentAboveTerrainDeg;
    sumDistKm += instant.earthMoonDistanceKm;
    if (instant.earthMoonDistanceKm < minEarthDistanceKm) minEarthDistanceKm = instant.earthMoonDistanceKm;
    if (instant.earthMoonDistanceKm > maxEarthDistanceKm) maxEarthDistanceKm = instant.earthMoonDistanceKm;

    samples.push({
      offsetHours,
      timestampMs,
      sunElevationAboveTerrainDeg: instant.sun.apparentAboveTerrainDeg,
      sunElevationSmoothSphereDeg: instant.sun.apparentSmoothSphereDeg,
      earthElevationAboveTerrainDeg: instant.earth.apparentAboveTerrainDeg,
      earthElevationSmoothSphereDeg: instant.earth.apparentSmoothSphereDeg,
      sunAzimuthDeg: instant.sun.azimuthDeg,
      earthAzimuthDeg: instant.earth.azimuthDeg,
      earthMoonDistanceKm: instant.earthMoonDistanceKm,
      sunVisible: instant.sun.isVisible,
      sunVisibleSmoothSphere: instant.sun.isVisibleSmoothSphere,
      sunVisibleSmoothNoDip: instant.sun.isVisibleSmoothNoDip,
      earthVisible: instant.earth.isVisible,
      earthVisibleSmoothSphere: instant.earth.isVisibleSmoothSphere,
      horizontalIrradianceWm2: instant.horizontalIrradianceWm2,
    });
  }

  const n = samples.length;
  const sunlightPercent = (sunCount / n) * 100;
  const sunlightPercentSmoothSphere = (sunSmoothCount / n) * 100;
  const sunlightPercentSmoothNoDip = (sunSmoothNoDipCount / n) * 100;
  const earthVisibilityPercent = (earthCount / n) * 100;
  const earthVisibilityPercentSmoothSphere = (earthSmoothCount / n) * 100;

  return {
    durationHours,
    sunlightPercent,
    sunlightPercentSmoothSphere,
    sunlightPercentSmoothNoDip,
    sunlightHours: (sunlightPercent / 100) * durationHours,
    earthVisibilityPercent,
    earthVisibilityPercentSmoothSphere,
    earthVisibilityHours: (earthVisibilityPercent / 100) * durationHours,
    simultaneousPowerAndCommsPercent: (bothCount / n) * 100,
    maxContinuousDarkHours: maxDarkStreak,
    maxContinuousDarkHoursSmoothSphere: maxDarkSmoothStreak,
    maxContinuousDteBlackoutHours: maxBlackoutStreak,
    meanSolarElevationDeg: sumSunElev / n,
    peakSolarElevationDeg: peakSunElev,
    meanEarthElevationDeg: sumEarthElev / n,
    meanEarthDistanceKm: sumDistKm / n,
    minEarthDistanceKm: Number.isFinite(minEarthDistanceKm) ? minEarthDistanceKm : 384400,
    maxEarthDistanceKm: maxEarthDistanceKm > 0 ? maxEarthDistanceKm : 384400,
    darkInterruptions,
    samples,
  };
}
