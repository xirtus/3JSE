# Recipe: Causal Snow

One continuous snow response model transitions through **cold dry powder → packed powder → warm wet snow → slush → refrozen crust** with no material prefab swap. The first decisive proof of the causal field (`docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md` Experiment 04).

Capabilities:
- `world_field` · `causal_field` · `material_response` · `constitutive_mixture` · `phase_change` · `granular_response` · `field_to_collision`

State (start minimal, add only on evidence):
- `temperature`, `liquidFraction`, `density`, `compression` (optional `grainState`)

Response card channels:
- visual: brightness/scattering proxy, sparkle/specular, translucency/transmission, clumping/covariance
- mechanical: ski friction, penetration, cohesion, compression resistance
- FX: powder plume yield, chunk/spray tendency, track depth (optional sound parameter)

Design recipe (Cause → Transport → Response → Projection → Feedback → Evidence):
- Cause: sun/wind/temperature/moisture + mechanical loading write state into the field.
- Transport: heat/moisture diffusion across field cells; compaction from contact.
- Response: one `ResponseCard` evaluates `W(state, environment) → [elastic, granular, wet-cohesive, fluid-like]` expert weights; phase regimes are curves in the response model, not `if` swaps.
- Projection: Gaussians (appearance), Rapier contact (friction/penetration), VFX (plume/chunk/track).
- Feedback: displaced snow compacts/densifies the cells it leaves, altering future contact.
- Evidence: a single state sweep drives visible change + friction/penetration change + displaced-snow FX yield change.

Gate: one state sweep drives (1) a visible change, (2) a mechanical friction/penetration change, (3) a displaced-snow FX yield change — from the same source. If these require three unrelated scripts, the architecture failed. A `causal-snow` slice must never contain `UseSlushMaterial`/`UsePowderMaterial` authority.
