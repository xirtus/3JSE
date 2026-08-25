# GRASS_PLAN.md — Transform the forked TREE generator into a focused GRASS generator

## Overview
Transform the demicreatures tree generator (forked by copy into `grassgen/`) into a focused procedural **grass** generator. Keep the organism-agnostic render substrate (viewer, environment, ground, RNG, mutate/distance, color ramp, node-graph data model) and the most valuable reuse — the chain-walking tube mesher's wind-bone rig is replaced by the simpler skeleton-free per-vertex `windGlsl.js` bend keyed by a 0..1 blade-height swayFactor. The skeleton collapses to a clump-of-tillers builder; proportions drops trunk/leader physics; foliage becomes ground-tuft placement; the leaf card becomes a flat tapered blade ribbon. We add a `GrassSchema`, a blade-ribbon mesher, and a new **field/lawn** view (`InstancedMesh` scatter of one clump) toggled against the existing **specimen** view in the UI.

The single highest-risk constraint drives the wave ordering: **the gene schema and the `randomGenome` rng draw order must be pinned and changed atomically in one package before any downstream package builds against it.** Everything else codes against the frozen contracts in the Interfaces section.

---

## Module Map (every current `src/` file)

Legend: **KEEP** = use as-is, no edits. **ADAPT** = edit in place. **REPLACE** = gut and rewrite the body, same file name + export surface where possible. **DELETE** = remove file + its imports/tests.

| File | Verdict | Notes |
|---|---|---|
| `src/rng.js` | **KEEP** | `mulberry32` — organism-agnostic. |
| `src/colorRamp.js` | **KEEP** | `pigmentToColor` full HSL hue wheel. Grass uses it directly. |
| `src/mutate.js` | **KEEP** | Schema-agnostic (iterates `Object.keys(schema)`). Works unchanged on `GRASS_SCHEMA` as long as schema stays well-formed (tier/kind/range). Re-points its import to the renamed schema export (see Task 1 note). |
| `src/biosphere.js` | **KEEP** (light import fix) | Schema-agnostic phylogeny gen. Imports `FLORA_SCHEMA`, `randomGenome`, `mutate`. Keep behavior; the schema export name change in Task 1 ripples here as an import rename only. Not on any UI path today but keep it green. |
| `src/environment.js` | **KEEP** | IBL/HDR loader. Substrate. |
| `src/ground.js` | **KEEP** (optional ADAPT) | Dirt plane. Keep. Optional later: greener tint; not in scope. |
| `src/genomeSchema.js` | **REPLACE** | Becomes `GRASS_SCHEMA` (see Interfaces). Keep `clampField`, `genomeDistance`, `STRUCTURAL_FIELDS/PROPORTIONS_FIELDS/COSMETIC_FIELDS` derivation mechanism verbatim. Export `GRASS_SCHEMA` AND a back-compat alias `export const FLORA_SCHEMA = GRASS_SCHEMA;` so mutate/biosphere need zero edits. Owned by Task 1. |
| `src/genome.js` | **REPLACE** | New `NEUTRAL`, `computeEnvOffset`, `randomGenome` draw schedule (grass genes only), `resolve` (drops roots + skin; keeps skeleton→proportions→foliage), `speciesColor`. Owned by Task 1. |
| `src/skeleton.js` | **ADAPT** → clump-of-tillers builder | Collapse to: branchiness→0 (no recursive forking — keep the BFS but maxDepth=0 path is the norm), crank tillering (1..N basal blades), stemSpread for clump footprint (already wired!), replace per-LEVEL taper with along-BLADE taper, whole-blade arch from droop. Drop whorl/rosette post-passes. Owned by Task 2. |
| `src/proportions.js` | **ADAPT** | Keep verticality + wind + pipe-model-ish radius pass + arch. Drop trunk-base gravity sizing, leader clamp, root pipe-model, weep willow pass. Owned by Task 3. |
| `src/foliage.js` | **REPLACE** | Keep SoA layout, `writeCluster` field set, basis math, exposure, deterministic `0x1EAF1EAF` rng stream. Replace branch-segment iteration with per-tiller blade placement (or: blades ARE the skeleton, so foliage may emit zero or just decorative seed-heads). Owned by Task 4. |
| `src/branchMesh.js` | **ADAPT** → blade-ribbon mesher | Rename concept branch→culm/blade. Replace round-tube ring emission with a flat tapered RIBBON (2 edges + midrib crease). Keep chain walking, bounds, `nodeToBone`. **Wind:** drop the bone-rig (`bones_wind`) coupling; emit a per-vertex `swayFactor` attribute (blade-height 0..1) for the `windGlsl.js` bend. Owned by Task 5. |
| `src/leafMesh.js` | **DELETE** (or REPLACE-as-thin) | Tree leaf cards. If foliage emits no per-blade cards (blades are the mesh), delete entirely. If seed-heads are wanted, keep a thinned InstancedMesh. **Decision below: DELETE in v1; seed-heads deferred.** Owned by Task 4. |
| `src/leafTexture.js` | **ADAPT** → blade texture (or DELETE) | Superformula lobed leaf → thin-blade outline (long taper, midrib) OR drop textures entirely (ribbon geometry needs none). **Decision: DELETE in v1** — the ribbon is geometric; vertex color via colorRamp. Owned by Task 5 (it owns the mesh/material). |
| `src/barkMaterial.js` | **DELETE** | No bark. Replaced by a simple grass blade material inside the mesh/material task. Owned by Task 5. |
| `src/windGlsl.js` | **ADAPT** | The skeleton-free per-vertex bend. Reduce the `^1.5` ease (blades bend near-uniformly), raise amplitude, key on a `swayFactor` attribute. Keep `windDir`/`windStrength`/`uTime` uniforms + defaults. Owned by Task 6. |
| `src/windSolver.js` | **DELETE** | Hierarchical bone solver — not used by grass. Owned by Task 6. |
| `src/windSkinGlsl.js` | **DELETE** | Bone-texture skinning GLSL — not used. Owned by Task 6. |
| `src/roots.js` | **DELETE** | No roots. Owned by Task 1 (it owns `resolve`, which calls `growRootSystem`). |
| `src/skin.js` | **DELETE** | Dead SDF path. `resolve` no longer calls it. Owned by Task 1. |
| `src/archetype.js` | **DELETE** | Already dead/stale (categorical growthHabit/symmetry — superseded by continuous morphospace; nothing imports it on the live path). Owned by Task 7 (cleanup). Verify no live import first (grep showed none on the render path). |
| `src/dendrogram.js` | **DELETE** | Tree-of-descent viz; not on the grass UI. Owned by Task 7. |
| `src/gridRenderer.js` | **DELETE** | Legacy SDF grid renderer; superseded by mesh viewer. Owned by Task 7. |
| `src/stubs.js` | **DELETE** (verify) | Stub/placeholder module; grep for imports first. Owned by Task 7. |
| `src/envelope.js` | **KEEP** (verify) | Env envelope helpers — if used by genome/main keep; else Task 7 deletes. |
| `src/renderModes.js` | **ADAPT** | Rename branch/leaf mesh refs → culm/blade mesh. Retire AO-leaf path if leafMesh is deleted; keep lit/unlit/wireframe/normals/ao for the blade mesh. Owned by Task 7. |
| `src/presets.js` | **REPLACE** | New `GRASS_DEFAULT` + grass presets (Lawn, Meadow, Tussock, Reed, Ornamental, Wheat-ish). Drop tree categories. Owned by Task 8. |
| `src/main.js` | **ADAPT** | Swap `MORPH_GENES` + `GENE_SLIDER_ID` to grass genes; remove roots-tab + reveal-roots wiring; add field/specimen view toggle wiring. Keep slider-registry machinery + stats + preset modal. Owned by Task 9. |
| `src/viewer.js` | **ADAPT** | Keep substrate. Remove bone-DataTexture/windSolver block; wire `windGlsl` uniforms instead. Add field-vs-specimen mode (build clump once, scatter via `InstancedMesh`). Owned by Task 10. |
| `index.html` | **ADAPT** | Swap slider DOM (grass gene ids), drop Roots tab, add a view-mode toggle (Specimen / Field). Keep tab framework, control-panel CSS, stats, rendermode toolbar, presets modal shell. Owned by Task 9. |

### NEW files
| File | Owner | Purpose |
|---|---|---|
| `src/bladeMesh.js` | Task 5 | Blade-ribbon mesher + grass blade material (replaces branchMesh tube + barkMaterial). Could also be the adapted `branchMesh.js` renamed — **decision: NEW `bladeMesh.js`, DELETE `branchMesh.js`** so the diff is clean and tube-specific tests don't carry over. |
| `src/fieldScatter.js` | Task 10 | Pure data: deterministic clump transform set (positions/rotations/scales) for the field view. No three.js — Node-testable. Consumed by viewer. |
| `test/grassSchema.test.mjs` | Task 1 | Schema range/determinism. |
| `test/genome.test.mjs` (replace) | Task 1 | randomGenome determinism + draw order + resolve shape. |
| `test/skeleton.test.mjs` (replace) | Task 2 | Clump-of-tillers topology. |
| `test/proportions.test.mjs` (replace) | Task 3 | Arch/verticality monotonicity, no-NaN. |
| `test/foliage.test.mjs` (replace) | Task 4 | Blade/seed-head SoA determinism. |
| `test/bladeMesh.test.mjs` | Task 5 | Ribbon validity (vertex/tri counts, swayFactor range, bounds, no-NaN). |
| `test/windGlsl.test.mjs` (adapt) | Task 6 | GLSL string contract + defaults; calm→zero. |
| `test/fieldScatter.test.mjs` | Task 10 | Field scatter determinism + count. |

---

## Interfaces (frozen contracts — pin before downstream work)

### 1. `GRASS_SCHEMA` gene list (Task 1 owns; everyone codes against these names)

Tiers drive `mutate.js` rates (structural rare, proportions moderate, cosmetic frequent) and `genomeDistance` weights. All genes `kind:'continuous'` except `structuralSeed` (`kind:'seed'`). Ranges chosen so the **neutral vector is a believable mid lawn blade** and identity defaults are no-ops.

```
STRUCTURAL
  tillerCount     [0,1]   fractional basal blade count → blades ∈ [1,12] (1 + tillerCount*11)
  clumpSpread     [0,1]   basal footprint radius (reuses skeleton stemSpread mechanism); 0 = single point
  bladeSegments   [0,1]   internode count per blade → segments ∈ [3,8] (3 + round(*5))
  seedHead        [0,1]   0 = no inflorescence, 1 = full seed head/panicle at blade tips
  fanSpread       [0,1]   azimuthal fan angle of the tiller bases (replaces radialOrder); 0 = all parallel
PROPORTIONS
  bladeLength     [0,1]   world-height of a full blade → [0.15, 2.2] m
  bladeWidth      [0,1]   base ribbon half-width → [0.004, 0.05] m
  bladeTaper      [0,1]   along-blade width falloff; 0 = parallel-sided, 1 = needle tip
  arch            [0,1]   whole-blade gravitational bow; 0 = stiff upright, 1 = strong droop/cascade
  curve           [0,1]   in-plane S/C lateral curvature of the blade (deterministic, no rng)
  stiffness       [0,1]   wind/arch resistance (1 = rigid, 0 = floppy); maps to swayFactor amplitude + arch scale
  verticality     [0,1]   0 = prostrate/creeping, 0.5 = erect, 1 = strongly pendulous (kept from proportions)
  tipDroop        [0,1]   extra droop concentrated in the distal third (separate from whole-blade arch)
COSMETIC
  pigment         [0,1]   hue along colorRamp (kept; green-ish neutral ~0.30)
  bladeRaggedness [0,1]   edge raggedness amplitude (vertex jitter on ribbon edge)
  colorVariation  [0,1]   per-blade hue/lightness spread within the clump
  jitter          [0,1.5] positional/azimuth noise amplitude (kept)
  midribStrength  [0,1]   midrib crease depth (geometry fold + shading); 0 = flat ribbon
  structuralSeed  seed    uint32 per-specimen jitter/curvature seed
```

19 genes (18 continuous + 1 seed). **Pin this list verbatim.** If a name must change, it changes here and ripples — but only Task 1 touches it.

### 2. `randomGenome(env, seed) -> genome` draw order (Task 1 owns; determinism-critical)

FIXED draw order, documented in the file header exactly as demicreatures did. Proposed order (structural→proportions→cosmetic, seed last among cosmetics except structuralSeed which is the final draw):

```
Draw 01 tillerCount     Draw 08 bladeWidth      Draw 14 pigment
Draw 02 clumpSpread     Draw 09 bladeTaper      Draw 15 bladeRaggedness
Draw 03 bladeSegments   Draw 10 arch            Draw 16 colorVariation
Draw 04 seedHead        Draw 11 curve           Draw 17 jitter
Draw 05 fanSpread       Draw 12 stiffness       Draw 18 midribStrength
Draw 06 bladeLength     Draw 13 verticality     Draw 19 structuralSeed = (rng()*2**32)>>>0
Draw 07 (tipDroop)      ...
```
(Exact slot numbers are at Task 1's discretion; the **rule** is: one rng draw per continuous gene in a fixed documented order, `pigment` may map the draw directly to its full [0,1] range like demicreatures did, `structuralSeed` is the final draw. Because grass starts from a fresh schema there is NO back-compat-with-old-seeds constraint — pick a clean order once and freeze it.)

`resolve(genome, env)` returns (frozen shape — viewer + renderModes code against this):
```
{
  graph,                 // { nodes, bones, meta } — solved (proportions applied in place)
  genome,                // the source genome (for re-deriving foliage with nodeToBone)
  boneCount: number,     // graph.bones.length  (stats panel)  — KEPT name even though "bone"≈blade segment
  lightDir: [x,y,z],     // graph.meta.lightDir
  pigment, colorVariation,
  bladeWidth, bladeTaper, midribStrength, bladeRaggedness,  // mesh params passthrough
  stiffness, arch,       // wind/material params
  foliage,               // SoA (seed-heads) — may be count:0 in v1
}
```
NOTE: `resolve` no longer imports/calls `growRootSystem` or `skin`. It calls `buildSkeleton` → `solveProportions` → `generateFoliage` only.

### 3. Graph node shape (Tasks 2,3,4,5 all read this — unchanged from tree where possible)

```
node = {
  pos: [x,y,z],
  radius: number,         // ribbon half-width at this node (set by proportions)
  weight: number,         // crossfade weight (tiller fade-in)
  branchLevel: 0,         // grass blades are all branchLevel 0 (no recursion); kept for foliage compat
  parentIdx: int,         // INVARIANT parentIdx < ownIndex  (parents emitted before children)
  isStem: true,           // every blade-chain node (replaces tree trunk/twig tags)
  isTerminal: bool,       // blade tip node (carries attachPos + tip behavior)
  swayBase: number,       // 0 at clump base, 1 at blade tip — drives windGlsl + arch (NEW, set by skeleton)
}
bones[] = { a, b }        // a = parent node idx, b = child node idx, a < b
meta = { bodyAxis:[0,1,0], lightDir:[x,y,z] }
```
`isWoody`, `isRoot`, `flatNormal` are REMOVED. proportions.js must not throw on their absence. Any consumer reading `branchLevel >= 1` (old foliage) must be rewritten for the all-level-0 grass graph.

### 4. Blade-ribbon mesher signature (Task 5 owns; viewer codes against it)

```
buildBladeGeometry(graph, opts = {}) -> {
  positions:  Float32Array(3*V),
  normals:    Float32Array(3*V),
  uvs:        Float32Array(2*V),   // u across blade width [0,1], v along blade length [0,1]
  ao:         Float32Array(V),     // [0.35,1] base-darker (kept for ao render mode)
  swayFactor: Float32Array(V),     // 0 at base → 1 at tip; per-vertex, drives windGlsl bend
  colorSeed:  Float32Array(V),     // per-blade [0,1] for colorVariation tint (constant within a blade)
  indices:    Uint32Array(3*T),
  vertexCount: V, triangleCount: T,
  bounds: { min:[x,y,z], max:[x,y,z] },
  nodeToBlade: Int32Array(nodes.length),  // node → blade index (-1 if not rendered); analog of nodeToBone
}
opts: { bladeWidth, bladeTaper, midribStrength, bladeRaggedness, radialSegsFor?(level) }
```
A blade is a flat ribbon: per chain node emit a LEFT and RIGHT edge vertex (and optionally a center midrib vertex if `midribStrength>0`) offset along the per-node in-plane width axis by `radius * rScale`. Tip collapses to a single apex. NO bone-rig tables. Determinism: pure function of graph + opts.

### 5. Wind contract (Task 6 owns GLSL; Task 5 emits the attribute; Task 10 wires uniforms)

```
GLSL fn:  vec3 windOffset(vec3 worldPos, float swayFactor)
Uniforms: uTime (float), uWindStrength (float), uWindDir (vec2 xz)
Attribute: aSwayFactor (float per vertex) — sourced from buildBladeGeometry().swayFactor
Guarantee: uWindStrength == 0 → windOffset returns vec3(0.0) exactly (every term × uWindStrength).
Grass tuning: ease exponent lowered from 1.5 toward ~1.0 (near-uniform blade bend), amplitude raised.
JS defaults: WIND_UNIFORM_DEFAULTS = { uTime:0, uWindStrength:0, uWindDir:[1,0] }
```
The blade material's vertex shader injects: `transformed += windOffset(worldPos, aSwayFactor);` BEFORE projection. Calm = exact rest pose.

### 6. Field-vs-specimen view (Task 10 owns viewer; Task 9 owns UI toggle)

`viewer.setViewMode('specimen' | 'field')`. See "Field-vs-Specimen Toggle" section for the full design and the `fieldScatter.js` contract.

---

## Dependency DAG / Wave Ordering

```
WAVE 1 (no deps — START HERE):
  Task 1  Schema + genome/resolve pipeline  (PINS all contracts: gene names, draw order, resolve shape, node shape)
  Task 6  Wind GLSL grass tuning            (independent: pure GLSL strings + defaults; depends only on the wind contract, which is fixed text)

WAVE 2 (depend on Task 1's frozen contracts; mutually disjoint files):
  Task 2  skeleton.js  → clump-of-tillers   (reads schema gene names + node shape contract)
  Task 4  foliage.js   → blade/seed-head SoA (reads node shape; emits SoA; v1 may be count:0)
  Task 7  Dead-file deletion + renderModes   (deletes roots/skin/archetype/dendrogram/gridRenderer/windSolver/windSkinGlsl/barkMaterial/leafMesh/leafTexture; renderModes rename)
  Task 8  presets.js   → grass presets       (reads final gene names; produces full gene vectors)

WAVE 3 (depend on Wave 2):
  Task 3  proportions.js → arch/verticality  (reads skeleton's node shape WITH swayBase; Task 2 must define it)
  Task 5  bladeMesh.js   → ribbon mesher      (reads solved graph from Task 3 contract + emits swayFactor for Task 6 attribute)

WAVE 4 (integration — depends on everything):
  Task 10 viewer.js     → wind uniforms + field/specimen scatter + fieldScatter.js
  Task 9  main.js + index.html → grass sliders, view toggle, drop roots tab

WAVE 5 (final):
  Task 11 Full-suite green + build clean (no code-owning; runs node --test + vite build, files only fixed by spawning targeted engineers)
```

Wave 2 runs ≤4 parallel (Tasks 2,4,7,8). Wave 3 runs 2 parallel (3,5). Wave 4 runs 2 parallel (9,10) — they touch disjoint files (main.js/index.html vs viewer.js/fieldScatter.js). No two parallel tasks share a file: Task 1 owns genome.js+genomeSchema.js; deletions (roots/skin) are owned by Task 1's resolve rewrite for the *import removal*, but the file *deletion* is Task 7 — **to avoid a conflict, Task 1 removes the imports/calls and Task 7 deletes the now-orphaned files; sequence Task 7 in Wave 2 AFTER confirming Task 1 merged.** (Both can't run truly parallel on the resolve→roots coupling; Task 7's deletes are safe once Task 1 has dropped the imports. Run Task 7 in Wave 2 but gate its roots.js/skin.js deletion on Task 1 completion — or simpler: **Task 1 deletes roots.js + skin.js itself** since it owns their only importer. Adopt that: Task 1 deletes roots.js, skin.js; Task 7 deletes the rest. Updated in tasks below.)

---

## Tasks

### Task 1: Grass schema + genome/resolve pipeline (the keystone)
- Scope:
  - REPLACE `src/genomeSchema.js`: define `GRASS_SCHEMA` per Interfaces §1; keep `clampField`, `genomeDistance`, tier-field derivation verbatim; `export const FLORA_SCHEMA = GRASS_SCHEMA;` alias so `mutate.js`/`biosphere.js` need no edits. Drop `FAUNA_SCHEMA_STUB`.
  - REPLACE `src/genome.js`: new `NEUTRAL`, `computeEnvOffset` (re-map env biases to grass genes — e.g. wind→lower verticality + higher stiffness, aridity→narrower/shorter blades, light→taller reaching), `randomGenome` with the fixed draw order (§2), `resolve` (skeleton→proportions→foliage only; NO roots, NO skin), `speciesColor`.
  - DELETE `src/roots.js` and `src/skin.js` (genome.js is their only live importer).
  - WRITE `test/grassSchema.test.mjs` + REPLACE `test/genome.test.mjs`.
  - DELETE `test/roots.test.mjs`, `test/roots-determinism.test.mjs`, `test/skin.test.mjs`.
- Depends on: none.
- Acceptance criteria:
  - [ ] `randomGenome(env, seed)` returns an object with exactly the 19 `GRASS_SCHEMA` fields; every field is within its schema range.
  - [ ] Same `(env, seed)` → deep-equal genome across two calls (determinism).
  - [ ] Changing `seed` by 1 changes ≥1 structural gene (draw order actually consumed).
  - [ ] `resolve(genome, env)` returns the frozen shape (§2): `graph` with `nodes`/`bones`/`meta`, `boneCount === graph.bones.length`, plus all listed passthrough fields; calling twice on same input is deep-equal.
  - [ ] No import of `roots.js`, `skin.js`, `archetype.js` anywhere in genome.js.
  - [ ] `node --test test/grassSchema.test.mjs test/genome.test.mjs test/mutate.test.js` passes (mutate still green via the alias).
- Complexity: large.
- Notes: This is the **riskiest, must-go-first** task. The draw order, gene names, resolve shape, and node shape are all pinned here and every downstream task quotes them. Provide the implementer the §1–§3 contracts verbatim. Because the schema is brand new there is NO old-seed back-compat constraint — pick a clean draw order and freeze it.

### Task 6: Grass wind GLSL tuning + cleanup
- Scope:
  - ADAPT `src/windGlsl.js`: lower the `pow(swayFactor, 1.5)` ease toward ~1.0 (near-uniform blade bend), raise primary/turb amplitudes (blades flex more than tree branches), keep `windDir`/`windStrength`/`uTime` uniforms + `WIND_UNIFORM_DECLS`/`WIND_FUNCTION_GLSL`/`WIND_UNIFORM_DEFAULTS`. Keep the calm-guarantee (every term × uWindStrength).
  - DELETE `src/windSolver.js`, `src/windSkinGlsl.js`.
  - ADAPT `test/windGlsl.test.mjs`; DELETE `test/windSolver.test.mjs`, `test/windSkinGlsl.test.mjs`.
- Depends on: none (pure text + the fixed wind contract §5).
- Acceptance criteria:
  - [ ] `WIND_FUNCTION_GLSL` defines `vec3 windOffset(vec3 worldPos, float swayFactor)`; signature unchanged.
  - [ ] String-level test asserts every amplitude term multiplies `uWindStrength` (calm→zero invariant).
  - [ ] `WIND_UNIFORM_DEFAULTS.uWindStrength === 0`.
  - [ ] No remaining import of `windSolver.js`/`windSkinGlsl.js` in the repo (grep clean after Task 10/5 land — note for Task 11).
  - [ ] `node --test test/windGlsl.test.mjs` passes.
- Complexity: small.
- Notes: Can run fully parallel with Task 1 — depends only on the fixed wind contract text, not on the schema.

### Task 2: skeleton.js → clump-of-tillers builder
- Scope: ADAPT `src/skeleton.js` to `buildSkeleton(genome, rng, jitterAmp=1.0)` producing a **clump of N blade-chains** (no recursive branching).
  - tillerCount → fractional basal blade count (reuse the existing fractional-crossfade idiom: full blades + 1 crossfade blade at fractional weight).
  - clumpSpread → basal footprint ring radius (the existing `stemSpread` mechanism — base nodes on a ring, base node pinned at ground).
  - fanSpread → azimuth distribution of tiller bases.
  - Each blade is a single chain of `bladeSegments` nodes from base to tip; set `swayBase` 0→1 along the chain; mark tip `isTerminal`; all nodes `isStem`, `branchLevel:0`, `parentIdx<ownIndex`.
  - bladeLength → chain length; curve → deterministic in-plane lateral arc (sin-hash of structuralSeed+blade index, no rng draw); arch handled by proportions (Task 3) but skeleton may set the initial near-vertical direction.
  - REMOVE: recursive BFS forking, whorl post-pass, rosette post-pass, leader/lateral split, `MAX_BONES=900` (lower to a grass-appropriate budget, e.g. 12 blades × 8 segs ≈ 96 + margin), `isWoody`/`isRoot` tags.
  - Keep `applySymmetry` only if fanSpread reuses it; otherwise inline a simpler azimuth fan.
  - REPLACE `test/skeleton.test.mjs`.
- Depends on: Task 1 (gene names, node shape, `swayBase`).
- Acceptance criteria:
  - [ ] `tillerCount=0` → exactly 1 blade chain; `tillerCount=1` → ~12 blade chains.
  - [ ] Every node has `branchLevel===0`, `isStem===true`, `parentIdx < ownIndex`; no node has `isWoody`/`isRoot`.
  - [ ] Exactly one `isTerminal` node per blade; `swayBase` is 0 at each blade's base node and 1 at its tip.
  - [ ] Same `(genome, rng-seed)` → deep-equal graph; `jitterAmp` does not change node/bone counts (RNG draw count invariant to jitterAmp — keep that invariant).
  - [ ] `clumpSpread=0` → all blade bases at the same XZ point (single-point clump); `clumpSpread=1` → bases spread on a ring of the documented max radius.
  - [ ] `node --test test/skeleton.test.mjs` passes.
- Complexity: large.
- Notes: This file is the densest tree logic; budget for a careful gutting. The fractional-crossfade continuity trick is worth keeping for the field view (so neighboring clumps with slightly different tillerCount don't pop).

### Task 4: foliage.js → blade/seed-head SoA
- Scope: REPLACE `src/foliage.js` `generateFoliage(graph, genome, opts)` returning the same SoA shape (`{count, position, normal, tangent, scale, rotation, ageColor, exposure, boneIndex, shape}`) so the leaf-instance consumer contract is stable, BUT:
  - v1 default: emit **seed-heads only** when `seedHead > 0` (small instanced cards/sprites at blade tips), else `count: 0`. Blades themselves are the mesh (Task 5), not foliage cards.
  - Keep the deterministic `mulberry32((structuralSeed ^ 0x1EAF1EAF))` stream, `writeCluster` math, exposure metric.
  - Replace branch-segment iteration (which assumed `branchLevel>=1`) with per-blade-tip iteration over `isTerminal` nodes.
  - `boneIndex` → reinterpret as `bladeIndex` via `opts.nodeToBlade` (analog of old nodeToBone); leave field present (default 0) for consumer compat.
  - REPLACE `test/foliage.test.mjs`.
- Depends on: Task 1 (node shape, schema).
- Acceptance criteria:
  - [ ] `seedHead===0` → `count === 0` (no instances), no NaN in buffers.
  - [ ] `seedHead>0` → one cluster of instances at each `isTerminal` tip; count scales monotonically with `seedHead`.
  - [ ] Same `(graph, genome)` → byte-identical SoA (deterministic stream).
  - [ ] SoA arrays are `Float32Array` of the documented strides; no value is `NaN`/`Infinity`.
  - [ ] `node --test test/foliage.test.mjs` passes.
- Complexity: medium.
- Notes: Keeping the SoA shape stable means Task 10's instance consumer (if seed-heads are rendered) needs no contract change. If v1 ships with `count:0` always, the seed-head render path is dormant but the interface is future-proof.

### Task 7: Dead-file deletion + renderModes rename
- Scope:
  - DELETE: `src/archetype.js`, `src/dendrogram.js`, `src/gridRenderer.js`, `src/barkMaterial.js`, `src/leafMesh.js`, `src/leafTexture.js`, and (verify-then-delete) `src/stubs.js`, `src/envelope.js` if unimported.
  - DELETE corresponding tests: `test/dendrogram.test.mjs`, `test/gridRenderer.test.mjs`, `test/leafTexture.test.mjs`, `test/branchMesh.test.mjs` (branchMesh → bladeMesh in Task 5; its old tube tests don't carry).
  - ADAPT `src/renderModes.js`: rename `branchMesh`→`culmMesh`/blade-mesh refs and `leafMesh` refs; if leafMesh is gone, drop the leaf-material override paths (keep bark→blade ao path against the new blade `ao` attribute). Keep lit/unlit/wireframe/normals/ao modes for the single blade mesh.
- Depends on: Task 1 must have removed roots/skin imports (Task 1 deletes those two files itself). Task 7's deletions are of files NOT imported by Task 1's output. **Grep each file for live imports before deleting** (archetype/dendrogram/gridRenderer/stubs/envelope were not on the render path per exploration, but verify).
- Acceptance criteria:
  - [ ] `grep -rn "from './archetype" src/` (and same for each deleted module) returns nothing.
  - [ ] `vite build` does not error on a missing module after deletions (run after viewer/main land — flag to Task 11).
  - [ ] renderModes exposes lit/unlit/wireframe/normals/ao for the blade mesh; `getMode()`/`setMode()`/`dispose()` unchanged.
- Complexity: medium.
- Notes: Pure subtraction + rename — low logic risk, but high "did I miss an import" risk. The grep-before-delete step is the gate. renderModes' rename must agree with viewer's exposed mesh names (Task 10) — coordinate the ref name (`viewer.culmMesh` vs keep `viewer.branchMesh` as the property name to minimize churn). **Decision: keep viewer's public property name as-is to avoid a cross-file rename; renderModes only changes internal leaf-path logic.** Re-scope: renderModes ADAPT = drop leaf-mat paths, keep branch(=blade)-mat paths. Simpler.

### Task 8: presets.js → grass presets
- Scope: REPLACE `src/presets.js`: `GRASS_DEFAULT` (a believable mid lawn blade clump — neutral-ish vector) + `PRESETS` array with grass forms: Lawn (short dense, high tillerCount, low bladeLength), Meadow (taller mixed), Tussock (big clump, high arch), Reed (tall stiff, low arch, low tillerCount), Ornamental/Fountain (high arch + tipDroop, cascade), Wheat-ish (seedHead high). Each `{ id, label, category, experimental, genome: {...GRASS_DEFAULT, ...overrides, structuralSeed} }`. Categories: e.g. Lawn / Meadow / Ornamental / Cereal / Wetland.
  - REPLACE `test/presets.test.mjs` (generic: every preset genome has all `GRASS_SCHEMA` fields, in range).
- Depends on: Task 1 (final gene names + ranges).
- Acceptance criteria:
  - [ ] Every preset's `genome` contains all 19 `GRASS_SCHEMA` fields, each within range (no missing field → no NaN).
  - [ ] `GRASS_DEFAULT` is exported and used as the spread base for every preset.
  - [ ] Distinct `structuralSeed` per preset.
  - [ ] Category strings match the set main.js/preset-modal will render (coordinate with Task 9's `CATEGORY_ORDER`).
  - [ ] `node --test test/presets.test.mjs` passes.
- Complexity: small.
- Notes: Coordinate `CATEGORY_ORDER` with Task 9 (shared constant value, not a shared file — Task 9 hardcodes the list in main.js; just agree on the strings).

### Task 3: proportions.js → arch/verticality grass solver
- Scope: ADAPT `src/proportions.js` `solveProportions(graph, envelope, genome)`:
  - KEEP: verticality rotation, wind structural response, a forward radius pass (ribbon half-width per node from `bladeWidth` × `bladeTaper` along `swayBase`/chain position), tip-taper-to-near-zero pass (blade tips taper to a point).
  - REPLACE the per-LEVEL pipe-model taper with along-BLADE taper: `radius(node) = bladeWidthBase * (1 - bladeTaper * swayBase)` (linear or eased), clamped ≥ tip floor.
  - REPLACE the deep-twig droop / weep willow pass with a **whole-blade arch**: bend each blade's chain progressively toward `arch` (and `tipDroop` concentrated distally), scaled by `stiffness` (1=stiff→~0 arch). Single Rodrigues per node, accumulating along the chain (parentIdx<ownIndex guarantees parents settle first).
  - DROP: trunk-base gravity sizing (`stemBaseRadius` physics), leader clamp, root pipe-model branch, `isFrond`/`isRoot` guards (but keep a tolerant guard: don't throw on missing tags). Keep the `parentIdx < ownIndex` ordering guard.
  - REPLACE `test/proportions.test.mjs`.
- Depends on: Task 2 (node shape with `swayBase`, all-level-0 graph). Wave 3.
- Acceptance criteria:
  - [ ] `arch=0, verticality=0.5, stiffness=1` → blades are straight and upright (tip directly above base within tolerance).
  - [ ] Increasing `arch` monotonically lowers mean tip Y (blades bow over).
  - [ ] Increasing `verticality` past 0.5 lowers tip elevation monotonically (pendulous); below 0.5 spreads outward (prostrate). No double-rotation (single combined Rodrigues with `arch`).
  - [ ] Radius decreases monotonically from base to tip; tip radius hits the documented floor.
  - [ ] No `NaN` in any node position/radius for the full gene range (fuzz a few extreme genomes).
  - [ ] Same `(graph, env, genome)` → deep-equal output; no rng used (zero-randomness guarantee kept).
  - [ ] `node --test test/proportions.test.mjs` passes.
- Complexity: large.
- Notes: This is where the grass "look" lives (arch + droop). Reuse the existing Rodrigues helpers and the single-combined-rotation discipline from the tree weep/droop code.

### Task 5: bladeMesh.js → blade-ribbon mesher + material
- Scope:
  - NEW `src/bladeMesh.js`: `buildBladeGeometry(graph, opts)` per §4 (flat tapered ribbon, left/right edge + optional midrib vertex per node, tip apex collapse, parallel-transport frame for the width axis, per-vertex `swayFactor` from `swayBase`, `colorSeed` per blade, `ao` base-darker, `nodeToBlade`). Also export a grass blade material factory `createBladeMaterial()` (MeshStandardMaterial or shader with `onBeforeCompile` injecting `windGlsl` `windOffset(worldPos, aSwayFactor)` into the vertex shader, vertex-color tint from `colorSeed`×`colorVariation`×`pigment` ramp, double-sided, no map). And a depth material for shadows mirroring the wind injection.
  - DELETE `src/branchMesh.js` (replaced).
  - NEW `test/bladeMesh.test.mjs`.
- Depends on: Task 3 (solved graph contract), Task 6 (windGlsl `windOffset` GLSL + attribute name `aSwayFactor`). Wave 3.
- Acceptance criteria:
  - [ ] Empty graph (0 bones) → zero-length typed arrays, `vertexCount/triangleCount===0`, never throws.
  - [ ] For a single straight blade of N nodes: vertex/triangle counts match the documented ribbon formula; `swayFactor` is 0 at base vertices and 1 at the tip apex.
  - [ ] `bladeTaper`/`bladeWidth`/`midribStrength`/`bladeRaggedness` opts change geometry; defaults give a flat parallel-sided ribbon.
  - [ ] `bounds` AABB contains all vertices; no `NaN` in any buffer.
  - [ ] `nodeToBlade` maps each rendered node to a valid blade index; `-1` for unrendered.
  - [ ] Pure function: two calls on same graph+opts → byte-identical arrays.
  - [ ] Material factory injects `windOffset(...)` (assert the GLSL token is present in the compiled vertex shader source string) and reads `aSwayFactor`.
  - [ ] `node --test test/bladeMesh.test.mjs` passes.
- Complexity: large.
- Notes: The mesher is the highest-value visual deliverable. Reuse branchMesh's chain-walking + bounds + parallel-transport scaffolding; swap ring emission for ribbon-edge emission. Material wind injection is GPU-only (not Node-testable) — the test asserts the token is present; rendering is user-verified.

### Task 9: main.js + index.html → grass UI + view toggle
- Scope:
  - ADAPT `src/main.js`: replace `MORPH_GENES` + `GENE_SLIDER_ID` with the 18 grass genes; keep the slider-registry machinery (loop wiring, label sync, `syncSlidersFromGenome`, climate sliders, seed/generate, stats poll, preset modal). Remove the reveal-roots IIFE + `setRootsRevealed` calls. Add a **Specimen / Field** view toggle wiring (`viewer.setViewMode`). Update `CATEGORY_ORDER` to grass categories (match Task 8). Import `GRASS_DEFAULT` instead of `TREE_DEFAULT`.
  - ADAPT `index.html`: swap slider DOM blocks to grass gene ids (`data-gene`/`data-display`), drop the Roots tab + its panel + reveal-roots button, retune tab set (e.g. Climate / Form / Blade / Posture / Look), add a view-mode toggle button group (Specimen / Field) near the rendermode panel. Keep tab framework JS, control-panel CSS, stats DOM, rendermode toolbar, presets-modal shell.
- Depends on: Task 1 (gene names), Task 8 (preset categories), Task 10 (`viewer.setViewMode` API). Wave 4.
- Acceptance criteria:
  - [ ] Every grass gene has a slider whose `id` is in `GENE_SLIDER_ID`, with matching `data-gene`/`data-display` in index.html; moving a slider mutates `genome[gene]` and re-resolves (manual/code review).
  - [ ] No reference to `setRootsRevealed`, roots tab, or tree-only gene ids remains.
  - [ ] View-toggle calls `viewer.setViewMode('specimen'|'field')`; default 'specimen'.
  - [ ] Preset modal renders the grass categories from Task 8; clicking a card loads its genome and syncs sliders.
  - [ ] App boots to `GRASS_DEFAULT` with no console errors (user-verified; no browser automation by the agent).
- Complexity: medium.
- Notes: main.js + index.html are a single owner here (they're tightly coupled by element ids) — do NOT split across parallel tasks. Disjoint from Task 10's files.

### Task 10: viewer.js → wind uniforms + field/specimen scatter
- Scope:
  - ADAPT `src/viewer.js`: keep all substrate (renderer/composer/Sky/lights/IBL/orbit/auto-fit/stats). Replace the bone-DataTexture + `windSolver` block with the simpler `windGlsl` path: per-frame set `uTime/uWindStrength/uWindDir` on the blade material (+ its depth material). Build branch→blade geometry via `buildBladeGeometry` + `createBladeMaterial`. Remove `growRootSystem`/roots references and the roots framing logic.
  - Implement `setViewMode('specimen'|'field')`:
    - **specimen**: render the single clump mesh (current single-mesh path).
    - **field**: scatter the SAME clump geometry via a THREE.InstancedMesh using transforms from `fieldScatter.js`. One geometry, one draw call, instanced. Auto-fit to the field bounds.
  - NEW `src/fieldScatter.js`: pure `computeFieldScatter(seed, opts) -> { count, matrices: Float32Array(16*count) | {position,rotationY,scale} SoA }`. Deterministic grid/jitter scatter (e.g. NxN grid + per-instance jitter + random Y-rotation + slight scale variance), seeded by `mulberry32`. No three.js.
  - NEW `test/fieldScatter.test.mjs`.
- Depends on: Task 5 (`buildBladeGeometry`/`createBladeMaterial`), Task 6 (wind uniforms), Task 3/2 (graph). Wave 4. Disjoint files from Task 9.
- Acceptance criteria:
  - [ ] `setViewMode('field')` uses ONE `InstancedMesh` (one geometry, instanced) — not N meshes; draw-call count stays low (stats panel shows it).
  - [ ] `computeFieldScatter(seed, opts)` is deterministic (same seed → identical transforms) and produces `count` transforms with no `NaN`.
  - [ ] Switching specimen↔field does not leak GPU resources (dispose old InstancedMesh on switch).
  - [ ] Wind toggle still animates blades (uWindStrength=0 → exact rest pose); applies in both views.
  - [ ] First `setPlant` still auto-frames; orbit state persists on subsequent calls.
  - [ ] `node --test test/fieldScatter.test.mjs` passes.
- Complexity: large.
- Notes: **Field-view perf decision (see section below): scatter ONE shared clump geometry via InstancedMesh — do NOT regenerate per-clump genomes in v1.** Per-clump variation comes from per-instance Y-rotation + scale jitter + the colorVariation already baked per-blade. Regenerating distinct genomes per clump is a future enhancement (would need per-instance geometry → many draw calls or a merged megamesh; explicitly deferred).

### Task 11: Full-suite green + clean build (integration gate)
- Scope: no file ownership. Run `node --test test/*.mjs test/*.js` and `npx vite build`. For each failure, spawn a targeted engineer scoped to the owning file. Grep the repo for any lingering imports of deleted modules (`roots`, `skin`, `archetype`, `dendrogram`, `gridRenderer`, `barkMaterial`, `leafMesh`, `leafTexture`, `windSolver`, `windSkinGlsl`, `branchMesh`).
- Depends on: all.
- Acceptance criteria:
  - [ ] `node --test` reports 0 failures across the surviving + new test files.
  - [ ] `vite build` completes with no unresolved-import errors.
  - [ ] No live import of any deleted module remains (grep clean).
- Complexity: medium.
- Notes: This is the loop that catches cross-task contract drift (especially gene-name typos and the wind attribute name `aSwayFactor`).

---

## Field-vs-Specimen Toggle (concrete design)

**Where the toggle lives:** a small two-button group (`Specimen` / `Field`) in `index.html` next to the existing `rendermode-panel`, wired in `main.js` to `viewer.setViewMode(mode)` (Task 9 owns the DOM; Task 10 owns the viewer API).

**Specimen view:** the current single-mesh path — `buildBladeGeometry(resolved.graph)` → one `THREE.Mesh` with the blade material; camera auto-fits the clump AABB. This is the design/authoring view (one clump, all sliders live).

**Field view:** build the clump geometry ONCE from the current resolved genome, then render it as a `THREE.InstancedMesh(clumpGeometry, bladeMaterial, count)`. Per-instance transforms come from `fieldScatter.computeFieldScatter(seed, { gridN, spacing, jitter, scaleVar })`:
- grid of `gridN × gridN` clumps at `spacing` intervals, centered on origin,
- per-instance XZ jitter (± a fraction of spacing),
- per-instance random Y-rotation (full 0..2π) so repetition is hidden,
- per-instance uniform scale jitter (± scaleVar).
The viewer writes these into `instanceMesh.setMatrixAt(i, m)` and auto-fits to the field AABB.

**Why InstancedMesh of one clump (not per-clump genomes) in v1:**
- One geometry + one material = one draw call for the entire field → trivially 60fps for hundreds of clumps.
- Per-clump variety is "free" via instance rotation/scale + the per-blade `colorVariation` already baked into the clump's vertex `colorSeed`.
- Regenerating a distinct genome per clump would require distinct geometry per clump (no shared instancing) → either N draw calls or a single merged megamesh rebuilt on every slider edit (expensive, GC-heavy). Explicitly **deferred**; the `fieldScatter` interface leaves room to later return per-instance genome seeds if we move to a merged-megamesh strategy.

**Wind in field view:** identical — `windOffset(worldPos, aSwayFactor)` uses world position, so each instance sways with the gust wave sweeping across the field (the spatial phase term makes neighbors slightly out of sync). No extra work beyond the shared material.

**LOD/perf notes:** v1 caps `gridN` (e.g. ≤ 24×24 = 576 clumps) and keeps `frustumCulled=false` on the InstancedMesh (the field spans the frustum). Triangle budget = clump-triangles × count; the blade ribbon is cheap (≈ segments×2 tris per blade), so a 12-blade clump ≈ a few hundred tris × 576 ≈ low-100k-tris — fine. If perf is an issue, lower `bladeSegments` or `gridN`; no dynamic LOD in v1.

---

## Test Strategy

**DELETE (tree-only, no grass analog):**
- `test/roots.test.mjs`, `test/roots-determinism.test.mjs` (no roots) — Task 1.
- `test/skin.test.mjs` (dead SDF) — Task 1.
- `test/windSolver.test.mjs`, `test/windSkinGlsl.test.mjs` (no bone wind) — Task 6.
- `test/dendrogram.test.mjs`, `test/gridRenderer.test.mjs`, `test/leafTexture.test.mjs` — Task 7.
- `test/branchMesh.test.mjs` (tube topology; replaced by bladeMesh) — Task 7.

**ADAPT/REPLACE (same concern, new behavior):**
- `test/genomeSchema.test.mjs` → grass schema (range/tier/clampField/genomeDistance) — Task 1 (or fold into new `grassSchema.test.mjs`).
- `test/genome.test.mjs` → randomGenome determinism + draw order + resolve shape — Task 1.
- `test/skeleton.test.mjs` → clump-of-tillers topology — Task 2.
- `test/proportions.test.mjs` → arch/verticality monotonicity + no-NaN + determinism — Task 3.
- `test/foliage.test.mjs` → seed-head SoA determinism + count:0 default — Task 4.
- `test/windGlsl.test.mjs` → grass wind contract (signature, calm→zero) — Task 6.
- `test/presets.test.mjs` → every grass preset in-range/complete — Task 8.
- `test/morphospace.test.mjs` → review: if it asserts continuous-genome crossfade continuity, ADAPT to grass gene set; else delete. (Inspect during Task 1; assign to Task 1.)
- `test/mutate.test.js` → KEEP (schema-agnostic; green via `FLORA_SCHEMA = GRASS_SCHEMA` alias). Its inline `makeFloraParent()` fixture uses tree gene names — UPDATE that fixture to grass gene names (Task 1 owns, since it owns the schema the fixture mirrors).

**NEW:**
- `test/grassSchema.test.mjs` — schema completeness, range, tier partition, determinism of clampField.
- `test/bladeMesh.test.mjs` — ribbon vertex/tri counts, swayFactor 0→1, bounds, no-NaN, empty-graph, GLSL token present.
- `test/fieldScatter.test.mjs` — scatter determinism, count, no-NaN, Y-rotation range.

**Determinism discipline (carry over verbatim):**
- `randomGenome` fixed rng draw order (Task 1) — one draw per gene, documented in header.
- `buildSkeleton` rng draw count invariant to `jitterAmp` (Task 2).
- `generateFoliage` isolated `^0x1EAF1EAF` stream (Task 4).
- `solveProportions` zero-randomness (Task 3).
- `fieldScatter` seeded mulberry32 (Task 10).
- Every "same input → deep-equal/byte-identical output" test mirrors demicreatures' existing determinism tests.

---

## Risks / Sequencing Notes

1. **RNG draw-order atomicity (highest risk).** Adding/removing a gene shifts every downstream draw in `randomGenome`. This MUST happen in exactly one package (Task 1) and be frozen before any downstream task. Mitigation: Task 1 is Wave 1, sole owner of `genome.js`+`genomeSchema.js`; the draw order is pinned in Interfaces §2 and quoted in the file header. No other task touches the draw schedule.

2. **Schema-name drift across parallel tasks.** Tasks 2/3/4/5/8/9 all reference grass gene names. A typo (`bladeWdith`) silently reads `undefined` → NaN. Mitigation: gene names pinned verbatim in §1; Task 11 grep + the in-range preset test (Task 8) + the no-NaN tests (Tasks 3,5) catch drift.

3. **Node-shape contract (`swayBase`, dropped `isWoody`/`isRoot`).** Task 3 (proportions) and Task 5 (mesher) both depend on Task 2 emitting `swayBase` and on proportions NOT throwing on missing `isFrond`/`isRoot`. Mitigation: §3 pins the node shape; proportions' guard is loosened (tolerant, not throwing). Sequenced: Task 2 (Wave 2) before Tasks 3/5 (Wave 3).

4. **Wind attribute name coupling.** Task 5 emits `swayFactor` → the mesher's `createBladeMaterial` must inject the attribute under the exact name Task 6's GLSL reads (`aSwayFactor`). Mitigation: pinned in §5; both are downstream of the fixed contract; Task 11 verifies the token in the compiled shader.

5. **Deletion vs import ownership.** `roots.js`/`skin.js` are imported only by `genome.js` → Task 1 deletes them itself (no cross-task conflict). All other deletions (Task 7) are of files off the live import path — but **grep-before-delete** is mandatory (archetype/dendrogram/gridRenderer/stubs/envelope must be confirmed unimported by the new code first).

6. **viewer.js is large and integration-heavy.** It currently couples to the bone wind system, roots framing, leaf cards, and bark material — all being removed. Task 10 is large; budget accordingly and keep the substrate (composer/Sky/lights/orbit) untouched to limit blast radius.

7. **Field megamesh temptation.** Resist per-clump genome regeneration in v1 (would explode draw calls or force per-edit megamesh rebuilds). InstancedMesh of one clump is the v1 contract; `fieldScatter` is designed to allow a later upgrade without re-architecting the toggle.

8. **`branchMesh`→`bladeMesh` rename + viewer property name.** To avoid a cross-file rename storm, keep `viewer.branchMesh` as the public property name (renderModes already references it) even though it now holds the blade mesh. Internal variable names can change; the public surface stays. (Noted in Task 7.)

9. **No test runner in package.json.** Tests run via `node --test test/*.mjs` (one stray `.js`). Task 11 should also consider adding a `"test": "node --test test/*.mjs test/*.js"` script (small QoL; optional, assign to Task 11 if desired). The fork "747 tests pass" figure is from `node --test`, not an npm script.
