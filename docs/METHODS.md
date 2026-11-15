# LUNARITHM Mathematical & Physics Methods (`docs/METHODS.md`)

## 1. Ephemeris & Topocentric Geometry (`src/engine/lunarEphemeris.ts`)
- **Library**: `astronomy-engine` (Don Cross, MIT License) via `Astronomy.Libration`, `Astronomy.SunPosition`, and `Astronomy.MoonPhase`.
- **Selenographic Vectors**:
  - Sub-Earth latitude & longitude (`earthSubLatDeg`, `earthSubLonDeg`) and Earth–Moon distance (`dist_km`) come directly from `Astronomy.Libration(date)`.
  - Subsolar latitude (`computeSubsolarLatForIso`, 1.5424° obliquity) & longitude combine `Astronomy.SunPosition(date).elon` and synodic phase rotation.
- **Airless Horizon Dip**:
  - For site elevation $h$ (m) above the lunar mean sphere ($R = 1737.4\text{ km}$), $\theta_{\text{dip}} = -\arccos(R / (R + h/1000))$.
- **Three Visibility Baselines**:
  - `Smooth Sphere (No Dip)`: geometric elevation $> 0^\circ$.
  - `Smooth Sphere (+Dip)`: geometric elevation $> \theta_{\text{dip}}$ (default `DERIVED` ranking basis).
  - `Terrain-Masked`: geometric elevation $> \max(\theta_{\text{dip}}, \text{mask}(\alpha))$ (`SYNTHETIC` baseline or `MEASURED` after LOLA CSV import).

## 2. Physics & Subsystem Models (`src/engine/physicsModels.ts`)
- **Solar Power & Battery SoC**: Supports `vertical_tracking` (polar grazing default) and `horizontal_fixed` panel orientations, starting at 90% initial SoC and reporting `hoursUntilDepletion`.
- **Direct-to-Earth (DTE) RF Link Budget**: Computes per-step Free-Space Path Loss across actual varying Earth–Moon distance, implementation loss, and low-elevation grazing penalty below $5^\circ$, reporting `Link available % (margin >= 3 dB)`.
- **Radiative Surface Thermal Estimate**: Stefan-Boltzmann sunlit equilibrium $T_{\text{eq}} = [(1 - A) S \sin(\text{el}) / (\varepsilon \sigma)]^{1/4}$ clamped by an explicit user-configured night floor (`ESTIMATED`).
- **Outpost Pair Optimizer**: Geodesic distance on $R = 1737.4\text{ km}$ with configurable maximum separation threshold (default `20 km`).

## 3. Multi-Criteria Decision & Robustness (`src/engine/scoringEngine.ts`, `src/engine/decisionIntelligence.ts`)
- **3-State Constraints & Relaxation Diagnostic**: `PASS` / `FAIL` / `INSUFFICIENT_DATA` (`MissingDataPolicy`), plus `computeClosestFeasibleRelaxation` when zero sites qualify and `computeConstraintRelaxationFrontier` bottleneck curves.
- **Dual Scoring & Agreement**: WSM + TOPSIS (`>= 2` viable sites required) and Spearman $\rho$ / Kendall $\tau$ (`>= 3` ranked sites required, otherwise `N/A`).
- **Exact Flip Detector**: Solves single-criterion indifference points and minimum $L_1$ simplex shift, explicitly separating `no_viable`, `sole_viable`, true 5-axis `dominant`, and `flippable`.
- **Stability Engine & Minimax Regret**: 300 seeded Dirichlet scenarios + 5 named scenarios reporting 4 lenses (Best Now, Most Consistently #1, Strict-Limit Resilient, Minimax Regret).
- **Landing Dispersion & Stakeholder Room**: Seeded landing-ellipse sampling (P10/Median/P90, Feasibility %) and 5-role Stakeholder consensus (Borda count, Minimax-Rank compromise, Kendall's $W$).
