# Physics

## Engine choice: wrap, don't build

Physics simulation is exactly the kind of subsystem `ARCHITECTURE.md`'s "build ourselves / wrap / adopt / plugin interface" framework (`PLUGIN_ARCHITECTURE.md`) says not to build from scratch — it's a solved, hard problem with mature WASM-compiled options available to the web platform today. 3JSE ships **Rapier** (Rust, compiled to WASM) as the default physics backend via `@3jse/physics-rapier`, with **Jolt** (also WASM-compiled) supported as a swappable alternative via `@3jse/physics-jolt` for projects that need its specific character-controller or large-scene performance characteristics. Both implement the same `@3jse/physics` interface, so swapping backends is a package swap, not a rewrite of gameplay code.

## Integration with the Entity/Component model

Physics bodies are Components (`RigidBody`, `Collider`, `Joint`) exactly like anything else in `ENTITY_COMPONENT_MODEL.md` — inspectable, serializable, replicable. The physics step runs as a fixed-step System (`RUNTIME.md`'s tick loop, stage 2); after stepping, a sync System writes resulting transforms back to each Entity's `Object3D`, so downstream render/animation/camera systems always see current-frame physics results without needing physics-engine-specific knowledge.

## Collision editing

The Physics/Collision Editor panel (`EDITOR.md`) provides gizmos for box/sphere/capsule/convex-hull colliders, snapping to mesh bounds, and the asset pipeline's collider suggestions (`ASSET_PIPELINE.md`) as a starting point rather than a mandatory default. Compound colliders (multiple shapes on one Entity) and physics constraints/joints (hinge, slider, fixed, spring) are authored the same way — gizmo-first, with exact numeric entry in the Inspector.

## Threading

Rapier and Jolt both support running their simulation step off the main thread via a Web Worker, communicating body-transform deltas back through a `SharedArrayBuffer` where cross-origin isolation allows it (falling back to structured-clone message passing otherwise). 3JSE's default configuration runs physics on a worker whenever the deployment target permits, keeping the main thread free for rendering and input — see `PERFORMANCE.md` for the isolation-header requirements this depends on and the graceful degradation path when they're unavailable.

## What 3JSE adds beyond the wrapped engine

- **Query API** (`raycast`, `overlap`, `sweep`) exposed uniformly to both TypeScript and 3JSE Graph nodes, backend-agnostic.
- **Collision/trigger events** surfaced as 3IR events (`GAMEPLAY_IR.md`) — `OnCollisionEnter`, `OnTriggerEnter` — so gameplay logic never touches the underlying WASM API directly.
- **Networking-friendly state**: `RigidBody` transform/velocity are Component fields, which is what makes them replicable by the same mechanism as any other Component state (`NETWORKING.md`), rather than needing a physics-specific network sync layer.
- **Determinism posture**: per-machine deterministic given identical build/inputs (`RUNTIME.md`), which is what save/replay and single-machine time-travel debugging rely on — explicitly not claimed as cross-platform bit-exact, since neither Rapier nor Jolt guarantee that across differing hardware.
