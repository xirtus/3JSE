# 3JSE Object Model

## The decision

3JSE uses a **hybrid Actor/Component authoring model backed by ECS-style storage** — not pure ECS, not classic OOP inheritance, and not a thin wrapper that just renames `Object3D`.

The reasoning, worked through against the optimization targets the model has to satisfy simultaneously:

- **Pure ECS** (à la bitECS/Bevy) wins on performance and query composability, but a bare ECS has no natural unit that corresponds to "a thing in the level" for an inspector, a prefab, or a sentence like *"the shark has a perception component."* Entities are anonymous integers; meaning lives in which systems happen to query them. That is hostile to an editor UI and to AI legibility — the explicit design target from `VISION.md`.
- **Classic OOP actor hierarchies** (deep inheritance, `Player extends Character extends Actor`) are exactly what an inspector and a beginner expect, but they serialize badly, fight hot reload (redefining a class invalidates live instances), and degrade badly at scale (virtual dispatch, poor cache locality, fragile diamond-inheritance workarounds).
- **Unity's GameObject + MonoBehaviour** and **Godot's Node** models split the difference and are what most working game developers already think in. That mental model — a named, spatial "thing" with an attached bag of typed components — is what 3JSE keeps at the *authoring* surface, while storing the data underneath in ECS-style archetype tables for the systems that actually iterate over thousands of instances per frame.

Concretely: **an Entity behaves like an Actor/GameObject/Node to a human or an AI reading the project, and like an ECS row to the scheduler at runtime.** Nothing about this is a compromise between the two models — it's a deliberate separation of *authoring ergonomics* from *storage layout*, which is exactly the kind of separation that lets one change (say, a future storage optimization) happen without ever being visible to the other.

## Vocabulary

| Term | What it is |
|---|---|
| **World** | The runtime container for all loaded Levels, the Resource/Service registry, and the scheduler. One per running game. |
| **Level** (aka Scene) | A serializable unit of content — a set of Entities plus level-local settings (environment, lighting). A World can have several Levels loaded at once (`WORLD_SYSTEM.md`). |
| **Entity** | An addressable, named "thing" in a Level. Has a stable ID, optionally a Transform (backed by an `Object3D`), and a set of Components. Directly analogous to an Unreal Actor, a Unity GameObject, or a Godot Node. |
| **Component** | Typed data attached to an Entity — `Health`, `CharacterController`, `Inventory`. Pure data by convention; behavior lives in Systems or Behaviors, not component methods, so components stay serializable and diffable. |
| **System** | Logic that runs each tick over every Entity matching a component query — the ECS half of the model. Hand-written (TypeScript) or generated (compiled 3JSE Graph). |
| **Behavior** | A convenience wrapper: a Component that also names a Graph or a small TS function to run *for that entity specifically*, registered into the scheduler as a per-entity-scoped System under the hood. This is the "attach a script to this one object" workflow every engine needs, expressed without inventing a second execution model. |
| **Prefab** | A serialized Entity (with children) usable as a template. Instances track their source Prefab and can override specific fields (a Prefab *variant*), matching Unreal's Blueprint-instance and Unity's Prefab-override model. |
| **Resource** | Global, non-spatial data not owned by any single Entity (input state, audio mixer settings). |
| **Service** | A Resource that also exposes an imperative API (`SaveService.save()`) alongside its data. |

## Storage

Components of the same type are stored contiguously (archetype/SoA storage), so a System querying `(Transform, Velocity)` iterates a tight, cache-friendly array rather than chasing pointers through heterogeneous objects — this is the specific mechanism that makes "editor-friendly" and "fast at 10,000 instances" compatible rather than contradictory. Adding or removing a component moves an Entity between archetypes; this is a well-understood, bounded-cost operation in every ECS implementation 3JSE draws from, not a novel risk.

`Object3D` is treated as the storage for the **Transform** component specifically — position, rotation, scale, parenting all continue to live on the Three.js scene graph exactly where every existing Three.js library expects to find them. An Entity without a Transform (a game-mode manager, a spawn director) simply has no associated `Object3D` and is not part of the render scene graph at all.

## Why this is legible to an AI (and a human skimming a diff)

The whole point of choosing this shape is that a serialized Entity reads as a sentence, not a call stack:

```json
{
  "name": "Player",
  "components": {
    "Transform": { "position": [0, 1, 0] },
    "CharacterController": { "maxSpeed": 6, "jumpHeight": 1.4 },
    "Health": { "current": 100, "max": 100 },
    "Inventory": { "slots": 8, "items": [] },
    "AnimationController": { "graph": "player_locomotion.3jgraph" },
    "GrapplingHook": { "range": 25, "reelSpeed": 12 }
  }
}
```

An AI agent (or a teammate) inspecting the project via `scene.query` (`AI_AGENT_API.md`) sees exactly the sentence from `VISION.md`: *"Player contains CharacterController, Health, Inventory, AnimationController, and GrapplingHook."* There is no arbitrary imperative code to trace through to reconstruct that fact — it's the literal shape of the data. Adding a feature to the Player is, structurally, adding or editing a component entry, not hunting through the codebase for where "player stuff" happens to live this month.

## Serialization, hot reload, and networking fall out of the same choice

- **Serialization**: a Component is required to be representable as plain JSON-compatible data (primitives, arrays, typed-array-backed vectors, references to other Entities/Assets by stable ID). This is enforced by the component schema system, not left to convention — a Component type declares its fields' types once, and the editor's inspector, the serializer, and the network replicator all derive their behavior from that single schema.
- **Hot reload**: because Systems are registered by name/reference and Components are plain data, redefining a System's logic (via TS edit or Graph recompile) never invalidates existing Entity data — see `RUNTIME.md`.
- **Networking**: replication (`NETWORKING.md`) is just "which Components, on which Entities, does this client need diffs for" — a direct consequence of Components being the atomic unit of state, not an afterthought bolted onto an OOP object graph.
- **Editor inspection**: the Inspector panel (`EDITOR.md`) is generated directly from each Component's schema — there is no per-component custom UI to hand-write unless a component wants a bespoke editor experience (a curve, a gradient), in which case it opts in explicitly.

## What this model deliberately does not do

It does not claim to be the fastest possible ECS — a hand-tuned Bevy/bitECS-style engine with no authoring-ergonomics constraints will out-iterate it in a synthetic benchmark. It optimizes for the actual bottleneck in practice, which is *how long it takes a human or an AI agent to understand and safely change what an entity does*, while keeping the storage layer fast enough that this doesn't become a real-world performance ceiling (target budgets in `PERFORMANCE.md`).
