# 3JSE Atlas

The layer-5 visual authoring surface (`ARCHITECTURE.md`) — the Blueprint / Verse alternative.
Full product spec: `3JSE_ATLAS_FULL_PLAN.md`. This page is the implementation status.

> **Code is for agents. Graphs are for understanding. FeelSpec is for intent and tuning.
> The viewport is a witness.** — the graph is the *explanation* of the program, never the program.

Atlas is **generated from the project** — declared semantic-system metadata plus static/runtime
evidence — and is never the source of program logic. The node-graph machinery of
`VISUAL_SCRIPTING.md` stays underneath as the execution architecture and one Atlas lens.

## Implemented — Atlas Semantic Core (`@3jse/atlas`, headless)

`3JSE_ATLAS_FULL_PLAN.md` §54 / §63. All headless, 31 tests.

| Piece | Module | Notes |
|---|---|---|
| `defineSystem()` semantic contract | `defineSystem.ts` | id · label · domain · purpose · owns · requires · emits · listens · **knobs** · tests · providers · assets · feelSpec · mechanic · parent. Module-scope `systemRegistry` like `ComponentRegistry`. |
| Atlas graph compiler | `compile.ts` | `compileAtlas(input) → AtlasModel`: typed nodes + typed edges (`dependency` / `event` / `provider` / `asset`), reverse-dependency index, dangling refs surfaced not swallowed. `focusDomain` + `childrenOf` for progressive disclosure. |
| FeelSpec | `feelspec.ts` | §8 parse/validate · `resolveInheritance` (§14 deltas, cycle-guarded) · `resolveFeel` (§11 weighted reference blend) · `checkProtected` (§13) · `feelDelta` (§12 preview). |
| System-map layout | `layout.ts` | Deterministic layered DAG (§22): dependency flow left→right, event edges lateral, cycle-guarded. Not a force graph. |
| Node inspector data | (compiled `AtlasNode`) | purpose, health, requires/dependents, emits/listens, tests, files, knobs, feelSpec, mechanic. |
| Direct knob editing | editor `AtlasPanel` + `sampleAtlas.applyAtlasKnob` | Number knobs on `player.movement` / `player.camera` / `world.props` write straight to the live component field (`CharacterController` / `CameraRig` / `Spin` / `Movable`) — §3.1 "update live where possible", real. |
| Agent task-context exporter | `agentContext.ts` | `exportAgentContext(model, nodeId, intent)` → §28 1-ring scoped package (system, neighbours, files, tests, feelSpec, knobs, runtime pointer). `previewChange` → §30 blast radius + coarse risk. |
| Test status | `health.ts` | `deriveHealth(evidence)` → §32 states. Status is a pure function of harness evidence (tests / perf / console / dirty / agent-working) — never invented. |
| Provider / asset metadata | `compile.ts` `ProviderMeta` / `AssetMeta` | Injected registry `Record` (keeps `@3jse/atlas` fs-free); unknown ids still get a bare node flagged "not in registry". |
| Simple runtime health | `health.ts` + `AtlasNode.cpuMs` | ms/frame surfaced on the node when evidence supplies it. |
| Universal search | `search.ts` | `searchAtlas(model, query)` across systems / knobs / events / providers / assets / tests / mechanics — ranked, deterministic, no search dep. §38 "shark tow" → the mechanic, its system, its tests. |
| Semantic colors | `colors.ts` | §20 domain hues + health badge colors/glyphs, shared 2D/3D. |

### Editor panel

`apps/editor/src/panels/AtlasPanel.tsx` (center tab **Atlas**, active). Hand-rolled SVG system
map (no react-flow — same posture as `GraphCanvas`): layered layout, domain-colored nodes,
typed edges, health badges, focus dimming on select. Right pane: the node inspector with live
knob inputs, search, and the §28/§30 agent-scoping section (assembles the scoped task package →
editor log + clipboard; no live LLM is wired, same honesty as the Agent Panel).

Model content = `sampleAtlas.ts`, the semantic declarations of the Third Person template
(`@3jse/templates`) — §63 "apply it to one existing 3JSE game".

## Implemented — v0.2

| Piece | Module | Notes |
|---|---|---|
| Additional lenses | `lenses.ts` | `eventLens` (§5.4), `performanceLens` (§5.9), `providerLens` (§5.7), `assetLens` (§5.6), `stateMachineLens` (§5.3), `gameplayFlowLens` (§5.2), `worldLens` (§5.10 — `defineRegion` hierarchy), `styleLens` (§5.8 — a VISUAL PROFILE from `StyleProfile`), `traceLens` + `TraceRecorder` + `pulseCounts` (§5.5 / §26 — a windowed event trace, feeds the time scrubber), `rigLens` (§5.11 — bones grouped by limb + Motion + Animation). Each a pure transform of the `AtlasModel`; the panel's lens switcher swaps which one feeds the map. |
| Node canvas | editor `AtlasPanel` via `@3jse/graph` `NodeCanvas` | The System Map now renders through a reusable pan / zoom / drag node canvas (`@3jse/graph`), dragged positions overriding the auto-layout per lens. |
| A/B FeelSpec | `feelAB.ts` | `feelABTable` (both values + delta per dimension, sorted by \|Δ\|), `mergeFeel` (per-dimension A/B pick → merged intent, §16), `feelABSummary` (§12 preview line). |
| `atlas/` project manifest | `manifest.ts` | `parseAtlasManifest(files)` over a virtual filesystem — loads `atlas/systems/*.json` → `AtlasSystemSpec[]` and `atlas/feelspec/*.json` → `FeelSpec[]`, reports malformed files instead of throwing, feeds `compileAtlas` directly (§44). JSON now; a YAML front-end is a swappable parse step. |

## Not built yet

- Runtime event *pulses* animating on the map + a wired time scrubber UI (§26–27) — the
  data side (`TraceRecorder` / `pulseCounts`) is done; the animation + slider are editor work.
- 2.5D / Three.js Atlas navigation (§18–19, §45–51) — deliberately deferred until the 2D core's
  pain points justify it (§63).
- Feel Lab (§17), personal feel libraries (§15).
- Live LLM planning behind "Ask agent" — the scoped-context export is real; the planning loop
  is the same future work as `AI_AGENT_API.md`'s PLAN stage.
- FeelSpec YAML on disk (the manifest loader takes JSON today).
- Provider swap workflow UI (§34) and git/history integration (§33).
