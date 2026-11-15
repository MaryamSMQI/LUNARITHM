import {
  EnergyModelParams,
  EnergySimulationResult,
  LinkBudgetParams,
  LinkBudgetResult,
  LunarSite,
  SitePairResult,
  ThermalEstimateParams,
  ThermalEstimateResult,
  TimelineSample,
} from '../types/lunar';
import { LUNAR_RADIUS_KM, SOLAR_CONSTANT_WM2 } from './lunarEphemeris';

const DEG_TO_RAD = Math.PI / 180;
const SPEED_OF_LIGHT_MS = 299792458;
const BOLTZMANN_J_K = 1.380649e-23;
const STEFAN_BOLTZMANN = 5.670374419e-8;

/**
 * Great-circle geodesic distance on a lunar sphere of radius R = 1737.4 km.
 */
export function computeGeodesicDistanceKm(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number
): number {
  const phi1 = lat1Deg * DEG_TO_RAD;
  const phi2 = lat2Deg * DEG_TO_RAD;
  const dPhi = (lat2Deg - lat1Deg) * DEG_TO_RAD;
  const dLambda = (lon2Deg - lon1Deg) * DEG_TO_RAD;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return LUNAR_RADIUS_KM * c;
}

/**
 * Labeled Simplified Solar Energy & Battery State-of-Charge (SoC) Simulation.
 * Supports selectable panel orientation (vertical sun-tracking default for polar sites,
 * or horizontal fixed deck). Tracks hoursUntilDepletion & documented 90% initial SoC.
 */
export function simulateSolarEnergyAndBattery(
  samples: TimelineSample[],
  stepHours: number,
  params: EnergyModelParams,
  maxDarkHours: number
): EnergySimulationResult {
  const effFactor =
    (params.cellEfficiencyPct / 100) *
    (1 - params.dustLossPct / 100) *
    (1 - params.degradationPct / 100) *
    (params.conversionEffPct / 100);

  const initialSocPct = 90;
  let batteryWh = params.batteryCapacityWh * (initialSocPct / 100);
  let minSocPct = initialSocPct;
  let totalEnergyWh = 0;
  let hoursUntilDepletion: number | null = null;

  const socSamples: { offsetHours: number; socPct: number; netPowerW: number; sunVisible: boolean }[] = [];

  for (const s of samples) {
    let generatedW = 0;
    if (s.sunVisible) {
      const elevRad = Math.max(0, s.sunElevationAboveTerrainDeg) * DEG_TO_RAD;
      const incidenceFactor =
        params.panelOrientation === 'horizontal_fixed'
          ? Math.max(0, Math.sin(elevRad))
          : Math.max(0.25, Math.cos(Math.max(0, elevRad - 0.08)));
      generatedW = SOLAR_CONSTANT_WM2 * incidenceFactor * params.panelAreaM2 * effFactor;
    }

    const netW = generatedW - params.continuousLoadW;
    totalEnergyWh += generatedW * stepHours;

    batteryWh = Math.min(params.batteryCapacityWh, Math.max(0, batteryWh + netW * stepHours));
    const socPct = params.batteryCapacityWh > 0 ? (batteryWh / params.batteryCapacityWh) * 100 : 0;
    if (socPct < minSocPct) minSocPct = socPct;
    if (hoursUntilDepletion === null && socPct <= 0.1) {
      hoursUntilDepletion = s.offsetHours;
    }

    socSamples.push({
      offsetHours: s.offsetHours,
      socPct: Number(socPct.toFixed(1)),
      netPowerW: Number(netW.toFixed(1)),
      sunVisible: s.sunVisible,
    });
  }

  const requiredBatteryKwhForNight = (params.continuousLoadW * maxDarkHours) / 1000;
  const survivesLongestNight = minSocPct > 5 && params.batteryCapacityWh / 1000 >= requiredBatteryKwhForNight;

  return {
    totalSolarYieldKwh: Number((totalEnergyWh / 1000).toFixed(1)),
    meanPowerW: Number((totalEnergyWh / Math.max(1, samples.length * stepHours)).toFixed(1)),
    minBatterySocPct: Number(minSocPct.toFixed(1)),
    survivesLongestNight,
    hoursUntilDepletion,
    requiredBatteryKwhForNight: Number(requiredBatteryKwhForNight.toFixed(2)),
    initialSocPct,
    socSamples,
  };
}

/**
 * Labeled Simplified Direct-to-Earth (DTE) RF Link Budget.
 * Evaluates Free-Space Path Loss (FSPL) using actual Earth-Moon distance per time step
 * when samples are provided, and applies low-elevation grazing penalty below 5 deg.
 * Outputs "Link available time %" = Earth visible AND margin >= 3 dB.
 */
export function computeDteLinkBudget(
  earthVisibilityPct: number,
  meanDistanceKm: number,
  params: LinkBudgetParams,
  samples?: TimelineSample[]
): LinkBudgetResult {
  const freqHz = params.frequencyGhz * 1e9;
  const eirpDbw = params.txPowerDbw + params.landerAntennaGainDbi;
  const noiseDensityDbwHz = 10 * Math.log10(BOLTZMANN_J_K * params.systemNoiseTempK);
  const bitRateDbHz = 10 * Math.log10(Math.max(1, params.dataRateKbps * 1000));

  const evalStep = (distKm: number, lowElPenalty: number) => {
    const distM = Math.max(300000, distKm) * 1000;
    const fsplDb = 20 * Math.log10((4 * Math.PI * distM * freqHz) / SPEED_OF_LIGHT_MS);
    const rxDbw =
      eirpDbw - fsplDb + params.earthDishGainDbi - params.implementationLossDb - lowElPenalty;
    const cNo = rxDbw - noiseDensityDbwHz;
    const ebN0 = cNo - bitRateDbHz;
    const margin = ebN0 - params.requiredEbN0Db;
    return { fsplDb, cNo, ebN0, margin };
  };

  if (samples && samples.length > 0) {
    let minDistanceKm = Infinity;
    let maxDistanceKm = 0;
    let sumDist = 0;
    let visibleCount = 0;
    let linkAvailCount = 0;
    let sumFspl = 0;
    let sumCNo = 0;
    let sumEbN0 = 0;
    let sumMargin = 0;

    for (const s of samples) {
      sumDist += s.earthMoonDistanceKm;
      if (s.earthMoonDistanceKm < minDistanceKm) minDistanceKm = s.earthMoonDistanceKm;
      if (s.earthMoonDistanceKm > maxDistanceKm) maxDistanceKm = s.earthMoonDistanceKm;

      const lowElPenalty =
        s.earthVisible && s.earthElevationAboveTerrainDeg < 5 ? params.lowElevationPenaltyDb : 0;
      const stepRes = evalStep(s.earthMoonDistanceKm, lowElPenalty);
      if (s.earthVisible) {
        visibleCount++;
        sumFspl += stepRes.fsplDb;
        sumCNo += stepRes.cNo;
        sumEbN0 += stepRes.ebN0;
        sumMargin += stepRes.margin;
        if (stepRes.margin >= 3) {
          linkAvailCount++;
        }
      }
    }

    const avgDist = sumDist / samples.length;
    const fallbackRes = evalStep(avgDist, 0);
    const denom = Math.max(1, visibleCount);
    const linkAvailablePct = (linkAvailCount / samples.length) * 100;

    const dteFrac = earthVisibilityPct / 100;
    const relayFrac = params.relayEnabled ? params.relayCoveragePct / 100 : 0;
    const effectiveFrac = 1 - (1 - dteFrac) * (1 - relayFrac);

    return {
      meanDistanceKm: Number(avgDist.toFixed(0)),
      minDistanceKm: Number((Number.isFinite(minDistanceKm) ? minDistanceKm : avgDist).toFixed(0)),
      maxDistanceKm: Number((maxDistanceKm > 0 ? maxDistanceKm : avgDist).toFixed(0)),
      freeSpacePathLossDb: Number((visibleCount > 0 ? sumFspl / denom : fallbackRes.fsplDb).toFixed(2)),
      receivedCNoDbHz: Number((visibleCount > 0 ? sumCNo / denom : fallbackRes.cNo).toFixed(1)),
      achievedEbN0Db: Number((visibleCount > 0 ? sumEbN0 / denom : fallbackRes.ebN0).toFixed(1)),
      linkMarginDb: Number((visibleCount > 0 ? sumMargin / denom : fallbackRes.margin).toFixed(2)),
      linkAvailablePct: Number(linkAvailablePct.toFixed(1)),
      effectiveCommsWithRelayPct: Number((effectiveFrac * 100).toFixed(1)),
    };
  }

  const pt = evalStep(meanDistanceKm, 0);
  const dteFrac = earthVisibilityPct / 100;
  const relayFrac = params.relayEnabled ? params.relayCoveragePct / 100 : 0;
  const effectiveFrac = 1 - (1 - dteFrac) * (1 - relayFrac);

  return {
    meanDistanceKm: Number(meanDistanceKm.toFixed(0)),
    minDistanceKm: Number(meanDistanceKm.toFixed(0)),
    maxDistanceKm: Number(meanDistanceKm.toFixed(0)),
    freeSpacePathLossDb: Number(pt.fsplDb.toFixed(2)),
    receivedCNoDbHz: Number(pt.cNo.toFixed(1)),
    achievedEbN0Db: Number(pt.ebN0.toFixed(1)),
    linkMarginDb: Number(pt.margin.toFixed(2)),
    linkAvailablePct: pt.margin >= 3 ? Number(earthVisibilityPct.toFixed(1)) : 0,
    effectiveCommsWithRelayPct: Number((effectiveFrac * 100).toFixed(1)),
  };
}

/**
 * Simple Radiative Equilibrium Surface Thermal Estimate (ESTIMATED, model):
 * T = [ (1 - A) * S * max(0, sin(sun elevation)) / (emissivity * sigma) ]^(1/4)
 * with explicit user-configured night floor temperature assumption.
 */
export function computeSimpleThermalEstimate(
  samples: TimelineSample[],
  stepHours: number,
  params: ThermalEstimateParams
): ThermalEstimateResult {
  const outSamples: { offsetHours: number; tempK: number }[] = [];
  let minTempK = Infinity;
  let maxTempK = -Infinity;
  let sumTemp = 0;
  let hoursBelowSurvival = 0;

  for (const s of samples) {
    let tempK = params.nightFloorTempK;
    if (s.sunVisible && s.sunElevationAboveTerrainDeg > 0) {
      const sinEl = Math.max(0.015, Math.sin(s.sunElevationAboveTerrainDeg * DEG_TO_RAD));
      const num = (1 - params.albedo) * params.solarConstantWm2 * sinEl;
      const denom = Math.max(0.1, params.emissivity) * STEFAN_BOLTZMANN;
      const eqTemp = Math.pow(num / denom, 0.25);
      tempK = Math.max(params.nightFloorTempK, eqTemp);
    }

    if (tempK < minTempK) minTempK = tempK;
    if (tempK > maxTempK) maxTempK = tempK;
    sumTemp += tempK;
    if (tempK < params.survivalMinTempK) hoursBelowSurvival += stepHours;

    outSamples.push({
      offsetHours: s.offsetHours,
      tempK: Number(tempK.toFixed(1)),
    });
  }

  return {
    minTempK: Number((Number.isFinite(minTempK) ? minTempK : params.nightFloorTempK).toFixed(1)),
    maxTempK: Number((Number.isFinite(maxTempK) ? maxTempK : params.nightFloorTempK).toFixed(1)),
    meanTempK: Number((sumTemp / Math.max(1, outSamples.length)).toFixed(1)),
    hoursBelowSurvival,
    samples: outSamples,
  };
}

/**
 * Site Network / Pair Optimizer (geometry-based):
 * Evaluates pairs of sites for combined union of sunlit periods, combined DTE periods,
 * longest simultaneous all-dark period, and geodesic separation (rover/cable limit check).
 * Excludes user-created custom sites by default unless explicitly requested.
 */
export function evaluateSitePairs(
  sites: LunarSite[],
  samplesBySiteId: Record<string, TimelineSample[]>,
  stepHours: number,
  maxSeparationKm = 20,
  includeCustom = false
): SitePairResult[] {
  const results: SitePairResult[] = [];
  const polarCandidates = sites.filter(
    (s) => s.latDeg <= -70 && (includeCustom || !s.isCustom)
  );

  for (let i = 0; i < polarCandidates.length; i++) {
    for (let j = i + 1; j < polarCandidates.length; j++) {
      const a = polarCandidates[i];
      const b = polarCandidates[j];
      const sA = samplesBySiteId[a.id];
      const sB = samplesBySiteId[b.id];
      if (!sA || !sB || sA.length === 0 || sA.length !== sB.length) continue;

      let unionSun = 0;
      let unionDte = 0;
      let curAllDark = 0;
      let maxAllDark = 0;
      let sunA = 0;
      let sunB = 0;

      for (let k = 0; k < sA.length; k++) {
        const aLit = sA[k].sunVisible;
        const bLit = sB[k].sunVisible;
        if (aLit) sunA++;
        if (bLit) sunB++;
        if (aLit || bLit) {
          unionSun++;
          curAllDark = 0;
        } else {
          curAllDark += stepHours;
          if (curAllDark > maxAllDark) maxAllDark = curAllDark;
        }
        if (sA[k].earthVisible || sB[k].earthVisible) {
          unionDte++;
        }
      }

      const combinedSunPct = (unionSun / sA.length) * 100;
      const bestSingleSunPct = Math.max((sunA / sA.length) * 100, (sunB / sA.length) * 100);
      const combinedDtePct = (unionDte / sA.length) * 100;
      const distanceKm = computeGeodesicDistanceKm(a.latDeg, a.lonDeg, b.latDeg, b.lonDeg);

      results.push({
        siteAId: a.id,
        siteAName: a.name,
        siteBId: b.id,
        siteBName: b.name,
        distanceKm: Number(distanceKm.toFixed(1)),
        isFeasibleDistance: distanceKm <= maxSeparationKm,
        combinedSunPercent: Number(combinedSunPct.toFixed(1)),
        combinedDtePercent: Number(combinedDtePct.toFixed(1)),
        maxAllDarkHours: maxAllDark,
        gainOverBestSingleSunPct: Number((combinedSunPct - bestSingleSunPct).toFixed(1)),
      });
    }
  }

  return results.sort((a, b) => {
    if (a.isFeasibleDistance !== b.isFeasibleDistance) return a.isFeasibleDistance ? -1 : 1;
    return b.combinedSunPercent - a.combinedSunPercent || a.distanceKm - b.distanceKm;
  });
}
