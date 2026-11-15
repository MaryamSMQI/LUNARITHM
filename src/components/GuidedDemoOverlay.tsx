import React from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';

export interface GuidedStep {
  title: string;
  subtitle: string;
  description: string;
  actionLabel?: string;
}

export const GUIDED_DEMO_STEPS: GuidedStep[] = [
  {
    title: '1. Meet the Mission',
    subtitle: 'Long-Duration Outpost Preset (>= 4 Viable Sites)',
    description:
      'There is no universally "best" lunar landing site—suitability depends on mission constraints and priorities. We have loaded the Long-Duration Outpost preset so multiple Artemis III 2024 candidates qualify for meaningful comparison.',
  },
  {
    title: '2. South Pole Geometry & Ephemeris',
    subtitle: 'Real Sun & Earth Libration (astronomy-engine)',
    description:
      'At the Moon’s south pole, a 1.54° axial tilt keeps the Sun skimming along the horizon while Earth wobbles ±6.7° in latitude due to optical libration. Inspect the 3D Terrain Scene and 2D Sky-Dome to see elevation angles and occlusion.',
  },
  {
    title: '3. Hard Constraints Filter Sites Honestly',
    subtitle: 'Exact Threshold Gaps & Closest-to-Feasible Fallback',
    description:
      'Sites that fail mandatory solar, Earth DTE, darkness, or slope thresholds (like Shackleton Interior PSR or farside Chang’e-4) move to the collapsed "Not eligible" group with exact gap bars—never silently dropped.',
  },
  {
    title: '4. WSM vs. TOPSIS & "Why This Site?"',
    subtitle: 'Dual-Method Agreement Check',
    description:
      'Notice #1 Connecting Ridge leads on high polar solar power and science score. Both Weighted Sum (WSM) and TOPSIS rankings—plus Spearman ρ and Kendall τ—are shown side-by-side.',
  },
  {
    title: '5. Decision Flip Detector & Weight-Space Map',
    subtitle: 'Watch the Winner Flip Live',
    description:
      'Click "Simulate Comms Surge" below (or click anywhere inside the filled Weight-Space Ternary Map) to boost Earth DTE priority and watch #1 flip live from Connecting Ridge to Malapert Massif!',
    actionLabel: 'Simulate Comms Priority Surge (Trigger Live Flip)',
  },
  {
    title: '6. Stability Engine & Minimax Regret',
    subtitle: '300 Perturbed Scenarios + 4 Robust Lenses',
    description:
      'We test 300 seeded Dirichlet weight/constraint scenarios and compute Kendall’s W plus Minimax Regret—identifying which site keeps you closest to the best possible score in every scenario.',
  },
  {
    title: '7. Landing Dispersion ("Score the Ellipse")',
    subtitle: 'Touchdown Uncertainty Across 500 Samples',
    description:
      'Real landers touch down inside an uncertainty ellipse, not a single dot. Inspect P10 / Median / P90 suitability scores and green vs. coral feasible touchdown samples across the ellipse.',
  },
  {
    title: '8. Multi-Stakeholder Decision Room',
    subtitle: 'Resolving Team Conflict with Minimax Compromise',
    description:
      'Science, Surface Ops, Comms, Power, and Safety teams weight criteria differently. Compare each role’s favorite against Kendall’s W consensus and the Minimax-Rank compromise candidate.',
  },
  {
    title: '9. Value of Information ("What to Measure Next?")',
    subtitle: 'Uncertainty Propagation on Synthetic Masks',
    description:
      'Because default horizon masks are SYNTHETIC until real LOLA DEM profiles are imported, LUNARITHM propagates their uncertainty to show which measurement reduces flip risk the most.',
  },
  {
    title: '10. Rationale Memo & 14-Test Engine Suite',
    subtitle: 'Reproducible Reports & Honest Provenance',
    description:
      'Export the full Site Selection Rationale Memo (Markdown / Print PDF), import per-site LOLA horizon CSV profiles, or execute the live 14-test verification suite against src/engine/.',
  },
];

interface GuidedDemoOverlayProps {
  stepIndex: number | null;
  onChangeStep: (next: number | null) => void;
  onTriggerStepAction?: (stepIndex: number) => void;
}

export const GuidedDemoOverlay: React.FC<GuidedDemoOverlayProps> = ({
  stepIndex,
  onChangeStep,
  onTriggerStepAction,
}) => {
  if (stepIndex === null) return null;
  const step = GUIDED_DEMO_STEPS[stepIndex];
  const isLast = stepIndex === GUIDED_DEMO_STEPS.length - 1;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(430px,calc(100vw-2rem))] lunar-panel border-[#c9e8ff]/50 rounded-lg shadow-2xl p-4 space-y-3 animate-toast-in no-print">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#c9e8ff] shrink-0" />
          <div>
            <div className="text-[10px] font-mono text-[#b9f0d7]">
              GUIDED DEMO · STEP {stepIndex + 1} OF {GUIDED_DEMO_STEPS.length}
            </div>
            <h3 className="text-sm font-bold text-white">{step.title}</h3>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChangeStep(null)}
          aria-label="Exit guided demo"
          className="p-1 text-[#7392B5] hover:text-white rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-[11px] font-mono text-[#c9e8ff]">{step.subtitle}</div>
      <p className="text-xs text-slate-300 leading-relaxed">{step.description}</p>

      {step.actionLabel && onTriggerStepAction && (
        <button
          type="button"
          onClick={() => onTriggerStepAction(stepIndex)}
          className="lunar-btn w-full py-1.5 px-3 text-xs font-semibold bg-[#F5B83D] text-[#0c0c16] rounded hover:brightness-110 transition-all"
        >
          {step.actionLabel}
        </button>
      )}

      {/* Progress bar */}
      <div className="w-full h-1 bg-[#0c0c16] rounded overflow-hidden">
        <div
          className="h-full bg-[#c9e8ff] transition-all duration-200"
          style={{ width: `${((stepIndex + 1) / GUIDED_DEMO_STEPS.length) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => onChangeStep(Math.max(0, stepIndex - 1))}
          className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 bg-[#0c0c16] border border-[#272d47] rounded disabled:opacity-40"
        >
          <ArrowLeft className="w-3 h-3" /> Back
        </button>

        <button
          type="button"
          onClick={() => (isLast ? onChangeStep(null) : onChangeStep(stepIndex + 1))}
          className="lunar-btn inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-[#c9e8ff] text-[#0c0c16] rounded hover:brightness-110"
        >
          {isLast ? 'Finish Tour' : 'Next Step'} {!isLast && <ArrowRight className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
};
