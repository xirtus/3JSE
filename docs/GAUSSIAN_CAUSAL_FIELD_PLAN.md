# 3JSE Gaussian Splat + Causal Field Integration Plan
## Agent handoff plan for the 3JSE Harness, Engine, and game-design workflow

**Status:** Proposed architecture and implementation program  
**Primary target:** `xirtus/3JSE`  
**Harness target:** `3JSE_Harness_v0.2/`  
**Goal:** Add Gaussian splatting to 3JSE in a way that changes how games are authored and simulated, not merely how they are rendered.

---

# 0. EXECUTIVE DIRECTIVE

Do not build "Gaussian splat support" as a visual feature.

Build a **multiresolution causal-field architecture** in which:

- Gaussian splats are one visual projection of world state.
- Rapier/Jolt colliders are one mechanical projection of world state.
- Continuum solvers such as MPM/PBD/SPH/combustion grids are optional simulation projections.
- Semantic/language features are one agent-facing projection.
- Audio/VFX/material parameters are projections.
- A coarse field is authoritative for causal state.
- Baked response coefficients describe how local matter responds to changing state.
- The visual splat count and the simulation field count are independent.
- AI agents mutate/query the causal field through a small typed command surface rather than directly scripting visual effects.

The one-sentence bet:

> **A baked response card is evaluated on a coarse causal field, then projected into Gaussians, Rapier, vendor VFX/audio, and agent-visible semantics.**

This is the join of the strongest patterns found in:

- FieryGS: coarse causal grid != splat resolution, causal state projects back to splats.
- PhysTalk: agent intent becomes constrained executable physics operations; splat is witness.
- OmniPhysGS: material behavior can be represented as a mixture of constitutive experts rather than a string label.
- PIDG: constitutive quantities can evolve over time, but its one-Gaussian-one-material-point coupling must NOT become the 3JSE runtime default.
- GASP / VR-GS: render resolution can be much larger than simulation resolution.
- VoMP / PhysGS / GaussianProperty: hidden material properties can be inferred onto captured scenes during authoring.
- Feature Splatting / LangSplat: extra semantic channels can be compressed and associated with splats.
- Brush / dynamic splat playgrounds: live Gaussian GPU data can be mutated without retraining.
- KHR_gaussian_splatting: splats can live in a standard glTF-derived asset path rather than a private container.

---

# 1. HARD CONSTRAINTS

These constraints override attractive research-paper architectures when they conflict.

## 1.1 Three.js remains the renderer

3JSE does not start a renderer war.

- Use Three.js `WebGPURenderer` / TSL as the engine rendering substrate.
- Integrate native Three.js Gaussian support when it satisfies the use case.
- Keep a 3JSE splat adapter interface so Brush/custom WebGPU/Three-native backends can be evaluated without changing gameplay code.
- Do not fork Three.js.
- Do not introduce a second scene graph.

## 1.2 Rapier remains the rigid-body default

Current 3JSE physics doctrine is correct:

- `@3jse/physics-rapier` remains the default rigid-body backend.
- Jolt remains a possible alternative behind the same interface.
- Continuum simulation is a separate optional backend/capability.
- Do not replace rigid-body physics with MPM merely because splat papers use MPM.
- Cars, bikes, characters, gondolas, rigid props, triggers, joints, and ordinary collision continue through the 3JSE physics interface.

## 1.3 Field resolution must be independent of splat resolution

Never make this the default:

```text
50,000,000 visible Gaussians
=
50,000,000 simulated material points
```

Target architecture:

```text
Visible reality
10M to 100M streamed Gaussians
        |
        v
Semantic/material clusters
100k to 1M clusters
        |
        v
Causal field
10k to 200k cells per active sector
        |
        v
Active continuum simulation
1k to 50k active elements where needed
```

Exact budgets will be measured, not assumed. The structural separation is non-negotiable.

## 1.4 State and response coefficients are different things

**State** changes every tick or frequently:

- temperature
- moisture
- liquid-water fraction
- density
- pressure
- velocity
- strain
- phase
- fuel
- biomass
- sediment
- damage
- carbonization

**Response coefficients/cards** are baked, inferred, authored, or slowly changing:

- constitutive expert weights/basis parameters
- friction response
- cohesion response
- thermal response
- optical response
- combustion response
- acoustic response
- permeability
- porosity response
- uncertainty
- semantic/material priors

Do not store enormous response models on every Gaussian.

Store compact indices/latents into shared response palettes.

## 1.5 No gameplay logic that merely swaps materials when a causal model should exist

Reject patterns such as:

```js
if (temperature > 0) material = "slush"
if (raining) material = "wet_dirt"
if (fireNearTree) tree.setOnFire()
```

Prefer:

```text
state changes
    ->
evaluate response
    ->
visual/mechanical/chemical consequences emerge
```

Discrete state transitions are still allowed where physics genuinely has discrete regimes, but those transitions belong in the response/phase model, not scattered gameplay scripts.

---

# 2. THE CORE 3JSE PRIMITIVE

The engine primitive should NOT be `GaussianSplat`.

The engine primitive should be a **ResponseElement** sampled from a **WorldField**.

A Gaussian is one renderer of a ResponseElement.

## 2.1 Proposed conceptual types

```ts
export interface WorldSampleState {
  temperature: number;
  moisture: number;
  liquidFraction: number;
  density: number;
  pressure: number;
  phase: number;

  velocity: [number, number, number];

  strain?: number[];
  fuel?: number;
  biomass?: number;
  sediment?: number;
  carbonization?: number;
}

export interface ResponseUncertainty {
  confidence: number;
  aleatoric?: number[];
  epistemic?: number[];
}

export interface ResponseCardRef {
  paletteId: number;
  latent?: Float32Array; // target <= 32 values
  uncertainty?: ResponseUncertainty;
}

export interface SemanticRef {
  dictionaryId: number;
  classId?: number;
  clusterId?: number;
  confidence?: number;
}

export interface WorldSample {
  position: [number, number, number];
  state: WorldSampleState;
  response: ResponseCardRef;
  semantic?: SemanticRef;
}

export interface ResponseProjection {
  visual?: VisualResponse;
  mechanical?: MechanicalResponse;
  thermal?: ThermalResponse;
  combustion?: CombustionResponse;
  acoustic?: AcousticResponse;
  ecological?: EcologicalResponse;
}
```

These are design-level types. Do not prematurely freeze names or fields before the experiments establish the minimum viable schema.

## 2.2 ResponseCard

A `ResponseCard` represents a compact local behavior manifold.

Conceptually:

```text
ResponseCard
    |
    +-- constitutive basis
    +-- state -> expert weights
    +-- friction response
    +-- thermal response
    +-- phase response
    +-- optical projection parameters
    +-- combustion response
    +-- optional acoustic/ecology response
    +-- uncertainty/provenance
```

Do not ship 12 neural networks per material.

Start with a tiny expert basis inspired by OmniPhysGS:

```text
elastic
granular
wet-cohesive
fluid-like
```

Later, only if evidence requires them:

```text
plastic
brittle
viscoelastic
porous
```

The important extension over OmniPhysGS is:

```text
expert weights = W(WorldSample.state, environment)
```

rather than frozen weights learned once per scene.

Example:

```text
cold dry powder:
  granular     0.78
  cohesive     0.08
  elastic      0.13
  fluid-like   0.01

warming wet snow:
  granular     0.45
  cohesive     0.35
  elastic      0.10
  fluid-like   0.10
```

This is the first concrete form of the "material is a walk through coefficient space" idea.

---

# 3. TWO REALITIES, ONE SOURCE

Formalize the user's "two realities" idea.

```text
                  AUTHORITATIVE WORLD FIELD
                           |
                  WorldSample + ResponseCard
                           |
       +-------------------+-------------------+
       |                   |                   |
       v                   v                   v
 VISUAL PROJECTION   MECHANICAL PROJECTION   AGENT PROJECTION
 Gaussian splats     Rapier/Jolt shapes      semantics
 mesh/vendor FX      friction/contact         affordances
 SH/opacity           MPM/PBD/SPH bridge      uncertainty
 emission             collision/query         field queries
       |                   |                   |
       +-------------------+-------------------+
                           |
                      PLAYER EXPERIENCE
```

The visible world and the logic world are not parallel hand-authored copies.

They are projections of the same causal source.

Collision meshes remain useful, but they are **derived projections**, not the authoritative world description.

---

# 4. RESEARCH SOURCE DISPOSITION

Create a source ledger before any integration.

Every source must be inspected through the existing Safe Repository Inspector. Record:

- repository
- pinned commit
- literal license text
- dependencies
- install scripts
- binary/CUDA assumptions
- code path relevant to 3JSE
- disposition
- extracted artifact/pattern
- rejection notes

Use these dispositions:

```text
provider
provider_reference
reference_implementation
pattern_port
authoring_only
watch
reject
```

## 4.1 Highest-priority sources

### FieryGS
**Role:** architecture reference for dual-resolution causal simulation.

Extract:

- combustion grid state channels
- neighbor heat transport
- material inference/field paint
- splat projection of emission, opacity, carbonization
- separation between authoring inference and runtime simulation

Do not:

- make FieryGS the renderer
- create a fire-only subsystem architecture
- assume its combustion representation should own all field data

3JSE interpretation:

```text
FieryGS loop
->
generic WorldField loop
```

Fire becomes one `field-chemistry` parameterization.

### PhysTalk
**Role:** harness/agent command-surface reference.

Extract:

- constrained prompt -> executable operation pattern
- proxy simulation -> visual skin mapping
- allowed operation surface
- how agent intent is separated from rendering

Do not:

- adopt Genesis as 3JSE rigid-body physics
- permit arbitrary generated code to reach raw simulation internals

3JSE interpretation:

```ts
world.query(...)
world.sample(...)
world.setState(...)
world.addHeat(...)
world.addMoisture(...)
world.applyImpulse(...)
world.ignite(...)
```

The final command surface should be even smaller than this when possible.

### OmniPhysGS
**Role:** constitutive expert-basis reference.

Extract:

- list/shape of expert constitutive models
- representation of per-particle mixture weights
- how the constitutive mixture enters MPM
- what information is actually required by the stepper

Do not:

- ship the video-diffusion trainer
- ship 12 neural experts as runtime dependencies
- confuse frozen expert weights with a full live response manifold

3JSE interpretation:

```text
small expert basis
+
baked card
+
live WorldSample state
=
state-dependent behavior weights
```

### PIDG
**Role:** equations and state-evolution reference.

Extract:

- Lagrangian formulation
- Cauchy momentum residual
- chosen evolving constitutive scalars
- static vs dynamic feature split

Do not:

- copy one-Gaussian = one-material-point
- copy per-sequence optimization into runtime
- copy optical-flow training into web client

3JSE interpretation:

```text
dynamic constitutive state belongs to field cells
Gaussians sample the field
```

### GASP
**Role:** hierarchy and simulation-resolution decoupling.

Extract:

- mapping between large Gaussian set and smaller simulated representatives
- transform propagation
- grouping data structures
- stability/performance lessons

This is one of the most important implementation references.

### PhysGaussian / warp-mpm / gs-mpm
**Role:** what-you-see-is-what-you-simulate reference bench.

Extract:

- deformation-gradient -> Gaussian covariance update
- interior particle filling
- material-card inputs
- MPM data organization
- which state variables visibly matter

Do not:

- ship Warp/Taichi/Python runtime
- simulate at visual Gaussian count

### VoMP
**Role:** authoring-time hidden-property inference.

Extract:

- representation of inferred mechanical property distributions
- MatVAE/latent compression idea
- uncertainty where available
- conversion from observed geometry/appearance to volumetric properties

3JSE interpretation:

- offline Causal Compiler source
- never a required runtime dependency

### PhysGS
**Role:** probabilistic per-Gaussian property estimation.

Extract:

- friction/hardness/density/stiffness/mass estimation
- aleatoric vs epistemic uncertainty
- aggregation into lower-resolution field cells

Uncertainty is first-class authoring data.

### GaussianProperty
**Role:** cheap zero-shot authoring.

Extract:

- SAM/VLM material reasoning
- 2D material cards
- voting/painting onto Gaussian clusters

Use as a first-pass field painter.

### Feature Splatting / Feature 3DGS
**Role:** compact extra-channel packing.

Extract:

- dimensionality/compression tradeoffs
- how features are associated with splats
- cost of 32-D vs huge foundation-model embeddings

3JSE rule:

> Response latent target <= 32 coefficients unless evidence proves more are necessary.

### LangSplat / LangSplat V2 / Gaussian Grouping
**Role:** semantic dictionary and object/group identity.

Extract:

- global dictionary/index approaches
- compressed language-field lookup
- cluster/object grouping

Do not make CLIP embeddings the physics representation.

### Brush / brush-js
**Role:** WebGPU reconstruction/runtime buffer integration.

Extract:

- browser/WebGPU training path
- GPU buffer access
- live data ownership
- file/formats bridge

Preferred experiment:

```text
Brush GPU buffers
   ->
3JSE adapter
   ->
Three/WebGPU scene
```

without PLY CPU round-trip if feasible.

### Gaussian Splat Playground / dynamic-GS demos
**Role:** live runtime mutation reference.

Extract:

- position mutation
- covariance mutation
- opacity/color mutation
- GPU data update patterns

Use for the first dynamic projection experiments.

### KHR_gaussian_splatting
**Role:** serialization base.

Do not invent a private splat container.

Target future shape:

```text
KHR_gaussian_splatting
+
EXT_3jse_causal_field
```

Do not attempt to register or freeze the extension until the experiments establish the data model.

### GOF / 2DGS / splat-to-geometry work
**Role:** mechanical/nav projection.

Extract:

- TSDF/mesh/SDF proxy generation
- collision-ready simplification
- walkability/nav generation patterns

Remember:

```text
proxy != authority
```

### MatSpray / GI-GS / 3DGRUT
**Role:** material/lighting projection reference.

Extract:

- PBR property recovery
- relighting
- optical decomposition
- secondary-ray/refraction/reflection strategies

These are projection improvements, not field architecture.

### NanoGaussian / LightGaussian / gsplat / SuperSplat
**Role:** scale, compression, LOD, streaming.

Extract:

- cluster hierarchy
- screen-space error
- tile/sector streaming
- render budgets
- compaction
- top-contributor/Gaussian-ID queries where available

These affect Xirtus Mountain scale, not the causal model.

---

# 5. HARNESS INTEGRATION

The harness is where this work starts.

Do not begin by adding seven engine packages.

The harness must first learn how to route, study, build, and verify field-based work.

## 5.1 Add capability IDs

Extend:

`3JSE_Harness_v0.2/.agents/registry/capabilities.json`

Proposed capability IDs:

```json
{
  "gaussian_splat_rendering": [],
  "gaussian_splat_streaming": [],
  "gaussian_splat_dynamic": [],
  "world_field": [],
  "causal_field": [],
  "material_response": [],
  "material_estimation": [],
  "semantic_splats": [],
  "field_physics": [],
  "constitutive_mixture": [],
  "phase_change": [],
  "combustion": [],
  "granular_response": [],
  "field_to_collision": [],
  "field_to_navigation": [],
  "field_agent_ops": [],
  "splat_relighting": []
}
```

Do not add all provider IDs blindly. Add provider mappings only after the source intake step verifies the source and disposition.

## 5.2 Add provider/reference entries

Extend:

`3JSE_Harness_v0.2/.agents/registry/providers.json`

Candidate entries, pending safe-repo/license audit:

```text
fierygs
phystalk
omniphysgs
pidg
gasp
physgaussian
vomp
physgs
gaussian-property
feature-splatting
langsplat
gaussian-grouping
brush
gaussian-splat-playground
khr-gaussian-splatting
gaussian-opacity-fields
2dgs
3dgrut
matspray
nanogaussian
lightgaussian
gsplat
supersplat
```

Use `reference_implementation` or `pattern_port` as the default disposition until a source is proven suitable for direct integration.

Do NOT inflate the always-loaded harness context by creating one always-loaded skill per paper.

## 5.3 New skills

Create only four canonical skills initially.

### `world-field`
Purpose:

- authoritative field doctrine
- state vs coefficient split
- field resolution != render resolution
- sampling/interpolation
- projection rules
- field-based gameplay design

### `splat-integration`
Purpose:

- Three.js/Brush/native-GS routing
- dynamic Gaussian projection
- LOD/streaming
- serialization
- collision proxy posture

### `causal-authoring`
Purpose:

- semantic/material inference
- uncertainty
- response-card fitting
- provenance
- offline-vs-runtime boundary

### `field-qa`
Purpose:

- emergence tests
- cross-projection invariants
- resolution/performance gates
- "no scripted outcome" checks
- causal replay/debug evidence

Add mirrors under `.claude/skills/` via the existing sync script, never hand-maintain divergent copies.

## 5.4 New recipes

Add three recipes:

### `causal-snow`
Goal:

one continuous snow response model transitions through powder, packed snow, wet snow, slush, refrozen crust without a material swap.

### `causal-trail`
Goal:

one moisture update changes appearance, tire response, bearing strength, dust, splash, and rut behavior.

### `emergent-forest-fire`
Goal:

fire propagation emerges from field state and neighbor transport without a scripted `SetTreeOnFire`.

These are reference validation recipes, not giant game templates.

## 5.5 Update harness docs

Agent must update:

- `docs/HARNESS.md`
- provider count
- skill count
- capability list
- field doctrine
- new source dispositions
- new recipes
- harness-to-engine convergence table

Regenerate:

- `docs/FILE_INDEX.txt`

Run:

```bash
node 3JSE_Harness_v0.2/scripts/sync-claude-skills.mjs
node 3JSE_Harness_v0.2/scripts/build-file-index.mjs
node 3JSE_Harness_v0.2/scripts/verify-harness.mjs
```

Use actual repository paths if scripts live elsewhere in the current tree.

Do not hand-edit generated index files.

---

# 6. ENGINE PACKAGE STRATEGY

Do not promote research concepts into engine packages until the harness experiments pass.

## 6.1 First package: `@3jse/field`

This is the only package that should be considered early.

Responsibilities:

- field schema
- field chunks
- state channels
- response-card references
- semantic references
- uncertainty/provenance references
- sampling
- interpolation
- LOD
- serialization of engine-side field metadata
- deterministic state update utilities

It must NOT:

- own the renderer
- own Rapier
- own MPM
- own fire
- own snow
- own vegetation

It is infrastructure.

## 6.2 `@3jse/field-gaussian`

Only after dual-resolution experiment passes.

Responsibilities:

- map field samples/clusters to visual Gaussians
- state -> SH/opacity/emission/covariance projection
- live GPU update
- splat grouping/binding
- splat cluster LOD
- backend adapter

Possible backend interface:

```ts
interface GaussianBackend {
  load(asset: GaussianAsset): Promise<GaussianHandle>;
  bindField(handle: GaussianHandle, binding: FieldBinding): void;
  updateProjection(handle: GaussianHandle, delta: FieldProjectionDelta): void;
  dispose(handle: GaussianHandle): void;
}
```

Backends may include:

```text
three-native
brush
custom-webgpu-experiment
```

No gameplay code may know which backend is active.

## 6.3 `@3jse/field-physics`

Do not implement a giant physics engine.

Responsibilities:

- interface for continuum backends
- map field cells/groups to simulation elements
- map results back to field state
- active-region management
- worker/GPU step scheduling
- coupling to rigid physics when needed

Possible interfaces:

```ts
interface FieldPhysicsBackend {
  prepare(region: FieldRegion): void;
  step(dt: number, inputs: FieldForces): FieldPhysicsDelta;
  dispose(): void;
}
```

Initial backend can be deliberately simple.

A tiny explicit solver that proves the interface is more useful than prematurely porting a research MPM stack.

Rapier remains separate under `@3jse/physics`.

## 6.4 Later packages only after evidence

Potential:

```text
@3jse/field-material
@3jse/field-chemistry
@3jse/field-ecology
```

Do not create them until at least two unrelated vertical slices require the abstraction.

If snow and mud share 80% of the same response machinery, promote it.

If fire alone needs something, leave it in the experiment until another use justifies a package.

---

# 7. RESPONSE CARD DESIGN

The response card is the most novel part of the system and must remain compact.

## 7.1 Do not put the function on every Gaussian

Use:

```text
Gaussian/cluster
    ->
responsePaletteId
    ->
shared ResponseCard
```

Optionally:

```text
responsePaletteId
+
small local latent <= 32 floats
```

## 7.2 First response basis

Initial runtime constitutive expert basis:

```text
E0: elastic
E1: granular
E2: wet-cohesive
E3: fluid-like
```

Response card defines:

```text
W(state, environment) -> [w0,w1,w2,w3]
```

Then:

```text
mechanical response =
sum(wi * expert_i(state, deformation))
```

Keep the basis understandable and debuggable.

Avoid opaque runtime networks until the explicit basis proves insufficient.

## 7.3 Response-card channels

Start with only channels required by the first three demos.

### Mechanical
- friction response
- cohesion
- compressibility
- bearing strength
- drag/resistance
- constitutive mix

### Thermal
- heat capacity approximation
- conductivity approximation
- phase thresholds/curves

### Moisture
- water capacity
- absorption
- evaporation response
- liquid fraction response

### Visual projection
- albedo multiplier
- roughness/specular response
- transmission/scattering controls
- emission
- opacity
- covariance/spray propensity

### Optional combustion
Add only for the fire demo:
- ignition curve
- burn rate
- fuel value
- smoke yield
- char yield

Do not add acoustics/ecology until there is a game test for them.

---

# 8. WORLD FIELD DESIGN

## 8.1 Field is chunked

Use sector/chunk architecture compatible with large games.

Conceptually:

```text
WorldField
  Region
    Chunk
      Cells
```

Chunk metadata:

```ts
interface FieldChunk {
  id: string;
  bounds: AABB;
  resolution: [number, number, number];
  stateBuffer: FieldStateBuffer;
  responseIndexBuffer: Uint32Array;
  semanticIndexBuffer?: Uint32Array;
  version: number;
}
```

## 8.2 Sparse and active-region aware

A mountain should not run chemistry everywhere.

Support:

- inactive baked chunks
- low-rate ambient chunks
- active gameplay chunks
- high-rate continuum subregions

Example:

```text
distant mountain:
0 Hz dynamic field

nearby forest:
1-5 Hz moisture/thermal ecology

player trail:
10-20 Hz material response

active avalanche/fire/fluid:
20-60 Hz specialized solver
```

These numbers are provisional measurement targets, not promises.

## 8.3 Sampling

Required operations:

```ts
field.sample(position)
field.sampleGradient(position, channel)
field.sampleDirectional(position, direction, response)
field.query(region, predicate)
field.write(region, operation)
```

Sampling must be backend-independent.

## 8.4 Determinism and replay

Where possible:

- fixed-step state evolution
- seeded stochastic events
- recorded external inputs
- field deltas serializable
- causal replay possible without renderer

The renderer must not be necessary for field correctness.

---

# 9. GAUSSIAN PROJECTION

A visual Gaussian or cluster samples the field.

```text
Gaussian:
position/covariance/base appearance
        +
sample(WorldField)
        +
ResponseCard.evaluate(...)
        ->
updated visual attributes
```

Potential outputs:

- SH coefficient adjustment
- base color/albedo adjustment
- opacity
- emission
- covariance stretch/compression
- visibility
- particle/spray/foam emission yield
- wetness/gloss projection

The visual projection should be cheap enough to run on GPU.

Prefer:

- WebGPU compute
- TSL
- storage buffers
- texture/buffer indirection

Avoid:

- per-Gaussian JS loops
- per-frame object allocation
- giant CPU readbacks

---

# 10. MECHANICAL PROJECTION

Rapier does not need to understand every Gaussian.

A contact system asks the field:

```text
position
normal
relative velocity
contact pressure
```

Field evaluates:

```text
friction
rolling resistance
penetration/sink tendency
surface compliance
adhesion
```

Then the 3JSE physics adapter projects those values into the supported contact/material API.

For vehicles:

```text
TireResponse
    x
SurfaceResponse
    ->
contact result
```

This is how one dirt/snow field affects:

- bikes
- cars
- skis
- snowboards
- snowmobiles
- feet

without each sport inventing its own material table.

---

# 11. AGENT COMMAND SURFACE

PhysTalk is the pattern, not the backend.

Agents must operate on the field through bounded commands.

Do not expose raw GPU buffers or raw solver internals.

Potential Agent API tools:

```text
field.query
field.sample
field.describe
field.setState
field.addHeat
field.addMoisture
field.applyForce
field.paintResponse
field.inspectUncertainty
field.captureState
```

Prefer general state operations over outcome verbs.

Bad:

```text
field.makeMud()
field.freezeLake()
field.burnTree()
```

Better:

```text
field.addMoisture(region, ...)
field.addHeat(region, ...)
field.setBoundaryCondition(...)
```

A convenience `ignite` operation may exist if it means "apply a physically defined ignition stimulus" rather than "force the target into burning state."

## 11.1 Agent-generated game design

New design doctrine:

> Agents describe causes and constraints. The field determines consequences.

Examples:

Instead of:

```text
"At 14:00 make the trail muddy."
```

Author:

```text
"Rain for 40 minutes with shaded soil retention."
```

Instead of:

```text
"Trigger avalanche after jump 3."
```

Author:

```text
"Create an unstable loaded snow slab above the couloir, then allow player vibration/loading to matter."
```

Instead of:

```text
"Set forest on fire."
```

Author:

```text
"Dry the west-facing slope, establish strong downslope wind, and ignite one roadside fuel source."
```

This is a new game-design language for systemic worlds.

---

# 12. OFFLINE CAUSAL COMPILER

The expensive intelligence belongs in authoring/build time.

Proposed pipeline:

```text
photos / video / generated scene
        |
        v
Gaussian reconstruction
Brush / other approved source
        |
        v
semantic grouping
LangSplat/Gaussian Grouping-style
        |
        v
material inference
GaussianProperty/VLM-style
        |
        v
physical-property inference
VoMP / PhysGS-style
        |
        v
response fitting
3JSE ResponseCard palette
        |
        v
uncertainty + provenance
        |
        v
coarse WorldField generation
        |
        v
collision/nav projections
        |
        v
3JSE project asset
```

Runtime must not depend on:

- large VLMs
- video diffusion
- scene-specific optimization
- CUDA
- PyTorch
- training loops

Those are authoring providers.

---

# 13. SERIALIZATION

Do not invent `.xirtussplat`.

Target standard asset path:

```text
glTF
+
KHR_gaussian_splatting
+
3JSE field metadata
```

Draft internal extension only after experiments:

```text
EXT_3jse_causal_field
```

Possible structure:

```json
{
  "extensions": {
    "EXT_3jse_causal_field": {
      "fieldAsset": "field/chunk-manifest.bin",
      "responsePalette": "field/response-palette.json",
      "semanticDictionary": "field/semantic-dictionary.json",
      "bindings": [...]
    }
  }
}
```

Keep bulk field state in dedicated buffers/assets rather than duplicating it as per-splat glTF attributes.

Per-splat/cluster attributes should usually be indices:

```text
RESPONSE_INDEX
SEMANTIC_INDEX
FIELD_BINDING_INDEX
DYNAMIC_GROUP_INDEX
```

---

# 14. EXPERIMENT PROGRAM

Do not schedule by calendar first.

Execute in dependency order.

Every experiment ends with recorded evidence under `evidence/`.

Suggested tree:

```text
experiments/
  field-world/
    00-source-intake/
    01-field-schema/
    02-dual-resolution/
    03-live-splat-projection/
    04-causal-snow/
    05-causal-trail/
    06-emergent-fire/
    07-agent-field-ops/
    08-game-integration/
```

---

# 15. EXPERIMENT 00: SOURCE INTAKE AND QUARANTINE

Use Safe Repository Inspector.

For every candidate repo:

- inspect, do not execute
- verify literal license
- record commit
- inspect package/manifests
- inspect lifecycle scripts
- identify CUDA/Python/native requirements
- identify useful files
- write disposition
- write "one artifact to extract"

Output:

`docs/FIELD_SOURCES.md`

Required columns:

```text
Source
Commit
License
Runtime stack
Disposition
Artifact to extract
Why useful
Why not directly imported
```

Stop condition:

No source enters a provider registry until its disposition is explicit.

---

# 16. EXPERIMENT 01: FIELD SCHEMA

Build no real physics.

Create:

- `WorldSample`
- `ResponseCard`
- `ResponsePalette`
- `FieldChunk`
- field sampler
- synthetic 3D test field

Synthetic scene:

```text
cold dry region
warm wet region
transition band
```

Must support querying the same field headlessly.

Gate:

An agent can describe a wet trail and cold snow using state + response cards without creating `WetMudMaterial` or `PowderSnowMaterial` as the primary causal abstraction.

Evidence:

- schema tests
- sample dumps
- serialization round-trip
- field query test

---

# 17. EXPERIMENT 02: DUAL RESOLUTION

Goal:

prove the visible count and causal count are independent.

Initial target:

```text
5,000 field cells
200,000 visual Gaussian/dummy splat elements
```

One field cell drives many visual elements.

Change a small field region.

Only associated visual groups update.

Gate:

- field step does not iterate all visual Gaussians
- changing field resolution does not require rebuilding the visible scene
- changing visual density does not alter causal simulation result

Evidence:

- CPU/GPU timing
- memory
- mapping correctness
- deterministic state capture

---

# 18. EXPERIMENT 03: LIVE SPLAT PROJECTION

Use Three native GS, Brush, or a minimal approved backend.

Demonstrate live field-driven mutation:

- opacity
- color/SH multiplier
- covariance
- emission if available

Do not retrain.

Build:

```text
field state
  ->
projection buffer
  ->
Gaussian GPU update
```

Gate:

A temperature/moisture change alters visible Gaussian appearance without replacing the splat asset.

Evidence:

- before/after capture
- no CPU per-splat loop
- measured update cost

---

# 19. EXPERIMENT 04: CAUSAL SNOW

This is the first decisive proof.

## 19.1 State

Start with:

```text
temperature
liquidFraction
density
compression
```

Optional:

```text
grainState
```

only if evidence proves necessary.

## 19.2 Response outputs

Visual:

- brightness/scattering proxy
- sparkle/specular proxy
- translucency/transmission proxy
- clumping/covariance response

Mechanical:

- ski friction
- penetration
- cohesion
- compression resistance

FX:

- powder plume yield
- chunk/spray tendency
- track depth

Optional:

- sound parameter

## 19.3 Required continuous sequence

The same response card must move through:

```text
cold dry powder
    ->
packed powder
    ->
warm wet snow
    ->
slush
    ->
refrozen crust
```

No material prefab swap.

## 19.4 Gate

One state sweep drives at least:

1. visible change
2. mechanical friction/penetration change
3. displaced-snow FX yield change

If these require three unrelated scripts, architecture failed.

---

# 20. EXPERIMENT 05: CAUSAL TRAIL / MUD

This proves snow was not a special-case trick.

State:

```text
moisture
temperature
compaction
soil density
```

One rainfall operation should result in:

- darker/glossier soil projection
- dust yield reduction
- splash yield increase
- lower bearing strength
- tire sink/rut increase
- friction change

Sun/wind then dry exposed zones.

Shaded areas remain wet longer.

Gate:

Same `@3jse/field` and response-card infrastructure handles both snow and soil.

No `WetDirtMaterial` authority.

---

# 21. EXPERIMENT 06: EMERGENT FOREST FIRE

Use FieryGS as the architecture checklist.

Do not create Fire AI.

Field channels:

```text
temperature
moisture
fuel
smoke
carbonization
wind input
```

Local rules:

```text
heatGain =
  radiation
  + convection
  + solar

heatLoss =
  evaporation
  + air cooling
  + conduction

if physical ignition conditions are met:
  fuel decreases
  temperature increases
  smoke increases
  carbonization increases
```

Wind transports:

- heat
- smoke
- embers

Visual projection drives:

- emission
- opacity
- smoke vendor/VFX input
- surface darkening/carbonization

Critical acceptance criterion:

A spot fire can begin downwind with NO call equivalent to:

```text
SetTreeOnFire(target)
```

The cause must be:

```text
ember deposition
+
local state
+
response evaluation
```

Evidence:

- timelapse
- field-state dump
- deterministic/seeded replay
- source cell lineage for ignition if possible

---

# 22. EXPERIMENT 07: AGENT FIELD OPS

Add harness/Agent API prototype operations.

Agent request:

> Make the west side of the mountain dangerously dry after a week of hot weather, then start a small campfire and show what happens.

Agent must:

1. query field/semantics
2. identify target region
3. apply climate/state operations
4. place/trigger a physically defined heat source
5. run
6. inspect field state
7. capture evidence
8. report emergent result

It must NOT:

- manually select every tree
- manually create smoke entities
- manually swap materials
- write a scripted fire-propagation event chain

This is the PhysTalk lesson promoted into harness doctrine.

---

# 23. EXPERIMENT 08: GAME INTEGRATION

Integrate the successful field system into one real game slice.

Preferred:

`Xirtus Mountain`

Do not modify the entire mountain.

Create one controlled sector.

The sector contains:

- snow zone
- wet/dry trail
- forest edge
- vehicle/bike/ski contact
- weather input

The field is shared by:

- renderer
- Rapier contact sampling
- particle/VFX projection
- agent query
- debug view

Gate:

One causal update affects multiple existing game systems.

---

# 24. XIRTUS MOUNTAIN WINTER INTEGRATION

After the snow experiment passes, expand carefully.

Possible uses:

## Snowpack
- dry powder
- wind slab
- packed piste
- wet snow
- slush
- crust
- ice

Represent them as state-space regions, not independent material systems.

## Tracks
Skis/boards/snowmobiles modify:

- compression
- density
- surface roughness
- local temperature slightly if justified

Those changes alter future contact.

## Avalanche
Field inputs:

- slope
- layer response
- density
- cohesion
- temperature
- moisture
- accumulated loading

Do not immediately build a research-grade avalanche solver. Start with a field-stability model and promote only when evidence demands more.

## Ice
Phase response can produce:

- friction
- transmission
- surface hardness
- crack propensity
- melt state

## Weather
Snowfall writes mass/state into field.

Sun/wind modify temperature/moisture.

The mountain surface is no longer a seasonal texture swap.

---

# 25. XIRTUS MOUNTAIN SUMMER INTEGRATION

This is equally important.

## Dirt/mud
Rain, shade, sun, traffic, and compaction create a changing trail.

## Vehicles
Tire response x field response produces contact behavior.

## MTB
Ground response affects:

- tire grip
- rolling resistance
- rutting
- splash/dust
- braking

## Forest
Field supports:

- moisture
- biomass/fuel
- wind exposure
- fire
- potentially growth/damage later

## Rock
Later response cards may encode:

- wet grip
- brittleness
- erosion
- thermal response

## Water
Poseidon/Tiamat remain water providers/solvers.

Field can provide:

- temperature
- sediment
- saturation
- foam tendency
- wetness deposition

Do not duplicate water simulation in the field merely because water is a response state.

---

# 26. GAME-DESIGN INTEGRATION

Add a field-aware design vocabulary to the harness.

Game designers/agents should think in:

```text
sources
sinks
state
transport
response
constraints
thresholds
feedback
```

rather than only:

```text
triggers
prefab swaps
particles
scripted events
```

## 26.1 Design recipe

For any systemic material/weather/ecology mechanic, require:

### Cause
What changes the state?

### Transport
How does that state move?

### Response
How does matter react?

### Projection
How does the player see/feel/hear the result?

### Feedback
How does the result alter future state?

### Evidence
How do we verify it emerged rather than being faked?

Example forest fire:

```text
Cause:
heat source

Transport:
radiation + convection + embers

Response:
moisture loss + ignition curve + burn response

Projection:
flame emission + smoke + char

Feedback:
fuel loss + heat generation
```

---

# 27. DEBUGGING AND EDITOR WITNESS

The field needs a witness/debug view.

Do not require full editor tooling immediately.

Harness prototype can render overlays for:

- temperature
- moisture
- response palette ID
- constitutive expert weights
- fuel
- density
- friction
- uncertainty
- active solver region
- field chunk LOD

Agent/headless API should be able to dump the same channels numerically.

The visual heatmap is not authoritative.

The serialized field state is authoritative evidence.

---

# 28. QA GATES

Add field-specific QA.

## 28.1 Cross-projection invariant

One state update must drive multiple outputs from the same source.

Example:

```text
moisture increases
```

Expected:

- appearance responds
- friction responds
- dust/splash responds

If any system has its own hidden wetness variable, fail.

## 28.2 No scripted-outcome gate

Search for forbidden patterns in experiment code:

```text
SetTreeOnFire
UseWetMaterial
UseSlushMaterial
TriggerAvalancheEvent
```

Names are illustrative. The gate should detect architecture, not literal strings only.

## 28.3 Dual-resolution gate

Field step complexity must scale with field cells/active solver cells, not render Gaussian count.

## 28.4 Headless gate

Causal tests run without renderer.

## 28.5 Visual gate

Fresh-eyes capture confirms the projection is convincing.

## 28.6 Performance gate

Measure:

- field step CPU/GPU time
- projection update time
- splat render time
- memory per field cell
- memory per response card
- active solver element count
- streaming behavior

No "should be fast."

---

# 29. PROVISIONAL PERFORMANCE BUDGETS

These are starting hypotheses to test, not promises.

Prototype:

```text
field cells:          5k
visual splats:        200k+
field tick:           10-20 Hz
render:               normal display refresh
response latent:      <= 32 floats
constitutive experts: 4
```

Sector-scale target to investigate:

```text
field cells active:   10k-200k
visual splats:        millions, streamed
specialized solver:   1k-50k active elements
ambient field tick:   1-5 Hz
interactive field:    10-30 Hz
```

Use GASP/VR-GS-style mappings or equivalent to keep these domains independent.

---

# 30. MEMORY DISCIPLINE

Do not store:

```text
32-float semantic vector
+
32-float response vector
+
full physical state
```

on every rendered Gaussian if 10M Gaussians share clusters.

Prefer:

```text
Gaussian:
  visual native data
  clusterId

Cluster:
  fieldBindingId
  semanticId
  responseId
```

Field cells hold dynamic state.

Shared palettes hold response data.

Dictionaries hold semantic embeddings.

This is the "three papers, one law" lesson:

> Store an index into a compact basis whenever possible.

---

# 31. NETWORKING

Do not replicate splats.

Replicate authoritative causal state at appropriate granularity.

Potential network model:

```text
sector/chunk ID
state deltas
event/input deltas
seed/time
active simulation snapshot when necessary
```

Clients derive:

- visual splat projection
- local VFX
- some contact projection

Server authority depends on gameplay importance.

For competitive physics, server should own critical state.

For purely visual ecology, looser replication may be sufficient.

Do not design this fully until the single-player field model passes.

---

# 32. SAVE / REPLAY

Save:

- field chunk state deltas from baked baseline
- response-card version
- seeds
- external causal inputs
- simulation timestamp

Do not save every visual Gaussian mutation if it can be regenerated from causal state.

Replay should be able to reconstruct:

```text
state -> projection
```

---

# 33. SOURCE PROVENANCE AND LICENSING

Every integration must follow existing 3JSE vendor doctrine.

For each source:

- pin commit
- verify literal license
- record attribution
- distinguish idea/pattern from copied code
- avoid hidden CUDA/native runtime dependency in web path
- quarantine unverified binaries/install scripts
- do not copy code from unlicensed repos

A research paper with code can still be:

```text
reference only
```

if architecture or dependencies make direct integration inappropriate.

---

# 34. COMMIT PLAN FOR THE AGENT

Work on a branch.

Do not commit a giant undifferentiated change.

Suggested sequence:

## Commit 1
`docs: add causal field and gaussian integration research plan`

Add:

- this plan under `docs/`
- `docs/FIELD_SOURCES.md` initial ledger
- no engine code

## Commit 2
`harness: register field and splat capabilities`

Modify:

- capabilities registry
- provider/reference registry after source verification
- registry tests if needed

Run harness verification.

## Commit 3
`harness: add world-field and splat integration skills`

Add:

- `world-field`
- `splat-integration`
- `causal-authoring`
- `field-qa`

Sync Claude mirrors.

Update harness docs/file index.

## Commit 4
`harness: add causal field recipes and evidence gates`

Add:

- causal-snow recipe
- causal-trail recipe
- emergent-fire recipe
- field-specific QA template/gates

## Commit 5
`experiment: add field schema and headless sampler`

Build experiment 01.

No renderer dependency.

## Commit 6
`experiment: prove dual-resolution field projection`

Build experiment 02.

Record evidence.

## Commit 7
`experiment: drive live gaussian projection from field state`

Build experiment 03.

## Commit 8
`experiment: causal snow response card`

Build experiment 04.

Do not proceed if the acceptance gates fail.

## Commit 9
`experiment: generalize response field to wet trail`

Build experiment 05.

## Commit 10
`experiment: add emergent combustion field slice`

Build experiment 06.

## Commit 11
`agent: expose bounded field operations`

Build experiment 07.

## Commit 12
`game: integrate causal field vertical slice into Xirtus Mountain`

Only after prior gates pass.

Package promotion to `@3jse/field` should occur when the experiment code has stabilized enough that the interface is evidenced, not guessed.

---

# 35. DO NOT DO THESE THINGS

1. Do not build a new Gaussian renderer as the center of the project.
2. Do not replace Three.js.
3. Do not replace Rapier.
4. Do not port Warp/Taichi/PyTorch into the browser runtime.
5. Do not equate one Gaussian with one simulation particle.
6. Do not put huge language/material vectors on every splat.
7. Do not invent a private splat file format.
8. Do not create fifteen new engine packages before the experiments.
9. Do not let semantic inference become runtime-required.
10. Do not let a VLM decide authoritative physics every frame.
11. Do not disguise scripted material swaps as emergence.
12. Do not make the renderer authoritative.
13. Do not create a fire-only architecture.
14. Do not claim microscopic snowflake simulation if the system is a homogenized response model.
15. Do not copy research code without license/provenance review.

---

# 36. DEFINITION OF SUCCESS

The architecture is proven when all of the following are true.

## Harness success

- Field/splat capabilities route correctly.
- Relevant research is represented as providers/references without bloating always-loaded context.
- New skills are canonical under `.agents/` and mirrored correctly.
- Harness verification passes.
- Source/license ledger is complete enough for an agent to know what may be reused.

## Schema success

- State is clearly separated from response coefficients.
- Response data is palette/index based.
- Field resolution is independent of visual Gaussian count.
- Headless field sampling works.

## Snow success

One continuous response model transitions through cold powder -> wet snow -> slush/refrozen crust and drives:

- appearance
- contact mechanics
- displaced-snow FX

without authoritative material swapping.

## Trail success

The same architecture handles soil moisture and causes:

- appearance change
- tire/contact change
- dust/splash change
- rut/bearing-strength change

## Fire success

A downwind spot fire emerges from:

- heat
- fuel
- moisture
- wind
- ember transport

without selecting and scripting the target tree.

## Agent success

An agent can:

- query causal state
- alter causes
- run the world
- inspect resulting state
- verify emergence

without directly scripting visual outcomes.

## Game success

One real Xirtus Mountain sector uses the field as the shared source for:

- splat/visual projection
- Rapier contact behavior
- vendor FX
- game/system logic
- agent inspection

---

# 37. LONG-TERM TARGET

The eventual 3JSE world pipeline becomes:

```text
CAPTURED OR GENERATED REALITY
            |
            v
      Causal Compiler
            |
    +-------+-------+
    |       |       |
semantic material geometry
    |       |       |
    +-------+-------+
            |
            v
     Response Palette
            +
       World Field
            |
    +-------+-------+----------------+
    |               |                |
    v               v                v
Gaussians       Rapier/MPM        Agents
appearance      mechanics         semantics
    |               |                |
    +-------+-------+----------------+
            |
            v
        GAME WORLD
```

This should let 3JSE games increasingly author **causes instead of outcomes**.

Examples:

- weather creates mud instead of toggling a mud material
- sun creates melt instead of swapping snow skins
- loading creates avalanche risk instead of firing an avalanche event
- embers create spot fires instead of scripted burn chains
- tire pressure and ground state determine ruts instead of spawning a rut decal
- wetness changes visuals, mechanics, particles, and sound from one state source
- agents reason over the same semantic/causal world that players experience visually

Gaussian splatting is what makes the visible projection extraordinarily rich.

The deeper 3JSE feature is the response-function field underneath it.

---

# 38. AGENT EXECUTION INSTRUCTION

You are implementing this plan inside the current `xirtus/3JSE` repository.

Follow the existing 3JSE Harness operating mode:

**UNDERSTAND -> RESOLVE -> ASSEMBLE -> BUILD -> PLAYTEST -> REPAIR -> VERIFY**

Before modifying anything:

1. Read `CLAUDE.md`.
2. Read `docs/HARNESS.md`.
3. Read `docs/PLUGIN_ARCHITECTURE.md`.
4. Read `docs/PHYSICS.md`.
5. Read `docs/AI_AGENT_API.md`.
6. Read `docs/VENDOR_INTEGRATIONS.md`.
7. Inspect the current harness registries and skills.
8. Inspect each research source safely and record its license/disposition before importing anything.
9. Search the repo for any existing splat/field work before adding new abstractions.

Then execute the commit sequence in this document.

Do not skip failed gates. If an experiment falsifies an architectural assumption, write the finding into the project learning/evidence system and revise the architecture rather than forcing the original plan through.

The most important invariant is:

> **The causal field is authoritative; Gaussians, rigid-body contact, VFX, audio, navigation, and agent semantics are projections of it at the resolution appropriate to each subsystem.**
