# Plugin Architecture

## Why this document matters more than usual

3JSE expects a significant share of its own future feature development to be done by coding agents (`VISION.md`, `AI_AGENT_API.md`), and expects third-party packages to be genuinely first-class rather than a tolerated extension mechanism bolted onto a closed core. Both of those goals fail unless adding a subsystem is a small, predictable, well-bounded operation — the opposite of "understand the whole engine first." This document specifies what that boundary looks like.

## What a plugin registers

A `@3jse/*` package (official or third-party) declares itself against a small set of typed extension points — the same ones an official package uses, with no private API tier:

| Extension point | Registers |
|---|---|
| **Component schemas** | New Component types (with field types, defaults, validation) — instantly inspectable, serializable, and replicable per `ENTITY_COMPONENT_MODEL.md` |
| **Systems** | Tick-stage-scoped logic operating over a component query (`RUNTIME.md`) |
| **Resources/Services** | Global singletons (`RUNTIME.md`) |
| **3JSE Graph nodes** | New node types wrapping the package's API, auto-derived from Component/event schemas where possible (`GAMEPLAY_FRAMEWORK.md`'s Health example) |
| **Material Graph nodes** | New shading node types compiling into TSL (`RENDERING.md`) |
| **Editor panels** | New dockable panels (`EDITOR.md`), built on the same panel-registration API every built-in panel uses |
| **Inspector field renderers** | Custom widgets for specific field types (a curve editor, a gradient picker) |
| **Importers/Exporters** | New Asset Pipeline format handlers (`ASSET_PIPELINE.md`) |
| **Agent tools** | New MCP-shaped tools extending the Agent API's surface (`AI_AGENT_API.md`) for package-specific operations |
| **Build targets** | New deployment targets (`BUILD_DEPLOYMENT.md`) |

A minimal plugin package might register just a Component schema and a couple of Systems (a pure-gameplay package like `@3jse/quests`); a subsystem-scale plugin like `@3jse/terrain` registers Component schemas, Systems, editor panels, Material Graph nodes, and an importer, but through the exact same manifest shape — scale changes how many extension points a package uses, not the mechanism.

## Stability contract

Extension-point APIs are versioned independently of the engine's overall version, with semver guarantees per point (a breaking change to the Component-schema API is a major bump on *that* API specifically). A plugin declares which extension-point API versions it targets in its manifest; the editor and CLI warn — rather than silently fail — when a plugin targets an API range the running 3JSE version doesn't satisfy. This is what makes third-party packages survivable across engine upgrades without every plugin author needing to track engine internals.

The cadence this contract runs on is modeled on Babylon.js's governance, not invented from scratch: a predictable yearly major (so a breaking change has a known landing window, not a surprise), long deprecation warnings before an extension-point API actually breaks (a plugin sees "this will stop working in the next major" for a full release cycle before it does), and an LTS designation on select majors for teams that need a version to sit still for a shipped game's lifetime. Copying a governance *cadence* is cheap and low-risk compared to copying code, and it's specifically what makes the stability guarantees above something a third-party author can actually plan around instead of a promise with no operational teeth.

## Sandboxing and trust

Plugin code runs with the same capability-scoping the Agent API's generated code runs under (`AI_AGENT_API.md`) — no ambient filesystem/network access beyond what the extension-point contract requires (an importer needs file read access to the asset being imported; a gameplay package needs none). This matters specifically because 3JSE expects both AI agents and third-party authors to be writing plugins, and neither should be implicitly trusted with more access than the extension point they're using actually needs.

## Build vs. wrap vs. adopt vs. plugin-interface

Applying `ARCHITECTURE.md`'s "avoid reinventing excellent libraries" principle concretely, subsystem by subsystem:

| Subsystem | Strategy | Rationale |
|---|---|---|
| Rendering | **Adopt** (Three.js `WebGPURenderer`/TSL) | Already excellent, already the reason developers choose the web for 3D |
| Physics | **Wrap** (Rapier default, Jolt alternative, both WASM) | Mature, fast, no reason to reimplement (`PHYSICS.md`) |
| ECS storage | **Build** (thin, purpose-fit) | Needs tight integration with `Object3D` and the schema/inspector/replication system no off-the-shelf ECS assumes (`ENTITY_COMPONENT_MODEL.md`) |
| Navigation/pathfinding | **Wrap** existing navmesh-generation libraries where license/output quality fit; **build** the query/agent integration layer | Navmesh baking is a solved problem; the Entity/Component integration is 3JSE-specific |
| Audio | **Adopt** (Web Audio via Three.js) + **build** mixer/event layer | Web Audio already does spatialization well; the bus/event model is the actual gap |
| Networking transport | **Wrap** (WebSocket/WebRTC) + **build** replication layer | Transports are commodity; Component-diff replication is the integration work worth owning |
| Node graph editor (canvas/rendering) | **Build** | Needs to render thousands of nodes/wires at interactive frame rates with custom debug overlays (`VISUAL_SCRIPTING.md`) — general-purpose DOM node-graph libraries don't hold up at this scale or integrate with 3IR's live-value overlays |
| Code editor | **Adopt** (Monaco-class embeddable editor) | Solved problem; not a differentiator worth owning |
| Editor UI toolkit (panels, forms, inspector controls) | **Adopt** (`@galacean/editor-ui` + `@galacean/gui`) | MIT, engine-agnostic (peer-deps on React only), purpose-built for exactly this problem — ships the ColorPicker/BezierCurveEditor/GradientSlider/AssetPicker/Vector-field controls a 3D editor's Inspector otherwise hand-rolls one at a time; see `EDITOR.md` |
| Terrain/water/foliage | **Wrap** named open-source projects where a permissively-licensed, technically-compatible one already exists; **build** the adapter layer | Revised from an earlier "build from scratch" call — see `VENDOR_INTEGRATIONS.md`. The render/physics/asset-pipeline coupling that made wrapping look awkward is exactly what the Tier A adapter shape (Component + System + Graph nodes, not a raw dependency) is designed to absorb |
| Asset compression (Draco/meshopt/KTX2/Basis) | **Adopt** | Established, widely used, no reason to reimplement (`ASSET_PIPELINE.md`) |
| Multiplayer editor collaboration | **Not built** (Git instead) | Deliberately deferred — see `EDITOR.md` |
| Community/solo-developer graphics work generally (water, vegetation, terrain, VFX techniques) | **Wrap when licensable, fetch-and-stage otherwise** | The Three.js/WebGPU ecosystem includes individual developers producing best-in-class effects work; a curated registry plus an in-editor fetcher (`VENDOR_INTEGRATIONS.md`) turns that into either an official plugin or an attributed, sandboxed starting point — never a silent, unverified dependency |

## Package examples, expanded

```
@3jse/core              runtime primitives (World/Level/Entity/Component/System)
@3jse/editor            editor shell, panel framework, docking
@3jse/runtime           game-side runtime (superset of core, includes scheduler)
@3jse/graph             3JSE Graph node model, compiler, debugger protocol
@3jse/ir                3JSE Gameplay IR types, validator, backends
@3jse/agent             Agent API tool server
@3jse/assets            import/analysis pipeline
@3jse/vendor            open-source registry + fetch-on-demand importer (VENDOR_INTEGRATIONS.md)

@3jse/physics-rapier     official plugin
@3jse/physics-jolt       official plugin (alternative backend)
@3jse/water-poseidon     official plugin — wraps github.com/owenyuwono/poseidon (FFT ocean)
@3jse/terrain            official plugin (procedural mode: @3jse/terrain-demiurge, wraps demiurge)
@3jse/foliage-gaia       official plugin — wraps github.com/owenyuwono/gaia (procedural grass)
@3jse/flora-dryad        official plugin — wraps github.com/owenyuwono/dryad (procedural trees)
@3jse/networking         official plugin
@3jse/nav                official plugin
@3jse/ai-behavior        official plugin
@3jse/ui                 official plugin
@3jse/character          official plugin
@3jse/vehicle            official plugin

community/*              third-party packages, same manifest shape, no privilege gap
_vendor/*                staged Tier B imports (project-local, unpublished, see VENDOR_INTEGRATIONS.md)
```

`@3jse/water-poseidon`, `@3jse/foliage-gaia`, and `@3jse/flora-dryad` replace the earlier placeholder `@3jse/water`/`@3jse/foliage` names in this table's first draft — `VENDOR_INTEGRATIONS.md` has the full case study, licensing verification, and adapter design behind that change. The naming convention (`@3jse/<capability>-<upstream>`) keeps provenance visible in every project's dependency list permanently, not just in a credits file.
