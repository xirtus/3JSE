# 3JSE Runtime

`@3jse/runtime` is the only package a shipped game strictly depends on besides `three`. It owns the tick loop, the World/Level/Entity/Component model (fully specified in `ENTITY_COMPONENT_MODEL.md`), and the boundary where 3JSE's abstractions hand off to raw Three.js.

## Relationship to Three.js

3JSE does not replace any Three.js concept that already works:

| Stays exactly Three.js | 3JSE adds around it |
|---|---|
| `Object3D` hierarchy, transforms | Entity/Component data attached via a side-table keyed by Object3D |
| `WebGPURenderer` / `WebGLRenderer` fallback | A render-graph/pass ordering layer, quality tiers |
| `Camera`, `Light`, `Material`, `Mesh` | Component wrappers that make these inspectable/serializable |
| TSL node materials | 3JSE's material graph compiles *into* TSL, not around it |
| `AnimationMixer`, `AnimationClip` | Blend trees and state machines layered on top (`ANIMATION.md`) |
| Loaders (`GLTFLoader`, `KTX2Loader`, …) | The asset pipeline wraps them with analysis and caching |

A project can always drop one level down: get the raw `Object3D` for any entity and hand-write Three.js against it. Nothing in 3JSE requires going through its own API exclusively — this is the release valve that keeps 3JSE from becoming a second thing to fight when Three.js already does something well.

## The tick loop

```
requestAnimationFrame / fixed-step accumulator
        │
        ▼
 1. Input sampling           (@3jse/runtime input resource)
 2. Fixed-step systems       (physics, gameplay logic — deterministic order)
 3. Variable-step systems    (camera, animation blending, particles)
 4. 3JSE Graph tick          (compiled Behavior functions, event dispatch)
 5. Render systems           (culling, LOD select, render-graph submit)
 6. Late/post systems        (UI layout, audio listener update)
```

Systems declare which stage(s) they run in and which component archetypes they read/write; the scheduler topologically sorts by declared data dependencies and parallelizes across Web Workers where dependencies allow (see `PERFORMANCE.md`). Fixed-step logic runs on an accumulator decoupled from display refresh rate so gameplay and physics stay deterministic-per-machine regardless of frame rate.

## World and Level

A **World** is the runtime container for one or more loaded **Levels** (see `WORLD_SYSTEM.md` for streaming/sectors/persistence). At the runtime layer, `World` is deliberately thin: a registry of loaded Levels, the global resource table, and the system scheduler. All gameplay state lives in Levels and their Entities.

## Resource and Service registry

Not everything is an Entity. Global, non-spatial state — the input manager, the audio mixer, the save-game service, a game-mode singleton — is a **Resource**, registered once on the World and injected into any system that declares a dependency on it. A **Service** is a Resource that exposes an imperative method surface in addition to data (e.g. `SaveService.save()`), for the cases where "just data + systems" is more indirection than the problem needs. Both are plain, inspectable objects — the editor lists registered Resources/Services in a Project Settings panel the same way it lists components on an entity.

## Hot reload

Because compiled Behaviors (from TypeScript or 3JSE Graph) are registered in the scheduler as named function references rather than baked into entity construction, hot-reload is a **function swap**, not an entity teardown/rebuild. Editing a system's TypeScript source, or recompiling a 3JSE Graph, replaces the registered function and the next tick picks it up — no scene reload, no lost state. This is the mechanism behind Edit → Play → Pause → Inspect → **Modify** → Resume (`EDITOR.md`): a paused game's entities and their live values are untouched by a code or graph edit; only the logic driving them changes underneath them.

## Determinism posture

Fixed-step gameplay/physics is deterministic *per machine* (same build, same OS/GPU, same inputs → same result), which is sufficient for save/replay and single-machine time-travel debugging (`AI_AGENT_API.md`, `EDITOR.md`). It is explicitly **not** claimed to be cross-platform bit-exact — floating point and physics engine behavior vary across hardware/drivers. Lockstep multiplayer that requires cross-machine determinism is out of scope for the runtime's default execution model; `NETWORKING.md` uses state replication instead, precisely to avoid depending on a guarantee the web platform can't reliably give.

## Headless mode

The runtime has no hard dependency on a DOM or a visible canvas. It can boot against an offscreen canvas / software fallback for CI, automated tests, and the AI Agent API's `runGame` / `inspectScene` verification loop (`AI_AGENT_API.md`), producing console output, a frame capture, and a performance report without a visible window. This is a first-class supported mode, not a hack — the CLI (`@3jse/cli`) exposes it directly as `3jse run --headless`.
