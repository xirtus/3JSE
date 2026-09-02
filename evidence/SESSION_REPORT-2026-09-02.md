# Session report — 2026-09-02 — the net-new subsystem roadmap

Branch `harness-integration`, PR #1. End state: `pnpm gate` green — verify:harness PASS · **33
typecheck projects** · **388 tests** · editor build.

Built all nine content-production subsystems `docs/ENGINE_GAP_ANALYSIS.md` §6 sequenced, each as
a headless-first `@3jse/*` package with tests, plus editor panels for the ones that warrant one.

## New packages (8) + additions (2)

| Package | What | Tests |
|---|---|---|
| `@3jse/packaging` | Publish pipeline as data: `planBuild` (tree-shake / asset finalize / LOD drop / FNV hash / code-split / manifest+buildId), `checkPublishGate`, `publish` (manifest + NOTICES + index.html + editor-free bootstrap; pwa sw/webmanifest) | 11 |
| `@3jse/audio` | `MixerGraph` (bus tree + ducking), AudioSource/Listener/ReverbZone + `createAudioSystem` (pluggable backend), `AudioEventRouter`, musical grid + `MusicDirector` (24-PPQN MIDI clock) + `MidiOut` | 8 |
| `@3jse/ui` | Retained widget tree, `computeLayout` (flexbox subset), `resolveTree` (bind to `resource:`/`entity:` paths), `hitTest`, renderer seam, `HUDManager` | 6 |
| `@3jse/materials` | `MaterialGraph` + `validateGraph` + `compileToTSL` (deterministic three/tsl codegen) + `evaluateGraph` (CPU reference evaluator) | 9 |
| `@3jse/terrain` | `valueNoise2D`/`fbm`, `meshChunk` (heightfield → positions/normals/uvs/indices/AABB), `lodResolution`, `TerrainStreamer` bounded residency | 9 |
| `@3jse/foliage` | `scatterArea` seeded jittered-grid scatter with slope/height/exclusion/spline constraints, `toInstanceMatrices` | 7 |
| `@3jse/nav` | `bakeNavGrid`, `findPath` (octile A* + string-pull), `buildFlowField` (group pathing), `NavAgent` + system | 8 |
| `@3jse/vfx` | `sampleCurve`/`sampleGradient`, `ParticlePool` (SoA, seeded, cone spread, gravity/drag, cap), `ParticleEmitter` + `createParticleSystem` | 7 |
| `@3jse/animation` += | `retargetClip` (bone rename + rest-delta rotation compensation + hip-height scale), `autoMapSkeleton` | +7 (25) |
| `@3jse/networking` += | `PriorityAccumulator` (interest cull + falloff + starvation + byte budget), `HistoryBuffer` (rewind + `validateHit`), `WebSocketTransport` | +7 (14) |

## Editor panels wired (planned → active)

Packaging, Material Graph, Animation, Terrain / Water / Veg., Particles — each over its real
package. **Verified in Chrome/WebGPU, zero console errors:** Material Graph (validation + TSL +
CPU preview strip), Particles (live rAF ParticlePool on a canvas), Packages/Sequencer/Profiler/
Atlas from prior sessions still working. Chrome background-tab rAF throttling makes the live
sims advance slowly in screenshots — an environment artifact; headless tests cover the logic.

## What's left per subsystem (not the core — the depth/GPU/service half)

`docs/ENGINE_GAP_ANALYSIS.md` §6, "Left:" per item: the esbuild step + platform wrappers
(packaging); the Web Audio backend + mixer panel (audio); the DOM/canvas renderer + UI editor
(ui); a node-canvas editor + GPU preview (materials); chunk mesh → BufferGeometry + splat
material + paint tools (terrain/foliage); a polygon navmesh (nav); a relay/matchmaking service
(networking); the GPU compute path + VFX node graph (vfx); an anim-graph editing canvas
(animation). Plus Atlas v0.2 remaining lenses + live agent planning (G.10 / A.4).
