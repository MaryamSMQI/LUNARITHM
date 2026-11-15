import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Command,
  Compass,
  Info,
  MapPin,
  Monitor,
  Radio,
  Redo2,
  Sparkles,
  Sun,
  Thermometer,
  Undo2,
} from 'lucide-react';
import { CURATED_LUNAR_SITES } from './data/lunarSites';
import { MISSION_PROFILES } from './data/datasetRegistry';
import { DEFAULT_DEMO_PRESET, STEP_5_COMMS_SURGE_PRESET } from './data/demoPresets';
import { computeInstantEphemeris, computeSubsolarLatForIso } from './engine/lunarEphemeris';
import { rankLunarSites } from './engine/scoringEngine';
import { computeFlipAnalysis } from './engine/decisionIntelligence';
import {
  DecisionHistoryEntry,
  LunarSite,
  MissingDataPolicy,
  MissionConstraints,
  MissionPriorities,
  ProvenanceRecord,
  RankingBasis,
  StakeholderRole,
} from './types/lunar';
import { LunarAmbientBackdrop } from './components/LunarAmbientBackdrop';
import { LunarViewport3D } from './components/LunarViewport3D';
import { HorizonSkyPlot } from './components/HorizonSkyPlot';
import { TimelineScrubber } from './components/TimelineScrubber';
import { SiteComparisonView } from './components/SiteComparisonView';
import { DecisionStabilityView } from './components/DecisionStabilityView';
import { PhysicsLabPanel } from './components/PhysicsLabPanel';
import { DataAndReportsView } from './components/DataAndReportsView';
import { CustomSiteModal } from './components/CustomSiteModal';
import { SouthPoleMiniMap } from './components/SouthPoleMiniMap';
import { ProvenanceDrawer } from './components/ProvenanceDrawer';
import { DataBadge } from './components/DataBadge';
import { GuidedDemoOverlay } from './components/GuidedDemoOverlay';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { DEFAULT_STAKEHOLDER_ROLES } from './components/StakeholderAndDispersionPanel';
import lunarRidgeImg from './assets/images/lunar_ridge_cta_1794599014260.jpg';
import lunarSurfaceImg from './assets/images/lunar_surface_detail_1794599014502.jpg';

type WorkspaceTab = 'overview' | 'sky3d' | 'compare' | 'decision' | 'reports';
type DecisionSubView = 'ranking' | 'flip' | 'stability' | 'dispersion_room';

const SEASON_PRESETS = [
  { label: 'Nov 2026 (Nominal)', isoDate: '2026-11-15T12:00' },
  { label: 'South Summer Peak', isoDate: '2027-01-12T12:00' },
  { label: 'Lunar Equinox', isoDate: '2027-04-10T12:00' },
  { label: 'South Winter Solstice', isoDate: '2027-07-08T12:00' },
];

interface SharedHashState {
  landingIsoLocal?: string;
  windowHours?: number;
  priorities?: MissionPriorities;
  constraints?: MissionConstraints;
}

interface ConfigSnapshot {
  priorities: MissionPriorities;
  constraints: MissionConstraints;
  activeProfileId: string;
}

function readInitialHashState(): SharedHashState | null {
  try {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash;
    if (!hash.startsWith('#state=')) return null;
    const encoded = hash.slice('#state='.length);
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json) as SharedHashState;
  } catch {
    return null;
  }
}

export default function App() {
  const initialHash = useMemo(() => readInitialHashState(), []);
  const defaultProfile = MISSION_PROFILES[0];

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [decisionSubView, setDecisionSubView] = useState<DecisionSubView>('ranking');
  const [sites, setSites] = useState<LunarSite[]>(CURATED_LUNAR_SITES);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(CURATED_LUNAR_SITES[0].id);

  // Mission epoch & timeline playback state
  const [landingIsoLocal, setLandingIsoLocal] = useState<string>(
    initialHash?.landingIsoLocal || '2026-11-15T12:00'
  );
  const [windowHours, setWindowHours] = useState<number>(initialHash?.windowHours || 708);
  const [offsetHours, setOffsetHours] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeedHoursPerSec, setPlaySpeedHoursPerSec] = useState<number>(12);

  // Mission Profile, Priorities, Constraints, Basis & Policies
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initialHash?.priorities ? 'custom' : defaultProfile.id
  );
  const [priorities, setPriorities] = useState<MissionPriorities>(
    initialHash?.priorities || defaultProfile.priorities
  );
  const [constraints, setConstraints] = useState<MissionConstraints>(
    initialHash?.constraints || defaultProfile.constraints
  );
  const [missingDataPolicy, setMissingDataPolicy] = useState<MissingDataPolicy>('conservative');
  const [rankingBasis, setRankingBasis] = useState<RankingBasis>('smooth_dip');
  const [relayBoostPct, setRelayBoostPct] = useState<number>(0);
  const [stakeholderRoles, setStakeholderRoles] = useState<StakeholderRole[]>(DEFAULT_STAKEHOLDER_ROLES);

  // Undo / Redo history for priorities & constraints
  const [undoStack, setUndoStack] = useState<ConfigSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ConfigSnapshot[]>([]);

  // Experience toggles & overlays
  const [motionReduced, setMotionReduced] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const [learnMode, setLearnMode] = useState<boolean>(false);
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [showScienceGuide, setShowScienceGuide] = useState(false);
  const [provenanceRecord, setProvenanceRecord] = useState<ProvenanceRecord | null>(null);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [flipToast, setFlipToast] = useState<string | null>(null);

  // Decision History Timeline
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEntry[]>([]);
  const lastActionRef = useRef<string>('Initial mission profile');
  const flipToastTimerRef = useRef<number | null>(null);

  // Compute subsolar latitudes for season preset buttons once
  const seasonPresetsWithLat = useMemo(
    () =>
      SEASON_PRESETS.map((p) => ({
        ...p,
        subsolarLatDeg: computeSubsolarLatForIso(p.isoDate),
      })),
    []
  );

  // Global Ctrl/Cmd+K shortcut for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setIsPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const baseTimestampMs = useMemo(() => {
    const parsed = Date.parse(landingIsoLocal + ':00Z');
    return Number.isNaN(parsed) ? Date.UTC(2026, 10, 15, 12, 0, 0) : parsed;
  }, [landingIsoLocal]);

  const currentTimestampMs = baseTimestampMs + offsetHours * 3600 * 1000;

  // Lunar day playback loop
  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setOffsetHours((prev) => {
        const next = prev + dt * playSpeedHoursPerSec;
        return next >= windowHours ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playSpeedHoursPerSec, windowHours]);

  // Clamp offset if window duration shrinks
  useEffect(() => {
    if (offsetHours > windowHours) setOffsetHours(0);
  }, [windowHours, offsetHours]);

  // Evaluate and rank all candidate sites (WSM + TOPSIS + Method Agreement)
  const rankingResult = useMemo(() => {
    return rankLunarSites(
      sites,
      baseTimestampMs,
      windowHours,
      priorities,
      constraints,
      missingDataPolicy,
      relayBoostPct,
      rankingBasis
    );
  }, [sites, baseTimestampMs, windowHours, priorities, constraints, missingDataPolicy, relayBoostPct, rankingBasis]);

  const evaluatedSites = rankingResult.ranked;

  // Exact analytical flip thresholds + L1 distance to flip
  const flipAnalysis = useMemo(() => {
    return computeFlipAnalysis(evaluatedSites, priorities);
  }, [evaluatedSites, priorities]);

  // Record Decision History Timeline + emit subtle bottom-left Flip Toast
  useEffect(() => {
    const top = evaluatedSites.find((e) => e.passesConstraints) ?? null;
    const topId = top ? top.site.id : null;
    const topName = top ? top.site.name : 'No Viable Site';
    const topScore = top ? top.totalScore : 0;

    setDecisionHistory((prev) => {
      const last = prev[prev.length - 1];
      const trigger = lastActionRef.current;

      if (last && last.topSiteId === topId && last.trigger === trigger && Math.abs(last.topScore - topScore) < 0.05) {
        return prev;
      }

      const flipped = Boolean(last && last.topSiteId !== topId);
      const winnerBefore = last ? last.topSiteName : null;
      const winnerAfter = topName;

      if (flipped && prev.length > 0) {
        setFlipToast(`Decision flipped: ${winnerBefore ?? 'None'} → ${winnerAfter ?? 'None'}`);
        if (flipToastTimerRef.current) window.clearTimeout(flipToastTimerRef.current);
        flipToastTimerRef.current = window.setTimeout(() => setFlipToast(null), 3500);
      }

      const entry: DecisionHistoryEntry = {
        id: `hist-${Date.now()}-${prev.length}`,
        timestampIso: new Date().toISOString().slice(11, 19) + ' UTC',
        trigger,
        winnerBefore,
        winnerAfter,
        topSiteId: topId,
        topSiteName: topName,
        topScore,
        flipped,
      };

      // Merge consecutive identical triggers on same winner unless a flip occurred
      if (last && !flipped && last.trigger === trigger && last.topSiteId === topId) {
        return [...prev.slice(0, -1), entry];
      }
      return [...prev.slice(-14), entry];
    });
  }, [evaluatedSites]);

  const activeEval = useMemo(() => {
    return evaluatedSites.find((e) => e.site.id === selectedSiteId) ?? evaluatedSites[0];
  }, [evaluatedSites, selectedSiteId]);

  const activeSite = activeEval.site;

  const currentInstant = useMemo(() => {
    return computeInstantEphemeris(activeSite, currentTimestampMs, true);
  }, [activeSite, currentTimestampMs]);

  const pushUndoSnapshot = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-19), { priorities, constraints, activeProfileId }]);
    setRedoStack([]);
  }, [priorities, constraints, activeProfileId]);

  const handleUndo = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      setRedoStack((r) => [...r, { priorities, constraints, activeProfileId }]);
      lastActionRef.current = 'Undo configuration change';
      setPriorities(target.priorities);
      setConstraints(target.constraints);
      setActiveProfileId(target.activeProfileId);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      setUndoStack((u) => [...u, { priorities, constraints, activeProfileId }]);
      lastActionRef.current = 'Redo configuration change';
      setPriorities(target.priorities);
      setConstraints(target.constraints);
      setActiveProfileId(target.activeProfileId);
      return prev.slice(0, -1);
    });
  };

  const handleShiftDays = (deltaDays: number) => {
    lastActionRef.current = `Launch epoch shifted +${deltaDays}d`;
    const shifted = new Date(baseTimestampMs + deltaDays * 86400000);
    setLandingIsoLocal(shifted.toISOString().slice(0, 16));
  };

  const handleAddCustomSite = (newSite: LunarSite) => {
    lastActionRef.current = `Added custom site: ${newSite.name}`;
    setSites((prev) => [newSite, ...prev]);
    setSelectedSiteId(newSite.id);
  };

  const handleImportSites = (imported: LunarSite[]) => {
    lastActionRef.current = `Imported ${imported.length} CSV site(s)`;
    setSites((prev) => [...imported, ...prev]);
    if (imported[0]) setSelectedSiteId(imported[0].id);
  };

  const handleImportHorizonMask = (siteId: string, maskDeg: number[], source: string) => {
    lastActionRef.current = `Imported LOLA horizon mask`;
    setSites((prev) =>
      prev.map((s) =>
        s.id === siteId
          ? {
              ...s,
              horizonMaskDeg: maskDeg,
              horizonDataClass: 'MEASURED',
              horizonSource: source,
            }
          : s
      )
    );
  };

  const handleSelectProfile = (profileId: string) => {
    const profile = MISSION_PROFILES.find((p) => p.id === profileId);
    if (!profile) {
      setActiveProfileId('custom');
      return;
    }
    pushUndoSnapshot();
    lastActionRef.current = `Profile: ${profile.name}`;
    setActiveProfileId(profile.id);
    setPriorities(profile.priorities);
    setConstraints(profile.constraints);
  };

  const handleChangePriorities = (next: MissionPriorities, reason?: string) => {
    pushUndoSnapshot();
    lastActionRef.current = reason || 'Priority weights adjusted';
    setActiveProfileId('custom');
    setPriorities(next);
  };

  const handleChangeConstraints = (next: MissionConstraints, reason?: string) => {
    pushUndoSnapshot();
    lastActionRef.current = reason || 'Hard constraint adjusted';
    setActiveProfileId('custom');
    setConstraints(next);
  };

  // 10-step Guided Demo synchronized navigation + deterministic presets
  const handleDemoStepChange = (nextStep: number | null) => {
    setDemoStep(nextStep);
    if (nextStep === null) return;

    if (nextStep === 0) {
      lastActionRef.current = 'Guided Demo: Long-Duration Outpost';
      setLandingIsoLocal(DEFAULT_DEMO_PRESET.epochIso);
      setWindowHours(DEFAULT_DEMO_PRESET.windowHours);
      setActiveProfileId(DEFAULT_DEMO_PRESET.profileId);
      setPriorities(DEFAULT_DEMO_PRESET.priorities);
      setConstraints(DEFAULT_DEMO_PRESET.constraints);
      setRankingBasis(DEFAULT_DEMO_PRESET.rankingBasis);
      setActiveTab('overview');
    } else if (nextStep === 1) {
      setActiveTab('sky3d');
    } else if (nextStep === 2 || nextStep === 3) {
      setActiveTab('decision');
      setDecisionSubView('ranking');
    } else if (nextStep === 4) {
      setActiveTab('decision');
      setDecisionSubView('flip');
    } else if (nextStep === 5 || nextStep === 8) {
      setActiveTab('decision');
      setDecisionSubView('stability');
    } else if (nextStep === 6 || nextStep === 7) {
      setActiveTab('decision');
      setDecisionSubView('dispersion_room');
    } else if (nextStep === 9) {
      setActiveTab('reports');
    }
  };

  const handleDemoStepAction = (stepIdx: number) => {
    if (stepIdx === 4) {
      pushUndoSnapshot();
      lastActionRef.current = 'Guided Demo: Comms priority surge';
      setActiveProfileId(STEP_5_COMMS_SURGE_PRESET.profileId);
      setPriorities(STEP_5_COMMS_SURGE_PRESET.priorities);
      setConstraints(STEP_5_COMMS_SURGE_PRESET.constraints);
    }
  };

  const formatCountdown = (hours: number | null, isCurrentlyVisible: boolean, kind: 'sun' | 'earth') => {
    if (hours === null) {
      return isCurrentlyVisible
        ? 'Continuous (>window)'
        : kind === 'sun'
        ? 'Continuous Dark (>window)'
        : 'Permanent Occlusion';
    }
    const days = Math.floor(hours / 24);
    const remH = Math.round(hours % 24);
    const label = isCurrentlyVisible
      ? kind === 'sun'
        ? 'Sunset in'
        : 'Earthset in'
      : kind === 'sun'
      ? 'Sunrise in'
      : 'Earthrise in';
    return days > 0 ? `${label} ${days}d ${remH}h` : `${label} ${hours.toFixed(1)}h`;
  };

  const viableWinner = evaluatedSites.find((e) => e.passesConstraints) ?? null;
  const activeProfileName =
    MISSION_PROFILES.find((p) => p.id === activeProfileId)?.name ?? 'Custom Mission Weights';

  return (
    <div
      className={`min-h-screen bg-[#0c0c16] text-slate-100 flex flex-col relative overflow-x-hidden ${
        motionReduced ? 'motion-reduced' : ''
      }`}
    >
      {/* Ambient Starfield & Lunar Limb Photography Backdrop */}
      <LunarAmbientBackdrop motionReduced={motionReduced} presentationMode={presentationMode} />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0c0c16]/90 backdrop-blur-md border-b border-[#272d47] px-4 lg:px-6 h-14 flex items-center justify-between gap-8 no-print">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff] rounded"
        >
          LUNARITHM
        </button>

        {/* Zone 2: 5 single-line text nav links */}
        <nav className="flex items-center gap-5 lg:gap-7 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'sky3d', label: '3D & Physics' },
              { id: 'compare', label: 'Compare Scenarios' },
              { id: 'decision', label: 'Decision & Flip' },
              { id: 'reports', label: 'Data & Reports' },
            ] as { id: WorkspaceTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'border-[#c9e8ff] text-white'
                  : 'border-transparent text-[#7392B5] hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary CTA button with subtle lunar ridge imagery */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => handleDemoStepChange(demoStep === null ? 0 : null)}
            style={{
              backgroundImage: `linear-gradient(125deg, rgba(12,12,22,0.82), rgba(115,146,181,0.45)), url(${lunarRidgeImg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            className="lunar-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#c9e8ff] border border-[#c9e8ff]/55 hover:border-[#c9e8ff] rounded-md whitespace-nowrap shrink-0 shadow-md"
          >
            <Compass className="w-3.5 h-3.5" />
            {demoStep === null ? 'Guided Demo' : 'Exit Demo'}
          </button>
        </div>
      </header>

      {/* Persistent Mission Context & Epoch Ribbon */}
      {!presentationMode && (
        <div className="relative z-10 bg-[#131524]/85 backdrop-blur-md border-b border-[#272d47] px-4 lg:px-6 py-2.5 space-y-2 no-print">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor="landing-epoch" className="text-xs text-[#7392B5] whitespace-nowrap">
                  Epoch (UTC)
                </label>
                <input
                  id="landing-epoch"
                  type="datetime-local"
                  value={landingIsoLocal}
                  onChange={(e) => {
                    if (e.target.value) {
                      lastActionRef.current = 'Epoch changed';
                      setLandingIsoLocal(e.target.value);
                    }
                  }}
                  className="bg-[#0c0c16] border border-[#272d47] rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-[#c9e8ff]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {seasonPresetsWithLat.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      lastActionRef.current = `Preset: ${p.label}`;
                      setLandingIsoLocal(p.isoDate);
                    }}
                    className={`lunar-btn px-2 py-1 text-[11px] rounded border transition-colors whitespace-nowrap shrink-0 ${
                      landingIsoLocal === p.isoDate
                        ? 'bg-[#1a1d30] border-[#7392B5] text-white'
                        : 'bg-[#0c0c16] border-[#272d47] text-[#7392B5] hover:text-white'
                    }`}
                  >
                    {p.label}{' '}
                    <span className="font-mono text-[#c9e8ff]">
                      ({p.subsolarLatDeg >= 0 ? '+' : ''}
                      {p.subsolarLatDeg}°)
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleShiftDays(7)}
                  className="lunar-btn px-2 py-1 text-[11px] font-mono rounded bg-[#0c0c16] border border-[#272d47] text-[#F5B83D] hover:border-[#F5B83D]/50 whitespace-nowrap shrink-0"
                >
                  +7d
                </button>
                <button
                  type="button"
                  onClick={() => handleShiftDays(14)}
                  className="lunar-btn px-2 py-1 text-[11px] font-mono rounded bg-[#0c0c16] border border-[#272d47] text-[#F5B83D] hover:border-[#F5B83D]/50 whitespace-nowrap shrink-0"
                >
                  +14d
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-0.5 p-0.5 bg-[#0c0c16] border border-[#272d47] rounded">
                {[
                  { label: '14d', hours: 336 },
                  { label: '29.5d', hours: 708 },
                  { label: '60d', hours: 1440 },
                ].map((w) => (
                  <button
                    key={w.hours}
                    type="button"
                    onClick={() => setWindowHours(w.hours)}
                    className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 ${
                      windowHours === w.hours
                        ? 'bg-[#1a1d30] text-[#c9e8ff] font-medium'
                        : 'text-[#7392B5] hover:text-white'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                title="Undo last priority/constraint edit"
                className="lunar-btn p-1.5 rounded bg-[#0c0c16] border border-[#272d47] text-[#7392B5] hover:text-white disabled:opacity-35"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                title="Redo"
                className="lunar-btn p-1.5 rounded bg-[#0c0c16] border border-[#272d47] text-[#7392B5] hover:text-white disabled:opacity-35"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsCustomModalOpen(true)}
                style={{
                  backgroundImage: `linear-gradient(125deg, rgba(12,12,22,0.88), rgba(19,21,36,0.72)), url(${lunarRidgeImg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border border-[#b9f0d7]/40 text-[#b9f0d7] hover:border-[#b9f0d7] whitespace-nowrap shrink-0"
              >
                <MapPin className="w-3 h-3" />
                Add Custom Site
              </button>

              <button
                type="button"
                onClick={() => setIsPaletteOpen(true)}
                className="lunar-btn inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded bg-[#0c0c16] border border-[#272d47] text-[#c9e8ff] hover:border-[#7392B5] whitespace-nowrap shrink-0"
              >
                <Command className="w-3 h-3" /> ⌘K
              </button>

              <button
                type="button"
                onClick={() => setLearnMode((v) => !v)}
                className={`lunar-btn inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border whitespace-nowrap shrink-0 ${
                  learnMode
                    ? 'bg-[#b8baff]/15 border-[#b8baff]/50 text-[#b8baff]'
                    : 'bg-[#0c0c16] border-[#272d47] text-[#7392B5] hover:text-white'
                }`}
              >
                <BookOpen className="w-3 h-3" /> Learn
              </button>

              <button
                type="button"
                onClick={() => setMotionReduced((v) => !v)}
                className={`lunar-btn inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border whitespace-nowrap shrink-0 ${
                  motionReduced
                    ? 'bg-[#1a1d30] border-[#7392B5] text-slate-200'
                    : 'bg-[#0c0c16] border-[#272d47] text-[#7392B5] hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3" /> {motionReduced ? 'Reduced' : 'Motion'}
              </button>

              <button
                type="button"
                onClick={() => setShowScienceGuide((v) => !v)}
                className={`lunar-btn inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border whitespace-nowrap shrink-0 ${
                  showScienceGuide
                    ? 'bg-[#c9e8ff]/15 border-[#c9e8ff]/50 text-[#c9e8ff]'
                    : 'bg-[#0c0c16] border-[#272d47] text-[#7392B5] hover:text-white'
                }`}
              >
                <Info className="w-3 h-3" /> Guide
              </button>

              <button
                type="button"
                onClick={() => setPresentationMode(true)}
                title="Hide context chrome for clean presentation"
                className="lunar-btn inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[#0c0c16] border border-[#272d47] text-[#7392B5] hover:text-white whitespace-nowrap shrink-0"
              >
                <Monitor className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Live Mission Decision & Ranking Basis Disclosure Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#272d47]/60 text-[11px] font-mono">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[#7392B5]">
                Profile: <span className="text-white">{activeProfileName}</span>
              </span>
              <span className="text-[#7392B5]">·</span>
              <span className="text-[#7392B5]">
                #1 Winner:{' '}
                <span className={viableWinner ? 'text-[#b9f0d7] font-semibold' : 'text-[#F25F5C] font-semibold'}>
                  {viableWinner ? `${viableWinner.site.name} (${viableWinner.totalScore.toFixed(1)})` : 'None Viable'}
                </span>
              </span>
              <span className="text-[#7392B5]">·</span>
              <span className="text-[#7392B5]">
                Min Shift to Flip: <span className="text-[#c9e8ff]">{flipAnalysis.displayLabel}</span>
              </span>
              {relayBoostPct > 0 && (
                <>
                  <span className="text-[#7392B5]">·</span>
                  <span className="text-[#b8baff]">Lunar Relay Active (+{relayBoostPct}%)</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  lastActionRef.current =
                    rankingBasis === 'smooth_dip'
                      ? 'Switched basis: Terrain-masked'
                      : 'Switched basis: Smooth-sphere + dip';
                  setRankingBasis((b) => (b === 'smooth_dip' ? 'terrain_masked' : 'smooth_dip'));
                }}
                className="lunar-btn inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0c0c16] border border-[#272d47] text-slate-200 hover:border-[#c9e8ff]"
              >
                <span className="text-[#7392B5]">Ranking based on:</span>
                <span className={rankingBasis === 'smooth_dip' ? 'text-[#c9e8ff]' : 'text-[#b8baff]'}>
                  {rankingBasis === 'smooth_dip' ? 'DERIVED geometry + dip' : 'SYNTHETIC / Imported terrain'}
                </span>
              </button>
              <DataBadge dataClass="DERIVED" />
              <DataBadge dataClass="SYNTHETIC" />
            </div>
          </div>
        </div>
      )}

      {presentationMode && (
        <div className="relative z-10 bg-[#131524] border-b border-[#272d47] px-4 py-1.5 flex items-center justify-between text-xs font-mono no-print">
          <span className="text-[#c9e8ff]">
            Presentation Mode · #1: {viableWinner ? viableWinner.site.name : 'None'} · Flip:{' '}
            {flipAnalysis.displayLabel}
          </span>
          <button
            type="button"
            onClick={() => setPresentationMode(false)}
            className="px-2.5 py-0.5 rounded bg-[#0c0c16] border border-[#272d47] text-slate-200 hover:border-[#c9e8ff]"
          >
            Exit Presentation Mode
          </button>
        </div>
      )}

      {/* Collapsible Educator & Mission Physics Explainer */}
      {showScienceGuide && (
        <div className="relative z-10 bg-[#131524]/95 border-b border-[#272d47] px-4 lg:px-6 py-4 no-print animate-panel-in">
          <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded">
              <div className="font-semibold text-[#F5B83D] mb-1">1. Why 1.54° Tilt Creates Grazing Light &amp; PSRs</div>
              <p className="text-[#7392B5] leading-relaxed">
                Unlike Earth (23.4° tilt), the Moon is tilted only 1.54° to the ecliptic. At the South Pole, the Sun skims sideways around the horizon—so elevated ridges catch extended sunlight while deep crater floors stay frozen in permanent darkness.
              </p>
            </div>
            <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded">
              <div className="font-semibold text-[#c9e8ff] mb-1">2. Why Earth Wobbles Across the Polar Horizon</div>
              <p className="text-[#7392B5] leading-relaxed">
                Although the Moon is tidally locked, its 5.14° orbital inclination and elliptical orbit cause Earth to trace a ±6.7° optical libration figure-8 every 27.2 days. When Earth dips below a ridge mask, Direct-to-Earth (DTE) comms drop.
              </p>
            </div>
            <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded">
              <div className="font-semibold text-[#b9f0d7] mb-1">3. Honest Scientific Provenance &amp; Stability</div>
              <p className="text-[#7392B5] leading-relaxed">
                LUNARITHM defaults site rankings to DERIVED smooth-sphere + horizon dip geometry while letting you toggle SYNTHETIC or imported LOLA MEASURED masks, and tests priority flips, dispersion ellipses, and Minimax Regret.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="relative z-10 flex-1 max-w-[1520px] w-full mx-auto px-4 lg:px-6 py-5">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start animate-panel-in">
            {/* Left Column: Site Selector & South Pole Map */}
            <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
              <SouthPoleMiniMap
                sites={sites}
                selectedSiteId={activeSite.id}
                onSelectSite={setSelectedSiteId}
                instant={currentInstant}
              />

              <div className="lunar-panel rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-white">
                    Candidate Sites ({evaluatedSites.length})
                  </h2>
                  <span className="font-mono text-[11px] text-[#b9f0d7]">
                    {evaluatedSites.filter((e) => e.passesConstraints).length} Viable
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                  {evaluatedSites.map((ev) => {
                    const isSelected = ev.site.id === activeSite.id;
                    return (
                      <button
                        key={ev.site.id}
                        type="button"
                        onClick={() => setSelectedSiteId(ev.site.id)}
                        className={`lunar-card-interactive w-full text-left p-2.5 rounded-md border ${
                          isSelected
                            ? 'bg-[#1a1d30] border-[#c9e8ff]/70'
                            : 'bg-[#0c0c16]/90 border-[#272d47]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">
                            {ev.site.name}
                          </span>
                          <span
                            className={`font-mono text-[11px] shrink-0 ${
                              ev.rank ? 'text-[#b9f0d7]' : 'text-[#7392B5]'
                            }`}
                          >
                            {ev.rank ? `#${ev.rank} · ${ev.totalScore.toFixed(0)}` : 'Not eligible'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[11px] text-[#7392B5] mt-0.5">
                          <span className="truncate">
                            {ev.site.program} · {Math.abs(ev.site.latDeg).toFixed(2)}°
                            {ev.site.latDeg < 0 ? 'S' : 'N'}
                          </span>
                          <DataBadge dataClass={ev.site.horizonDataClass} />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between font-mono text-[11px]">
                          <span className="text-[#F5B83D]">Sun {ev.activeSunlightPct.toFixed(0)}%</span>
                          <span className="text-[#c9e8ff]">DTE {ev.activeEarthPct.toFixed(0)}%</span>
                          <span className="text-[#7392B5]">
                            {ev.site.slopeDeg !== null ? `${ev.site.slopeDeg.toFixed(1)}°` : 'MISSING'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            {/* Right Main Stage */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-4">
              {/* Selected Site Header Strip with Subtle Right-Edge Lunar Surface Vignette */}
              <div className="relative overflow-hidden lunar-panel rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-72 opacity-25"
                  style={{
                    backgroundImage: `linear-gradient(90deg, #131524 0%, rgba(19,21,36,0.35) 55%, rgba(19,21,36,0.85) 100%), url(${lunarSurfaceImg})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div className="relative z-10 space-y-1 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#7392B5]">
                    <span>{activeSite.program}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeSite.region}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-200">
                      {Math.abs(activeSite.latDeg).toFixed(2)}°{activeSite.latDeg < 0 ? 'S' : 'N'},{' '}
                      {Math.abs(activeSite.lonDeg).toFixed(2)}°{activeSite.lonDeg < 0 ? 'W' : 'E'} · Elev{' '}
                      {activeSite.elevationM >= 0 ? `+${activeSite.elevationM}` : activeSite.elevationM} m
                    </span>
                    <DataBadge
                      dataClass={activeSite.coordinateApproximate ? 'ESTIMATED' : activeSite.elevationDataClass}
                      provenance={{
                        id: `${activeSite.id}-coord`,
                        label: `${activeSite.name} — Coordinates & Elevation`,
                        value: `${activeSite.latDeg.toFixed(2)}°, ${activeSite.lonDeg.toFixed(2)}°`,
                        unit: `Elev ${activeSite.elevationM} m`,
                        dataClass: activeSite.coordinateApproximate ? 'ESTIMATED' : activeSite.elevationDataClass,
                        source: activeSite.coordinateSource,
                        processingSteps: [
                          'Parsed site centroid from catalog record.',
                          'Computed airless sphere horizon dip angle from site elevation (R = 1737.4 km).',
                        ],
                        uncertainty: activeSite.coordinateApproximate
                          ? 'Representative regional centroid; import exact LOLA GDR pad coordinates for pinpoint siting.'
                          : 'Verified literature landing site coordinate.',
                      }}
                      onInspect={setProvenanceRecord}
                    />
                  </div>
                  <h1 className="text-xl font-bold text-white" style={{ textWrap: 'balance' }}>
                    {activeSite.name}
                  </h1>
                  <p className="text-xs text-slate-300 leading-relaxed">{activeSite.summary}</p>
                </div>

                <div className="relative z-10 flex items-center gap-4 shrink-0 font-mono">
                  <div className="text-right">
                    <div className="text-[11px] text-[#7392B5]">SUITABILITY (WSM / TOPSIS)</div>
                    <div className="text-2xl font-bold text-white">
                      {activeEval.totalScore.toFixed(1)}
                      <span className="text-sm text-[#b8baff] ml-1.5">
                        / {activeEval.topsisScore !== null ? activeEval.topsisScore.toFixed(1) : 'N/A'}
                      </span>
                    </div>
                    <div className={`text-[11px] ${activeEval.passesConstraints ? 'text-[#b9f0d7]' : 'text-[#7392B5]'}`}>
                      {activeEval.rank
                        ? `WSM #${activeEval.rank} · ${activeEval.topsisRank ? `TOPSIS #${activeEval.topsisRank}` : 'TOPSIS N/A'}`
                        : 'Not eligible under constraints'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Column Critical Ephemeris & Mission Telemetry Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="lunar-panel rounded-lg p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#7392B5]">
                    <span>Solar Elevation (Terrain)</span>
                    <div className="flex items-center gap-1.5">
                      <DataBadge
                        dataClass="DERIVED"
                        provenance={{
                          id: `${activeSite.id}-sun-el`,
                          label: `${activeSite.name} — Solar Elevation Above Terrain`,
                          value: `${currentInstant.sun.apparentAboveTerrainDeg.toFixed(2)}°`,
                          unit: 'above effective horizon',
                          dataClass: 'DERIVED',
                          source: 'astronomy-engine SunPosition() + site horizon mask',
                          processingSteps: [
                            'Compute ecliptic solar longitude at UTC instant via Astronomy.SunPosition().',
                            'Map onto selenographic subsolar latitude/longitude with 1.5424° lunar axial tilt.',
                            'Convert to local azimuth/elevation and subtract effective horizon mask.',
                          ],
                          formula: 'apparent_el = geometric_el - max(horizon_dip, terrain_mask)',
                        }}
                        onInspect={setProvenanceRecord}
                      />
                      <Sun className="w-3.5 h-3.5 text-[#F5B83D]" />
                    </div>
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#F5B83D]">
                    {currentInstant.sun.apparentAboveTerrainDeg >= 0 ? '+' : ''}
                    {currentInstant.sun.apparentAboveTerrainDeg.toFixed(2)}°
                  </div>
                  <div className="text-[11px] font-mono text-[#7392B5]">
                    {formatCountdown(currentInstant.hoursToSunsetOrSunrise, currentInstant.sun.isVisible, 'sun')}
                  </div>
                </div>

                <div className="lunar-panel rounded-lg p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#7392B5]">
                    <span>Earth DTE Elevation</span>
                    <div className="flex items-center gap-1.5">
                      <DataBadge
                        dataClass="DERIVED"
                        provenance={{
                          id: `${activeSite.id}-earth-el`,
                          label: `${activeSite.name} — Earth Topocentric DTE Elevation`,
                          value: `${currentInstant.earth.apparentAboveTerrainDeg.toFixed(2)}°`,
                          unit: `Dist ${Math.round(currentInstant.earthMoonDistanceKm).toLocaleString()} km`,
                          dataClass: 'DERIVED',
                          source: 'astronomy-engine Astronomy.Libration() + site horizon mask',
                          processingSteps: [
                            'Compute sub-Earth selenographic libration (elat, elon) and range (dist_km) via Astronomy.Libration().',
                            'Transform sub-Earth vector into site local horizon frame.',
                            'Compare against airless horizon dip and terrain mask.',
                          ],
                          formula: 'dte_apparent = earth_geom_el - max(horizon_dip, terrain_mask)',
                        }}
                        onInspect={setProvenanceRecord}
                      />
                      <Radio className="w-3.5 h-3.5 text-[#c9e8ff]" />
                    </div>
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#c9e8ff]">
                    {currentInstant.earth.apparentAboveTerrainDeg >= 0 ? '+' : ''}
                    {currentInstant.earth.apparentAboveTerrainDeg.toFixed(2)}°
                  </div>
                  <div className="text-[11px] font-mono text-[#7392B5]">
                    {formatCountdown(currentInstant.hoursToEarthsetOrEarthrise, currentInstant.earth.isVisible, 'earth')}
                  </div>
                </div>

                <div className="lunar-panel rounded-lg p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#7392B5]">
                    <span>Window Power &amp; Data Mix</span>
                    <Compass className="w-3.5 h-3.5 text-[#b9f0d7]" />
                  </div>
                  <div className="text-2xl font-mono font-bold text-white">
                    {activeEval.activeSunlightPct.toFixed(1)}%
                    <span className="text-xs text-[#7392B5] ml-1.5">lit</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#7392B5]">
                    DTE {activeEval.activeEarthPct.toFixed(1)}% · Dark {activeEval.activeMaxDarkHours}h
                  </div>
                  {/* Honest Data Mix Mini Bar */}
                  <div className="pt-0.5 space-y-0.5">
                    <div className="h-1.5 w-full bg-[#0c0c16] rounded overflow-hidden flex">
                      <div
                        className="h-full bg-[#b9f0d7]"
                        style={{ width: `${activeEval.dataMixDerivedPct}%` }}
                      />
                      <div
                        className="h-full bg-[#b8baff]"
                        style={{ width: `${activeEval.dataMixSyntheticPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-mono text-[#7392B5]">
                      {activeEval.dataMixDerivedPct}% Derived · {activeEval.dataMixSyntheticPct}% Synth
                    </div>
                  </div>
                </div>

                <div className="lunar-panel rounded-lg p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-xs text-[#7392B5]">
                    <span>Thermal &amp; Surface</span>
                    <div className="flex items-center gap-1.5">
                      <DataBadge
                        dataClass={activeSite.divinerTempRangeK ? 'MEASURED' : 'MISSING'}
                        provenance={{
                          id: `${activeSite.id}-diviner`,
                          label: `${activeSite.name} — Diviner Bolometric Temperature`,
                          value: activeSite.divinerTempRangeK
                            ? `${activeSite.divinerTempRangeK[0]}–${activeSite.divinerTempRangeK[1]} K`
                            : 'MISSING',
                          unit: 'K',
                          dataClass: activeSite.divinerTempRangeK ? 'MEASURED' : 'MISSING',
                          source: 'NASA LRO Diviner DLRE (Linked — Not Yet Ingested)',
                          processingSteps: [
                            'LUNARITHM marks uningested Diviner bolometric temperature as MISSING.',
                            'Use the 3D & Physics tab for the labeled Stefan-Boltzmann radiative estimate.',
                          ],
                          uncertainty: 'Thermal extremes depend strongly on local slope micro-relief and albedo.',
                        }}
                        onInspect={setProvenanceRecord}
                      />
                      <Thermometer className="w-3.5 h-3.5 text-[#7392B5]" />
                    </div>
                  </div>
                  <div className="text-xl font-mono font-bold text-[#F25F5C]">
                    {activeSite.divinerTempRangeK
                      ? `${activeSite.divinerTempRangeK[0]}–${activeSite.divinerTempRangeK[1]} K`
                      : 'Diviner MISSING'}
                  </div>
                  <div className="text-[11px] font-mono text-[#7392B5]">
                    Slope {activeSite.slopeDeg !== null ? `${activeSite.slopeDeg.toFixed(1)}°` : 'MISSING'} · PSR{' '}
                    {activeSite.psrProximityKm} km
                  </div>
                </div>
              </div>

              {/* 3D Terrain & Sun/Earth Vectors Viewport */}
              <LunarViewport3D
                site={activeSite}
                allSites={sites}
                instant={currentInstant}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onSelectSite={setSelectedSiteId}
                heightClass="h-[390px]"
              />

              {/* Timeline Scrubber & Playback */}
              <TimelineScrubber
                metrics={activeEval.metrics}
                offsetHours={offsetHours}
                onChangeOffsetHours={setOffsetHours}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                playSpeedHoursPerSec={playSpeedHoursPerSec}
                onChangeSpeed={setPlaySpeedHoursPerSec}
                baseTimestampMs={baseTimestampMs}
              />

              {/* 2D Local Sky-Dome & Horizon Mask Plot */}
              <HorizonSkyPlot
                site={activeSite}
                instant={currentInstant}
                metrics={activeEval.metrics}
              />
            </div>
          </div>
        )}

        {activeTab === 'sky3d' && (
          <div className="space-y-4 animate-panel-in">
            <div className="lunar-panel rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-semibold text-white">
                  3D Terrain, Sky-Dome Geometry &amp; Subsystem Physics — {activeSite.name}
                </h1>
                <p className="text-xs text-[#7392B5] font-mono">
                  Sun Az {currentInstant.sun.azimuthDeg.toFixed(1)}° / El{' '}
                  {currentInstant.sun.geometricElevationDeg.toFixed(2)}° · Earth Az{' '}
                  {currentInstant.earth.azimuthDeg.toFixed(1)}° / El{' '}
                  {currentInstant.earth.geometricElevationDeg.toFixed(2)}° · Dist{' '}
                  {Math.round(currentInstant.earthMoonDistanceKm).toLocaleString()} km
                </p>
              </div>
              <select
                value={activeSite.id}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                aria-label="Select lunar landing site"
                className="bg-[#0c0c16] border border-[#272d47] text-xs text-slate-100 rounded px-3 py-1.5 focus:outline-none focus:border-[#c9e8ff]"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({Math.abs(s.latDeg).toFixed(2)}°{s.latDeg < 0 ? 'S' : 'N'})
                  </option>
                ))}
              </select>
            </div>

            <LunarViewport3D
              site={activeSite}
              allSites={sites}
              instant={currentInstant}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onSelectSite={setSelectedSiteId}
              heightClass="h-[480px]"
            />

            <TimelineScrubber
              metrics={activeEval.metrics}
              offsetHours={offsetHours}
              onChangeOffsetHours={setOffsetHours}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              playSpeedHoursPerSec={playSpeedHoursPerSec}
              onChangeSpeed={setPlaySpeedHoursPerSec}
              baseTimestampMs={baseTimestampMs}
            />

            <HorizonSkyPlot
              site={activeSite}
              instant={currentInstant}
              metrics={activeEval.metrics}
            />

            <PhysicsLabPanel
              activeEval={activeEval}
              allEvaluated={evaluatedSites}
              allSites={sites}
              relayBoostPct={relayBoostPct}
              onChangeRelayBoostPct={(pct) => {
                lastActionRef.current = pct > 0 ? `Lunar Relay +${pct}%` : 'Relay disabled (Pure DTE)';
                setRelayBoostPct(pct);
              }}
            />
          </div>
        )}

        {activeTab === 'compare' && (
          <SiteComparisonView
            allSites={sites}
            evaluatedSites={evaluatedSites}
            baseTimestampMs={baseTimestampMs}
            windowHours={windowHours}
            selectedSiteId={activeSite.id}
            onSelectPrimarySite={setSelectedSiteId}
          />
        )}

        {activeTab === 'decision' && (
          <DecisionStabilityView
            evaluatedSites={evaluatedSites}
            spearmanRho={rankingResult.spearmanRho}
            kendallTau={rankingResult.kendallTau}
            methodDisagreementNote={rankingResult.methodDisagreementNote}
            flipAnalysis={flipAnalysis}
            history={decisionHistory}
            activeProfileId={activeProfileId}
            onSelectProfile={handleSelectProfile}
            priorities={priorities}
            constraints={constraints}
            missingDataPolicy={missingDataPolicy}
            rankingBasis={rankingBasis}
            learnMode={learnMode}
            stakeholderRoles={stakeholderRoles}
            onChangeStakeholderRoles={setStakeholderRoles}
            onChangePriorities={handleChangePriorities}
            onChangeConstraints={handleChangeConstraints}
            onChangeMissingDataPolicy={(p) => {
              lastActionRef.current = `Missing-data policy: ${p}`;
              setMissingDataPolicy(p);
            }}
            onRelaxToNearestFeasible={(next) =>
              handleChangeConstraints(next, 'Auto-relaxed to nearest feasible threshold')
            }
            onSelectSite={(id) => setSelectedSiteId(id)}
            selectedSiteId={activeSite.id}
            onInspectProvenance={setProvenanceRecord}
            initialSubView={decisionSubView}
          />
        )}

        {activeTab === 'reports' && (
          <DataAndReportsView
            evaluatedSites={evaluatedSites}
            allSites={sites}
            flipAnalysis={flipAnalysis}
            priorities={priorities}
            constraints={constraints}
            landingIsoLocal={landingIsoLocal}
            windowHours={windowHours}
            spearmanRho={rankingResult.spearmanRho}
            kendallTau={rankingResult.kendallTau}
            rankingBasis={rankingBasis}
            stakeholderRoles={stakeholderRoles}
            onImportSites={handleImportSites}
            onImportHorizonMask={handleImportHorizonMask}
          />
        )}
      </main>

      {/* Non-intrusive Bottom-Left Decision Flip Toast */}
      {flipToast && (
        <div className="fixed bottom-4 left-4 z-40 lunar-panel border-[#F5B83D]/60 px-4 py-2.5 rounded-lg shadow-xl text-xs font-mono text-[#F5B83D] flex items-center gap-2 animate-toast-in no-print">
          <span className="w-2 h-2 rounded-full bg-[#F5B83D]" />
          <span>{flipToast}</span>
        </div>
      )}

      <CustomSiteModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onAddSite={handleAddCustomSite}
      />

      <ProvenanceDrawer
        record={provenanceRecord}
        onClose={() => setProvenanceRecord(null)}
      />

      <CommandPaletteModal
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        sites={sites}
        onSelectSite={setSelectedSiteId}
        onNavigate={(tab, subView) => {
          setActiveTab(tab);
          if (subView && tab === 'decision') {
            setDecisionSubView(subView as DecisionSubView);
          }
        }}
        onStartDemo={() => handleDemoStepChange(0)}
        onToggleMotion={() => setMotionReduced((v) => !v)}
        onToggleLearnMode={() => setLearnMode((v) => !v)}
        onTogglePresentation={() => setPresentationMode((v) => !v)}
        onToggleRankingBasis={() =>
          setRankingBasis((b) => (b === 'smooth_dip' ? 'terrain_masked' : 'smooth_dip'))
        }
      />

      <GuidedDemoOverlay
        stepIndex={demoStep}
        onChangeStep={handleDemoStepChange}
        onTriggerStepAction={handleDemoStepAction}
      />
    </div>
  );
}
