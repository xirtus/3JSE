// =============================================================================
// genome.js — GRASS genome layer (continuous morphospace)
//
// A genome is a flat object with one numeric gene per field in GRASS_SCHEMA.
// It is the single object passed to the render pipeline to produce all
// render-ready data for one grass specimen.
//
// CONTINUOUS MORPHOSPACE (No Man's Sky-style):
//   All genes are kind:'continuous' (float in [lo,hi]) except structuralSeed
//   which is kind:'seed' (uint32).
//
// RNG DRAW ORDER for randomGenome(env, seed):
//   Draws are consumed from mulberry32(seed) in a FIXED documented order.
//   This order is FROZEN — any change shifts subsequent draws for all seeds.
//   Structural genes (5):
//     Draw 01: tillerCount
//     Draw 02: clumpSpread
//     Draw 03: bladeSegments
//     Draw 04: seedHead
//     Draw 05: fanSpread
//   Proportions genes (8):
//     Draw 06: bladeLength
//     Draw 07: tipDroop
//     Draw 08: bladeWidth
//     Draw 09: bladeTaper
//     Draw 10: arch
//     Draw 11: curve
//     Draw 12: stiffness
//     Draw 13: verticality
//   Cosmetic genes (5 continuous + 1 seed):
//     Draw 14: pigment      (wide hue spread — full [0,1] range → full HSL hue wheel)
//     Draw 15: bladeRaggedness
//     Draw 16: colorVariation
//     Draw 17: jitter
//     Draw 18: midribStrength
//     Draw 19: structuralSeed  — (rng()*2**32)>>>0  (seeds skeleton + foliage)
//   Blade-silhouette genes (appended AFTER structuralSeed so its value — and
//   therefore all downstream structure — is byte-identical for existing seeds):
//     Draw 20: bladeShape
//     Draw 21: widestPos
//     Draw 22: crossSectionCurl
//     Draw 23: veining
//   Inflorescence genes (draws 24–28):
//     Draw 24: inflorescenceType
//     Draw 25: spikeletCount
//     Draw 26: grainsPerSpikelet
//     Draw 27: awnLength
//     Draw 28: midEarBulge
//     Draw 29: bladeTwist
//     Draw 30: stemRoundness
//   Color-stack species baselines (draws 31–34):
//     Draw 31: chlorophyll
//     Draw 32: senescence
//     Draw 33: anthoPropensity
//     Draw 34: glaucousness
//   Per-blade range maxima (draws 35–39; base gene = min):
//     Draw 35: bladeLengthMax   Draw 38: archMax
//     Draw 36: bladeWidthMax    Draw 39: tipDroopMax
//     Draw 37: bladeTaperMax
//
// NEUTRAL DEFAULTS — the sensible "mid lawn blade" plant:
//   tillerCount:     0.45  (≈6 blades: 1 + 0.45*11 ≈ 5.9)
//   clumpSpread:     0.30  (moderate spread)
//   bladeSegments:   0.40  (≈5 segments: 3 + round(0.40*5) = 5)
//   seedHead:        0.00  (no seed heads by default)
//   fanSpread:       0.50  (moderate fan spread)
//   bladeLength:     0.35  (mid lawn: 0.15 + 0.35*(2.2-0.15) ≈ 0.87 m)
//   tipDroop:        0.10  (slight tip droop)
//   bladeWidth:      0.45  (moderate ribbon width)
//   bladeTaper:      0.70  (moderately tapered — lawn-like)
//   arch:            0.25  (mild bow — not stiff, not drooping)
//   curve:           0.15  (slight lateral curve)
//   stiffness:       0.60  (fairly stiff)
//   verticality:     0.55  (slightly more erect than prostrate)
//   pigment:         0.30  (green-ish neutral — ~108° hue on HSL wheel)
//   bladeRaggedness: 0.10  (slightly ragged edge)
//   colorVariation:  0.20  (mild per-blade variety)
//   jitter:          0.40  (moderate positional noise)
//   midribStrength:  0.20  (subtle midrib crease)
//
// ENV→GENE BIAS TABLE (envOffset):
//   Neutral env: gravity=1, medium='air', light=0.6, wind=0.2, aridity=0.35, temperature=0.5
//   All offsets are 0 at the neutral env so only seedVariation applies.
//
//   wind (w, neutral=0.2):
//     windDelta = clamp((wind - 0.2) / 0.8, 0, 1)
//     verticality -= 0.20 * windDelta   (wind → low/prostrate)
//     stiffness   += 0.25 * windDelta   (wind → stiffer to resist bending)
//
//   aridity + temperature → narrow/short blades:
//     aridHeat = clamp(aridFrac*0.5 + tempFrac*0.5, -1, 1)
//     bladeLength -= 0.25 * aridHeat   (dry+hot → shorter blades)
//     bladeWidth  -= 0.20 * aridHeat   (dry+hot → narrower blades)
//
//   light (l, neutral=0.6):
//     lightDelta = clamp((0.6 - light) / 0.6, -1, 1)  (positive = dim)
//     bladeLength += 0.20 * lightDelta   (dim → reaching taller)
//
// SEED VARIATION (±spread, drawn in the fixed order above):
//   Most genes: ±0.12 of full range (small but visible variation)
//   pigment:    full [0,1] range (draw maps directly to [0,1])
//   jitter:     ±0.20 of range
//
// speciesColor → pigmentToColor (colorRamp.js, single source of truth):
//   Full HSL hue wheel — pigment 0→1 maps hue 0°→360° (S=0.55, L=0.42).
//
// resolve(genome, env) pipeline:
//   buildSkeleton → solveProportions → generateFoliage
//   NO roots. NO skin. Returns the frozen shape per §2 of GRASS_PLAN.md.
//
// Pure ESM — no three.js dependency.
// =============================================================================

import { mulberry32 }               from './rng.js';
import { buildSkeleton }            from './skeleton.js';
import { solveProportions }         from './proportions.js';
import { GRASS_SCHEMA, clampField } from './genomeSchema.js';
import { generateFoliage }          from './foliage.js';
import { pigmentToColor }           from './colorRamp.js';

// ---------------------------------------------------------------------------
// Neutral gene vector
// ---------------------------------------------------------------------------
// These are the sensible "mid lawn blade" defaults. envOffset and seedVariation
// are added on top of these values before clamping.
// ---------------------------------------------------------------------------

const NEUTRAL = Object.freeze({
  // Structural
  tillerCount:     0.45,
  clumpSpread:     0.30,
  bladeSegments:   0.40,
  seedHead:        0.00,
  fanSpread:       0.50,
  inflorescenceType: 0.00,  // no structured ear by default (legacy fan path)
  spikeletCount:     0.50,  // inert until inflorescenceType > 0
  grainsPerSpikelet: 0.50,  // inert until inflorescenceType > 0
  // Proportions
  bladeLength:     0.35,
  tipDroop:        0.10,
  bladeWidth:      0.45,
  bladeTaper:      0.70,
  arch:            0.25,
  curve:           0.15,
  stiffness:       0.60,
  verticality:     0.55,
  // Per-blade range maxima (base gene = min): blades vary within [min,max].
  bladeLengthMax:  0.55,  // height varies (min 0.35 → max 0.55)
  bladeWidthMax:   0.55,
  bladeTaperMax:   0.80,
  archMax:         0.40,
  tipDroopMax:     0.30,
  awnLength:       0.00,  // awnless by default
  midEarBulge:     0.50,  // uniform ear by default
  // Blade silhouette profile (consumed by bladeMesh.js; identity = linear taper)
  bladeShape:      0.15,  // mild lanceolate belly on average (0 = straight taper)
  widestPos:       0.45,  // widest just below mid-blade
  crossSectionCurl: 0.20, // gentle channel on average (0 = flat ribbon)
  bladeTwist:      0.00,  // untwisted by default
  stemRoundness:   0.00,  // flat blade by default (1 = round stalk/culm)
  // Cosmetic (pigment handled separately via seed draw)
  pigment:         0.30,
  bladeRaggedness: 0.10,
  colorVariation:  0.20,
  jitter:          0.40,
  midribStrength:  0.20,
  veining:         0.50,  // math-derived blade texture on by default (0 = smooth)
  // Condition-driven color: per-species baselines (env shifts the final axes).
  chlorophyll:     0.60,  // healthy green baseline
  senescence:      0.00,  // lush (not dried) baseline
  anthoPropensity: 0.00,  // does not redden by default
  glaucousness:    0.00,  // no waxy bloom by default
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp v to [lo, hi]. */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Compute environment-driven gene offsets (envOffset).
 *
 * All offsets are 0 at the neutral environment:
 *   gravity=1, medium='air', light=0.6, wind=0.2, aridity=0.35, temperature=0.5
 *
 * Returns a partial object with only the genes that need offsetting.
 * Absent genes default to 0 in the caller.
 */
function computeEnvOffset(env) {
  const {
    wind        = 0.2,
    aridity     = 0.35,
    temperature = 0.5,
    light       = 0.6,
  } = env;

  const offset = {
    tillerCount:     0,
    clumpSpread:     0,
    bladeSegments:   0,
    seedHead:        0,
    fanSpread:       0,
    inflorescenceType: 0,
    spikeletCount:     0,
    grainsPerSpikelet: 0,
    awnLength:         0,
    midEarBulge:       0,
    bladeLength:     0,
    tipDroop:        0,
    bladeWidth:      0,
    bladeTaper:      0,
    arch:            0,
    curve:           0,
    stiffness:       0,
    verticality:     0,
    bladeLengthMax:  0,
    bladeWidthMax:   0,
    bladeTaperMax:   0,
    archMax:         0,
    tipDroopMax:     0,
    bladeShape:      0,
    widestPos:       0,
    crossSectionCurl: 0,
    bladeTwist:      0,
    stemRoundness:   0,
    chlorophyll:     0,
    senescence:      0,
    anthoPropensity: 0,
    glaucousness:    0,
    pigment:         0,
    bladeRaggedness: 0,
    colorVariation:  0,
    jitter:          0,
    midribStrength:  0,
    veining:         0,
  };

  // --- wind → prostrate + stiff ---
  // windDelta: 0 at wind=0.2, range [0, 1]
  const windDelta = clamp((wind - 0.2) / 0.8, 0, 1);
  offset.verticality -= 0.20 * windDelta;
  offset.stiffness   += 0.25 * windDelta;

  // --- aridity + temperature → narrow/short blades ---
  // aridHeat: 0 at neutral (aridity=0.35, temp=0.5), range [-1, +1]
  const aridFrac = clamp((aridity - 0.35) / 0.65, -1, 1);
  const tempFrac = clamp((temperature - 0.5) / 0.5, -1, 1);
  const aridHeat = clamp(aridFrac * 0.5 + tempFrac * 0.5, -1, 1);
  offset.bladeLength -= 0.25 * aridHeat;
  offset.bladeWidth  -= 0.20 * aridHeat;

  // --- dim light → taller reaching blades ---
  // lightDelta: 0 at light=0.6, positive = dim
  const lightDelta = clamp((0.6 - light) / 0.6, -1, 1);
  offset.bladeLength += 0.20 * lightDelta;

  return offset;
}

/**
 * Draw seed variation for one gene.
 * spread is the half-width of the ±variation in [0,1] rng space.
 * Returns (draw - 0.5) * 2 * spread * rangeSpan.
 */
function seedVar(draw, spread, rangeSpan) {
  return (draw - 0.5) * 2 * spread * rangeSpan;
}

// ---------------------------------------------------------------------------
// randomGenome(env, seed) -> genome (flat object, all genes in GRASS_SCHEMA)
// ---------------------------------------------------------------------------

/**
 * Construct a random genome from a numeric seed and an environment envelope.
 *
 * Each gene is computed as:
 *   clampField(GRASS_SCHEMA, name, geneNeutral[name] + envOffset[name] + seedVariation(rng))
 *
 * The rng draws are consumed in the FIXED order documented at the top of this file.
 * Repeating with the same (env, seed) produces bit-identical output.
 *
 * Returns a plain (non-frozen) object with all GRASS_SCHEMA fields.
 */
export function randomGenome(env, seed) {
  const rng    = mulberry32(seed);
  const offset = computeEnvOffset(env);

  // Standard seed spread for most genes (±12% of range)
  const STD = 0.12;

  // Helper: build one continuous gene value
  function gene(name, spread) {
    const schema = GRASS_SCHEMA[name];
    const [lo, hi] = schema.range;
    const span  = hi - lo;
    const raw   = NEUTRAL[name] + offset[name] + seedVar(rng(), spread, span);
    return clampField(GRASS_SCHEMA, name, raw);
  }

  // --- Structural (draws 01–05) ---
  const tillerCount   = gene('tillerCount',   STD);   // draw 01
  const clumpSpread   = gene('clumpSpread',   STD);   // draw 02
  const bladeSegments = gene('bladeSegments', STD);   // draw 03
  const seedHead      = gene('seedHead',      STD);   // draw 04
  const fanSpread     = gene('fanSpread',     STD);   // draw 05

  // --- Proportions (draws 06–13) ---
  const bladeLength = gene('bladeLength', STD);       // draw 06
  const tipDroop    = gene('tipDroop',    STD);       // draw 07
  const bladeWidth  = gene('bladeWidth',  STD);       // draw 08
  const bladeTaper  = gene('bladeTaper',  STD);       // draw 09
  const arch        = gene('arch',        STD);       // draw 10
  const curve       = gene('curve',       STD);       // draw 11
  const stiffness   = gene('stiffness',   STD);       // draw 12
  const verticality = gene('verticality', STD);       // draw 13

  // --- Cosmetic (draws 14–18 continuous, 19 seed) ---
  // pigment: wide hue spread across the full [0,1] range (maps draw directly)
  const pigment         = clampField(GRASS_SCHEMA, 'pigment', rng());             // draw 14
  const bladeRaggedness = gene('bladeRaggedness', STD);                           // draw 15
  const colorVariation  = gene('colorVariation',  STD);                           // draw 16
  const jitter          = gene('jitter',          0.20);                          // draw 17
  const midribStrength  = gene('midribStrength',  STD);                           // draw 18

  // structuralSeed: a fresh uint32 from the rng. Kept at draw 19 (its original
  // slot) so that ALL downstream structure (skeleton + foliage, both seeded from
  // structuralSeed) stays byte-identical for every existing seed. New genes are
  // appended AFTER this draw (per the "append draws LAST" determinism norm).
  const structuralSeed = (rng() * 2 ** 32) >>> 0;                                // draw 19

  // --- Blade silhouette + cross-section genes (draws 20–22, appended after structuralSeed) ---
  const bladeShape       = gene('bladeShape',       STD);                        // draw 20
  const widestPos        = gene('widestPos',        STD);                        // draw 21
  const crossSectionCurl = gene('crossSectionCurl', STD);                        // draw 22
  const veining          = gene('veining',          STD);                        // draw 23

  // --- Inflorescence genes (draws 24–28) ---
  const inflorescenceType = gene('inflorescenceType', STD);                      // draw 24
  const spikeletCount     = gene('spikeletCount',     STD);                      // draw 25
  const grainsPerSpikelet = gene('grainsPerSpikelet', STD);                      // draw 26
  const awnLength         = gene('awnLength',         STD);                      // draw 27
  const midEarBulge       = gene('midEarBulge',       STD);                      // draw 28

  // --- Blade twist + stem roundness (draws 29–30) ---
  const bladeTwist        = gene('bladeTwist',        STD);                      // draw 29
  const stemRoundness     = gene('stemRoundness',     STD);                      // draw 30

  // --- Color-stack species baselines (draws 31–34) ---
  const chlorophyll       = gene('chlorophyll',       STD);                      // draw 31
  const senescence        = gene('senescence',        STD);                      // draw 32
  const anthoPropensity   = gene('anthoPropensity',   STD);                      // draw 33
  const glaucousness      = gene('glaucousness',      STD);                      // draw 34

  // --- Per-blade range maxima (draws 35–39). Drawn as the base gene + a
  //     positive spread so max ≥ min and clumps get natural per-blade variety. ---
  const bladeLengthMax = clampField(GRASS_SCHEMA, 'bladeLengthMax', bladeLength + 0.10 + rng() * 0.25); // draw 35
  const bladeWidthMax  = clampField(GRASS_SCHEMA, 'bladeWidthMax',  bladeWidth  + 0.05 + rng() * 0.15); // draw 36
  const bladeTaperMax  = clampField(GRASS_SCHEMA, 'bladeTaperMax',  bladeTaper  + rng() * 0.10);        // draw 37
  const archMax        = clampField(GRASS_SCHEMA, 'archMax',        arch        + 0.05 + rng() * 0.25); // draw 38
  const tipDroopMax    = clampField(GRASS_SCHEMA, 'tipDroopMax',    tipDroop    + 0.05 + rng() * 0.25); // draw 39

  return {
    // Structural
    tillerCount,
    clumpSpread,
    bladeSegments,
    seedHead,
    fanSpread,
    inflorescenceType,
    spikeletCount,
    grainsPerSpikelet,
    // Proportions
    bladeLength,
    tipDroop,
    awnLength,
    midEarBulge,
    bladeWidth,
    bladeTaper,
    arch,
    curve,
    stiffness,
    verticality,
    bladeLengthMax,
    bladeWidthMax,
    bladeTaperMax,
    archMax,
    tipDroopMax,
    bladeShape,
    widestPos,
    crossSectionCurl,
    bladeTwist,
    stemRoundness,
    // Cosmetic
    pigment,
    bladeRaggedness,
    colorVariation,
    jitter,
    midribStrength,
    veining,
    chlorophyll,
    senescence,
    anthoPropensity,
    glaucousness,
    structuralSeed,
  };
}

// ---------------------------------------------------------------------------
// computeColorAxes(genome, env) -> final pigment-stack color axes  [PURE]
//
// Condition-driven color: combines per-species seed BASELINES (chlorophyll,
// senescence, anthoPropensity, glaucousness, pigment=hue) with the ENVIRONMENT
// (fertility, aridity, temperature, light, sunAngle, starTemp) — the real-world
// drivers of grass color. Returns axis values in [0,1] consumed by the blade
// shader's pigment stack (and the JS swatch via colorRamp.colorStackRGB).
//
// Recomputed every resolve() so CLIMATE sliders shift color live (the env biases
// are NOT baked into the genome). Identity-ish defaults (neutral env, neutral
// genome) → today's healthy green. Star stage is a no-op at the Sun-like default.
// ---------------------------------------------------------------------------

/** Default Sun-like star temperature proxy (0=cool red dwarf … 1=hot blue-white). */
export const STAR_TEMP_SUN = 0.55;

export function computeColorAxes(genome, env) {
  const e = env || {};
  const fertility   = e.fertility   !== undefined ? e.fertility   : 0.5;
  const aridity     = e.aridity     !== undefined ? e.aridity     : 0.35;
  const temperature = e.temperature !== undefined ? e.temperature : 0.5;
  const light       = e.light       !== undefined ? e.light       : 0.6;
  const sunAngle    = e.sunAngle    !== undefined ? e.sunAngle    : 0.25;
  const starTemp    = e.starTemp    !== undefined ? e.starTemp    : STAR_TEMP_SUN;

  // Neutral-relative env terms (mirror computeEnvOffset conventions).
  const fertFrac = (fertility - 0.5) / 0.5;                 // -1..+1
  const aridUp   = clamp((aridity - 0.35) / 0.65, 0, 1);    // 0..1 (drought)
  const tempC    = -5 + temperature * 45;                   // env temp → °C (−5..40)
  const heatUp   = clamp((tempC - 22) / 18, 0, 1);          // 0..1 above ~22 °C
  const coldGate = clamp((20 - tempC) / 15, 0, 1);          // 1 at ≤5 °C, 0 at ≥20 °C
  const lightGate = clamp((light - 0.3) / 0.7, 0, 1);       // high light promotes antho/wax
  const dim       = clamp((0.6 - light) / 0.6, 0, 1);       // shade amount

  // Seed baselines.
  const chlorophyll   = genome.chlorophyll     !== undefined ? genome.chlorophyll     : 0.6;
  const senescenceG   = genome.senescence      !== undefined ? genome.senescence      : 0.0;
  const anthoProp     = genome.anthoPropensity !== undefined ? genome.anthoPropensity : 0.0;
  const glaucousG     = genome.glaucousness    !== undefined ? genome.glaucousness    : 0.0;
  const seedHead      = genome.seedHead        !== undefined ? genome.seedHead        : 0.0;

  // --- Axis combination (env + baseline), all clamped to [0,1] ---
  // Chlorophyll vigour: fertility ↑ green; drought ↓; mild shade ↑ (light-hoarding).
  const chlorophyllVigor = clamp(chlorophyll + 0.45 * fertFrac - 0.30 * aridUp + 0.10 * dim, 0, 1);
  // Senescence: drought + heat + a little maturity push green→gold→straw.
  const senescence = clamp(senescenceG + 0.45 * aridUp + 0.30 * heatUp + 0.12 * seedHead, 0, 1);
  // Anthocyanin: multiplicative cold×light gate, amplified by drought/low fertility,
  // scaled by species propensity (with a small floor so cold+bright still tints).
  const stressMult = 1 + 0.5 * aridUp + 0.5 * clamp(-fertFrac, 0, 1);
  const anthoTint  = clamp((0.30 + 0.70 * anthoProp) * coldGate * lightGate * stressMult, 0, 1);
  // Glaucous wax: a dry/high-sun ADAPTATION — only EXCESS aridity/light/sun/heat
  // above neutral adds wax, so well-watered shaded grass stays unwaxed.
  const lightUp = clamp((light - 0.6) / 0.4, 0, 1);
  const sunUp   = clamp((sunAngle - 0.5) / 0.5, 0, 1);
  const glaucousness = clamp(glaucousG + 0.50 * aridUp + 0.20 * lightUp + 0.15 * sunUp + 0.10 * heatUp, 0, 1);
  // Species hue (constrained green band; reinterprets the old `pigment` gene).
  const speciesHue = genome.pigment !== undefined ? genome.pigment : 0.30;

  // --- Star spectrum (OPTIONAL, speculative; no-op at the Sun-like default) ---
  // starWarm: signed star warmth (hot/F = +  → shader pushes yellow; cool/M = −
  //           → shader pushes red). 0 at the Sun-like default.
  // starDark: lightness multiplier — cool/dim stars darken the canopy (light-hoarding).
  const starWarm = starTemp - STAR_TEMP_SUN;                       // −0.55..+0.45, 0 = Sun
  const starDark = starWarm < 0 ? clamp(1 + starWarm * 0.9, 0.2, 1) : 1;

  return { chlorophyllVigor, senescence, anthoTint, glaucousness, speciesHue, starWarm, starDark };
}

// ---------------------------------------------------------------------------
// resolve(genome, env) -> render data  [PURE]
// ---------------------------------------------------------------------------

/**
 * Pure render-data pipeline from a genome + environment envelope.
 *
 * Pipeline: buildSkeleton → solveProportions → generateFoliage
 * NO roots. NO skin.
 *
 * Determinism contract:
 *   - Structural jitter uses mulberry32(genome.structuralSeed), a fresh rng
 *     created here each call. No shared mutable state is read or written.
 *   - solveProportions mutates the graph in-place, but the graph is created
 *     fresh every call, so repeated calls on the same (genome, env) pair
 *     produce deep-equal output.
 *
 * Returns (per §2 of GRASS_PLAN.md):
 *   {
 *     graph,              // { nodes, bones, meta } — solved (proportions applied in-place)
 *     genome,             // the source genome
 *     boneCount,          // graph.bones.length (stats panel)
 *     lightDir,           // graph.meta.lightDir
 *     pigment, colorVariation,
 *     bladeWidth, bladeTaper, midribStrength, bladeRaggedness,
 *     stiffness, arch,
 *     foliage,            // SoA (seed-heads) — may be count:0 in v1
 *   }
 */
export function resolve(genome, env) {
  // Fresh rng seeded from genome — never touches external state.
  const rng = mulberry32(genome.structuralSeed);

  // Build skeleton: grass clump-of-tillers.
  // jitterAmp defaults to 1.0 — genome.jitter is already read internally by
  // buildSkeleton (jAmp = genome.jitter * jitterAmp). Passing genome.jitter
  // here would square the jitter amplitude.
  const graph = buildSkeleton(genome, rng);

  // Solve proportions in-place (deterministic given same inputs).
  solveProportions(graph, env, genome);

  // Foliage: seed-head instance set (may be count:0 when seedHead===0).
  const foliage = generateFoliage(graph, genome);

  // Condition-driven color axes (genome baselines + live environment).
  const color = computeColorAxes(genome, env);

  return {
    graph,
    genome,
    boneCount:       graph.bones.length,
    lightDir:        graph.meta.lightDir,
    color,
    pigment:         genome.pigment,
    colorVariation:  genome.colorVariation,
    veining:         genome.veining,
    bladeWidth:      genome.bladeWidth,
    bladeTaper:      genome.bladeTaper,
    bladeShape:      genome.bladeShape,
    widestPos:       genome.widestPos,
    crossSectionCurl: genome.crossSectionCurl,
    bladeTwist:      genome.bladeTwist,
    stemRoundness:   genome.stemRoundness,
    midribStrength:  genome.midribStrength,
    bladeRaggedness: genome.bladeRaggedness,
    stiffness:       genome.stiffness,
    arch:            genome.arch,
    foliage,
  };
}

// ---------------------------------------------------------------------------
// speciesColor(genome) -> CSS color string  [single source of truth]
// ---------------------------------------------------------------------------

/**
 * Map genome.pigment ∈ [0, 1] to a CSS rgb() color string.
 *
 * Delegates to pigmentToColor (colorRamp.js) — the single source of truth
 * for the pigment→color mapping. UI swatches share the same color at any
 * pigment value.
 *
 * Full hue sweep: pigment 0→1 sweeps hue 0°→360° (HSL, S=0.55, L=0.42).
 */
export function speciesColor(genome) {
  const [r, g, b] = pigmentToColor(genome.pigment);
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(b * 255);
  return `rgb(${ri},${gi},${bi})`;
}
