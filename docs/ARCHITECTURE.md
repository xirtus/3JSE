# 3JSE — Architecture

## Design principles

1. **Three.js is a dependency, never a fork.** 3JSE imports `three` like any other npm package, pins a compatible range, and upgrades it like any other dependency. No subsystem reaches into Three.js internals that aren't part of its public API. Where 3JSE needs something Three.js doesn't expose, it composes around Three.js (a parallel data structure, a wrapper), not inside it.
2. **One IR, many frontends.** Gameplay logic authored via TypeScript, 3JSE Graph, or an AI agent all compile to the same **3JSE Gameplay IR** (`GAMEPLAY_IR.md`). No subsystem is allowed to become a parallel, opaque execution engine.
3. **Everything the editor can do, code can do.** Every editor mutation — moving an entity, adding a component, wiring a graph node — has a corresponding call in the runtime's command API. The editor is a GUI for that API, not a separate authority. This is what makes the Agent API (`AI_AGENT_API.md`) possible without inventing a second interface.
4. **Plugins are first-class, not an afterthought.** The engine you get by default is a curated set of official plugins on top of a small core. A third-party physics engine, terrain system, or gameplay package installs the same way an official one does. See `PLUGIN_ARCHITECTURE.md`.
5. **Projects are software projects.** Scenes, prefabs, graphs, and settings are readable, deterministically-serialized files under version control — never a proprietary binary the editor is the only thing that can open. See `PROJECT_FORMAT.md`.
6. **Adding a feature should touch a small, predictable set of places** — a command, a data schema, a runtime system, an editor panel, inspector fields, optional graph nodes — not a scavenger hunt across the codebase. This is a load-bearing constraint, not a nicety: 3JSE expects a large share of its own future development to be done by coding agents, and an architecture that can't be safely extended by an agent won't stay coherent as it grows.

## The ten layers

```
┌─────────────────────────────────────────────────────────────────┐
│ 9  Project / Templates            starter kits, genre scaffolding │
│ 8  Build + Deployment             play → publish, web/desktop/XR  │
│ 7  Plugin / Package System        @3jse/* registry & sandboxing   │
│ 6  AI Development Layer           Agent API, agentic loop         │
│ 5  Visual Scripting (3JSE Graph)  node authoring → 3IR            │
│ 4  Gameplay Framework             CharacterController, Inventory… │
│ 3  Asset Pipeline                 import, analyze, optimize       │
│ 2  Editor                         viewport, panels, PIE           │
│ 1  Runtime                        world/level tick, ECS, systems  │
│ 0  Three.js (dependency)          scene graph, WebGPU renderer    │
└─────────────────────────────────────────────────────────────────┘
```

Layers 0–1 are the only ones a shipped game strictly needs at runtime. Layers 2, 3, 6, 7, 9 are development-time (editor, tooling, AI, packaging, scaffolding) and do not ship in the game bundle. Layer 5 (3JSE Graph) is development-time as *authoring*, but its compiled output (plain functions, layer 1) does ship — the graph editor itself never does.

### 0 — Three.js (dependency)
Object3D hierarchy, cameras, the WebGPU/WebGL2 renderer, TSL, loaders, `AnimationMixer`. 3JSE treats `Object3D` as the **transform component** — see `ENTITY_COMPONENT_MODEL.md` — rather than inventing a competing scene graph. Any existing Three.js example or library that operates on `Object3D` keeps working inside a 3JSE project.

### 1 — 3JSE Runtime (`@3jse/runtime`)
Owns the `World` → `Level` → `Entity`/`Component` model, the archetype/system scheduler, the resource/service registry, and the render/physics/audio tick order. Ships as a standalone package usable with zero editor dependency — a 3JSE game is a normal TypeScript/JS app that imports `@3jse/runtime` and `three`. Detailed in `RUNTIME.md`, `ENTITY_COMPONENT_MODEL.md`, `GAMEPLAY_FRAMEWORK.md`.

### 2 — 3JSE Editor
A desktop-class, dockable GUI (viewport, hierarchy, inspector, content browser, graph editor, profiler, etc.) that edits a **live** Runtime instance in-process — Edit/Play/Pause/Inspect/Modify/Resume without a rebuild. Ships as a Tauri (or browser) application; games it produces are ordinary web builds with zero editor dependency. Detailed in `EDITOR.md`.

### 3 — Asset Pipeline
Import, analysis, and optimization for meshes, textures, audio, animation. Runs both inside the editor (drag-and-drop) and headless (CI, CLI, agent-driven). Detailed in `ASSET_PIPELINE.md`.

### 4 — Gameplay Framework
The standard library of composable gameplay systems (`CharacterController`, `Inventory`, `SaveGame`, `BehaviorTree`, …) that every non-trivial game rebuilds from scratch otherwise. Ships as independent `@3jse/*` plugin packages on top of the Entity/Component model. Detailed in `GAMEPLAY_FRAMEWORK.md`.

### 5 — Visual Scripting (3JSE Graph)
A node-graph authoring frontend that compiles to 3JSE Gameplay IR, not an isolated execution engine. Detailed in `VISUAL_SCRIPTING.md`.

### 6 — AI Development Layer
The Agent API and the observe → plan → act → verify loop that lets an AI agent operate the editor's own command surface. Detailed in `AI_AGENT_API.md`.

### 7 — Plugin / Package System
The `@3jse/*` package contract: how a subsystem (physics, terrain, water, networking, an editor panel, an importer) registers itself, what stability guarantees it gets, and how third-party packages become first-class. Detailed in `PLUGIN_ARCHITECTURE.md`.

### 8 — Build + Deployment
Play-button local run, Publish pipeline, and the target matrix (static web, PWA, desktop shell, mobile wrapper, XR). Detailed in `BUILD_DEPLOYMENT.md`.

### 9 — Project / Templates
Genre starter kits and the project scaffolding CLI/UI. Detailed in `TEMPLATES.md`, `PROJECT_FORMAT.md`.

Two more documents cut across these layers rather than owning one: `GAMEPLAY_IR.md` (the compiler architecture connecting layers 1, 5, and 6) and `VERSE_COMPATIBILITY.md` (an evaluation of how far to lean on Verse-shaped concepts in layer 5).

## Data flow: how the layers actually talk

```
 Editor (2)  ───┐
                │  same command API
 Agent (6)  ────┼──▶  Runtime command surface (1)  ──▶  World/Level state
                │            ▲
 3JSE Graph(5) ─┘            │ compiles to
                    3JSE Gameplay IR  ◀── TypeScript source (hand-written)
```

The editor, the AI layer, and the compiled output of 3JSE Graph are three callers of the *same* runtime command surface — `createEntity`, `addComponent`, `setProperty`, and so on (full list in `AI_AGENT_API.md`). None of them has a privileged, undocumented path into the World that the others lack. This is what keeps "the editor did it," "the AI did it," and "a script did it" indistinguishable in the resulting project state and undo history.

## Package map

```
@3jse/runtime          world/level/ECS scheduler, resource registry
@3jse/ir               3JSE Gameplay IR types, validator, JS/TS emitter
@3jse/graph            3JSE Graph node model, graph→IR compiler, debugger protocol
@3jse/editor           editor shell, panel framework, docking
@3jse/agent            Agent API, tool schemas, observe/verify harness
@3jse/assets           importers, analyzers, optimizers
@3jse/cli              project scaffolding, headless build, headless run

@3jse/physics-rapier    plugin: physics (default)
@3jse/physics-jolt      plugin: physics (alternative)
@3jse/terrain           plugin: heightfield/terrain
@3jse/water             plugin: water rendering + buoyancy
@3jse/foliage           plugin: instanced vegetation + painting
@3jse/networking        plugin: replication
@3jse/nav               plugin: navmesh + pathfinding
@3jse/ai-behavior       plugin: perception + behavior trees
@3jse/ui                plugin: retained-mode HUD/UI system
@3jse/character         plugin: CharacterController + camera rig
@3jse/vehicle           plugin: VehicleController
```

Every package above 1–7 is optional. A minimal 3JSE game can depend on nothing but `@3jse/runtime` and `three`.

## Why this layering, specifically

Most of the risk in an engine like this is coupling risk, not rendering risk — the danger that the visual scripting system, the AI layer, and hand-written code quietly drift into three different ways of expressing "what the game does," at which point the editor stops being trustworthy for any of them. Putting the IR at the center (rather than treating the graph compiler as a private implementation detail of the graph editor, which is what most engines do) is the one structural decision that prevents that drift. Everything else in this document follows from protecting that decision.
