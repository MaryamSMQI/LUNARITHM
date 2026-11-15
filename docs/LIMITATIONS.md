# LUNARITHM Scientific Limitations (`docs/LIMITATIONS.md`)

1. **Synthetic Default Horizon Masks**: Curated site horizon masks are procedural demo approximations (`SYNTHETIC`) unless replaced by LRO LOLA DEM horizon profiles via Horizon Mask CSV import (`MEASURED`). By default, site rankings use `smooth_dip` (`DERIVED` geometry + airless horizon dip) so rankings do not depend covertly on synthetic masks.
2. **Representative Region Centroids**: Candidate coordinates labeled `Approximate — verify` represent regional zone centers rather than pinpoint touchdown pads; Shackleton Interior (PSR) and Connecting Ridge are non-CLPS illumination/PSR benchmarks.
3. **Uningested Diviner Thermal Data**: LRO Diviner bolometric temperatures default to `MISSING`. The Stefan-Boltzmann thermal model in 3D & Physics is explicitly labeled `ESTIMATED` and relies on a user-set night floor assumption.
4. **Simplified Energy, RF & Dispersion Models**: Battery SoC (90% initial charge), X-band DTE link budget (assumed 34m DSN dish), and landing dispersion ellipses are preliminary trade-study aids and depend on terrain resolution.
5. **Decision-Support Scores Are Not Probabilities**: Suitability scores (0–100) and first-place frequencies measure scenario consistency under weighted preferences, never mission success probability.
6. **Guest / Local Persistence**: Cloud authentication and Firebase persistence are not provisioned in this deployment; configurations persist locally via URL `#state=` links and downloadable JSON/CSV/Markdown exports.
