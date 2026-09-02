# Session report — 2026-09-02b — the depth pass ("Left:" half of the gap roadmap)

Branch `harness-integration`, PR #1. End state: `pnpm gate` green — verify:harness PASS · **35
typecheck projects** · **410 tests** · editor build.

Continued the gap roadmap into its "Left:" half (`docs/ENGINE_GAP_ANALYSIS.md` §6 per-item
notes), **reuse-first** throughout — researched current best-in-class libraries via WebSearch and
adapted / deferred to them rather than reimplementing.

## Done (BUILD_TASKS.md G.10–G.15)

| # | What | Reuse decision | Tests |
|---|---|---|---|
| G.10 | **Viewport rendering** — `@3jse/render` (`TerrainRenderer` / `FoliageRenderer` / `ParticleRenderer`) turns the headless cores' typed-array output into live BufferGeometry / InstancedMesh / Points; editor `Viewport.tsx` drives them from `Terrain`/`FoliageField`/`ParticleEmitter` components. **Verified in Chrome: rolling terrain + scattered grass render live.** | No new dep — Three.js WebGPURenderer + BufferGeometry/InstancedMesh/Points is already the stack | 3 |
| G.11 | **`3jse` CLI** — `@3jse/cli`: `publish` runs `@3jse/packaging`, `info` lists the catalog | JS bundling defers to **esbuild** (dynamic optional import; `build.mjs` fallback) — no bundler reimplemented | 5 |
| G.12 | **Web Audio backend** — `@3jse/audio` `WebAudioBackend` (2D + HRTF spatial, buffer cache, click-free gain) | Wraps the **Web Audio API**'s own PannerNode / GainNode / AudioListener | +4 (12) |
| G.13 | **Polygon navmesh seam** — `@3jse/nav` `PolyNavMesh` + `createRecastNavMesh(query)` + `gridAsPolyNavMesh` fallback | Adapts **recast-navigation-js** (isaac-mason, MIT, `@recast-navigation/three` v0.43.1) as an optional peer; provenance in `packages/vendor/licenses.json`. Not ported. | +5 (13) |
| G.14 | **Reusable node canvas** — `@3jse/graph` `NodeCanvas` (model-agnostic pan/zoom/drag/select/bezier); Atlas System Map renders through it | Pure-3JSE glue; `edgePath` unit-tested | +3 (9) |
| G.15 | **Atlas v0.2 lenses** — `stateMachineLens` (§5.3), `gameplayFlowLens` (§5.2) | pure `AtlasModel` transforms | +2 (43) |

## Reuse research (WebSearch, 2026-09)

- **recast-navigation-js** `@recast-navigation/three` v0.43.1 — the standard WASM Recast/Detour
  port with three.js integration. → G.13 adapter.
- **three-vfx** (already vendored at `packages/vendor/upstream/three-vfx`) + Three.js WebGPU
  compute — the GPU particle path. → noted as the `ParticleRenderer` swap-in.
- **esbuild** — the bundler for `3jse publish`. → G.11 dynamic import.
- **postprocessing / troika-three-text / three-mesh-bvh** (already in `@3jse/extras`) — the
  post-process stack / UI text / terrain BVH raycasting when those land.

## Not done — genuinely blocked or deferred

- **Live LLM planning** behind Atlas "Ask agent" — the §28 scoped-context export + §30 preview
  are real; a planning loop needs an actual LLM (same posture as `AI_AGENT_API.md`'s PLAN stage).
- **Atlas Runtime Trace / Style / World / Rig lenses** + runtime event pulses + time scrubber
  (§5.5, §5.8, §5.10, §5.11, §26–27) — need instrumentation / data models that don't exist yet.
- **GPU particle compute path, TSL splat terrain material, paint tools, `pnpm add` of recast /
  esbuild** — the "polish + install" tail; the seams are all in place.
- **Phase 0 items 1–2** — a mid-range Windows laptop; a Rust toolchain + a running Tauri shell.
  Hardware/toolchain-bound.
