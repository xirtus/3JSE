# Performance

## Posture

Performance work in 3JSE is not a late optimization pass — it's a set of architectural decisions made early enough that most projects never have to fight the engine to hit a reasonable budget, plus honest, visible instrumentation (the Profiler panel, `EDITOR.md`) for the projects that need to go further. This document lists the specific mechanisms, not just the aspiration.

## WebGPU and the WebGL2 fallback

Three.js's `WebGPURenderer` is the primary target; WebGL2 is the automatic fallback for browsers/devices without WebGPU support, using the same TSL-authored materials on both backends (`RENDERING.md`). This is a permanent second render path to keep correct, not a temporary bridge — device/driver WebGPU support (particularly mobile Safari at the time of this writing) is uneven enough that treating WebGL2 as disposable would cut off a real share of the target audience.

## Workers and threading

- **Physics** runs on a dedicated worker where cross-origin isolation headers permit `SharedArrayBuffer` (`PHYSICS.md`); falls back to structured-clone message passing (higher latency, still off the main thread) where they don't.
- **Asset decoding/transcoding** (KTX2/Basis, mesh decompression) runs on workers via the loaders' existing worker-pool support.
- **3IR's WASM emitter** (`GAMEPLAY_IR.md`) is the defined escape hatch for gameplay logic that profiles as genuinely hot (large-scale crowd/particle simulation) — deliberately not the default backend, because most gameplay logic's bottleneck is elsewhere (draw calls, physics, GC pressure), and defaulting to WASM compilation would trade iteration speed for a performance win most projects don't need.

## Rendering-side techniques

| Technique | Mechanism |
|---|---|
| Spatial partitioning | BVH-backed frustum/occlusion culling over the Level's Entities, rebuilt incrementally as Transforms change |
| Instancing | Automatic `InstancedMesh` promotion for repeated Prefab instances above a configurable count threshold (foliage, crowd, projectile-heavy scenes) |
| Batching | Static-geometry merging for non-moving Entities sharing a Material, applied at build time (`BUILD_DEPLOYMENT.md`), not at runtime cost |
| LOD | Asset-pipeline-generated tiers (`ASSET_PIPELINE.md`) selected by screen-space size, blended/cross-faded to avoid popping |
| Occlusion culling | Software occlusion (hierarchical depth buffer from the previous frame) as a portable baseline, with a defined extension point for platform-specific hardware occlusion queries where available |
| Texture compression | KTX2/Basis universal, transcoded per-target format at build time (`ASSET_PIPELINE.md`, `BUILD_DEPLOYMENT.md`) |
| Streaming | Distance/sector-based sublevel and asset streaming (`WORLD_SYSTEM.md`), with a priority queue keyed to camera frustum and movement direction |
| GPU compute | TSL compute nodes (`RENDERING.md`) for particle simulation and GPU-driven foliage placement, opt-in per project |

## Quality tiers

A small number of named tiers (e.g. `Low` / `Medium` / `High` / `Ultra`), each a coordinated bundle of settings rather than independent sliders a developer has to reason about in combination: shadow map resolution and cascade count, post-processing effect set, particle density multiplier, LOD bias, instancing threshold, and physics substep count all move together per tier. Projects can override individual settings per tier, but the default experience is "pick a tier," not "tune forty knobs" — and the Mobile/Low-power template default (`TEMPLATES.md`) starts at a conservative tier rather than requiring a developer to discover the need for one after shipping.

## Memory budgets

The Profiler surfaces GPU memory (texture/mesh VRAM estimate), JS heap, and asset-cache size as first-class panels, with per-quality-tier target budgets documented per platform class (a `Low`-tier mobile target and an `Ultra`-tier desktop target have deliberately different budget ceilings, set and revisited as real project data comes in during `ROADMAP.md`'s later phases rather than fixed speculatively here).

## GPU frame capture

The Profiler's draw-call view is backed by a Spector.js-style capture: a single frame's full GPU command sequence (draw calls, state changes, bound textures/buffers, shader source per pass) captured on demand from the live Viewport, not a separate standalone tool a developer has to leave the editor to use. This is adopted as an integration pattern, not a code dependency — whether it's Spector.js itself or a WebGPU-native capture mechanism built against Three.js's own render-graph instrumentation is an implementation choice at build time, not a design commitment made here. What matters architecturally is that "what did the GPU actually do this frame" is one click from the Viewport a developer (or an agent, via `runtime.captureFrame`/`runtime.getPerf` in `AI_AGENT_API.md`) is already looking at, the same "debug tooling lives where the problem is, not in a separate app" posture Babylon's Inspector debug layer models for the editor as a whole (picking, live property readout, and draw-call stats overlaid directly on the running scene rather than in a disconnected panel).

## Shader compilation

TSL's node-graph materials compile to WGSL/GLSL ahead-of-time at build (`RENDERING.md`, `BUILD_DEPLOYMENT.md`) wherever the material's inputs are static; runtime shader variant compilation (from dynamic material parameter combinations) is minimized by the Material Graph editor warning when a graph structure implies runtime branching that will produce shader-compile stalls — surfaced as a build-time lint, not discovered as a hitch during play.

## Large worlds

World Partition-style streaming (`WORLD_SYSTEM.md`) plus asset streaming together are what let a large open-world project stay within a bounded per-frame and per-memory budget regardless of total world size — the budget is a function of streaming radius and quality tier, not total authored content, which is the property that makes "large worlds" and "runs on a mid-range laptop" compatible goals rather than a tradeoff a developer has to negotiate manually per project.
