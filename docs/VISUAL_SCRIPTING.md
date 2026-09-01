# 3JSE Graph

> **Superseded as the authoring UI by 3JSE Atlas** (`3JSE_ATLAS_FULL_PLAN.md`). Atlas replaces the Blueprint-style node-wiring canvas with semantic navigation, FeelSpec tuning, and agent-scoped editing — the graph becomes one of Atlas's lenses rather than the primary authoring surface. Everything in this document about the *machinery* — the 3IR compiler, the JS/TS backend, bidirectional graph↔code, the debugger — remains the execution architecture underneath Atlas. A human rarely wires nodes by hand anymore: they navigate meaning, tune feel, and let the agent (or a direct edit) produce the graph.

3JSE Graph is 3JSE's visual scripting system — a node-graph authoring frontend for **3JSE Gameplay IR** (`GAMEPLAY_IR.md`), not a separate execution engine. Every capability below exists because it's expressible in 3IR; there is no 3JSE Graph feature that hand-written TypeScript can't also express, and no TypeScript-callable engine API that a graph node can't also call. That symmetry is deliberate — it's what keeps this from becoming "its own isolated universe," which the design brief calls out as the one thing to avoid above all else.

## Node families

| Family | Examples |
|---|---|
| **Events** | `BeginPlay`, `Tick(dt)`, `OnCollision`, `OnInput`, custom Events (fan-out, multiple listeners) |
| **Flow control** | `Branch`, `Sequence`, `ForLoop`, `WhileLoop`, `Gate`, `Delay`, `Switch` |
| **Pure functions** | math/vector/quaternion ops, string/array ops, curve sampling — no exec pins, evaluate on demand |
| **Impure functions** | `SpawnEntity`, `DestroyEntity`, `AddComponent`, `PlaySound` — ordered, exec-pin driven |
| **Data** | `Get`/`Set Variable`, `GetComponent`, typed Entity/Asset references |
| **Async** | `Timer`, `Tween`, `Await Signal`, coroutine-style `yield` |
| **State machines** | Nested sub-graph per state, guarded transitions, entry/exit events |
| **Interfaces** | Typed contracts a graph can implement/require (see below) |
| **Composition** | Graph Functions (reusable, callable subgraphs) and Graph Macros (inline-expanded reusable fragments) — the direct equivalent of Blueprint Functions/Macros |
| **Behavior Tree** | Sequence/Selector/Decorator/Leaf nodes, sharing the blackboard model with `@3jse/ai-behavior` |
| **Animation** | Blend, state-transition, and event-sync nodes feeding `ANIMATION.md`'s runtime |
| **UI logic** | Bind, event-listen, and dispatch nodes against `@3jse/ui` widgets |
| **Networking** | `IsServer`/`IsClient` guards, RPC-call and RPC-receive nodes (`NETWORKING.md`) |
| **Debug** | `Print`, `Breakpoint`, `Watch` |

Typed pins throughout: a pin's type comes directly from 3IR's type system (`GAMEPLAY_IR.md`), so an incompatible connection is rejected at wire-creation time in the editor, not discovered at runtime.

## Graph scopes

- **Event Graph** — per-entity or per-Behavior, the primary gameplay-logic surface (the equivalent of a Blueprint's Event Graph).
- **Construction/editor-time script** — runs in the editor as values change (placing/tuning an entity), not during Play — for procedural setup that should be visible while authoring, not just at runtime.
- **Graph Function / Macro** — reusable, versioned, shareable as a package (`PLUGIN_ARCHITECTURE.md`), callable from any Event Graph.
- **Level (global) Graph** — attached to a non-spatial "level logic" Entity for game-mode-scoped logic, the equivalent of Unreal's Level Blueprint.
- **Animation Graph** and **Behavior Tree** — specialized node families operating over the same 3IR core, so debugging, breakpoints, and the compiler pipeline are shared rather than reimplemented per graph type.

## Debugging

All of the following are properties of the **interpreter backend** described in `GAMEPLAY_IR.md`, not bespoke visual-scripting-only tooling:

- **Active-wire visualization** — every wire renders its last-evaluated value live during Play, because the interpreter reports every intermediate value by construction.
- **Breakpoints / step** — pause the scheduler at a specific IR node; step node-by-node or resume; works identically whether the node came from a graph or from the TypeScript adapter frontend.
- **Watches** — pin a variable or component field to a persistent panel, independent of which node graph currently references it.
- **Execution history** — a scrollable log of the last N ticks' fired events and branch outcomes, for "why did this happen three frames ago" debugging without needing to have had a breakpoint set in advance.
- **Performance timing** — per-node cost shown inline on hover, and per-graph cost in the Profiler (`PERFORMANCE.md`), so a slow Behavior shows up by name instead of folding into an undifferentiated "script time" bucket.

## Bidirectional editing, from the graph editor's side

`GAMEPLAY_IR.md` specifies the mechanism (a source-mapped 3IR round-trip through a recognized TypeScript subset); this is what it looks like in the editor:

- Any graph can be viewed as generated TypeScript in the Code Editor panel (`EDITOR.md`), live-updated as the graph changes.
- Edits made in the Code Editor, within the recognized subset, re-parse and update the graph view live in the other direction.
- The moment code leaves that subset, the corresponding region of the graph renders as an opaque **Code node** — typed inputs/outputs inferred from the function signature, wireable like any other node, but not decomposable back into primitive graph nodes. This is a visible, honest boundary rather than a silent desync, and it's the same tradeoff Unreal has lived with between Blueprint and C++ for over a decade — 3JSE's contribution is making the boundary a first-class, inspectable editor object instead of a wall between two separate tools.

## Worked example

*Player enters Trigger → Check `HasKey` → Play Door Animation → Play Sound → Disable Collision → Save Door State*

```
[OnTriggerEnter(other)] ──► [Branch: other.HasComponent<Key>()]
                                   │ true
                                   ▼
                     [PlayAnimation(door, "open")] ──► [PlaySound(doorOpenSfx)]
                                   │
                                   ▼
                     [SetComponent(door, Collision.enabled = false)]
                                   │
                                   ▼
                     [SaveService.setFlag("door_1_open", true)]
```

Every node here is a thin wrapper over a Runtime/Component API call (`ENTITY_COMPONENT_MODEL.md`, `GAMEPLAY_FRAMEWORK.md`) — the compiled TypeScript output reads exactly like the hand-written version a programmer would write for the same behavior, because it's produced by the same JS/TS backend described in `GAMEPLAY_IR.md`, not a graph-specific code generator with its own conventions.

## What this is not

3JSE Graph is not scoped to materials or shaders (that's `RENDERING.md`'s Material Graph, a related but separate node system compiling to TSL, not 3IR) and it is not a simplified subset of "real" scripting held back from doing anything TypeScript can do — any Runtime API callable from TS is callable from a graph node, by construction, because both compile through the same IR and the same backend.
