# Roadmap

Dependency-ordered, not calendar-ordered — each phase specifies what it needs from the previous one and what it unlocks for the next. The overall sequencing bet: ship something that already beats hand-rolled Three.js before visual scripting exists, ship visual scripting before AI depends on it, ship AI before ecosystem/marketplace features need a userbase and content that don't exist yet, and treat "professional tooling" (terrain, cinematics, VFX graphs) as depth to layer in once the foundation is proven, not a prerequisite for anything else.

> **Tandem note:** this roadmap is the *engine* track. The *harness* track — **3JSE Harness v0.1** — is already live (`HARNESS.md`) and serves as a working field test of Phase 4's AI-native thesis before that phase is built, feeding design decisions back into every earlier phase. The harness track's visual layer is **3JSE Atlas** (`3JSE_ATLAS_FULL_PLAN.md`), which supersedes Phase 3's node-wiring canvas while keeping that phase's compiler deliverables.

---

## Phase 0 — Technical experiments

**Goals**: de-risk the decisions the rest of the roadmap depends on, before committing architecture to them.

**Prerequisites**: none.

**Architecture affected**: validates or revises `GAMEPLAY_IR.md`, `ENTITY_COMPONENT_MODEL.md`, `VERSE_COMPATIBILITY.md`.

**Deliverables**:
- A throwaway 3IR prototype: hand-write ~5 IR node kinds, a JS emitter, and an interpreter; confirm the source-map round-trip (`GAMEPLAY_IR.md`'s bidirectional-editing claim) actually works on a small recognized TS subset before it's load-bearing for the whole engine.
- A minimal ECS-over-`Object3D` spike: confirm archetype storage plus a Transform-as-Object3D bridge performs acceptably (target: 10k entities, steady 60fps on a mid-range laptop) and doesn't fight Three.js's own scene-graph update internals.
- A Verse-spec research spike (`VERSE_COMPATIBILITY.md` Level 3): read Epic's published grammar/license terms and produce a written go/no-go, not an implementation.
- A Tauri-vs-Electron spike for the editor shell (`EDITOR.md`): confirm WebGPU access, file-system permissions, and multi-window behavior meet the editor's needs in Tauri before committing to it as primary.

**Tests**: benchmarks (entity count vs. frame time), a working (if ugly) graph↔code round-trip demo, a written feasibility memo per spike.

**Exit criteria**: no open question from `GAMEPLAY_IR.md` or `ENTITY_COMPONENT_MODEL.md` remains unvalidated by a working prototype; Verse Level-3 go/no-go is decided; editor shell technology is chosen.

---

## Phase 1 — 3JSE Editor MVP

**Goals**: enough to visually construct a simple Three.js game without writing a scene-setup script by hand.

**Prerequisites**: Phase 0's ECS/Object3D bridge and editor-shell decision.

**Architecture affected**: `RUNTIME.md`, `EDITOR.md`, `ENTITY_COMPONENT_MODEL.md`, `PROJECT_FORMAT.md` (all first real implementations).

**Deliverables**: `@3jse/runtime` (World/Level/Entity/Component, no Systems scheduler complexity yet beyond fixed/variable tick); Viewport, Hierarchy, Inspector, Content Browser, basic transform gizmos; Play/Pause (no Modify-while-paused yet); local project save/load in the `PROJECT_FORMAT.md` layout; `@3jse/assets` v1 (glTF/GLB import, thumbnails, basic metadata — no LOD/collider generation yet).

**Tests**: hand-build a small static scene (a room, some props, a camera) entirely in-editor with zero hand-written code; project round-trips through save/load/Git-diff cleanly.

**Exit criteria**: a non-programmer can place and arrange a scene using only the editor; the project file is readable and diffs sensibly in Git.

---

## Phase 2 — Gameplay Engine

**Goals**: components, prefabs, physics, input, saves, animation — the engine becomes capable of an actual game, not just a scene.

**Prerequisites**: Phase 1's Entity/Component runtime and editor.

**Architecture affected**: `RUNTIME.md`'s full scheduler, `PHYSICS.md`, `ANIMATION.md`, `AUDIO.md`, first slice of `GAMEPLAY_FRAMEWORK.md` (`@3jse/character`, `@3jse/save`, `@3jse/spawning`).

**Deliverables**: Prefab system with variant overrides; `@3jse/physics-rapier` integration + Collision Editor panel; `InputManager`; `@3jse/character` CharacterController + CameraRig; Animation Graph MVP (state machine + blend tree, no IK yet); `@3jse/save`; hot reload for hand-written TypeScript systems (`RUNTIME.md`'s function-swap mechanism, first real use).

**Tests**: build the Third Person template (`TEMPLATES.md`) end-to-end using only Phase 1–2 features; verify hot reload preserves live Play-mode state across a code edit.

**Exit criteria**: the Third Person template is playable, tunable via Inspector, and its logic hot-reloads without restarting Play.

---

## Phase 3 — 3JSE Graph

**Goals**: visual gameplay scripting, built on a real 3IR, not a shortcut.

**Prerequisites**: Phase 0's validated IR prototype; Phase 2's Entity/Component/System runtime to compile against.

**Architecture affected**: `GAMEPLAY_IR.md` (production implementation), `VISUAL_SCRIPTING.md` (compiler machinery; the canvas UI is superseded by `3JSE_ATLAS_FULL_PLAN.md`), Debugger panel in `EDITOR.md`.

**Deliverables**: `@3jse/ir` production compiler (interpreter + JS/TS backends); `@3jse/graph` node canvas, core node families (events, flow control, functions, variables, async); live debugging (active wires, breakpoints, watches); bidirectional graph↔code for the recognized TS subset, including the visible "Code node" boundary for anything outside it; `@3jse/vendor` registry + fetcher (`VENDOR_INTEGRATIONS.md`) landing here specifically so Tier B open-source staging is available well before any Tier A plugin adapter is ready — a developer shouldn't have to wait for Phase 5 to at least look at the best available open-source work.

**Tests**: reproduce the kite-surf-style boost/combo worked example from `VISUAL_SCRIPTING.md` with zero hand-written logic files; confirm the compiled output is readable, idiomatic TypeScript a programmer would not be embarrassed to have written; confirm a graph edit and a code edit of the same logic converge to the same IR.

**Exit criteria**: a designer with no TypeScript experience can build non-trivial gameplay logic (an event chain with branching, timers, and state) entirely in the graph editor, and a programmer can read the compiled output without needing the graph open.

**Opportunistic, not blocking**: a Playground — a shareable-URL sandbox holding a snippet id (scene + graph state), modeled directly on Babylon.js's Playground, which is as much that engine's primary community/onboarding mechanism as it is a debugging tool. It becomes buildable the moment `@3jse/ir`/`@3jse/graph` exist (this phase), needs no engine-architecture changes to add, and is worth picking up whenever it's convenient rather than gating on it — the adoption target is the *mechanism* (a snippet id, a save/fork/share flow), not Babylon's implementation. Once it exists, docs gain a companion discipline worth holding to going forward: a feature described in the manual without a live Playground link demonstrating it is treated as documentation debt, the same way an untested code path is.

---

## Phase 4 — AI-native authoring

**Goals**: agents can reliably create and modify games through the same primitives humans use.

**Prerequisites**: Phase 2's stable Component/System API and Phase 3's 3IR — the Agent API's tool surface is a thin layer over both, and can't be built reliably against either while they're still shifting.

**Architecture affected**: `AI_AGENT_API.md` (production implementation), Agent Panel in `EDITOR.md`, headless run mode in `RUNTIME.md`.

**Deliverables**: `@3jse/agent` MCP-shaped tool server (full tool list from `AI_AGENT_API.md`); headless `runtime.run`/`getConsole`/`getPerf`/`captureFrame`; the observe→plan→act→verify loop; Suggest and Co-pilot trust tiers; Agent Panel UI showing live plan/diff.

**Tests**: the shark worked example (`AI_AGENT_API.md`) end-to-end, unattended through ACT/VERIFY, human approval only at plan and final-diff stages; a natural-language project-creation smoke test (a one-sentence prompt producing a browsable, editable project, not an opaque bundle).

**Exit criteria**: an agent can complete a moderately complex feature request (new Component + Graph + asset import + verified working result) without a human intervening mid-loop, and every artifact it produces opens normally in the ordinary editor panels.

---

## Phase 5 — Professional tools

**Goals**: the depth that separates "usable" from "a studio would actually ship with this."

**Prerequisites**: stable core (Phases 1–3); AI layer (Phase 4) is not required by this phase but benefits from it (agents can help build/tune content in these tools too).

**Architecture affected**: adds to `ANIMATION.md` (IK, retargeting depth), `RENDERING.md` (particle/VFX graph), `PLUGIN_ARCHITECTURE.md` (terrain/water/foliage as shipped official plugins), `PERFORMANCE.md` (Profiler depth).

**Deliverables**: `@3jse/water-poseidon`, `@3jse/terrain` (with the `@3jse/terrain-demiurge` procedural mode), `@3jse/foliage-gaia`, `@3jse/flora-dryad` — the Tier A vendor-wrapped plugins staged since Phase 3's `@3jse/vendor` graduate here (`VENDOR_INTEGRATIONS.md`); cinematic Sequencer/Timeline (`@3jse/cinematics`); particle/VFX graph; skeletal retargeting + IK; full Profiler (GPU/CPU/memory/network); render/network debuggers; automated testing framework (`build.runTests` gets real teeth); replay system (building on `RUNTIME.md`'s per-machine determinism).

**Tests**: build one of each of the Racing, RPG, and Open World templates (`TEMPLATES.md`) using these tools, exercising terrain, water, cinematics, and VFX in a real (if small) project each.

**Exit criteria**: the remaining "MVP vs. long-term" gap identified back in `ARCHITECTURE.md`/`EDITOR.md`'s panel inventory is closed — every panel listed there exists and is usable, not stubbed.

---

## Phase 6 — Ecosystem

**Goals**: templates, package sharing, and multiplayer support mature from "exists" to "a community can build on it."

**Prerequisites**: Phase 3's Graph and Phase 5's plugin catalog give the ecosystem something worth packaging; `PLUGIN_ARCHITECTURE.md`'s stability contract needs to have survived at least one real engine version bump (Phase 5) before third parties can trust it.

**Architecture affected**: `PLUGIN_ARCHITECTURE.md` (registry/discovery layer added on top of the existing manifest contract), `NETWORKING.md` (hardened from Phase 2's basics into a documented, template-backed Multiplayer offering), `TEMPLATES.md` (full catalog).

**Deliverables**: a package registry/discovery surface for `@3jse/*` and community packages (versioned, semver-checked against the stability contract); the full template catalog from `TEMPLATES.md`; the Multiplayer template hardened on `@3jse/networking`; documentation and a contribution path for third-party plugin authors.

**Tests**: a third-party developer, external to the core team, publishes a working plugin using only public documentation and the extension-point APIs, with no core-team assistance required.

**Exit criteria**: at least one community-authored plugin and one community-authored template exist and are installable without manual intervention.

---

## Phase 7 — Unreal-class workflow

**Goals**: honestly assess what remains between 3JSE and a genuinely professional, general-purpose engine — this phase is a re-evaluation, not a fixed feature list, because the honest answer depends on where Phases 0–6 actually landed.

**Prerequisites**: all prior phases, plus real usage data from projects built in Phases 4–6.

**Architecture affected**: revisits the deferred items flagged throughout this design — live multi-user editor collaboration (deferred in `EDITOR.md` in favor of Git), rollback netcode for competitive genres (deferred in `NETWORKING.md`), deeper acoustic modeling (deferred in `AUDIO.md`), Verse Level 3 (contingent on the Phase 0 go/no-go), and rendering-ceiling questions explicitly out of scope in `VISION.md` (Nanite/Lumen-class techniques, revisited only as Three.js's own roadmap and WebGPU compute capability evolve).

**Deliverables**: a written gap analysis against Unreal/Unity/Godot for the genres 3JSE's real users are actually shipping in (not a hypothetical full-parity checklist); a decision, per deferred item, to build, continue deferring, or explicitly declare out of scope for the engine's identity as defined in `VISION.md`.

**Status**: first pass of the gap analysis written — `ENGINE_GAP_ANALYSIS.md` (grounded in the repo's actual state: Phase 1–2 core tested, Phase 3–6 partial, the AI-native differentiators ahead; genre-readiness table; a recommended sequencing that puts packaging → audio → UI first). Per-deferred-item build/defer/out-of-scope decisions still owed as Phases 4–6 produce real usage data.

**Exit criteria**: not "feature parity with Unreal" — parity with a twenty-years-deep engine is not a real target and chasing it would betray `VISION.md`'s own framing. The exit criterion is a credible, evidence-backed answer to the question this entire design package exists to answer: for the genres and teams 3JSE actually serves, is it a better choice than Unreal, Unity, Godot, or a custom web stack — and if not yet, precisely what's missing.
