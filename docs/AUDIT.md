# LUNARITHM Pre-Upgrade System Audit (`docs/AUDIT.md`)

Date: 2026-11-13
Scope: Audit of initial LUNARITHM v1 build prior to Phase 1–7 upgrades.

## 1. Pages & Views
- **Mission Overview (`overview`)**: Working. Displays candidate site list, South Pole stereographic mini-map, 4-column KPI strip, 3D Three.js terrain viewport, timeline scrubber, and 2D sky-dome/horizon plot.
- **3D & Sky Horizon (`sky3d`)**: Working. Focused view of 3D terrain/globe + scrubber + horizon profile.
- **Compare Scenarios (`compare`)**: Working. Side-by-side comparison of up to 4 sites and launch date-slip comparison (`Nominal`, `+7d`, `+14d`, `+30d`).
- **Decision & Stability (`decision`)**: Partially working. Has direct weight sliders, hard constraints, WSM ranking, 5-axis radar, and basic perturbation tipping points, but lacked exact analytical flip thresholds, L1 minimum-change-to-flip, ternary weight-space map, TOPSIS dual-method comparison, AHP/ROC weight elicitation, Dirichlet Monte Carlo stability heatmap, and Value of Information (VoI).

## 2. Scientific & Ephemeris Engine (`src/engine/`)
- **`lunarEphemeris.ts`**: Partially working (analytical approximation). Computes subsolar latitude (`±1.54°`), optical libration, airless horizon dip, terrain mask interpolation, and 29.5-day hourly simulation. Upgrade needed: integrate `astronomy-engine` for JPL/IAU-consistent Sun/Earth vectors, true Earth–Moon distance, and smooth-sphere vs. terrain-masked side-by-side toggle.
- **`decisionEngine.ts`**: Partially working. Implements WSM and constraint pass/fail. Lacks 3-state constraints (`PASS` / `FAIL` / `INSUFFICIENT DATA`), missing-data policies, TOPSIS, Spearman/Kendall agreement, exact flip math, Pareto dominance, energy/battery SoC simulation, link budget, and site-pair network optimizer.

## 3. Data & Provenance (`src/data/`)
- **`lunarSites.ts`**: Partially working. Contains 10 sites, but lacked explicit per-value Data Class tags (`MEASURED`, `DERIVED`, `LITERATURE`, `ESTIMATED`, `SYNTHETIC`, `MISSING`), NASA 2024 refined 9 Artemis III regions, dataset registry, CSV/JSON schema-validated import, and clickable Provenance Inspector drawer.

## 4. Visual System & Controls
- **3D Viewport (`LunarViewport3D.tsx`)**: Working. Clean Three.js lifecycle, `RoomEnvironment`, software-WebGL guard, 7-part lander, dynamic shadows, and South Pole globe mode. Preserved and themed to new palette.
- **Palette & UX**: Uses dark slate theme. Needs alignment to requested palette (`#0c0c16`, `#7392B5`, `#b9f0d7`, `#c9e8ff`, `#b8baff`), Data-Class tagging, Guided Demo / Judge Tour, and Engine Self-Test page.
