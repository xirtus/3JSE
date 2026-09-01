# 3JSE — Build Tasks Ledger

One line per task (the dambeavers `TASKS.md` discipline): phase · task · status · evidence · commit.
Statuses: `todo` · `wip` · `done` · `blocked` · `deferred`.
Updated at the end of every session with a session report (see `evidence/SESSION_REPORT-*.md`).

Baseline at ledger creation: commit `2fc24e8`, harness verify green.

---

## Phase 0 — Technical experiments

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 0.0 | Harness verify green before touching anything | done | `verify-harness.mjs` → PASS (2026-09-01) | (uncommitted) |
| 0.1 | 3IR round-trip prototype (~5 node kinds, emitter, interpreter, source-map round-trip on a recognized TS subset) | done | `evidence/phase0-spike1-3ir-roundtrip.md`; `packages/ir` 14/14 tests | pre-existing (`ecf0c89`) + memo (uncommitted) |
| 0.2 | ECS-over-Object3D spike (archetype storage + Transform-as-Object3D bridge; 10k entities @ 60fps; doesn't fight three's scene-graph update) | done | `evidence/phase0-spike2-ecs-object3d.md`; `spikes/phase0/ecs-object3d/` (bench: 0.60 ms/frame @ 10k) | (uncommitted) |
| 0.3 | Verse Level-3 research spike — read Epic's grammar/license, written go/no-go | done | `evidence/phase0-spike3-verse-level3-memo.md` (NO-GO on Level 3) | (uncommitted) |
| 0.4 | Tauri-vs-Electron editor-shell decision | done | `evidence/phase0-spike4-editor-shell.md` (Tauri v2; Phase 1 confirmation checklist) | (uncommitted) |
| 0.5 | Phase 0 summary + consolidated routing ledger + exit-criteria check | done | `evidence/phase0-summary.md` | (uncommitted) |

**Phase 0 exit:** all four spikes closed; go/no-go recorded; **Phase 0 closes, Phase 1 authorised.** Non-blocking open items tracked in `evidence/phase0-summary.md` §"Open items carried into Phase 1".

---

## Phase 1 — 3JSE Editor MVP  (mostly pre-existing from `ecf0c89`; gaps closed this session)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 1.0 | Confirm Phase 0 open items 1–3 | **item 3 done** — `apps/editor/src/shell/` native-call adapter (`ShellAdapter` + `BrowserShell` FS-Access/download + `TauriShell` via `window.__TAURI__`, zero build-time dep; `getShell()` auto-selects; 6 tests) + browser build is the CI target (`pnpm gate`). **Items 1–2 hardware/toolchain-bound** (mid-range Windows laptop; Rust toolchain + signed builds + a running Tauri shell) — the de-risking layout/agnosticism is shipped; see memo. | `evidence/phase0-open-items-status-2026-09-01.md`; `apps/editor/src/shell/` | (uncommitted) |
| 1.1 | `@3jse/runtime` archetype storage (promote `spikes/phase0/ecs-object3d` layout into the real runtime; `EntityId` registry, snapshot/restore) | **archetype index + EntityRegistry + snapshot/restore done** — `Level.query` signature-bucketed (2.8× faster at 20k, byte-identical results, API unchanged); `EntityRegistry` generational `EntityHandle` (`World.resolveEntity`, stale-handle safe); `World`/`Level` `snapshot()`/`restore()` (total, id-preserving round-trip, deep-equal proven). **Still open:** SoA column storage (Phase 0 memo: not-yet-needed to ~10k). | `evidence/phase1.1-runtime-archetype-index-2026-09-01.md`; `packages/runtime` 39 tests (was 19) | (uncommitted) |
| 1.2 | `@3jse/runtime` World/Level/Entity/Component + fixed/variable tick | done (pre-existing) — 19 tests; + `id?` params added for stable-id project load | `packages/runtime` | (uncommitted) |
| 1.3 | Editor panels: Viewport, Hierarchy, Inspector, Content Browser, transform gizmos | done (pre-existing) — 13 active panels, editor builds | `apps/editor/src/panels/registry.ts` | — |
| 1.4 | Play/Pause (no modify-while-paused) | done (pre-existing) — `World.play/pause`, editor toolbar | `apps/editor/src/App.tsx` | — |
| 1.5 | Local project save/load in `PROJECT_FORMAT.md` layout; Git-diff clean round-trip | **done this session** — `@3jse/project`: byte-identical round-trip, one-line diff on one-field change, versioned migration chain, unregistered-component preservation | `packages/project` (6 tests) | (uncommitted) |
| 1.6 | `@3jse/assets` v1 (glTF/GLB import, thumbnails, basic metadata) | done (pre-existing) — 41 tests | `packages/assets` | — |
| 1.x | **Exit gate:** non-programmer places/arranges a scene with zero hand-written code; project file diffs sensibly in Git | **met (browser)** — editor boots the shipped Third Person template as its scene; Hierarchy select + Inspector edit of components verified live in Chrome/WebGPU; project file diffs cleanly (1.5). Not yet re-verified in the Tauri shell or with a non-programmer. | `evidence/phase1-2-exit-gate-2026-09-01.md` | (uncommitted) |

---

## Phase 2 — Gameplay Engine  (largely pre-existing from `ecf0c89`; deliverables filled this session)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 2.1 | Prefab system with variant overrides | done (pre-existing) — `createPrefab`/`instantiatePrefab`/`diffPrefabOverrides` | `packages/runtime/src/Prefab.ts` | — |
| 2.2 | `@3jse/physics-rapier` + Collision Editor panel | done (pre-existing) — 4 tests, Physics panel | `packages/physics-rapier` | — |
| 2.3 | `InputManager` | done (pre-existing) — headless-driveable, 6 tests | `packages/runtime/src/InputManager.ts` | — |
| 2.4 | `@3jse/character` CharacterController + CameraRig | done (pre-existing) — 8 tests | `packages/character` | — |
| 2.5 | Animation Graph MVP (state machine + blend tree; TwoBoneIK present) | done (pre-existing) — 18 tests | `packages/animation` | — |
| 2.6 | `@3jse/save` | done (pre-existing) — 5 tests | `packages/save` | — |
| 2.7 | Hot reload for hand-written TS systems (function-swap) | done (pre-existing) — `Scheduler.register` upsert + editor HMR accept | `apps/editor/src/sampleScene.ts` | — |
| 2.8 | `@3jse/spawning` (spawn-point Components, `ObjectPool` resource) | **done this session** — SpawnPoint/Spawned components, `SpawnRegistry`, `ObjectPool` (recycle, prewarm), spawn System (interval/maxAlive/totalLimit/jitter/pooled), `onSpawn` hook | `packages/spawning` (5 tests) | (uncommitted) |
| 2.9 | Third Person template end-to-end (Phase 2 exit criterion) | **done this session** — `@3jse/templates` `buildThirdPersonTemplate`: headless-valid, wires input→character→physics→camera→animation→save; tests assert player falls & settles on the ground collider and forward input drives movement | `packages/templates` (4 tests) | (uncommitted) |
| 2.x | **Exit gate:** Third Person template playable, tunable via Inspector, logic hot-reloads without restarting Play | **met (browser)** — `apps/editor/src/sampleScene.ts` now calls `buildThirdPersonTemplate({ world, clips, decorate })`, so the editor scene and the shipped template are one code path. Verified in Chrome/WebGPU: Play runs the full loop with follow camera; Inspector edit of Spin.degreesPerSecond (60→240) drives the live sim; editing `systems/builtins.ts` during Play function-swaps via the preserved `sampleScene.ts` HMR accept boundary with no reload / no Play-state loss. | `evidence/phase1-2-exit-gate-2026-09-01.md` | (uncommitted) |

Follow-up done: the sampleScene → template swap is complete; the HMR accept boundary
(`@3jse/runtime/systems/builtins` subpath, `registerBuiltinSystems` kept as a direct call to
hold the module in-graph) was preserved and re-verified on-screen.

---

## Phase 3 — 3JSE Graph  (compiler pre-existing; canvas + Playground)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 3.1 | `@3jse/ir` compiler (interpreter + JS/TS backend, source map) | done (pre-existing, Phase 0 spike 1) — 14 tests | `packages/ir` | — |
| 3.2 | `@3jse/graph` node canvas + core node families | partial (pre-existing) — `GraphCanvas.tsx`, layout/edges/labels, 6 tests; not full node-family coverage | `packages/graph` | — |
| 3.3 | `@3jse/vendor` registry + fetcher | done (pre-existing) | `packages/vendor` | — |
| 3.4 | Playground — shareable-URL snippet sandbox (opportunistic) | **done this session (core mechanism)** — `@3jse/playground`: `encodeSnippet`/`decodeSnippet` (URL-safe, offline-first, versioned), `forkSnippet` with provenance, hash helpers. UI tab + hosted short-id registry not built. | `packages/playground` (6 tests) | (uncommitted) |

---

## Phase 4 — AI-native authoring  (pre-existing skeleton)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 4.1 | `@3jse/agent` MCP-shaped tool server, headless run, observe→plan→act→verify | partial (pre-existing) — `server.ts`, `scene`/`graph`/`build`/`runtime` tools, 30 tests incl. a shark-style example | `packages/agent` | — |

---

## Phase 5 — Professional tools  (vendor wraps staged; runtime Systems not built)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 5.1 | `@3jse/water-poseidon` / `@3jse/terrain-demiurge` / `@3jse/foliage-gaia` / `@3jse/flora-dryad` | partial (pre-existing) — pure generation cores re-exported from vendored MIT upstreams; WebGPU/TSL material + InstancedMesh/chunk-mesher runtime Systems + paint tools **not** built. Sequenced in `docs/ENGINE_GAP_ANALYSIS.md` §6 item 6 (after packaging/audio/UI/material-graph). | `packages/{water-poseidon,terrain-demiurge,foliage-gaia,flora-dryad}` | — |
| 5.2 | Cinematics/Sequencer, particle/VFX graph, retargeting/IK, full Profiler, replay, automated test framework | **Sequencer + Profiler panels done** — `@3jse/cinematics` (7 tests; external `time` write = seek); editor **Sequencer** panel (live Cinematic list, Play/Pause/scrub bound to the component, track summary, event-marker log; demo `sunSweep` sequence) and **Profiler** panel (real `runtime.getPerf` from `@3jse/agent` fed by the live render loop — avg/min/max ms, est FPS, scene census, per-component usage). `@3jse/replay` + TwoBoneIK pre-existing. VFX-graph + animation-retargeting UI still todo. | `packages/cinematics`, `apps/editor/src/panels/{SequencerPanel,ProfilerPanel}.tsx` | (uncommitted) |

---

## Phase 6 — Ecosystem  (not started)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 6.1 | Package registry/discovery, full template catalog, `@3jse/networking`, third-party plugin path | **mostly done** — `@3jse/plugins` (new, 10 tests): `PluginManifest` + `EXTENSION_POINT_API_VERSIONS` + `checkCompatibility`; `PluginHost` (register/validate/activate components/systems/resources/agentTools/editorPanels); `PACKAGE_CATALOG` (24 official `@3jse/*` with capability/phase/status/points). Editor **Packages** panel lists the catalog by phase + registered third-party plugins. `community/orbit-marker` proves the path end-to-end (Component + System via the same host an official pkg uses, live in the scene). `@3jse/templates` catalog now 3 (Third Person / Top-Down / First Person) via CameraRig presets in `@3jse/character`. `@3jse/networking` core pre-existing. Still todo: a remote plugin *fetch/install* flow. | `packages/plugins`, `packages/{templates,character}`, `apps/editor` | (uncommitted) |

---

## Phase 7 — Unreal-class workflow  (re-evaluation; not started)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| 7.1 | Written gap analysis vs. Unreal/Unity/Godot for genres real users ship in | **first pass done** — `docs/ENGINE_GAP_ANALYSIS.md`: subsystem tables vs the three incumbents, editor/workflow table, "where 3JSE is ahead", genre-readiness matrix, recommended sequencing (packaging → audio → UI first). Per-deferred-item build/defer/out-of-scope decisions owed pending Phase 4–6 usage data. | `docs/ENGINE_GAP_ANALYSIS.md` | (uncommitted) |

---

## Harness track  (keep green at all times)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| H.0 | `node 3JSE_Harness_v0.1/scripts/verify-harness.mjs` green | done (ongoing) | PASS 2026-09-01 (with new stricter checks) | (uncommitted) |
| H.1 | Extend harness only where real work proves a gap (bootstrap: audit → highest-leverage gap → improve → verify) | **done this session — 3 gaps closed** | `evidence/SESSION_REPORT-2026-09-01c.md` | (uncommitted) |
| H.1a | New skill `engine-package` — conventions for building `@3jse/*` engine packages (rung-0 capability→package map, headless-first, side-effect component registration, `.js` import ext, Scheduler stage order, stable-id load, engine evidence shape). Loaded on demand. Mirrored to `.claude/`. | done | `3JSE_Harness_v0.1/.agents/skills/engine-package/SKILL.md` | (uncommitted) |
| H.1b | `verify-harness.mjs` hardened: (1) `docs/FILE_INDEX.txt` must match the actual tree (drift = fail); (2) cross-registry integrity — every provider id in `capabilities.json` must exist in `providers.json`; (3) mirror check now bidirectional (extra Claude-only skill = fail). New `scripts/build-file-index.mjs` regenerates the index deterministically. Negative-tested: both new checks fail on injected drift, pass when clean. | done | `3JSE_Harness_v0.1/scripts/{verify-harness,build-file-index}.mjs` | (uncommitted) |
| H.1c | `docs/FILE_INDEX.txt` regenerated (was stale: listed 4 non-existent `.claude/recipes/*` files, missing `mechanics-harness` + 4 recipes from the sorted block). Now 79 files, sorted, verified. `mechanics-harness` + `engine-package` added to `docs/HARNESS.md` skill catalog (22→24). | done | `3JSE_Harness_v0.1/docs/FILE_INDEX.txt`, `docs/HARNESS.md` | (uncommitted) |
| H.1d | `pnpm -r test` restored to green — `@3jse/vendor` gets a `vitest.config.ts` excluding vendored `upstream/**` (was globbing them as empty suites → workspace test gate always red). Now exits 0 across all 22 packages. | done | `packages/vendor/vitest.config.ts` | (uncommitted) |

Note: `3JSE_Harness_v0.1/` is still untracked in git (whole directory `??`) — the harness edits above are uncommitted along with it. Flag for the repo owner — the harness should be committed.

---

## Atlas track  (Atlas Semantic Core, `3JSE_ATLAS_FULL_PLAN.md` §54/§63)

| # | Task | Status | Evidence | Commit |
|---|---|---|---|---|
| A.1 | Atlas Semantic Core spec read + scope | done — full plan read; §63 scope confirmed; applied to the Third Person template (only real 3JSE game in this repo; 3jsurf is a separate repo) | `docs/ATLAS.md` | (uncommitted) |
| A.2 | `@3jse/atlas` headless core — `defineSystem`, compiler, FeelSpec (parse/inherit/blend/protected), layered layout, agent-context exporter (§28) + change preview (§30), evidence-derived health (§32), universal search (§38), semantic colors (§20) | **done** — 31 tests, typecheck clean | `evidence/atlas-semantic-core-2026-09-01.md`; `packages/atlas` | (uncommitted) |
| A.3 | Editor **Atlas** panel — SVG system map (deterministic layered layout, domain colors, typed edges, health badges, focus dimming), node inspector, live knob editing (writes through to `CharacterController`/`CameraRig`/`Spin`/`Movable`), search, §28/§30 agent-scoping section | **done** — rendered + verified in Chrome/WebGPU, zero console errors; `apps/editor` gains vitest + `sampleAtlas.test.ts` (4) | `evidence/atlas-semantic-core-2026-09-01.md` | (uncommitted) |
| A.4 | Atlas v0.2+ — extra lenses, runtime pulses, time scrubber, A/B FeelSpec, Feel Lab, `atlas/` manifest, live LLM planning, 2.5D/Three.js layer | **partial** — `eventLens` / `performanceLens` / `providerLens` / `assetLens` (pure `AtlasModel` transforms, panel lens switcher, verified in Chrome); A/B FeelSpec (`feelABTable` / `mergeFeel` / `feelABSummary`, §16); `parseAtlasManifest` (`atlas/systems|feelspec/*.json` over a virtual FS, §44). +10 tests (41). Still todo: Flow/State/Trace/Style/World/Rig lenses, runtime pulses + time scrubber, Feel Lab, live LLM planning, 2.5D layer (deferred per §63). | `packages/atlas/src/{lenses,feelAB,manifest}.ts`; `docs/ATLAS.md` | (uncommitted) |
