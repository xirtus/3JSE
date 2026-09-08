# Field & Gaussian Source Ledger

Handoff ledger for the Gaussian-splat + causal-field integration
(`docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md`, Experiment 00). Every source here is
**inspection-only** until its disposition and literal license are verified
through the Safe Repository Inspector (`3JSE_Harness_v0.2/.agents/skills/safe-repo-inspector/SKILL.md`)
and recorded in `packages/vendor/src/registry.json`. None of these sources is
imported or vendored yet; none is copied into the engine. Dispositions below
encode *what we intend to extract* (patterns, equations, data-shapes), never a
promise to copy code.

**Disposition vocabulary** (from the plan §4):
`provider` · `provider_reference` · `reference_implementation` · `pattern_port` ·
`authoring_only` · `watch` · `reject`.

**Standing rule:** until a source is proven suitable for direct integration, the
default disposition is `reference_implementation` or `pattern_port`. `license`
fields marked `unverified` mean the literal LICENSE text has not yet been read by
a human/curator in this tree; treat the source as all-rights-reserved for any
copy decision regardless of what a platform API field claims (the `tiamat` BOM
lesson, `docs/VENDOR_INTEGRATIONS.md`).

| Source | Commit | License | Runtime stack | Disposition | Artifact to extract | Why useful | Why not directly imported |
|---|---|---|---|---|---|---|---|
| FieryGS (`PKU-VCL-Geometry/FieryGS`) | unverified | unverified | CUDA/PyTorch, offline+online | `pattern_port` | combustion grid channels · neighbor heat transport · field paint → splat projection of emission/opacity/carbonization · authoring-vs-runtime split | The canonical "coarse causal grid ≠ splat resolution" architecture; the generic `WorldField` loop is FieryGS's loop generalized | CUDA/PyTorch fire-only architecture; would make combustion own all field data |
| PhysTalk (`nv-tlabs/PhysTalk`) | unverified | unverified | Genesis/Python, agent prompt→physics | `pattern_port` | constrained prompt → executable operation surface · proxy-sim → visual-skin mapping · intent/render separation | The agent command-surface shape (`query/sample/setState/addHeat/…`) promoted into harness doctrine | Genesis rigid-body backend; raw generated code reaching sim internals |
| OmniPhysGS | unverified | unverified | CUDA/PyTorch, video-diffusion trainer | `pattern_port` | small constitutive expert basis (elastic/granular/cohesive/fluid-like) · per-point mixture weights · what the stepper actually needs | The expert-mixture representation of material behavior (basis + weights) | 12 neural experts + video-diffusion trainer as runtime deps; frozen weights ≠ live response manifold |
| PIDG | unverified | unverified | CUDA, per-sequence optimization | `pattern_port` | Lagrangian formulation · Cauchy momentum residual · evolving constitutive scalars · static-vs-dynamic feature split | Evolving constitutive quantities over time — but dynamic state belongs to *field cells*, not Gaussians | one-Gaussian = one-material-point coupling; per-sequence optical-flow training in the web client |
| GASP | unverified | unverified | CUDA/GPU | `pattern_port` | large-Gaussian-set → small-sim-representative mapping · transform propagation · grouping structures · stability lessons | The hierarchy that decouples sim resolution from render resolution — one of the most important implementation references | research renderer; not a Three.js/WebGPU runtime |
| PhysGaussian / warp-mpm / gs-mpm | unverified | unverified | CUDA/Warp/Taichi/Python | `pattern_port` | deformation-gradient → covariance update · interior particle fill · material-card inputs · MPM data layout | The "what-you-see-is-what-you-simulate" reference bench for the projection math | Warp/Taichi/Python runtime; simulating at visual Gaussian count |
| VoMP | unverified | unverified | PyTorch, authoring-time | `authoring_only` | inferred mechanical-property distribution · MatVAE/latent compression · uncertainty | Offline Causal Compiler source for hidden-property inference | never a required runtime dependency |
| PhysGS | unverified | unverified | PyTorch, authoring-time | `authoring_only` | per-Gaussian friction/hardness/density/stiffness/mass estimation · aleatoric vs epistemic uncertainty · aggregation to low-res field cells | First-class authoring uncertainty | authoring-time inference, not runtime |
| GaussianProperty | unverified | unverified | PyTorch, authoring-time (SAM/VLM) | `authoring_only` | SAM/VLM material reasoning · 2D material cards · voting/painting onto Gaussian clusters | Cheap zero-shot first-pass field painter | runtime must not require a VLM |
| Feature Splatting / Feature 3DGS | unverified | unverified | CUDA/PyTorch | `pattern_port` | compact extra-channel packing · dimensionality/compression tradeoffs · per-splat feature association | Justifies the ≤32-coefficient response latent rule | foundation-model embeddings as physics representation |
| LangSplat / LangSplat V2 / Gaussian Grouping | unverified | unverified | CUDA/PyTorch | `pattern_port` | global dictionary/index approaches · compressed language-field lookup · cluster/object grouping | Semantic dictionary + object identity; per-splat *indices* not embeddings | CLIP embeddings as the physics representation |
| Brush (`arthurbrussee/brush`) | unverified | unverified | Rust → WebGPU/WASM | `watch` / `provider_reference` | browser/WebGPU training path · GPU buffer access · live data ownership · file/format bridge | Preferred experiment backend: Brush GPU buffers → 3JSE adapter → Three/WebGPU scene, no PLY CPU round-trip | backend only; adapt via the 3JSE splat adapter interface, never a second scene graph |
| Gaussian Splat Playground / dynamic-GS demos | unverified | unverified | JS/WebGPU demo | `pattern_port` | position/covariance/opacity/color live mutation · GPU data update patterns | First dynamic-projection experiments | demo shell, not a library |
| KHR_gaussian_splatting | — | Khronos spec (spec license) | glTF extension | `provider_reference` | serialization base: splats in a standard glTF-derived path | Serialization base; `KHR_gaussian_splatting` + `EXT_3jse_causal_field`, no private container | extension registration deferred until the data model is evidenced |
| GOF / 2DGS / splat-to-geometry | unverified | unverified | CUDA/PyTorch | `pattern_port` | TSDF/mesh/SDF proxy generation · collision-ready simplification · walkability/nav generation | Mechanical/nav projection (`proxy != authority`) | proxies are derived, never the authoritative world description |
| MatSpray / GI-GS / 3DGRUT | unverified | unverified | CUDA/PyTorch | `pattern_port` | PBR property recovery · relighting · optical decomposition · secondary-ray strategies | Optical projection improvements | projection improvements, not field architecture |
| NanoGaussian / LightGaussian / gsplat / SuperSplat | unverified | unverified | CUDA/WASM/tooling | `pattern_port` | cluster hierarchy · screen-space error · tile/sector streaming · render budgets · compaction · top-contributor queries | Scale/compression/LOD/streaming for Xirtus-Mountain scale | affect render scale, not the causal model |

## Disposition summary

- **`pattern_port`** (11): FieryGS, PhysTalk, OmniPhysGS, PIDG, GASP, PhysGaussian,
  Feature Splatting, LangSplat, Gaussian Splat Playground, GOF/2DGS, MatSpray/GI-GS/3DGRUT,
  NanoGaussian/LightGaussian/gsplat/SuperSplat. Extract *patterns and equations*; no code crosses over.
- **`authoring_only`** (3): VoMP, PhysGS, GaussianProperty. Offline Causal Compiler providers; never runtime deps.
- **`provider_reference`** (2): Brush, KHR_gaussian_splatting. The two candidates that may later become `provider` once license + backend fit are verified.
- **`watch`** (Brush): held at watch until a WebGPU/WASM runtime path is confirmed for the web client.

## What enters the provider registry, and when

Nothing from this ledger enters `3JSE_Harness_v0.2/.agents/registry/providers.json`
or `packages/vendor/src/registry.json` until a curator/agent has pinned a commit
and read the literal LICENSE (human-verified), per `docs/VENDOR_INTEGRATIONS.md`.
The plan §5.2 candidate list is recorded below for tracking; `—` = not yet audited.

```text
fierygs · phystalk · omniphysgs · pidg · gasp · physgaussian · vomp · physgs ·
gaussian-property · feature-splatting · langsplat · gaussian-grouping · brush ·
gaussian-splat-playground · khr-gaussian-splatting · gaussian-opacity-fields ·
2dgs · 3dgrut · matspray · nanogaussian · lightgaussian · gsplat · supersplat
```

## Stop condition (Experiment 00)

No source enters a provider registry until its disposition is explicit and its
license is verified. This ledger is the pre-registry record; it deliberately
keeps every `Commit`/`License` as `unverified` until the Safe Repository Inspector
pass actually runs against each repo.
