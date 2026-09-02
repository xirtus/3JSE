# Session report — 2026-09-02c — the install + polish tail

Continues `SESSION_REPORT-2026-09-02b.md`. That session merged the harness branch to `main` and
left a "polish + install tail" list in `RESUME.md`. This session closes items 2–5 of that list.
Everything reuse-first per the standing instruction ("best tools, don't reinvent — adapt recent
good GitHub projects").

Branch `main`, pushed. `pnpm gate` green throughout: `verify:harness` PASS · `pnpm -r typecheck`
clean (36 projects) · `pnpm -r test` **433 passing** · `pnpm --filter @3jse/editor build` OK.

## What shipped

### 1. `@3jse/cli` bundles for real (RESUME item 2a) — commit `86f885f`

`3jse publish` previously deferred JS bundling to a hand-run `build.mjs`. `esbuild` is now a real
dependency of `@3jse/cli` (`^0.24.2`, MIT — verified from the installed package.json), and
`runPublish`'s bundle callback runs `esbuild.build` with a stdin entry, `format: "esm"`,
`minify`, and `three` / `three/webgpu` / `three/tsl` marked `external` (they come from the host
page's import map). Output is written straight from `outputFiles[0].text`, nothing hits disk
mid-bundle. 5 CLI tests still green.

### 2. `@3jse/nav-recast` — real polygon navmesh bake (RESUME item 2b) — commit `86f885f`

Routing ledger:

| | |
|---|---|
| Capability | Bake a polygon navmesh from arbitrary THREE level geometry |
| Existing project solution | `@3jse/nav` has the `PolyNavMesh` **interface** + `createRecastNavMesh(query)` adapter + a grid fallback — but no actual bake |
| Selected | **recast-navigation-js** (`@recast-navigation/core` + `/three`, v0.43.1, MIT — isaac-mason; the standard WASM Recast/Detour port) via `threeToSoloNavMesh` |
| Why | It *is* Recast/Detour compiled to WASM with maintained three bindings; porting Recast would be thousands of lines of C++ translation for a strictly worse result |
| Fallback | `gridAsPolyNavMesh` (already in `@3jse/nav`) — same interface, no WASM |

New package `packages/nav-recast/` (kept separate so `@3jse/nav` stays WASM-free and three-free):

- `bakeRecastNavMesh(meshes, config?) -> Promise<PolyNavMesh>` — memoised `init()`, then
  `threeToSoloNavMesh`, then a `NavMeshQuery`, wrapped through `toRecastQuery` into the
  `RecastNavMeshQuery` shape `@3jse/nav`'s `createRecastNavMesh` consumes.
- `toRecastQuery(query)` — tuple↔`{x,y,z}` marshalling; `raycast` resolves a `startRef` via
  `findNearestPoly` and interprets Detour's `t > 1` as "segment cleared".
- `collectWalkable(root)` — gathers meshes, skipping `nav:ignore` subtrees.
- 6 tests, incl. a **real WASM bake** across a 20×20 ground plane (`findPath` returns a
  non-empty path, `closestPoint` snaps a raised point to the surface).

### 3. GPU particle render path (RESUME item 3) — commit `198eeeb`

three-vfx (vendored) was the candidate, but it is R3F-coupled and carries its own emitter/curve
simulation — adopting it would move particle-sim authority off the headless `@3jse/vfx` core and
out of vitest reach, against the headless-first convention. Correctly-scoped move instead:
`@3jse/render` `GpuParticleRenderer` — a **drop-in for `ParticleRenderer`** (identical
`sync(pools)` / `count` / `dispose`) that

- uses `PointsNodeMaterial` with `sizeNode` / `colorNode` / `opacityNode` — per-particle size
  and a soft round sprite mask evaluated in a **TSL node graph on the GPU** (square points →
  soft discs, additive blend);
- streams position / colour / size into `StorageBufferAttribute`s.

`@3jse/vfx` stays the single headless simulation authority. A full GPU-*compute* re-simulation
remains the deferred "GPU compute" row in `PERFORMANCE.md`. Editor `Viewport.tsx` now uses
`GpuParticleRenderer`. +1 test.

### 4. TSL splat terrain material + paint tools (RESUME item 4) — commit `4aeac50` (prev turn)

Landed last turn; ledger rows updated here. `@3jse/terrain` `splat.ts` (`createSplatMap` /
`paintSplat` circular brush / `sampleSplat` / `splatToTexture`), `@3jse/materials` `presets.ts`
(`splatTerrainGraph` / `waterGraph`), `@3jse/render` `terrainSplatMaterial` (RGBA `DataTexture`
+ TSL channel-mix, `updateSplat` re-upload). Fixed a **latent bug** surfaced by the first
realistic preset: neither the CPU evaluator nor the TSL codegen respected `edge.fromPin`
(`.r/.g/.b/.a` channel selection) — `mix`'s t-input always got a whole vec. Both paths now
swizzle. Editor terrain renders slope/height-seeded splat instead of flat green.

### 5. Atlas §5 lenses + Trace time scrubber (RESUME item 5) — commits `9acf95c`, `198eeeb`

`worldLens` (§5.10), `styleLens` (§5.8), `traceLens` + `TraceRecorder` + `pulseCounts` (§5.5),
`rigLens` (§5.11) — all pure `AtlasModel`/array transforms, all committed last turn with tests
(atlas suite now 48). This turn wired the **editor** side:

- `AtlasPanel` Trace lens gets a `TraceScrubber` — a play/pause `requestAnimationFrame` sweep
  and a seek slider over `TraceRecorder.span`. Revealed event nodes are those with
  `time <= playhead`; nodes that fired in the last 0.3 s **pulse** (`◉`, bright accent). A
  `pulseCounts` density strip shows the top emitting/reacting systems.
- `sampleScene.ts` seeds a short representative event burst so the lens has something to sweep
  before any sequence has played; the `CinematicSystem` still appends live.

## RESUME tail — final status

| Item | Status |
|---|---|
| 1. Merge PR #1 | done (prev turn) |
| 2. esbuild + recast-navigation install + wire | **done** — `86f885f`, `bd36355` |
| 3. GPU particle path | **done** — `198eeeb` (render-bridge tuning; full compute re-sim deferred by design) |
| 4. TSL splat material + paint tools | **done** — `4aeac50` |
| 5. Atlas Trace/Style/World/Rig lenses + pulses + scrubber | **done** — `9acf95c`, `198eeeb` |
| 6. Live LLM planning behind "Ask agent" | **blocked** — needs a real LLM; scoped-context export + change preview are real, planning deliberately not faked |
| 7. Phase 0 items 1–2 | **blocked** — needs a mid-range Windows laptop; a Rust toolchain + running Tauri shell |

Nothing tracked remains except the two hardware/LLM-blocked items.

## Provenance

`packages/vendor/licenses.json`: `@recast-navigation/core` + `/three` (0.43.1) and `esbuild`
(0.24.2, under `@3jse/cli`) moved from `npm-registry` / `optional-peer` to
`installed-package-json`; transitive `@recast-navigation/generators` + `/wasm` (both 0.43.1,
MIT) noted. `tools/license-scan.mjs` was run to confirm the MIT fields but its full rewrite was
**not** committed — it drops the hand-curated `vendored-upstream` / `vendor-registry` rows; the
licenses.json edits here are surgical.
