# Splat Integration

Use when routing Gaussian-splat rendering, dynamic projection, LOD/streaming, serialization, or collision-proxy work.

## Routing

- Three.js `WebGPURenderer`/TSL stays the renderer. Prefer Three-native Gaussian support when it satisfies the use case; keep a 3JSE splat adapter interface so Three-native / Brush / custom-WebGPU backends are interchangeable without touching gameplay code. No fork of Three, no second scene graph.
- Backend interface shape: `load(asset) → handle`, `bindField(handle, binding)`, `updateProjection(handle, delta)`, `dispose(handle)`. Gameplay code never knows which backend is active.

## Dynamic projection

- A visual Gaussian/cluster samples the field, evaluates its `ResponseCard`, and updates visual attributes (SH, albedo, opacity, emission, covariance, visibility, spray/foam yield, wetness/gloss). No retraining at runtime.
- Cheap enough to run on GPU: WebGPU compute, TSL, storage buffers, buffer/texture indirection. Avoid per-Gaussian JS loops, per-frame allocation, giant CPU readbacks.

## LOD / streaming / serialization

- Cluster hierarchy, screen-space error, tile/sector streaming (NanoGaussian/LightGaussian/gsplat/SuperSplat patterns).
- Serialize on `KHR_gaussian_splatting` + `EXT_3jse_causal_field`; per-splat/cluster attributes are indices (`RESPONSE_INDEX`, `SEMANTIC_INDEX`, `FIELD_BINDING_INDEX`, `DYNAMIC_GROUP_INDEX`), not duplicated bulk data. No private splat container.

## Collision proxy posture

- Collision/nav meshes are **derived projections**, not the authoritative world description (`proxy != authority`). GOF/2DGS/splat-to-geometry patterns produce TSDF/mesh/SDF proxies.
