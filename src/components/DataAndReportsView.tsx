import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Printer,
  Upload,
  XCircle,
} from 'lucide-react';
import { DATASET_REGISTRY } from '../data/datasetRegistry';
import { createCustomLunarSite } from '../data/lunarSites';
import { runAllEngineSelfTests } from '../engine/selfTestSuite';
import {
  computeVoiAndUncertainty,
  evaluateStakeholderRoom,
  runStabilitySimulation,
} from '../engine/decisionIntelligence';
import {
  DataClass,
  EvaluatedSite,
  FlipAnalysisResult,
  LunarSite,
  MissionConstraints,
  MissionPriorities,
  RankingBasis,
  SelfTestResult,
  StakeholderRole,
} from '../types/lunar';

interface DataAndReportsViewProps {
  evaluatedSites: EvaluatedSite[];
  allSites: LunarSite[];
  flipAnalysis: FlipAnalysisResult;
  priorities: MissionPriorities;
  constraints: MissionConstraints;
  landingIsoLocal: string;
  windowHours: number;
  spearmanRho: number | null;
  kendallTau: number | null;
  rankingBasis: RankingBasis;
  stakeholderRoles: StakeholderRole[];
  onImportSites: (imported: LunarSite[]) => void;
  onImportHorizonMask: (siteId: string, maskDeg: number[], source: string) => void;
}

const SAMPLE_IMPORT_CSV = `name,latDeg,lonDeg,elevationM,slopeDeg,dataClass,source
LOLA-Imported Mons Mouton Pad,-84.62,31.18,5215,3.8,MEASURED,User LOLA 20m GDR excerpt
LOLA-Imported Connecting Ridge Pad,-89.44,-137.38,1485,7.1,MEASURED,User LOLA 20m GDR excerpt`;

const SAMPLE_HORIZON_CSV = `azimuth_deg,horizon_elev_deg,source
0,2.1,LRO LOLA 20m DEM Profile
45,3.4,LRO LOLA 20m DEM Profile
90,1.8,LRO LOLA 20m DEM Profile
135,0.5,LRO LOLA 20m DEM Profile
180,-0.4,LRO LOLA 20m DEM Profile
225,1.2,LRO LOLA 20m DEM Profile
270,2.8,LRO LOLA 20m DEM Profile
315,2.5,LRO LOLA 20m DEM Profile`;

export const DataAndReportsView: React.FC<DataAndReportsViewProps> = ({
  evaluatedSites,
  allSites,
  flipAnalysis,
  priorities,
  constraints,
  landingIsoLocal,
  windowHours,
  spearmanRho,
  kendallTau,
  rankingBasis,
  stakeholderRoles,
  onImportSites,
  onImportHorizonMask,
}) => {
  const [subTab, setSubTab] = useState<'registry' | 'import' | 'reports' | 'selftest' | 'methods'>('registry');
  const [importMode, setImportMode] = useState<'sites' | 'horizon'>('sites');
  const [csvText, setCsvText] = useState(SAMPLE_IMPORT_CSV);
  const [horizonCsvText, setHorizonCsvText] = useState(SAMPLE_HORIZON_CSV);
  const [targetHorizonSiteId, setTargetHorizonSiteId] = useState(allSites[0]?.id ?? '');
  const [validationReport, setValidationReport] = useState<{
    message: string;
    errors: string[];
  } | null>(null);
  const [testResults, setTestResults] = useState<SelfTestResult[] | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const reproducibilityHash = useMemo(() => {
    const payload = JSON.stringify({
      landingIsoLocal,
      windowHours,
      priorities,
      constraints,
      rankingBasis,
      ranks: evaluatedSites.map((e) => [e.site.id, e.rank, e.totalScore]),
    });
    let h = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      h ^= payload.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `LUN-${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  }, [evaluatedSites, priorities, constraints, landingIsoLocal, windowHours, rankingBasis]);

  const handleValidateAndImportSites = () => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setValidationReport({ message: '', errors: ['CSV requires a header row and at least one data row.'] });
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const required = ['name', 'latDeg', 'lonDeg', 'elevationM', 'slopeDeg', 'dataClass', 'source'];
    const missingCols = required.filter((col) => !headers.includes(col));
    if (missingCols.length > 0) {
      setValidationReport({
        message: '',
        errors: [`Missing required columns: ${missingCols.join(', ')}`],
      });
      return;
    }

    const errors: string[] = [];
    const validRows: LunarSite[] = [];
    const seenNames = new Set<string>();

    for (let r = 1; r < lines.length; r++) {
      const cols = lines[r].split(',').map((c) => c.trim());
      if (cols.length !== headers.length) {
        errors.push(`Row ${r + 1}: Column count mismatch (${cols.length} vs ${headers.length}).`);
        continue;
      }
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = cols[i]));

      const lat = Number(row.latDeg);
      const lon = Number(row.lonDeg);
      const elev = Number(row.elevationM);
      const slope = row.slopeDeg === '' || row.slopeDeg.toUpperCase() === 'MISSING' ? null : Number(row.slopeDeg);
      const dc = row.dataClass.toUpperCase() as DataClass;
      const validClasses: DataClass[] = ['MEASURED', 'DERIVED', 'LITERATURE', 'ESTIMATED', 'SYNTHETIC', 'MISSING'];

      if (!row.name) {
        errors.push(`Row ${r + 1}: Missing site name.`);
        continue;
      }
      if (seenNames.has(row.name.toLowerCase())) {
        errors.push(`Row ${r + 1}: Duplicate site name "${row.name}".`);
        continue;
      }
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        errors.push(`Row ${r + 1}: latDeg "${row.latDeg}" out of [-90, 90] range.`);
        continue;
      }
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        errors.push(`Row ${r + 1}: lonDeg "${row.lonDeg}" out of [-180, 180] range.`);
        continue;
      }
      if (!Number.isFinite(elev) || elev < -10000 || elev > 12000) {
        errors.push(`Row ${r + 1}: elevationM "${row.elevationM}" out of lunar range.`);
        continue;
      }
      if (slope !== null && (!Number.isFinite(slope) || slope < 0 || slope > 45)) {
        errors.push(`Row ${r + 1}: slopeDeg "${row.slopeDeg}" invalid.`);
        continue;
      }
      if (!validClasses.includes(dc)) {
        errors.push(`Row ${r + 1}: Invalid dataClass "${row.dataClass}".`);
        continue;
      }

      seenNames.add(row.name.toLowerCase());
      const site = createCustomLunarSite({
        name: row.name,
        latDeg: lat,
        lonDeg: lon,
        elevationM: elev,
        slopeDeg: slope,
      });
      site.coordinateSource = row.source || 'User CSV Import';
      site.elevationDataClass = dc;
      site.slopeDataClass = slope === null ? 'MISSING' : dc;
      validRows.push(site);
    }

    if (validRows.length > 0 && errors.length === 0) {
      onImportSites(validRows);
      setValidationReport({
        message: `Imported ${validRows.length} validated site(s) into the live workspace.`,
        errors: [],
      });
    } else {
      setValidationReport({ message: '', errors });
    }
  };

  const handleValidateAndImportHorizon = () => {
    const lines = horizonCsvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 3) {
      setValidationReport({
        message: '',
        errors: ['Horizon CSV requires header + at least 2 azimuth samples.'],
      });
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    if (!headers.includes('azimuth_deg') || !headers.includes('horizon_elev_deg')) {
      setValidationReport({
        message: '',
        errors: ['Required columns: azimuth_deg, horizon_elev_deg (optional: source).'],
      });
      return;
    }

    const points: { az: number; el: number }[] = [];
    let source = 'User Imported LOLA Horizon CSV';
    const errors: string[] = [];

    for (let r = 1; r < lines.length; r++) {
      const cols = lines[r].split(',').map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = cols[i] ?? ''));
      const az = Number(row.azimuth_deg);
      const el = Number(row.horizon_elev_deg);
      if (!Number.isFinite(az) || az < 0 || az > 360) {
        errors.push(`Row ${r + 1}: azimuth_deg must be in [0, 360].`);
        continue;
      }
      if (!Number.isFinite(el) || el < -15 || el > 60) {
        errors.push(`Row ${r + 1}: horizon_elev_deg must be in [-15, 60].`);
        continue;
      }
      if (row.source) source = row.source;
      points.push({ az: az % 360, el });
    }

    if (errors.length > 0 || points.length < 2) {
      setValidationReport({ message: '', errors: errors.length ? errors : ['Need ≥ 2 valid points.'] });
      return;
    }

    points.sort((a, b) => a.az - b.az);
    const mask72: number[] = [];
    for (let idx = 0; idx < 72; idx++) {
      const targetAz = idx * 5;
      // Circular linear interpolation across sorted points
      let p0 = points[points.length - 1];
      let p1 = points[0];
      let found = false;
      for (let i = 0; i < points.length - 1; i++) {
        if (targetAz >= points[i].az && targetAz <= points[i + 1].az) {
          p0 = points[i];
          p1 = points[i + 1];
          found = true;
          break;
        }
      }
      if (found) {
        const span = Math.max(0.001, p1.az - p0.az);
        const f = (targetAz - p0.az) / span;
        mask72.push(Number((p0.el * (1 - f) + p1.el * f).toFixed(2)));
      } else {
        const az0 = p0.az;
        const az1 = p1.az + 360;
        const tAz = targetAz < p1.az ? targetAz + 360 : targetAz;
        const span = Math.max(0.001, az1 - az0);
        const f = (tAz - az0) / span;
        mask72.push(Number((p0.el * (1 - f) + p1.el * f).toFixed(2)));
      }
    }

    onImportHorizonMask(targetHorizonSiteId, mask72, source);
    const siteName = allSites.find((s) => s.id === targetHorizonSiteId)?.name ?? targetHorizonSiteId;
    setValidationReport({
      message: `Upgraded ${siteName} to MEASURED horizon mask (${points.length} source points interpolated to 72 × 5° bins, source: "${source}").`,
      errors: [],
    });
  };

  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const report = {
      app: 'LUNARITHM',
      reproducibilityHash,
      exportedUtc: new Date().toISOString(),
      landingEpochUtc: landingIsoLocal,
      windowHours,
      rankingBasis,
      priorities,
      constraints,
      methodAgreement: { spearmanRho, kendallTau },
      flipAnalysis,
      sites: evaluatedSites.map((e) => ({
        id: e.site.id,
        name: e.site.name,
        latDeg: e.site.latDeg,
        lonDeg: e.site.lonDeg,
        coordinateSource: e.site.coordinateSource,
        passesConstraints: e.passesConstraints,
        failedConstraints: e.failedConstraints,
        wsmRank: e.rank,
        wsmScore: e.totalScore,
        topsisRank: e.topsisRank,
        topsisScore: e.topsisScore,
        dataMixDerivedPct: e.dataMixDerivedPct,
        dataMixSyntheticPct: e.dataMixSyntheticPct,
        evidenceQuality: e.evidenceQuality,
        metrics: {
          sunlightPercent: e.metrics.sunlightPercent,
          sunlightPercentSmoothSphere: e.metrics.sunlightPercentSmoothSphere,
          sunlightPercentSmoothNoDip: e.metrics.sunlightPercentSmoothNoDip,
          earthVisibilityPercent: e.metrics.earthVisibilityPercent,
          maxContinuousDarkHours: e.metrics.maxContinuousDarkHours,
        },
      })),
    };
    downloadBlob(JSON.stringify(report, null, 2), `lunarithm-report-${reproducibilityHash}.json`, 'application/json');
  };

  const handleExportCsv = () => {
    const header =
      'rank_wsm,rank_topsis,site_name,program,lat_deg,lon_deg,passes_constraints,wsm_score,topsis_score,sunlight_pct,earth_dte_pct,max_dark_h,slope_deg,derived_mix_pct,evidence_quality';
    const rows = evaluatedSites.map((e) =>
      [
        e.rank ?? 'FAIL',
        e.topsisRank ?? 'FAIL',
        `"${e.site.name}"`,
        `"${e.site.program}"`,
        e.site.latDeg,
        e.site.lonDeg,
        e.passesConstraints,
        e.totalScore,
        e.topsisScore ?? 'N/A',
        e.activeSunlightPct.toFixed(1),
        e.activeEarthPct.toFixed(1),
        e.activeMaxDarkHours,
        e.site.slopeDeg ?? 'MISSING',
        e.dataMixDerivedPct,
        e.evidenceQuality,
      ].join(',')
    );
    downloadBlob([header, ...rows].join('\n'), `lunarithm-sites-${reproducibilityHash}.csv`, 'text/csv');
  };

  const handleDownloadRationaleMemo = () => {
    const viable = evaluatedSites.filter((e) => e.passesConstraints);
    const rejected = evaluatedSites.filter((e) => !e.passesConstraints);
    const stability = runStabilitySimulation(evaluatedSites, priorities, constraints, 2026, 300, 0.45);
    const voi = computeVoiAndUncertainty(evaluatedSites, priorities, 4096, 200);
    const room = evaluateStakeholderRoom(evaluatedSites, stakeholderRoles);
    const top = viable[0] ?? null;

    const lines: string[] = [
      `# LUNARITHM Site Selection Rationale Memo`,
      `- **Snapshot Hash:** \`${reproducibilityHash}\``,
      `- **Landing Epoch (UTC):** ${landingIsoLocal} | **Window:** ${Math.round(windowHours / 24)} days (${windowHours} h)`,
      `- **Ranking Basis:** ${rankingBasis === 'smooth_dip' ? 'Smooth-sphere + dip (DERIVED)' : 'Terrain-masked (SYNTHETIC / Imported MEASURED)'}`,
      `- **Hard Constraints:** Sunlight ≥ ${constraints.minSunlightPercent}%, Earth DTE ≥ ${constraints.minEarthCommsPercent}%, Max Darkness ≤ ${constraints.maxContinuousDarkHours}h, Max Slope ≤ ${constraints.maxSlopeDeg}°`,
      '',
      `## 1. Recommended Candidate`,
      top
        ? `- **#1 Candidate:** **${top.site.name}** (WSM ${top.totalScore.toFixed(1)} | TOPSIS ${top.topsisScore !== null ? top.topsisScore.toFixed(1) : 'N/A'} | Mix: ${top.dataMixDerivedPct}% Derived / ${top.dataMixSyntheticPct}% Synthetic)\n- **Trade-Off:** ${top.tradeOffNote}`
        : `- **No Viable Candidate** passes current hard constraints.`,
      '',
      `## 2. Viable Ranked Candidates (${viable.length})`,
      ...viable.map(
        (v) =>
          `- **#${v.rank} ${v.site.name}** — WSM ${v.totalScore.toFixed(1)}, TOPSIS ${v.topsisScore !== null ? v.topsisScore.toFixed(1) : 'N/A'} | Sun ${v.activeSunlightPct.toFixed(1)}%, DTE ${v.activeEarthPct.toFixed(1)}%, Max Dark ${v.activeMaxDarkHours}h, Slope ${v.site.slopeDeg ?? 'MISSING'}°`
      ),
      '',
      `## 3. Not Eligible Under Current Constraints (${rejected.length})`,
      ...rejected.map((r) => `- **${r.site.name}**: ${r.failedConstraints.join('; ')}`),
      '',
      `## 4. Decision Robustness & Regret`,
      `- **Analytical Flip Margin:** ${flipAnalysis.displayLabel}`,
      `- **Method Agreement:** Spearman ρ = ${spearmanRho ?? 'N/A'}, Kendall τ = ${kendallTau ?? 'N/A'}`,
      `- **Stability Lenses (300 scenarios):** Best Now = ${stability.bestNowSiteName ?? 'None'} | Most Consistent #1 = ${stability.mostConsistentSiteName ?? 'None'} | Strict-Limit Resilient = ${stability.strictResilientSiteName ?? 'None'} | Minimax Regret = ${stability.minimaxRegretSiteName ?? 'None'} (${stability.minimaxRegretValue ?? 'N/A'} pts max regret)`,
      '',
      `## 5. Multi-Stakeholder Consensus`,
      `- **Weighted Avg Winner:** ${room.groupWinnerWeightedAvg ?? 'N/A'} | **Minimax-Rank Compromise:** ${room.compromiseSiteName ?? 'N/A'} (worst rank #${room.compromiseWorstRank ?? 'N/A'}) | **Kendall's W:** ${room.kendallW ?? 'N/A'}`,
      `- **Most Contested Criterion:** ${room.mostContestedCriterion}`,
      '',
      `## 6. Value of Information ("What to Measure Next")`,
      ...(voi.length > 0
        ? voi.slice(0, 4).map((item, idx) => `- ${idx + 1}. **${item.siteName}** — ${item.parameterLabel}: ${item.recommendation}`)
        : ['- At least 2 viable candidates needed for VoI uncertainty propagation.']),
      '',
      `## 7. Scientific Honesty & References`,
      `- Ephemeris generated client-side via \`astronomy-engine\` (Don Cross, MIT License).`,
      `- Default local horizon masks and slopes are SYNTHETIC demo baselines unless upgraded via LOLA Horizon CSV Import.`,
      `- Suitability scores are decision-support indices, not probabilities of mission success.`,
    ];

    downloadBlob(lines.join('\n'), `lunarithm-rationale-memo-${reproducibilityHash}.md`, 'text/markdown');
  };

  const handleCopyShareLink = () => {
    const stateObj = { landingIsoLocal, windowHours, priorities, constraints };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(stateObj))));
    const url = `${window.location.origin}${window.location.pathname}#state=${encoded}`;
    window.history.replaceState(null, '', `#state=${encoded}`);
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const viableTop = evaluatedSites.find((e) => e.passesConstraints) ?? null;

  return (
    <div className="space-y-4 animate-panel-in">
      {/* Sub-navigation */}
      <div className="lunar-panel rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'registry', label: 'Scientific Dataset Registry' },
              { id: 'import', label: 'CSV Data & LOLA Horizon Import' },
              { id: 'reports', label: 'Reproducibility, Memo & Reports' },
              { id: 'selftest', label: 'Engine Self-Test (14)' },
              { id: 'methods', label: 'Methods, Limitations & Status' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`lunar-btn px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                subTab === t.id
                  ? 'bg-[#c9e8ff] text-[#0c0c16]'
                  : 'bg-[#0c0c16] text-[#7392B5] hover:text-white border border-[#272d47]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="font-mono text-xs text-[#b9f0d7]">Snapshot Hash: {reproducibilityHash}</div>
      </div>

      {/* 1. Dataset Registry */}
      {subTab === 'registry' && (
        <div className="lunar-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#c9e8ff]" />
            <h2 className="text-sm font-semibold text-white">
              Scientific Data Center — Honest Dataset Registry
            </h2>
          </div>
          <p className="text-xs text-[#7392B5]">
            Explicit distinction between analytical ephemeris ingested in-browser, synthetic demo baselines, and external NASA/ISRO PDS archives linked for user ingestion.
          </p>

          <div className="space-y-2.5">
            {DATASET_REGISTRY.map((ds) => (
              <div key={ds.id} className="p-3 bg-[#0c0c16] border border-[#272d47] rounded text-xs space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{ds.name}</span>
                    <span className="text-[#7392B5]">· {ds.organization}</span>
                  </div>
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                      ds.status === 'INGESTED_ANALYTICAL'
                        ? 'text-[#b9f0d7] border-[#b9f0d7]/30 bg-[#b9f0d7]/10'
                        : ds.status === 'SYNTHETIC_BASELINE'
                        ? 'text-[#b8baff] border-[#b8baff]/30 bg-[#b8baff]/10'
                        : 'text-[#F5B83D] border-[#F5B83D]/30 bg-[#F5B83D]/10'
                    }`}
                  >
                    {ds.status === 'INGESTED_ANALYTICAL'
                      ? 'INGESTED (LIVE ENGINE)'
                      : ds.status === 'SYNTHETIC_BASELINE'
                      ? 'SYNTHETIC DEMO BASELINE'
                      : 'LINKED — NOT YET INGESTED'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px] text-[#7392B5]">
                  <span>ID: {ds.identifier}</span>
                  <span>Resolution: {ds.spatialResolution}</span>
                  <span>Units: {ds.units}</span>
                </div>
                <div className="text-slate-300">
                  <span className="text-[#7392B5]">Used by:</span> {ds.usedByCriteria} ·{' '}
                  <span className="text-[#7392B5]">Limitations:</span> {ds.limitations}
                </div>
                {ds.url ? (
                  <a
                    href={ds.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#c9e8ff] hover:underline font-mono text-[11px]"
                  >
                    Official Archive <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="inline-block font-mono text-[11px] text-[#7392B5]">
                    Generated by LUNARITHM — see Methods
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. CSV Import & Per-Site LOLA Horizon Mask Import */}
      {subTab === 'import' && (
        <div className="lunar-panel rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                CSV Data Import &amp; Per-Site Horizon Mask Importer
              </h2>
              <p className="text-xs text-[#7392B5]">
                Add new candidate coordinates OR upload a real LOLA horizon elevation profile to upgrade any site from SYNTHETIC to MEASURED.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#0c0c16] border border-[#272d47] rounded">
              <button
                type="button"
                onClick={() => {
                  setImportMode('sites');
                  setValidationReport(null);
                }}
                className={`px-2.5 py-1 text-xs rounded ${
                  importMode === 'sites' ? 'bg-[#1a1d30] text-[#c9e8ff]' : 'text-[#7392B5]'
                }`}
              >
                Site Catalog CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportMode('horizon');
                  setValidationReport(null);
                }}
                className={`px-2.5 py-1 text-xs rounded ${
                  importMode === 'horizon' ? 'bg-[#1a1d30] text-[#b9f0d7]' : 'text-[#7392B5]'
                }`}
              >
                Horizon Mask CSV
              </button>
            </div>
          </div>

          {importMode === 'sites' ? (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setCsvText(SAMPLE_IMPORT_CSV)}
                  className="px-2.5 py-1 text-xs bg-[#0c0c16] border border-[#272d47] rounded text-[#c9e8ff] hover:border-[#7392B5]"
                >
                  Load Sample Site CSV
                </button>
              </div>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full bg-[#0c0c16] border border-[#272d47] rounded p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#c9e8ff]"
              />
              <button
                type="button"
                onClick={handleValidateAndImportSites}
                className="lunar-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#b9f0d7] text-[#0c0c16] rounded hover:brightness-110"
              >
                <Upload className="w-3.5 h-3.5" />
                Validate &amp; Add Sites to Pool
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#7392B5]">Target Site:</span>
                  <select
                    value={targetHorizonSiteId}
                    onChange={(e) => setTargetHorizonSiteId(e.target.value)}
                    className="bg-[#0c0c16] border border-[#272d47] rounded px-2.5 py-1 text-xs text-slate-100"
                  >
                    {allSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.horizonDataClass})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setHorizonCsvText(SAMPLE_HORIZON_CSV)}
                  className="px-2.5 py-1 text-xs bg-[#0c0c16] border border-[#272d47] rounded text-[#c9e8ff] hover:border-[#7392B5]"
                >
                  Load Sample Horizon CSV
                </button>
              </div>
              <textarea
                rows={7}
                value={horizonCsvText}
                onChange={(e) => setHorizonCsvText(e.target.value)}
                className="w-full bg-[#0c0c16] border border-[#272d47] rounded p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-[#c9e8ff]"
              />
              <button
                type="button"
                onClick={handleValidateAndImportHorizon}
                className="lunar-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#c9e8ff] text-[#0c0c16] rounded hover:brightness-110"
              >
                <Upload className="w-3.5 h-3.5" />
                Apply MEASURED Horizon Mask (72 × 5° Bins)
              </button>
            </>
          )}

          {validationReport && (
            <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded text-xs space-y-1.5">
              {validationReport.errors.length === 0 ? (
                <div className="text-[#b9f0d7] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {validationReport.message}
                </div>
              ) : (
                <div className="space-y-1 text-[#F25F5C]">
                  <div className="font-semibold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" /> Validation Errors Found
                  </div>
                  {validationReport.errors.map((err, i) => (
                    <div key={i} className="font-mono text-[11px]">
                      {err}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Reports, Memo & Decision Card */}
      {subTab === 'reports' && (
        <div className="space-y-4">
          <div className="lunar-panel rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Reproducible Exports, Rationale Memo &amp; Printable Decision Card
              </h2>
              <p className="text-xs text-[#7392B5]">
                Every exported metric is computed directly from the live scoring &amp; ephemeris engines.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0c0c16] border border-[#272d47] rounded text-[#c9e8ff] hover:border-[#7392B5]"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedLink ? 'Link Copied' : 'Copy Shareable URL'}
              </button>
              <button
                type="button"
                onClick={handleDownloadRationaleMemo}
                className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#b9f0d7] text-[#0c0c16] rounded hover:brightness-110"
              >
                <FileText className="w-3.5 h-3.5" />
                Download Rationale Memo (.md)
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0c0c16] border border-[#272d47] rounded text-slate-200 hover:border-[#7392B5]"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0c0c16] border border-[#272d47] rounded text-[#b9f0d7] hover:border-[#b9f0d7]/60"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#c9e8ff] text-[#0c0c16] rounded hover:brightness-110"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Save PDF
              </button>
            </div>
          </div>

          <div className="lunar-panel rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#272d47] pb-3">
              <div>
                <div className="text-[11px] font-mono text-[#7392B5]">LUNARITHM EXECUTIVE DECISION CARD</div>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  Top Candidate: {viableTop ? viableTop.site.name : 'No Viable Candidate'}
                </h3>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-[#b9f0d7]">Hash: {reproducibilityHash}</div>
                <div className="text-[#7392B5]">
                  Epoch: {landingIsoLocal} UTC ({Math.round(windowHours / 24)}d)
                </div>
              </div>
            </div>

            {viableTop && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded">
                  <div className="text-[#7392B5]">WSM / TOPSIS Score</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {viableTop.totalScore.toFixed(1)} /{' '}
                    {viableTop.topsisScore !== null ? viableTop.topsisScore.toFixed(1) : 'N/A'}
                  </div>
                  <div className="text-[10px] text-[#7392B5]">
                    Spearman ρ = {spearmanRho !== null ? spearmanRho : 'N/A'}
                  </div>
                </div>
                <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded">
                  <div className="text-[#7392B5]">Min Shift to Flip</div>
                  <div className="text-lg font-bold text-[#c9e8ff] mt-1">{flipAnalysis.displayLabel}</div>
                  <div className="text-[10px] text-[#7392B5]">
                    Runner-up: {flipAnalysis.runnerUpSiteName ?? 'None'}
                  </div>
                </div>
                <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded">
                  <div className="text-[#7392B5]">Sun / Earth DTE</div>
                  <div className="text-lg font-bold text-[#F5B83D] mt-1">
                    {viableTop.activeSunlightPct.toFixed(1)}% / {viableTop.activeEarthPct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[#7392B5]">Max Dark: {viableTop.activeMaxDarkHours}h</div>
                </div>
                <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded">
                  <div className="text-[#7392B5]">Data Mix &amp; Evidence</div>
                  <div className="text-lg font-bold text-[#b8baff] mt-1">{viableTop.evidenceQuality}</div>
                  <div className="text-[10px] text-[#7392B5]">
                    {viableTop.dataMixDerivedPct}% Derived / {viableTop.dataMixSyntheticPct}% Synth
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-[#7392B5] border-t border-[#272d47] pt-3">
              Disclosure: Ephemeris trajectories are DERIVED via astronomy-engine (VSOP87/ELP2000). Baseline local crater horizon masks and slopes are SYNTHETIC demo baselines unless replaced via Horizon Mask CSV import. Suitability scores are decision-support metrics, not probabilities of mission success.
            </div>
          </div>
        </div>
      )}

      {/* 4. In-App Engine Self-Test */}
      {subTab === 'selftest' && (
        <div className="lunar-panel rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-[#b9f0d7]" />
                In-Browser Scientific Engine Self-Test Suite (14 Tests)
              </h2>
              <p className="text-xs text-[#7392B5]">
                Executes live mathematical, ephemeris, minimax regret, dispersion, stakeholder, and constraint relaxation checks directly against src/engine/.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTestResults(runAllEngineSelfTests())}
              className="lunar-btn px-4 py-2 text-xs font-semibold bg-[#b9f0d7] text-[#0c0c16] rounded hover:brightness-110"
            >
              Run 14 Engine Verification Tests
            </button>
          </div>

          {!testResults ? (
            <div className="p-6 text-center text-xs text-[#7392B5] bg-[#0c0c16] border border-dashed border-[#272d47] rounded">
              Click &ldquo;Run 14 Engine Verification Tests&rdquo; to execute the live suite and inspect pass/fail outputs.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-mono text-[#b9f0d7]">
                Results: {testResults.filter((t) => t.passed).length} / {testResults.length} Passed
              </div>
              {testResults.map((t) => (
                <div
                  key={t.id}
                  className="p-3 bg-[#0c0c16] border border-[#272d47] rounded text-xs flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      {t.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#b9f0d7]" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-[#F25F5C]" />
                      )}
                      {t.name}
                    </span>
                    <span className={`font-mono text-[11px] ${t.passed ? 'text-[#b9f0d7]' : 'text-[#F25F5C]'}`}>
                      {t.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-[#7392B5]">
                    Expected: {t.expected} · Actual: <span className="text-[#c9e8ff]">{t.actual}</span>
                  </div>
                  <div className="text-[#7392B5]">{t.details}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Methods, Limitations & Status */}
      {subTab === 'methods' && (
        <div className="lunar-panel rounded-lg p-4 space-y-4 text-xs text-slate-300 leading-relaxed">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Methods &amp; Mathematical Formulations</h2>
            <ul className="list-disc list-inside space-y-1 text-[#7392B5]">
              <li>
                <span className="text-slate-200">Ephemeris:</span> Powered by <code className="font-mono text-[#c9e8ff]">astronomy-engine</code> (Don Cross, MIT License) via <code className="font-mono">Libration()</code>, <code className="font-mono">SunPosition()</code>, and <code className="font-mono">MoonPhase()</code> with 1.5424° obliquity and airless horizon dip (−arccos(R/(R+h))).
              </li>
              <li>
                <span className="text-slate-200">Dual Scoring (WSM + TOPSIS) &amp; Minimax Regret:</span> Weighted Sum computes linear utility; TOPSIS computes Euclidean closeness (requires ≥ 2 viable sites); Spearman ρ and Kendall τ require ≥ 3 ranked sites. Minimax Regret selects the candidate minimizing worst-case score shortfall across scenarios.
              </li>
              <li>
                <span className="text-slate-200">Exact Flip Detector:</span> Analytically solves single-criterion indifference points and minimum L1 weight-simplex shift to flip #1, separating True Pareto Dominance from Sole-Viable / Zero-Viable states.
              </li>
              <li>
                <span className="text-slate-200">Subsystem Models:</span> Solar Battery SoC (vertical tracking vs. horizontal fixed, 90% initial SoC), per-step RF Link Budget (FSPL + implementation loss + grazing penalty), Stefan-Boltzmann radiative thermal estimate, and seeded landing dispersion ellipses.
              </li>
            </ul>
          </div>

          <div className="border-t border-[#272d47] pt-3">
            <h2 className="text-sm font-semibold text-white mb-1">Known Scientific Limitations &amp; Project Status</h2>
            <ul className="list-disc list-inside space-y-1 text-[#7392B5]">
              <li>
                <span className="text-slate-200">Data Boundaries:</span> Baseline polar horizon masks and landing slopes are SYNTHETIC demo approximations until replaced by LRO LOLA DEM profiles via Horizon Mask CSV Import. Diviner bolometric temperatures default to MISSING.
              </li>
              <li>
                <span className="text-slate-200">Local Mode Persistence:</span> Application runs in client-side local/guest mode with URL-hash state sharing and Markdown/JSON/CSV exports (Firebase cloud persistence is not provisioned on this deployment).
              </li>
              <li>
                <span className="text-slate-200">Verification Status:</span> 14 deterministic unit &amp; integration tests in <code className="font-mono text-[#c9e8ff]">src/engine/selfTestSuite.ts</code> validate ephemeris, scoring, flip, minimax regret, dispersion, and relaxation math.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
