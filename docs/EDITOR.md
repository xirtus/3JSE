# 3JSE Editor

## What it is, physically

The Editor is a single-page application built on the exact same `@3jse/runtime` a shipped game uses, running the actual WebGPU viewport in-process rather than talking to a separate game process over IPC. It distributes three ways from one codebase:

- **Browser** — for quick edits, sharing a project link, and CI-driven visual review. No install.
- **Tauri desktop app** — the primary target for serious work: native file-system access, multiple windows, better GPU/driver access than a sandboxed browser tab, still just a webview around the same SPA.
- *(Electron is a viable fallback for the desktop shell if a Tauri limitation forces it; the SPA itself doesn't care which shell hosts it.)*

Games built with 3JSE never depend on the editor at runtime — the editor is strictly a development-time tool that reads and writes the same project files a hand-editing developer or a CI pipeline would (`PROJECT_FORMAT.md`).

## UI implementation

The editor's own chrome (panels, docking, forms) is **React**, built on `@galacean/editor-ui` and `@galacean/gui` (MIT, engine-agnostic — peer-deps only on React/React-DOM, no dependency on Galacean's own renderer). This is an adopt decision, not a build decision, and it resolves a question this document previously left open: the panel/docking layer needed a real UI framework choice, and this library is purpose-built for exactly this problem rather than a generic component kit pressed into service. Concretely, it supplies the Inspector's hardest recurring pieces out of the box — `ColorPicker`, `BezierCurveEditor` (Animation Graph curve editing, `ANIMATION.md`), `GradientSlider` (fog/sky authoring, `RENDERING.md`; later the particle/VFX graph, `ROADMAP.md` Phase 5), `ParticleSlider`, `AssetPicker` (Content Browser drag-targets), and Vector/property form items for every Transform and Component field in `ENTITY_COMPONENT_MODEL.md` — accessible (Radix UI primitives underneath), themeable (built-in light/dark, restyled to 3JSE's own visual identity via its Stitches-based token system rather than forked), and independent of Galacean's engine entirely, so adopting it carries no coupling to another engine's rendering or scene-graph assumptions. Registered as a direct dependency of `@3jse/editor` rather than through the `@3jse/vendor` registry (`VENDOR_INTEGRATIONS.md`) — see that document's note on why editor-tooling adoptions and project-facing content plugins are handled differently.

## Panel inventory

All panels are dockable/rearrangeable (a standard docking layout engine — tabs, splits, floating windows, saved layouts per project or per user). Panels are declared through the same panel-registration API third-party plugins use (`PLUGIN_ARCHITECTURE.md`) — there is no separate "built-in panel" privilege tier.

| Panel | Role |
|---|---|
| **Viewport** | Live WebGPU render of the active Level(s); gizmos, camera navigation, stats overlay |
| **Hierarchy / Outliner** | Entity tree for loaded Levels; Prefab instances visually distinguished; multi-select |
| **Inspector** | Component editors generated from schema (`ENTITY_COMPONENT_MODEL.md`); multi-edit diffing |
| **Content Browser** | Project assets — meshes, textures, audio, prefabs, graphs, materials — tagged/searchable/thumbnailed |
| **Open Source** | Browse the `@3jse/vendor` registry, preview license/stack/screenshot, install a Tier A plugin or stage a Tier B import; see `VENDOR_INTEGRATIONS.md` |
| **3JSE Graph Editor** | Full-tab node canvas; see `VISUAL_SCRIPTING.md` |
| **Material/Shader Graph** | Node editor compiling to TSL; see `RENDERING.md` |
| **Code Editor** | Embedded TypeScript editing (Monaco-class: LSP, go-to-definition) for hand-written systems |
| **Animation Tools** | Timeline, state-machine/blend-tree editor, skeleton view; see `ANIMATION.md` |
| **Terrain / Water / Vegetation** | Heightfield sculpting, water volume placement, foliage painting; each owned by its plugin |
| **Particle Editor** | VFX graph (roadmap Phase 5, `PLUGIN_ARCHITECTURE.md`) |
| **Physics / Collision Editor** | Collider gizmos, constraint authoring; see `PHYSICS.md` |
| **Navigation** | Navmesh bake + visualization; see `PLUGIN_ARCHITECTURE.md` (`@3jse/nav`) |
| **UI/HUD Editor** | Retained-mode layout canvas for `@3jse/ui` |
| **Environment Settings** | Sky, fog, post-processing stack, lighting presets |
| **Profiler** | Frame timing by system/draw-call/GPU pass; see `PERFORMANCE.md` |
| **Console** | Runtime logs, warnings, errors — clickable to source (TS line or graph node) |
| **Debugger** | Breakpoints/step/watch across both TypeScript and 3JSE Graph (`VISUAL_SCRIPTING.md`) |
| **Asset Dependency Viewer** | Graph of what references what — "what breaks if I delete this" |
| **Project Settings** | Registered Resources/Services, quality tiers, input mappings, build targets |
| **Input Mapping** | Action/axis binding editor for `InputManager` |
| **Packaging / Deployment** | Build target selection, Publish flow; see `BUILD_DEPLOYMENT.md` |
| **Source Control** | Git status, diff, stage/commit, branch — operating directly on the readable project format |

Multiple Scenes/Levels can be open at once (`WORLD_SYSTEM.md`); the Hierarchy panel scopes to the active Level while allowing cross-level entity references where the World architecture permits.

## Edit → Play → Pause → Inspect → Modify → Resume

This loop is the editor's central promise, and it is possible specifically because of two Runtime properties (`RUNTIME.md`):

1. **No process boundary.** Play mode runs the same World in the same WebGPU context the edit view uses — entering Play does not serialize the scene out to a separate game process and back. Exiting Play can optionally *keep* the resulting state ("apply Play state to Level") instead of always discarding it.
2. **Hot-swappable logic.** Pausing freezes the scheduler's tick advancement, not the World's data. Editing a Component value, a TypeScript system, or a 3JSE Graph while paused mutates live state or swaps a registered function (`RUNTIME.md`'s hot reload) — Resume continues the same simulation with the new logic or data in effect, not a fresh boot.

Concretely: pause mid-jump, open the Inspector, change `jumpHeight` from 1.4 to 2.2, resume — the character's current velocity and position are untouched, only the constant driving future jumps has changed. Pause during a bug, open the 3JSE Graph debugger, see exactly which branch fired last frame with real captured values on the wires, patch the graph, resume without restarting the level.

## The Agent Panel

Not a floating chat widget — a permanent dock, because in the AI-native posture (`VISION.md`, `AI_AGENT_API.md`) most sessions use it. It shows the agent's current plan, the tool calls it's making against the same command API the rest of the editor uses, and a running diff of what's changed — reviewable and revertible through the same undo stack as a manual edit (`ARCHITECTURE.md` — "everything the editor can do, code can do" cuts both ways: everything the agent does is visible the same way a human's edit is).

## Multi-scene, multi-user posture

3JSE does not build a live multi-user CRDT collaboration layer into the editor's first several years (see `ROADMAP.md` for where that's revisited). Instead, collaboration is **Git-based**, matching the "projects are software projects" principle in `ARCHITECTURE.md`: the project format is deterministically serialized and diff/merge-friendly (`PROJECT_FORMAT.md`), the editor's Source Control panel operates on it directly, and two people can work on the same project the way two people work on the same codebase — branches, PRs, merge conflicts a human resolves in a real diff, not a proprietary "who wins" resolution dialog. This is a deliberate, simpler bet than live co-editing: it costs nothing to build relative to a CRDT sync layer, and it's the collaboration model most of 3JSE's target developers already trust.
