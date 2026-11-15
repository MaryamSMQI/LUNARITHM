# LUNARITHM Deliverable Status Report (`docs/STATUS.md`)

| Feature / Subsystem | Status | Data Basis | Notes |
|---|---|---|---|
| Sun & Earth Libration Ephemeris (`astronomy-engine`) | Implemented & Verified | `DERIVED` | MIT-licensed `astronomy-engine` (`Libration`, `SunPosition`, `MoonPhase`). |
| 3-Baseline Solar & Earth Visibility + Ranking Basis Toggle | Implemented & Verified | `DERIVED` + `SYNTHETIC` | Smooth No-Dip, Smooth (+Dip, default), and Terrain-Masked (`MEASURED` on import). |
| Artemis III Regions, Apollo, Chang'e-4 & PSR Benchmarks | Implemented | `ESTIMATED` / `LITERATURE` / `SYNTHETIC` | Corrected Shackleton PSR (`-89.67°, 129.78°`), honest non-CLPS labels & Diviner `MISSING`. |
| 3D Three.js Terrain & South Pole Globe + Ambient Starfield | Implemented | `DERIVED` + `SYNTHETIC` | Software-WebGL guard, `#0c0c16` obsidian palette, `motionReduced` toggle. |
| Dual WSM + TOPSIS Ranking, Agreement & Collapsible Rejected Sites | Implemented & Verified | `DERIVED` | Honest `N/A` rules (`<2` TOPSIS, `<3` $\rho/\tau$), closest-feasible fallback, gap bars. |
| Decision Flip Detector & Clipped Weight-Space Ternary Map | Implemented & Verified | `DERIVED` | Exact indifference thresholds, $L_1$ shift, filled Voronoi map, Flip Toast. |
| Stability Engine (300 Scenarios) & Minimax Regret | Implemented & Verified | `DERIVED` | 4 stability lenses + Worst Scenario / Max Regret table columns. |
| Landing Dispersion, Multi-Stakeholder Room & Relaxation Frontier | Implemented & Verified | `DERIVED` / `SYNTHETIC` | Ellipse P10/Median/P90, 5-role Kendall's $W$ + Minimax Compromise, bottleneck sweeps. |
| Subsystem Physics Lab (Battery, RF Link, Thermal, Pair Optimizer) | Implemented & Verified | `DERIVED` / `ESTIMATED` | Vertical vs. horizontal solar, per-step FSPL, Stefan-Boltzmann thermal, 20 km reach check. |
| CSV Site & Horizon Mask Importer + Markdown Rationale Memo | Implemented | User CSV / Live Engine | Upgrades site horizons to `MEASURED`; exports full `.md`, `.json`, `.csv`, print card. |
| Command Palette (`⌘K`), 10-Step Guided Demo & Undo/Redo | Implemented | Interactive UI | Synchronized 10-step walkthrough with deterministic Step 5 winner flip (`#1` flips live). |
| 14-Test Scientific Engine Self-Test (`src/engine/selfTestSuite.ts`) | Verified (14/14 PASS) | Automated Engine Suite | Runnable via CLI (`npx tsx`) and inside **Data & Reports → Engine Self-Test**. |
