import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Command,
  Compass,
  FolderKanban,
  GraduationCap,
  Info,
  LogOut,
  Mail,
  MapPin,
  Monitor,
  Radio,
  Redo2,
  Rocket,
  Sparkles,
  Sun,
  Thermometer,
  Undo2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { CURATED_LUNAR_SITES } from './data/lunarSites';
import { MISSION_PROFILES } from './data/datasetRegistry';
import { DEFAULT_DEMO_PRESET, STEP_5_COMMS_SURGE_PRESET } from './data/demoPresets';
import { computeInstantEphemeris, computeSubsolarLatForIso } from './engine/lunarEphemeris';
import { computeSimpleThermalEstimate } from './engine/physicsModels';
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
  ThermalEstimateParams,
} from './types/lunar';
import { LunarAmbientBackdrop } from './components/LunarAmbientBackdrop';
import { TimelineScrubber } from './components/TimelineScrubber';
import { CustomSiteModal } from './components/CustomSiteModal';
import { SouthPoleMiniMap } from './components/SouthPoleMiniMap';
import { ProvenanceDrawer } from './components/ProvenanceDrawer';
import { DataBadge } from './components/DataBadge';
import { GuidedDemoOverlay } from './components/GuidedDemoOverlay';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { DEFAULT_STAKEHOLDER_ROLES } from './components/StakeholderAndDispersionPanel';
import { SpaceLoadingScreen } from './components/SpaceLoadingScreen';
import { NasaDataInsideSection } from './components/NasaDataInsideSection';
import { SavedAnalysisRecord } from './utils/sessionTypes';
import { useAuth } from './context/AuthContext';
import lunarRidgeImg from './assets/images/lunar_ridge_cta_1794599014260.jpg';
import lunarSurfaceImg from './assets/images/lunar_surface_detail_1794599014502.jpg';

const LunarViewport3D = lazy(() =>
  import('./components/LunarViewport3D').then((m) => ({ default: m.LunarViewport3D }))
);
const HorizonSkyPlot = lazy(() =>
  import('./components/HorizonSkyPlot').then((m) => ({ default: m.HorizonSkyPlot }))
);
const SiteComparisonView = lazy(() =>
  import('./components/SiteComparisonView').then((m) => ({ default: m.SiteComparisonView }))
);
const DecisionStabilityView = lazy(() =>
  import('./components/DecisionStabilityView').then((m) => ({ default: m.DecisionStabilityView }))
);
const PhysicsLabPanel = lazy(() =>
  import('./components/PhysicsLabPanel').then((m) => ({ default: m.PhysicsLabPanel }))
);
const DataAndReportsView = lazy(() =>
  import('./components/DataAndReportsView').then((m) => ({ default: m.DataAndReportsView }))
);
const AboutPage = lazy(() =>
  import('./components/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const SignInPage = lazy(() =>
  import('./components/AuthPages').then((m) => ({ default: m.SignInPage }))
);
const SignUpPage = lazy(() =>
  import('./components/AuthPages').then((m) => ({ default: m.SignUpPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('./components/AuthPages').then((m) => ({ default: m.ForgotPasswordPage }))
);
const MyAccountPage = lazy(() =>
  import('./components/MyAccountPage').then((m) => ({ default: m.MyAccountPage }))
);
const SavedAnalysesPage = lazy(() =>
  import('./components/SavedAnalysesPage').then((m) => ({ default: m.SavedAnalysesPage }))
);
const NotFoundPage = lazy(() =>
  import('./components/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);

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
    let encoded = '';
    if (hash.startsWith('#state=')) {
      encoded = hash.slice('#state='.length);
    } else if (hash.includes('state=')) {
      const idx = hash.indexOf('state=');
      encoded = hash.slice(idx + 'state='.length).split('&')[0];
    }
    if (!encoded) return null;
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json) as SharedHashState;
  } catch {
    return null;
  }
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
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

  // Account & Role Personalization state (Email/Password Auth, no DB saves)
  const {
    user,
    profile,
    toastMessage,
    clearToast,
    resendVerificationEmail,
    refreshVerificationStatus,
    signOutUser,
  } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [roleBannerDismissed, setRoleBannerDismissed] = useState(false);
  const [resendingVerify, setResendingVerify] = useState(false);
  const [sessionAnalyses, setSessionAnalyses] = useState<SavedAnalysisRecord[]>([]);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const appliedRoleUidRef = useRef<string | null>(null);

  const userInitials = useMemo(() => {
    const raw = (profile?.name || user?.displayName || user?.email || 'LU').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  }, [profile?.name, user?.displayName, user?.email]);

  // Role-based personalization when signed in
  useEffect(() => {
    if (!user || !profile) {
      appliedRoleUidRef.current = null;
      return;
    }
    if (appliedRoleUidRef.current === user.uid) return;
    appliedRoleUidRef.current = user.uid;
    setRoleBannerDismissed(false);
    if (
      profile.role === 'University student' ||
      profile.role === 'University researcher / educator'
    ) {
      setLearnMode(true);
    }
  }, [user, profile]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [userMenuOpen]);

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

  const activeThermal = useMemo(() => {
    const thermalDefaults: ThermalEstimateParams = {
      albedo: 0.12,
      emissivity: 0.95,
      solarConstantWm2: 1361,
      nightFloorTempK: 100,
      survivalMinTempK: 150,
    };
    const samples = activeEval.metrics.samples;
    const stepHours = samples.length > 1 ? samples[1].offsetHours - samples[0].offsetHours : 2;
    const summary = computeSimpleThermalEstimate(samples, stepHours, thermalDefaults);
    let currentTempK = thermalDefaults.nightFloorTempK;
    if (currentInstant.sun.isVisible && currentInstant.sun.apparentAboveTerrainDeg > 0) {
      const sinEl = Math.max(0.015, Math.sin((currentInstant.sun.apparentAboveTerrainDeg * Math.PI) / 180));
      const num = (1 - thermalDefaults.albedo) * thermalDefaults.solarConstantWm2 * sinEl;
      const denom = thermalDefaults.emissivity * 5.670374419e-8;
      currentTempK = Math.max(thermalDefaults.nightFloorTempK, Math.pow(num / denom, 0.25));
    }
    return {
      ...summary,
      currentTempK: Number(currentTempK.toFixed(1)),
      currentTempC: Number((currentTempK - 273.15).toFixed(0)),
    };
  }, [activeEval.metrics.samples, currentInstant]);

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
  const isWorkspaceRoute = location.pathname === '/' || location.pathname.startsWith('/state=');

  const currentSnapshotPayload = useMemo(
    () => ({
      missionProfileId: activeProfileId,
      missionProfileName: activeProfileName,
      winningSiteId: viableWinner ? viableWinner.site.id : null,
      winningSiteName: viableWinner ? viableWinner.site.name : 'No Viable Site',
      selectedSiteId: activeSite.id,
      landingIsoLocal,
      windowHours,
      priorities,
      constraints,
      rankingBasis,
      missingDataPolicy,
      relayBoostPct,
    }),
    [
      activeProfileId,
      activeProfileName,
      viableWinner,
      activeSite.id,
      landingIsoLocal,
      windowHours,
      priorities,
      constraints,
      rankingBasis,
      missingDataPolicy,
      relayBoostPct,
    ]
  );

  const handleAddSessionAnalysis = (title: string) => {
    const nowIso = new Date().toISOString();
    const record: SavedAnalysisRecord = {
      id: `session-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      title,
      ...currentSnapshotPayload,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    setSessionAnalyses((prev) => [record, ...prev]);
  };

  const handleRenameSessionAnalysis = (id: string, nextTitle: string) => {
    setSessionAnalyses((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, title: nextTitle, updatedAtIso: new Date().toISOString() }
          : item
      )
    );
  };

  const handleDuplicateSessionAnalysis = (id: string) => {
    setSessionAnalyses((prev) => {
      const source = prev.find((item) => item.id === id);
      if (!source) return prev;
      const nowIso = new Date().toISOString();
      const copy: SavedAnalysisRecord = {
        ...source,
        id: `session-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        title: `${source.title} (Copy)`,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      return [copy, ...prev];
    });
  };

  const handleDeleteSessionAnalysis = (id: string) => {
    setSessionAnalyses((prev) => prev.filter((item) => item.id !== id));
  };

  const handleOpenSavedAnalysis = (record: SavedAnalysisRecord) => {
    pushUndoSnapshot();
    lastActionRef.current = `Opened session snapshot: ${record.title}`;
    setActiveProfileId(record.missionProfileId);
    setPriorities(record.priorities);
    setConstraints(record.constraints);
    setLandingIsoLocal(record.landingIsoLocal);
    setWindowHours(record.windowHours);
    setSelectedSiteId(record.selectedSiteId);
    setRankingBasis(record.rankingBasis);
    setMissingDataPolicy(record.missingDataPolicy);
    setRelayBoostPct(record.relayBoostPct);
    setActiveTab('overview');
  };

  return (
    <div
      className={`min-h-screen bg-[#0c0c16] text-slate-100 flex flex-col relative overflow-x-hidden ${
        motionReduced ? 'motion-reduced' : ''
      }`}
    >
      {/* Ambient Starfield & Lunar Limb Photography Backdrop */}
      <LunarAmbientBackdrop motionReduced={motionReduced} presentationMode={presentationMode} />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0c0c16]/90 backdrop-blur-md border-b border-[#272d47] px-4 lg:px-6 h-14 flex items-center justify-between gap-4 lg:gap-8 no-print">
        {/* Zone 1: Single-element Brand Wordmark */}
        <Link
          to="/"
          onClick={() => setActiveTab('overview')}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff] rounded"
        >
          LUNARITHM
        </Link>

        {/* Zone 2: Clean single-line text nav links */}
        <nav className="flex items-center gap-4 lg:gap-6 overflow-x-auto no-scrollbar">
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
              onClick={() => {
                setActiveTab(tab.id);
                if (!isWorkspaceRoute) navigate('/');
              }}
              className={`py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                isWorkspaceRoute && activeTab === tab.id
                  ? 'border-[#c9e8ff] text-white'
                  : 'border-transparent text-[#7392B5] hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <Link
            to="/analyses"
            className={`py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              location.pathname === '/analyses' || location.pathname === '/account/analyses'
                ? 'border-[#c9e8ff] text-white'
                : 'border-transparent text-[#7392B5] hover:text-slate-100'
            }`}
          >
            Saved
          </Link>
          <Link
            to="/about"
            className={`py-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              location.pathname === '/about'
                ? 'border-[#c9e8ff] text-white'
                : 'border-transparent text-[#7392B5] hover:text-slate-100'
            }`}
          >
            About
          </Link>
        </nav>

        {/* Zone 3: Account Controls + Primary Guided Demo CTA */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
                className="lunar-btn inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-[#131524] border border-[#272d47] hover:border-[#c9e8ff] text-xs text-white transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-[#c9e8ff]/20 border border-[#c9e8ff]/50 text-[#c9e8ff] font-mono font-bold text-[11px] flex items-center justify-center">
                  {userInitials}
                </span>
                <span className="hidden md:inline max-w-[110px] truncate font-medium">
                  {profile?.name || user.displayName || 'Account'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#7392B5]" />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-52 lunar-panel rounded-lg shadow-2xl border border-[#272d47] py-1.5 z-50"
                >
                  <div className="px-3 py-2 border-b border-[#272d47]">
                    <div className="text-xs font-semibold text-white truncate">
                      {profile?.name || user.displayName || 'LUNARITHM User'}
                    </div>
                    <div className="text-[11px] font-mono text-[#7392B5] truncate">
                      {user.email}
                    </div>
                  </div>
                  <Link
                    to="/account/analyses"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-[#1a1d30] hover:text-white"
                  >
                    <FolderKanban className="w-3.5 h-3.5 text-[#c9e8ff]" />
                    Session Snapshots
                  </Link>
                  <Link
                    to="/account"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-[#1a1d30] hover:text-white"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-[#b9f0d7]" />
                    Account
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void signOutUser();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#F25F5C] hover:bg-[#1a1d30] text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link
                to="/sign-in"
                state={{ from: location.pathname }}
                className="px-2.5 py-1.5 text-xs font-medium text-[#7392B5] hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Sign in
              </Link>
              <Link
                to="/sign-up"
                className="px-2.5 py-1.5 text-xs font-semibold text-[#c9e8ff] border border-[#272d47] hover:border-[#c9e8ff] rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Sign up
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (!isWorkspaceRoute) navigate('/');
              handleDemoStepChange(demoStep === null ? 0 : null);
            }}
            style={{
              backgroundImage: `linear-gradient(125deg, rgba(12,12,22,0.82), rgba(115,146,181,0.45)), url(${lunarRidgeImg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            className="lunar-btn inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold text-[#c9e8ff] border border-[#c9e8ff]/55 hover:border-[#c9e8ff] rounded-md whitespace-nowrap shrink-0 shadow-md"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{demoStep === null ? 'Guided Demo' : 'Exit Demo'}</span>
          </button>
        </div>
      </header>

      {/* Email Verification Banner (only when signed in with unverified email) */}
      {user && !user.emailVerified && !presentationMode && (
        <div className="relative z-20 bg-[#F5B83D]/10 border-b border-[#F5B83D]/35 px-4 lg:px-6 py-2 text-xs text-[#F5B83D] flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span>
              Please verify your email —{' '}
              <button
                type="button"
                disabled={resendingVerify}
                onClick={() => {
                  setResendingVerify(true);
                  void resendVerificationEmail().finally(() => setResendingVerify(false));
                }}
                className="underline font-semibold hover:text-white disabled:opacity-55"
              >
                {resendingVerify ? 'Sending…' : 'Resend email'}
              </button>
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refreshVerificationStatus()}
            className="text-[11px] font-mono text-slate-200 hover:text-white underline"
          >
            I verified my email
          </button>
        </div>
      )}

      {/* Role-Based Dashboard Personalization Suggestion */}
      {user && profile && !roleBannerDismissed && !presentationMode && isWorkspaceRoute && (
        profile.role === 'University student' ||
        profile.role === 'University researcher / educator' ? (
          <div className="relative z-20 bg-[#131524]/95 border-b border-[#b9f0d7]/30 px-4 lg:px-6 py-2 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#b9f0d7] shrink-0" />
              <span>
                Learn Mode enabled for your <span className="text-[#b9f0d7] font-medium">{profile.role}</span> workspace. Recommended: start the 10-step Guided Demo.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handleDemoStepChange(0);
                  setRoleBannerDismissed(true);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#b9f0d7] text-[#0c0c16] hover:bg-white"
              >
                Start Guided Demo
              </button>
              <button
                type="button"
                aria-label="Dismiss role suggestion"
                onClick={() => setRoleBannerDismissed(true)}
                className="p-1 text-[#7392B5] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : profile.role === 'Space agency' || profile.role === 'Space company / lander company' ? (
          <div className="relative z-20 bg-[#131524]/95 border-b border-[#b8baff]/30 px-4 lg:px-6 py-2 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-[#b8baff] shrink-0" />
              <span>
                Tailored for <span className="text-[#b8baff] font-medium">{profile.role}</span>: jump straight to the Stakeholder Room or Site Selection Memo.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('decision');
                  setDecisionSubView('dispersion_room');
                  setRoleBannerDismissed(true);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#b8baff] text-[#0c0c16] hover:bg-white"
              >
                Stakeholder Room
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('reports');
                  setRoleBannerDismissed(true);
                }}
                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#0c0c16] border border-[#272d47] text-[#c9e8ff] hover:border-[#c9e8ff]"
              >
                Site Selection Memo
              </button>
              <button
                type="button"
                aria-label="Dismiss role suggestion"
                onClick={() => setRoleBannerDismissed(true)}
                className="p-1 text-[#7392B5] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : null
      )}

      {/* Persistent Mission Context & Epoch Ribbon */}
      {!presentationMode && isWorkspaceRoute && (
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

      {presentationMode && isWorkspaceRoute && (
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
      {showScienceGuide && isWorkspaceRoute && (
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
        <Suspense fallback={<SpaceLoadingScreen />}>
          {isWorkspaceRoute ? (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-5 animate-panel-in">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
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
                                dataClass={activeSite.divinerTempRangeK ? 'MEASURED' : 'ESTIMATED'}
                                provenance={{
                                  id: `${activeSite.id}-thermal`,
                                  label: `${activeSite.name} — Surface Thermal & Regolith Telemetry`,
                                  value: activeSite.divinerTempRangeK
                                    ? `${activeSite.divinerTempRangeK[0]}–${activeSite.divinerTempRangeK[1]} K`
                                    : `${Math.round(activeThermal.minTempK)}–${Math.round(activeThermal.maxTempK)} K (Now ~${Math.round(activeThermal.currentTempK)} K)`,
                                  unit: 'K',
                                  dataClass: activeSite.divinerTempRangeK ? 'MEASURED' : 'ESTIMATED',
                                  source: activeSite.divinerTempRangeK
                                    ? 'NASA LRO Diviner DLRE + Site Slope/Roughness'
                                    : 'Stefan-Boltzmann Radiative Estimate (A=0.12, ε=0.95, 100 K floor); raw LRO Diviner DLRE not yet ingested',
                                  processingSteps: [
                                    'Compute instantaneous and window radiative equilibrium T = [(1−A)·S·sin(el)/(ε·σ)]^(1/4) from solar elevation above terrain.',
                                    'Apply 100 K shadowed/nighttime regolith floor when Sun is below effective horizon.',
                                    'Display baseline site slope, roughness, and PSR distance alongside thermal range.',
                                  ],
                                  formula: 'T_eq = [ (1 - 0.12) * 1361 * max(0.015, sin(el)) / (0.95 * 5.67e-8) ]^(1/4)',
                                  uncertainty: 'Radiative estimate excludes local crater wall IR reflection and thermal inertia; import LRO Diviner data for measured bolometric T.',
                                }}
                                onInspect={setProvenanceRecord}
                              />
                              <Thermometer className="w-3.5 h-3.5 text-[#b8baff]" />
                            </div>
                          </div>
                          <div className="text-xl font-mono font-bold text-[#c9e8ff]">
                            {activeSite.divinerTempRangeK
                              ? `${activeSite.divinerTempRangeK[0]}–${activeSite.divinerTempRangeK[1]} K`
                              : Math.round(activeThermal.minTempK) === Math.round(activeThermal.maxTempK)
                              ? `~${Math.round(activeThermal.minTempK)} K floor`
                              : `${Math.round(activeThermal.minTempK)}–${Math.round(activeThermal.maxTempK)} K`}
                            <span className="text-xs font-normal text-[#b8baff] ml-1.5">
                              now ~{Math.round(activeThermal.currentTempK)} K
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-[#7392B5]">
                            {activeThermal.currentTempC >= 0 ? `+${activeThermal.currentTempC}` : activeThermal.currentTempC}°C now · Mean {Math.round(activeThermal.meanTempK)} K · &lt;150 K: {activeThermal.hoursBelowSurvival}h
                          </div>
                          <div className="text-[11px] font-mono text-[#7392B5]">
                            Slope {activeSite.slopeDeg !== null ? `${activeSite.slopeDeg.toFixed(1)}°` : 'N/A'} · Rough{' '}
                            {activeSite.roughnessM !== null ? `${activeSite.roughnessM.toFixed(1)} m` : 'N/A'} · PSR{' '}
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

                  {/* NASA Data Inside Section */}
                  <NasaDataInsideSection />
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
            </>
          ) : (
            <Routes>
              <Route path="/about" element={<AboutPage />} />
              <Route path="/sign-in" element={<SignInPage />} />
              <Route path="/sign-up" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/account" element={<MyAccountPage />} />
              <Route
                path="/analyses"
                element={
                  <SavedAnalysesPage
                    analyses={sessionAnalyses}
                    currentSnapshot={currentSnapshotPayload}
                    onAddAnalysis={handleAddSessionAnalysis}
                    onRenameAnalysis={handleRenameSessionAnalysis}
                    onDuplicateAnalysis={handleDuplicateSessionAnalysis}
                    onDeleteAnalysis={handleDeleteSessionAnalysis}
                    onOpenAnalysis={handleOpenSavedAnalysis}
                  />
                }
              />
              <Route
                path="/account/analyses"
                element={
                  <SavedAnalysesPage
                    analyses={sessionAnalyses}
                    currentSnapshot={currentSnapshotPayload}
                    onAddAnalysis={handleAddSessionAnalysis}
                    onRenameAnalysis={handleRenameSessionAnalysis}
                    onDuplicateAnalysis={handleDuplicateSessionAnalysis}
                    onDeleteAnalysis={handleDeleteSessionAnalysis}
                    onOpenAnalysis={handleOpenSavedAnalysis}
                  />
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          )}
        </Suspense>
      </main>

      {/* Quiet Footer */}
      {!presentationMode && (
        <footer className="relative z-10 border-t border-[#272d47] bg-[#0c0c16]/90 px-4 lg:px-6 py-4 text-xs text-[#7392B5] no-print">
          <div className="max-w-[1520px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <span>LUNARITHM · Built in Alexandria, Egypt · NASA Space Apps Challenge 2026</span>
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/" onClick={() => setActiveTab('overview')} className="hover:text-[#c9e8ff] transition-colors">
                Overview
              </Link>
              <Link to="/analyses" className="hover:text-[#c9e8ff] transition-colors">
                Session Snapshots
              </Link>
              <Link to="/about" className="hover:text-[#c9e8ff] transition-colors">
                About LUNARITHM
              </Link>
              <Link to={user ? '/account' : '/sign-in'} className="hover:text-[#c9e8ff] transition-colors">
                {user ? 'My Account' : 'Sign in'}
              </Link>
            </div>
          </div>
        </footer>
      )}

      {/* Non-intrusive Bottom-Left Decision Flip & Account Toasts */}
      {flipToast && (
        <div className="fixed bottom-4 left-4 z-40 lunar-panel border-[#F5B83D]/60 px-4 py-2.5 rounded-lg shadow-xl text-xs font-mono text-[#F5B83D] flex items-center gap-2 animate-toast-in no-print">
          <span className="w-2 h-2 rounded-full bg-[#F5B83D]" />
          <span>{flipToast}</span>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-40 lunar-panel border-[#b9f0d7]/60 px-4 py-2.5 rounded-lg shadow-xl text-xs text-[#b9f0d7] flex items-center gap-2 animate-toast-in no-print">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            aria-label="Close notification"
            onClick={clearToast}
            className="text-[#7392B5] hover:text-white ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
          if (!isWorkspaceRoute) navigate('/');
          setActiveTab(tab);
          if (subView && tab === 'decision') {
            setDecisionSubView(subView as DecisionSubView);
          }
        }}
        onStartDemo={() => {
          if (!isWorkspaceRoute) navigate('/');
          handleDemoStepChange(0);
        }}
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
