# Engine Package

Use when the task is to build or change a `@3jse/*` **engine** package (or the editor app) in this monorepo — as opposed to building a game *with* Three.js, which is what `3jse-director` and the provider skills cover. Load on demand; do not keep in always-on context.

`docs/ROADMAP.md` is the sequencing contract; `docs/ARCHITECTURE.md` + `docs/GAMEPLAY_IR.md` + `docs/ENTITY_COMPONENT_MODEL.md` are read before writing engine code. This skill is the *repo conventions* those docs assume but don't spell out.

## Reuse ladder, engine edition

0. **An existing `@3jse/*` package already covers the capability.** Search `packages/*/src` first. Current map (keep updated as packages land):

   | Capability | Package |
   |---|---|
   | World / Level / Entity / Component / Scheduler / Prefab / Input | `@3jse/runtime` |
   | Gameplay IR (frontend + interpreter + JS emitter + source map) | `@3jse/ir` |
   | Node canvas over the IR | `@3jse/graph` |
   | glTF/GLB import, thumbnails, metadata, character detection | `@3jse/assets` |
   | Project save/load in the `PROJECT_FORMAT.md` tree | `@3jse/project` |
   | Character controller + camera rig | `@3jse/character` |
   | Animation state machine + blend tree + TwoBoneIK | `@3jse/animation` |
   | Rapier physics integration | `@3jse/physics-rapier` |
   | Save games (tagged-component snapshots) | `@3jse/save` |
   | Spawn points + object pooling | `@3jse/spawning` |
   | Starter templates (Third Person, …) | `@3jse/templates` |
   | Netcode: replication, authority, prediction, RPC | `@3jse/networking` |
   | Timeline / sequencer runtime | `@3jse/cinematics` |
   | Shareable-URL snippet sandbox | `@3jse/playground` |
   | Input recording + deterministic replay | `@3jse/replay` |
   | MCP-shaped agent tool server | `@3jse/agent` |
   | Semantic system model / FeelSpec / Atlas graph compiler / agent-scoping | `@3jse/atlas` |
   | Plugin manifest / host / extension-point versioning / package catalog | `@3jse/plugins` |
   | Publish pipeline: tree-shake, asset finalize, manifest, notices, static-host files | `@3jse/packaging` |
   | Audio: bus mixer, AudioSource/Listener/ReverbZone, event router, musical grid + MIDI/OSC | `@3jse/audio` |
   | UI/HUD: retained widget tree, flexbox-subset layout, data binding, hit-test, renderer seam | `@3jse/ui` |
   | Material Graph -> TSL codegen + CPU reference evaluator + validation | `@3jse/materials` |
   | Terrain: heightfield sampling, chunk mesher, LOD, bounded-residency streamer | `@3jse/terrain` |
   | Foliage: deterministic field scatter -> InstancedMesh instance data | `@3jse/foliage` |
   | Navigation: grid bake, A* + string-pull, flow field (group pathing), NavAgent | `@3jse/nav` |
   | Vendored MIT ecosystem libs (mesh-bvh, troika text, postprocessing, …) | `@3jse/extras` |
   | Vendor registry + fetcher; Tier A wraps (poseidon/gaia/dryad/demiurge) | `@3jse/vendor`, `@3jse/water-poseidon` etc. |

1. A sibling package's pattern (copy the shape, not a dependency edge you don't need).
2. A reference game in `docs/REFERENCE_GAMES.md` (dambeavers ECS core, 3jsurf headless tools, …).
3. Custom — last resort, with a one-line justification in the package's index/header comment.

## Non-negotiable conventions (proven by the packages that already pass)

- **Headless-first.** Gameplay/logic code runs with **no renderer, no canvas, no DOM**. `World.step(dt)` is caller-driven, never `requestAnimationFrame`-owned. A package that can't be exercised in a plain vitest `node` test is wrong. Physics is the only async seam (Rapier WASM init) — isolate it.
- **Components are plain JSON data.** Primitives, arrays, plain objects, entity-id strings. No functions, Maps, or class instances in component data. Behaviour lives in **Systems**, not component methods.
- **Register components as an import side effect.** Every package with components does `import "./components.js"` (or `./systems.js`) from its `index.ts`, and that module calls `registerComponent(...)` at module scope. Matches `@3jse/runtime`'s own builtins. Consumers get a working component set just by importing the package.
- **`Object3D` *is* the Transform.** Spatial entities store position/rotation/scale on `entity.object3D` directly — never a parallel copy. Non-spatial entities (`{ spatial: false }`) have `object3D === null` and are not in the render scene.
- **Import from `three/webgpu`**, never bare `three`, in any package that touches the scene graph — they are non-identical builds and mixing specifiers creates two `Object3D` classes.
- **`.js` extensions in relative TS imports** (`./foo.js` even though the file is `foo.ts`) — the repo's `moduleResolution: "Bundler"` + `isolatedModules` setup requires it. Copy an existing package's `import` lines.
- **Scheduler stage + registration order is load-bearing.** Stages run `fixed → variable → late`; within a stage, systems run in registration order. Kinematic movement (`@3jse/character`) registers *before* `@3jse/physics-rapier`'s system so the move is queued before `physics.step()` commits it. Document any ordering dependency in the system factory's doc comment.
- **Determinism.** Seed RNG; route time-scaling through one `worldDt = dt * scale` clock; make structural results reproducible. Replay/ghost/netcode all assume it.
- **Stable ids on load.** `createEntity`/`createLevel` accept an optional `id` so a loader (`@3jse/project`) rehydrates persisted ids instead of session-local counters. Don't reintroduce a hidden global counter as the only id source.
- **Testability via a virtual filesystem.** Anything that reads/writes project files works over a `Record<path, string>` map (see `@3jse/project`), so it's testable with no disk and is "recoverable without the editor" (`PROJECT_FORMAT.md`).

## Package scaffold

`packages/<name>/`:
- `package.json` — `"name": "@3jse/<name>"`, `"type": "module"`, `"main"`/`"types": "./src/index.ts"`, `exports: { ".": "./src/index.ts" }`, scripts `typecheck` (`tsc --noEmit -p tsconfig.json`) + `test` (`vitest run`), deps on `workspace:*` siblings, dev-deps `typescript` + `vitest` (+ `@types/three` if it imports three).
- `tsconfig.json` — `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }`.
- `src/index.ts` — the public barrel; explicit re-exports; the component-registration side-effect import last.
- `src/*.test.ts` — at least a smoke/round-trip test per module so `pnpm -r test` stays a real gate.
- After scaffolding: `pnpm install` (links the workspace), then `pnpm --filter @3jse/<name> typecheck && pnpm --filter @3jse/<name> test`.

## Evidence for engine work (not the game evidence report)

A game task uses `templates/EVIDENCE_REPORT.example.md` (core loop, screenshots, draw calls). Engine-package / roadmap-spike work uses instead:

- **The phase/deliverable's exit criterion, quoted**, then met / partially met / not met with specifics.
- **A round-trip or invariant proof** where the claim is structural (serialize→load→serialize byte-identical; parse→emit→re-parse behaviourally identical; N-frame headless sim settles / stays within bounds).
- **A benchmark table** where the claim is performance (min/avg/p95/max, % of frame budget, hardware named).
- **A routing ledger** (rung-0 search result · chosen approach · why · fallback).
- Written to `evidence/phase<N>-<slug>.md` and one line in `BUILD_TASKS.md` (phase · task · status · evidence file · commit).

## Verify before claiming done

- `pnpm -r typecheck` clean (includes `apps/editor`).
- `pnpm -r test` green — if it's red for an infrastructural reason (a package's vitest globbing vendored files), fix that first; a red workspace gate hides real regressions.
- `pnpm --filter @3jse/editor build` still succeeds if runtime/any editor dep changed.
- `node 3JSE_Harness_v0.1/scripts/verify-harness.mjs` PASS.
- New package added to this skill's rung-0 table and to `docs/FILE_INDEX.txt` if it's a harness file (engine packages under `packages/` are not).
