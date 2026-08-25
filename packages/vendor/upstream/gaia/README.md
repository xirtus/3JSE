# grassgen

A browser prototype that **procedurally generates grass** and renders it with Three.js. No authored 3D models — every blade, seed head and field is derived from a continuous gene vector plus a deterministic seed. The only binary asset is a CC0 HDRI for lighting.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build (also the fastest "does it compile" check)
npm run preview    # serve the build
npm test           # node --test test/*.mjs test/*.js  (470 tests)
```

## How it works

Two halves that meet at `resolve(genome, env)`.

### Generation (pure ESM, no three.js, Node-testable)

```
PlanetEnvelope (gravity / medium / light / wind / aridity / temperature) + seed
  → randomGenome(env, seed)          genome.js        continuous gene vector, env-biased
  → buildSkeleton(genome, rng)       skeleton.js      clump of tiller chains (base → tip)
  → solveProportions(graph, env, g)  proportions.js   width taper, arch, droop — zero RNG
  → generateFoliage(graph, genome)   foliage.js       seed-head / grain instance set (SoA)
  → resolve(genome, env)             genome.js        sequences the above
```

**Determinism is load-bearing.** All randomness comes from `mulberry32` (`rng.js`); `(genome, env)` always produces an identical clump. `randomGenome` uses a fixed, documented RNG draw order — one draw per gene — so changing the count or order of draws reshuffles every downstream value.

`graph = { nodes:[{pos, radius, swayBase, parentIdx, isTerminal, ...}], bones:[{a,b}], meta }`, with the invariant `parentIdx < ownIndex`.

### Rendering (Three.js — visual, user-verified)

- **Blades**: `bladeMesh.js` walks the graph into one merged tapered-ribbon `BufferGeometry` (midrib crease, cross-section curl, twist, per-vertex `ao` / `swayFactor` / `colorSeed`). `createBladeMaterial()` is a `MeshStandardMaterial` with `onBeforeCompile` injecting the procedural blade texture and wind.
- **Seed heads**: an `InstancedMesh` of grains, structured per inflorescence type (wheat ear, panicle, spike…).
- **Wind**: `windGlsl.js` — skeleton-free per-vertex bend keyed on the `aSwayFactor` attribute. `uWindStrength = 0` is an exact rest pose.
- **Scene**: HDRI IBL (`environment.js`), procedural sky, sun + PCF soft shadows, ground plane, and an `EffectComposer` chain (`RenderPass → UnrealBloom → SMAA → OutputPass`). `OutputPass` does the single ACES tonemap — don't also set sRGB on the renderer.

### Views

| Toggle | Options |
|---|---|
| View mode | `specimen` (one clump, all sliders live) · `field` (one `InstancedMesh` scattered by `fieldScatter.js`) |
| Render style | `geometry` (real ribbons) · `billboard` (cross-quad cards, `billboardField.js`) |
| Render mode | lit · unlit · wireframe · normals · ao |

## Genes

39 genes in `GRASS_SCHEMA` (`genomeSchema.js`), tiers drive mutation rates and `genomeDistance`:

- **structural (8)** — `tillerCount`, `clumpSpread`, `bladeSegments`, `seedHead`, `fanSpread`, `inflorescenceType`, `spikeletCount`, `grainsPerSpikelet`
- **proportions (20)** — length/width/taper/arch/droop plus their `*Max` variation ranges, `bladeShape`, `widestPos`, `crossSectionCurl`, `bladeTwist`, `stemRoundness`, `awnLength`, `midEarBulge`
- **cosmetic (11)** — `pigment`, `chlorophyll`, `senescence`, `anthoPropensity`, `glaucousness`, `veining`, `colorVariation`, `bladeRaggedness`, `midribStrength`, `jitter`, `structuralSeed`

Lawn / meadow / cereal / wetland forms are **regions of this continuous space**, not `if (type === ...)` branches. `presets.js` holds 15 named gene-vector bookmarks across Lawn, Meadow, Ornamental, Cereal and Wetland — pure parameters, zero custom logic.

## UI

Left panel: preset dropdown + tabbed sliders (Climate / Form / Blade / Posture / Look). Morphological sliders edit the genome directly; **Generate** rolls a climate-adapted `randomGenome`; **↻** rerolls only the seed (a new individual of the same genes). Top-right: live fps / triangle / draw-call stats.

## Adding a gene

1. Add it to `GRASS_SCHEMA` with a tier, range, and an **identity default that is a no-op**.
2. Append its `randomGenome` draw **last**, after the current final draw.
3. Add it to `GRASS_DEFAULT` and every hand-built genome test fixture, or `genomeDistance` / `resolve` will `NaN`.

## Testing

Generation modules (`skeleton`, `proportions`, `foliage`, `genome`, `genomeSchema`, `bladeMesh`, `fieldScatter`, `windGlsl`, `mutate`, `presets`) import no three.js and are unit-tested with `node:test` — determinism (deep-equal on repeat), invariants (bone budget, `parentIdx < ownIndex`, no NaN), and directional behaviour (more `arch` → lower tips).

Rendering modules (`viewer`, `environment`, `ground`, `renderModes`, `billboardField`) are not unit-tested; their correctness is visual and user-verified. `npm run build` is the compile gate.

> ⚠️ GLSL injected via `onBeforeCompile` is compiled **only at runtime in the browser** — the build and the tests pass even when it's broken, and the mesh then silently vanishes. Verify identifiers against the installed three r160 source in `node_modules/three/src/renderers/shaders/`.

## Parked

`biosphere.js` (branch-mutate one ancestral genome into a family of species) and `mutate.js` are intact and tested but not on the UI path — that's the route to a whole-meadow ecology. `GRASS_PLAN.md` is the original transformation plan from the forked tree generator; the code has moved past it in places.
