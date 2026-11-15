# LUNARITHM Data Sources & Provenance Classes (`docs/DATA_SOURCES.md`)

## Data Classification Standard
Every displayed figure in LUNARITHM carries one of six explicit Data Classes:
1. `MEASURED` — Direct spacecraft telemetry or user-imported LRO LOLA / Diviner CSV records.
2. `DERIVED` — Computed deterministically in-browser from `astronomy-engine` and spherical/horizon geometry.
3. `LITERATURE` — Verified coordinates/slopes from published NASA/CNSA mission literature (e.g., Apollo 11, Chang'e-4).
4. `ESTIMATED` — Approximate region centroids or simple physics estimates (e.g., Stefan-Boltzmann radiative temperature estimate).
5. `SYNTHETIC` — Illustrative demo horizon relief profiles (`72-bin` 5° azimuth masks) used until real LRO LOLA DEM horizon CSV data is imported.
6. `MISSING` — Uningested fields (e.g., LRO Diviner bolometric temperature ranges by default, or user-marked missing slope).

## Registry Status
- **Ingested Analytical (`astronomy-engine`)**: Live in-browser Sun/Earth vectors, Earth optical libration, Earth–Moon distance (MIT License, Don Cross).
- **Synthetic Demo Baseline**: Default polar horizon masks and regional slope baselines (`url` intentionally omitted; generated in-repo).
- **Linked (Not Yet Ingested by Default)**: NASA PDS LOLA (`LRO-L-LOLA-4-GDR-V1.0`), Diviner (`LRO-L-DLRE-5-GDR-V1.0`), LAMP/LEND, Mini-RF, Chandrayaan-1 M3, NASA Moon Trek. Users can import validated Site CSV or Per-Site Horizon Mask CSV records inside **Data & Reports → CSV Data & LOLA Horizon Import**.
