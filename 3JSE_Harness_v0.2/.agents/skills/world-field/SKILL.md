# World Field

Use when building or extending the authoritative causal field that Gaussian splats, rigid-body contact, VFX, audio, navigation, and agent semantics all project from.

## Doctrine

- **The causal field is authoritative.** Gaussians, colliders, VFX, audio, nav, and agent semantics are projections of it at each subsystem's own resolution. The renderer must never be necessary for field correctness (headless always makes sense).
- **State ≠ response coefficients.** State changes every tick (temperature, moisture, liquidFraction, density, pressure, velocity, strain, phase, fuel, biomass, sediment, damage, carbonization). Response coefficients/cards are baked/inferred/slowly-changing (constitutive basis, friction/cohesion/thermal/optical/combustion/acoustic response, permeability, porosity, uncertainty). Store compact indices/latents into shared response palettes, never full response models per sample.
- **Field resolution ≠ render resolution.** One field cell may drive thousands of visual Gaussians. Field-step cost scales with field/active-solver cells, never with render element count.
- **Systems, not scripted outcomes.** Implement causes (addHeat, addMoisture, transport, response evaluation), never `SetTreeOnFire`-style named events. Discrete regime switches belong in the response/phase model, not scattered gameplay scripts.

## Shape

- Chunked: `WorldField → Region → Chunk → Cells`. Chunk metadata: id, AABB, resolution, state buffer, response/semantic index buffers, version.
- Sparse and active-region aware: inactive baked · low-rate ambient · active gameplay · high-rate continuum subregions.
- Sampling: `sample(position)`, `sampleGradient(position, channel)`, `sampleDirectional(...)`, `query(region, predicate)`, `write(region, op)` — backend-independent.
- Determinism/replay: fixed-step evolution, seeded stochastic events, recorded inputs, serializable field deltas, causal replay without renderer.

## Rules

- `@3jse/field` owns schema/chunks/state/response refs/sampling/interpolation/LOD/serialization/deterministic-update utilities — never the renderer, Rapier, MPM, fire, snow, or vegetation.
- Do not equate one Gaussian with one simulation particle. Do not promote a field package until at least two vertical slices require the abstraction.
