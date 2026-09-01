# 3JSE — Gap Analysis vs. Unreal / Unity / Godot

**Phase:** 7 (`ROADMAP.md`). **Purpose:** an honest, grounded assessment of where 3JSE stands
against the incumbents, per genre a real developer actually ships in — not a feature-checkbox
race. Scored against **what is in this repo today**, not the design docs.

Legend: ✅ shipped & tested · 🟡 partial / headless-only / needs a viewport to validate ·
⬜ not started · ➖ deliberate non-goal.

---

## 1. The honest position

3JSE today is a **headless-first web game runtime + an editor shell + an agent-native
development harness**, with roughly Phase 1–2 of a traditional engine's core built and tested,
Phase 3–6 partially, and the differentiators (Atlas, the Agent API, the reuse harness) further
along than a normal engine would have them at this stage.

What that means concretely:

- **You can build a small third-person / top-down / first-person game today**, entirely through
  tested `@3jse/*` packages, and tune + hot-reload it in the editor. The Third Person template
  is a real, playable, headless-verified vertical slice.
- **You cannot yet ship a content-heavy 3D game** — no streaming/level-partitioning, no
  lightmap/GI bake, no material graph, no particle system, no nav-mesh, no animation
  retargeting UI, no build/packaging pipeline. Those are the bulk of Phase 3–6.
- **The parts that are ahead of a normal Phase-2 engine**: an agent tool server with real
  headless perf/state probes (`@3jse/agent`), a semantic authoring layer (`@3jse/atlas`,
  the Blueprint alternative), a plugin system with versioned extension points
  (`@3jse/plugins`), deterministic input replay (`@3jse/replay`), and a reuse-first harness
  that turns a coding agent into a reference-first game dev.

---

## 2. Core engine subsystems

| Subsystem | Unreal | Unity | Godot | 3JSE today | Gap |
|---|---|---|---|---|---|
| Scene/entity model | Actors/Components | GameObject/Component (+ DOTS) | Nodes | ✅ ECS-over-`Object3D`, archetype-indexed `query`, generational handles, snapshot/restore | Storage is still per-entity `Map` (no SoA columns) — fine to ~10k entities per the Phase 0 bench, not to 100k |
| Scheduler / tick | Tick groups | PlayerLoop / Update phases | `_process`/`_physics_process` | ✅ fixed/variable/late stages, registration-order-sensitive, headless-driven | No job graph / parallelism; single-threaded |
| Rendering | Nanite/Lumen, deferred, RHI | HDRP/URP/BiRP, SRP | Forward+/Vulkan | ➖ **adopt** Three.js `WebGPURenderer`/TSL — see `PLUGIN_ARCHITECTURE.md`. Viewport renders; no render-graph, shadows-only lighting | Material graph ⬜, post-process stack ⬜, GI/lightmaps ⬜, virtualized geometry ➖ (not a web target) |
| Physics | Chaos | PhysX / Havok | Jolt / Godot Physics | 🟡 `@3jse/physics-rapier` — rigid bodies, colliders, kinematic character; 4 tests | No joints/constraints UI, no vehicle/cloth/soft-body, no continuous-collision tuning surface |
| Animation | AnimBP, Control Rig, retargeting | Mecanim, Animation Rigging | AnimationTree, SkeletonIK | 🟡 `@3jse/animation` state machine + blend tree + TwoBoneIK (18 tests); no editor graph UI, no retargeting, no root-motion extraction UI | Retargeting is the big one for using marketplace animations |
| Audio | MetaSounds, submixes | FMOD/Wwise-class + built-in | AudioStreamPlayer, buses | ⬜ `AUDIO.md` designed, nothing built | Whole subsystem |
| Input | Enhanced Input | Input System package | InputMap/actions | ✅ `InputManager` axis/action binding, headless-driveable, deterministic; editor Input Mapping panel | No runtime rebinding UI, no device hot-swap, no touch/gesture layer |
| Navigation | NavMesh + smart objects | NavMesh + AI Navigation | NavigationServer | ⬜ `@3jse/nav` named, not built | Whole subsystem |
| Networking | Replication graph, Push Model | Netcode for GameObjects / FishNet | MultiplayerSynchronizer | 🟡 `@3jse/networking` — replication, authority, prediction/reconciliation, RPC, loopback transport (7 tests). No real transport, no relay/matchmaking, no lag comp | Transport + a bandwidth/priority model |
| Save / serialization | SaveGame objects | JsonUtility / ScriptableObjects | ResourceSaver | ✅ `@3jse/save` (tagged-component snapshots, 5 tests) + `@3jse/runtime` `snapshot/restore` + `@3jse/project` byte-identical round-trip | No migration tooling UI, no binary format |

---

## 3. Editor & workflow

| Capability | Incumbents | 3JSE today | Gap |
|---|---|---|---|
| Scene editing | Mature, gizmos, snapping, multi-select | ✅ Viewport + Hierarchy + Inspector + transform gizmos, click-to-select, prefab create/instantiate | No multi-select, no snapping/grid, no undo/redo stack |
| Play-in-editor | One-click, hot state | ✅ Play/Pause, no modify-while-paused, **on-screen hot-reload of hand-written Systems** (function-swap, no state loss) | Hot-reload is Systems only; component-schema edits still reload |
| Visual scripting | Blueprint / Visual Scripting / GDScript+VisualScript | 🟡 `@3jse/graph` renders 3IR graphs read-only; **`@3jse/atlas`** is the primary surface (semantic map + FeelSpec tuning + agent scoping) — see `ATLAS.md` | Graph *editing* (drag/wire/palette) ⬜; Atlas v0.2 lenses ⬜ |
| Material authoring | Full node graph → HLSL | ⬜ Material Graph panel is a placeholder | Whole subsystem (compiles to TSL when built) |
| Particles / VFX | Niagara / VFX Graph / GPUParticles | ⬜ Particles panel is a placeholder; `@3jse/extras` vendors `three-vfx` | Whole subsystem |
| Terrain / foliage | Landscape + Foliage / Terrain Tools / GridMap+HeightMap | 🟡 generation cores re-exported from vendored MIT upstreams (poseidon/gaia/dryad/demiurge); **no runtime Systems or editor tools** | The InstancedMesh/chunk-mesher/TSL-material runtime + the paint tools |
| Profiler | Unreal Insights / Profiler / Godot profiler | ✅ Profiler panel — real `runtime.getPerf` (CPU/sim timing + scene census) fed by the live render loop | No GPU timing, no draw-call/triangle counts (needs render-pass instrumentation), no flame graph |
| Sequencer / cinematics | Sequencer / Timeline / AnimationPlayer | ✅ Sequencer panel over `@3jse/cinematics` (property/event/activation tracks, scrub, event log) | No curve editor, no camera-cut track, no sub-sequences |
| Asset pipeline | Import presets, LOD gen, texture streaming | 🟡 `@3jse/assets` — glTF/GLB import, thumbnails, metadata, character detection (41 tests). No LOD gen, no texture compression pass wired, no dependency graph UI | Draco/meshopt/KTX2 passes exist as libs (`@3jse/extras`), not wired into an import flow |
| Build / packaging | BuildConfiguration, platform targets | ⬜ Packaging panel is a placeholder | `BUILD_DEPLOYMENT.md` designed; nothing emits a shippable bundle |
| Source control | Perforce/Git plugins, diff tools | ✅ `@3jse/project` produces Git-diff-friendly, byte-identical-round-trip project files; no in-editor VCS panel | Diff/merge UI; the format is deliberately text-first so external Git works |
| Multi-user editing | Multi-User Editing / (none) / (none) | ➖ **not built — Git instead** (`EDITOR.md`) | Intentional |

---

## 4. Where 3JSE is deliberately different (and ahead)

| Capability | Incumbents | 3JSE |
|---|---|---|
| Agent-native development | Bolt-on AI plugins | The coding agent **is** the primary editor (`VISION.md`); `@3jse/agent` exposes the editor's own command API as MCP tools with real headless verify probes (`runtime.getPerf` / `runtime.captureState`) + `buildEvidenceReport()` |
| Semantic authoring | Blueprint exposes *implementation* | **Atlas** exposes *meaning* — systems before files, mechanics before functions, feel before constants (`ATLAS.md`); the human edits intent + FeelSpec, the agent edits code, the viewport witnesses |
| Reuse doctrine | "build it in-engine" | The **3JSE Harness** — a reuse ladder (project → provider → reference → licensed asset → procedural → adapt → custom), a curated provider registry, and quality gates that make "don't reinvent the wheel" an enforced workflow, not advice |
| Extension model | Plugin API with a privileged core | `@3jse/plugins` — versioned extension-point APIs, **no private tier**; an official package and a `community/*` one register through the exact same manifest (`PLUGIN_ARCHITECTURE.md`) |
| Determinism for tooling | Varies | Per-machine deterministic fixed-step + `@3jse/replay` (input edge recording → identical replay) + `snapshot/restore` → counterfactual debugging is a first-class primitive |
| Distribution | Large native runtime | Web-first: the runtime is headless-capable, the "editor is a witness", and a game is a static bundle (when packaging lands) |

---

## 5. Genre readiness (ship a real game in…)

| Genre | Readiness | What's missing to ship |
|---|---|---|
| **3D platformer / third-person action** | 🟡 slice playable | animation retargeting + graph UI, checkpoints/objectives package, VFX, audio, packaging |
| **Top-down / twin-stick** | 🟡 slice playable | click-to-move/twin-stick input variant, projectiles/`@3jse/combat`, audio, packaging |
| **First-person** | 🟡 slice playable | mouse-look, weapon viewmodel + `@3jse/combat`, audio, packaging |
| **Racing** | ⬜ | `@3jse/vehicle` (physics), track tooling, lap/checkpoint `@3jse/match`, audio |
| **Open world** | ⬜ | world partitioning/streaming, terrain runtime + tools, foliage runtime, LOD, nav |
| **RTS / tactics** | ⬜ | orbit/isometric camera preset ✅, but unit selection/command, `@3jse/nav` group pathing, fog-of-war |
| **RPG** | ⬜ | `@3jse/inventory` / `@3jse/dialogue` / `@3jse/quests`, save-migration tooling, UI framework |
| **Multiplayer (any of the above)** | 🟡 core only | a real transport, relay/matchmaking, lag compensation, a replication priority/bandwidth model |
| **Narrative / walking sim** | 🟡 closest to shippable | audio, a UI/HUD framework, `@3jse/dialogue`, packaging |

---

## 6. Recommended sequencing to close the biggest gaps

Ordered by "unblocks the most genres per unit of work":

1. **Packaging** (`BUILD_DEPLOYMENT.md`) — nothing ships without this; every genre needs it.
2. **Audio** (`AUDIO.md`) — every genre; the mixer/bus/event layer on top of Web Audio.
3. **UI / HUD framework** — every genre; menus, HUD, dialogue all sit on it.
4. **Animation retargeting + graph UI** — unblocks using marketplace/Mixamo animation at scale.
5. **Material Graph → TSL** — unblocks anything with a custom look; the vendored providers assume it.
6. **Terrain/foliage runtime Systems + paint tools** — unblocks open-world and large outdoor genres.
7. **Nav-mesh (`@3jse/nav`)** — unblocks RTS/tactics/RPG AI movement.
8. **Networking transport + priority model** — turns the replication core into shippable multiplayer.
9. **Particles/VFX** — polish layer; every genre wants it, few genres are blocked without it.
10. **Atlas v0.2 lenses + live agent planning** — compounds the differentiator once the above give it more to describe.

---

## 7. One-paragraph summary

3JSE has a **tested, honest Phase 1–2 core** (entity model, scheduler, input, physics wrap,
character + camera presets, animation state machine, save/snapshot, three genre templates) and
**genuinely novel Phase 4–5 differentiators** (agent tool server with real verify probes, the
Atlas semantic authoring layer, a no-privileged-tier plugin system, deterministic replay). It
is **not** a drop-in Unreal/Unity/Godot replacement: the content-production half of an engine —
packaging, audio, UI, material/particle authoring, terrain/foliage runtime, nav, animation
retargeting — is largely unbuilt. The path to "ship a real game" runs through packaging → audio
→ UI first, then the authoring subsystems, with the AI-native layer compounding value the whole
way.
