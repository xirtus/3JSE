# 3JSE Gameplay Framework

The Gameplay Framework is the standard library every non-trivial game otherwise rebuilds from scratch: character and vehicle movement, cameras, inventory, damage, save games, AI perception, and so on. It exists so that a new project — or an AI agent building one from a one-sentence prompt (`AI_AGENT_API.md`) — starts from working, composable systems instead of an empty `World`.

## Design rule: composable plugins, not a monolith

Every system in this document ships as an independent `@3jse/*` package built entirely on the public Entity/Component/System API (`ENTITY_COMPONENT_MODEL.md`) — none of them get privileged runtime access the Gameplay Framework author has that a third-party package author doesn't. This is enforced, not just a style preference: it's the same constraint that makes third-party packages first-class in `PLUGIN_ARCHITECTURE.md`, and it's what stops the Gameplay Framework from calcifying into "the parts of the engine nobody can safely touch."

A game depends only on the systems it uses. Removing `@3jse/inventory` from a racing game's `package.json` removes the Inventory component schema, its systems, and its inspector/graph-node registrations — cleanly, because registration is explicit (`PLUGIN_ARCHITECTURE.md`), not a side effect of importing the framework as a whole.

## Catalog

| System | Package | Provides |
|---|---|---|
| CharacterController | `@3jse/character` | Capsule movement, slopes, stairs, jumping, coyote time, ground/air state machine |
| VehicleController | `@3jse/vehicle` | Wheel raycasts or physics-wheel constraints, suspension, drivetrain, arcade/sim tuning modes |
| CameraRig | `@3jse/character` | Third-person spring-arm, first-person head, top-down, cinematic-follow presets |
| InputManager | `@3jse/runtime` (core) | Device-agnostic action/axis mapping (`WORLD_SYSTEM.md` covers per-level input contexts) |
| Inventory / Items | `@3jse/inventory` | Slot-based inventory Component, item Asset schema, stacking/equip events |
| Weapons | `@3jse/combat` | Hitscan/projectile firing Behaviors, ammo, cooldowns |
| Health / Damage | `@3jse/combat` | Health Component, damage-event pipeline, death/respawn hooks |
| Interaction | `@3jse/interaction` | "Interactable" component + prompt UI, range/line-of-sight checks |
| Quests / Objectives | `@3jse/quests` | Objective graph state, completion events, HUD binding |
| Dialogue | `@3jse/dialogue` | Branching dialogue asset format, speaker/UI binding |
| SaveGame / Checkpoints | `@3jse/save` | Snapshot of tagged Components to a save slot; checkpoint = named save trigger |
| Spawning / Pooling | `@3jse/spawning` | Spawn-point Components, `ObjectPool` resource for high-churn entities (projectiles, VFX) |
| AI Perception / Behavior Trees | `@3jse/ai-behavior` | Sight/hearing sensors, blackboard, behavior-tree nodes exposed to 3JSE Graph |
| Navigation | `@3jse/nav` | Navmesh bake, pathfinding queries, `NavAgent` component |
| Teams / Objectives / Scoring | `@3jse/match` | Team assignment, score resource, round/match state machine |
| Achievements | `@3jse/achievements` | Event-driven unlock tracking, platform-agnostic (maps to Steam/web later) |
| Localization | `@3jse/localization` | String table asset, `LocalizedText` component, runtime locale switch |
| Accessibility | `@3jse/accessibility` | Remappable input, subtitle/caption pipeline, colorblind-safe palette hooks in `@3jse/ui` |
| Multiplayer Replication | `@3jse/networking` | See `NETWORKING.md` |
| Cinematics | `@3jse/cinematics` | Timeline/sequencer runtime (editor tooling in `EDITOR.md`, `PERFORMANCE.md`/roadmap phase 5) |

Physics, animation, and audio are foundational enough to have their own documents (`PHYSICS.md`, `ANIMATION.md`, `AUDIO.md`) rather than a catalog row each.

## How a system is "composable," concretely

Take `Health` as the minimal example. It is:

- A **Component schema** (`current`, `max`, `invulnerable`) — inspectable, serializable, replicable, exactly as described in `ENTITY_COMPONENT_MODEL.md`.
- A **System** (`HealthRegenSystem`, if regen is enabled) — plain logic over the `Health` archetype.
- A set of **events** (`onDamaged`, `onHealed`, `onDied`) — the seam other systems and 3JSE Graph hook into, rather than reaching into `Health`'s internals.
- A set of **3JSE Graph nodes** (`Get Health`, `Apply Damage`, `On Died`) — auto-registered from the Component/event schema (`VISUAL_SCRIPTING.md`), not hand-authored twice.
- Optional **inspector affordances** — a health-bar preview widget in the Inspector, opted into via a decorator, not required.

Every other catalog entry follows the same five-part shape. This uniformity is what lets a new Gameplay Framework package — official or third-party — plug into the editor, the graph, and the Agent API automatically instead of needing bespoke integration work each time.

## Configuration over code, but never opaque

Most of these systems are usable by tuning exposed Component fields and wiring a few graph events — a designer building a third-person game should rarely need to open a TypeScript file for `CharacterController`. But every default is a real, readable value on a real Component, not a hidden constant inside a compiled black box: `maxSpeed`, `jumpHeight`, and `coyoteTimeMs` are inspector fields today, not "someday." Templates (`TEMPLATES.md`) pre-wire these systems together into a working starting point; the Gameplay Framework is what they're built from.
