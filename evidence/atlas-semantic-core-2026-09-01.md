# Atlas Semantic Core — `@3jse/atlas` + editor panel

**Status:** done (v0.1 / §63 scope). Full gate green.
**Date:** 2026-09-01
**Spec:** `docs/3JSE_ATLAS_FULL_PLAN.md` §54 (MVP scope) + §63 (recommended first task).

## Exit criterion, quoted (§63)

> Build the Atlas Semantic Core: `defineSystem()`, Atlas graph compiler, FeelSpec parser,
> React Flow system map, node inspector, direct knob editing, agent task context exporter,
> test status, provider metadata, asset metadata, simple runtime health. Then apply it to one
> existing 3JSE game.

**Met.** Every item shipped (React Flow → hand-rolled SVG, per the plan's "or equivalent" and
the repo's no-heavy-dep posture). "One existing 3JSE game" = the Third Person template
(`@3jse/templates`), the only real 3JSE game in this repo; 3jsurf is a separate repo and out of
scope here.

## Routing ledger

| Capability | Rung-0 search | Choice | Why |
|---|---|---|---|
| Semantic system contract | `@3jse/runtime` has ECS `SystemDef` (execution), not semantic systems with knobs/purpose | new `@3jse/atlas` `defineSystem` | §4/§40 — a layer *over* implementation |
| Graph compiler / model | none | new — pure `compileAtlas` | §41 pipeline |
| FeelSpec | none | new — §8 schema, §11/§13/§14 resolvers | implementation-independent intent |
| System-map layout | `@3jse/graph` `layoutGraph` is IR-exec-spine specific | new layered-DAG layout | different graph shape |
| React Flow map + inspector | editor `GraphPanel` hand-rolls its canvas | new `AtlasPanel`, hand-rolled SVG | repo avoids heavy deps; plan says "or equivalent" |
| Agent context exporter | `@3jse/agent` MCP server, no scoped packager | new `exportAgentContext` → §28 JSON | §28 |
| Provider/asset metadata | `packages/vendor/registry.json`, harness `providers.json`, `@3jse/assets` | injected `Record` into `compileAtlas` | keeps `@3jse/atlas` fs-free (engine-package rule) |
| Health | `@3jse/agent` `buildRunTests` / `runtimeGetPerf` / `ConsoleSink` | `deriveHealth(evidence)` — pure | §32 "derived from evidence" |

## Structural proofs

- **Compiler is pure/deterministic** — `compile.test.ts` + `layout.test.ts`: same inputs →
  identical `AtlasModel` and identical layout; dangling refs surfaced (`{from,ref,kind}`), not
  dropped; `includeProviders:false` yields a pure system map.
- **Layout terminates on cycles** — dependency cycle breaks at layer 0, event cycle stays
  lateral (events never create layers). No infinite recursion (`layout.test.ts`).
- **FeelSpec resolvers** — inheritance folds base-first with child-wins + array union and
  detects cycles; weighted reference blend with weights summing to 1 equals the weighted
  reference average, clamped to 0..1; `checkProtected` flags exactly the moved protected dims
  (`feelspec.test.ts`).
- **Agent scoping is a 1-ring, not the project** — `exportAgentContext` on `player.tricks.
  landing` returns `[combo, player.physics]` and their files/tests only, never `unrelated`
  (`agentContext.test.ts`).
- **Search finds a mechanic without a filename** — `searchAtlas(model, "shark tow")` returns
  the `shark_tow` mechanic node, its system, and its test glob; every query term must appear;
  deterministic (`search.test.ts`).
- **Live knob binding is real** — `apps/editor/src/sampleAtlas.test.ts`: `applyAtlasKnob(level,
  "player.camera", "distance", 9.5)` writes through to the template's `Player` `CameraRig.
  distance`; `readAtlasKnob` reads it back; an unbound knob reports "descriptive knob — no live
  binding yet" instead of pretending.
- **Health is evidence-derived** — `world.props` (no test suite) shows `untested`;
  `player.movement` (8/8) shows `healthy`; a `{failed:1}` evidence entry shows `failing`.

## Editor verification (Chrome/WebGPU)

Opened the editor, selected the **Atlas** center tab. Screenshot evidence:

- System map renders: Input / Scene Props / Physics (layer 0) → Movement (layer 1, selected) →
  Save / Camera / Animation (layer 2). Domain-colored left bars (core slate, gameplay amber,
  animation violet, physics blue, world green). Dependency edges solid+arrowed, event edges
  dashed amber. Selecting a node dims non-neighbours.
- Health badges: `● healthy` (with "8/8 tests passing" in the inspector), `◌ untested` on
  Scene Props.
- Node inspector shows purpose, Requires/Depended-on-by, Emits/Listens, Tests, Owns, FeelSpec,
  Mechanic; a "Tuning (live)" block with moveSpeed / jumpSpeed / turnSpeedDegPerSec number
  inputs; an "Ask agent (§28/§30)" block with an action dropdown, intent textarea, and a live
  "Affects N systems, N files, N test paths · risk medium" preview line.
- Search bar present; legend present. **Zero console errors.**

The knob-input → live-component write path is verified by `sampleAtlas.test.ts` (the browser
automation's device-pixel-ratio offset made reliable in-editor typing into the number field
flaky this pass — a harness quirk, not a panel bug; the logic path is unit-covered).

## Verify

- `pnpm --filter @3jse/atlas test` — 31 passed. `typecheck` clean.
- `apps/editor` gains a `test` script; `sampleAtlas.test.ts` — 4 passed.
- `pnpm -r typecheck` clean (25 projects), `pnpm -r test` green (23 packages + editor),
  `pnpm --filter @3jse/editor build` OK, `verify-harness.mjs` PASS.

## Known limitations

See `docs/ATLAS.md` "Not built yet" — the v0.2+ lenses, the Three.js 2.5D layer (deferred by
§63 until 2D pain points justify it), A/B auditioning, Feel Lab, FeelSpec-on-disk, and a live
LLM behind "Ask agent" (scoped-context export is real; planning is not).
