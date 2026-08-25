// =============================================================================
// genome.test.mjs — contract tests for the GRASS genome layer
//
// Run: node --test test/genome.test.mjs
//
// Covers:
//   1. randomGenome determinism (same seed+env → deep-equal output)
//   2. All 19 GRASS_SCHEMA genes present and in range after randomGenome
//   3. Default-centered: at neutral env, gene means near neutral defaults
//   4. Env-bias direction asserts (wind, aridity+temp, dim light)
//   5. Changing seed by 1 changes ≥1 structural gene (draw order consumed)
//   6. resolve determinism (same genome+env → deep-equal output)
//   7. resolve returns the frozen §2 shape from GRASS_PLAN.md
//   8. speciesColor — CSS rgb() string with full-hue mapping
// =============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { randomGenome, resolve, speciesColor, computeColorAxes } from '../src/genome.js';
import { GRASS_SCHEMA, clampField }            from '../src/genomeSchema.js';
import { mutate }                              from '../src/mutate.js';
import { mulberry32 }                          from '../src/rng.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Neutral environment — all env offsets should be 0 at these values. */
const NEUTRAL_ENV = Object.freeze({
  gravity:     1,
  medium:      'air',
  light:       0.6,
  sunAngle:    0.25,
  wind:        0.2,
  aridity:     0.35,
  temperature: 0.5,
});

/** High wind environment. */
const HIGH_WIND_ENV = Object.freeze({ ...NEUTRAL_ENV, wind: 0.9 });

/** High aridity + high temperature environment. */
const HOT_DRY_ENV = Object.freeze({ ...NEUTRAL_ENV, aridity: 0.90, temperature: 0.95 });

/** Dim light environment. */
const DIM_LIGHT_ENV = Object.freeze({ ...NEUTRAL_ENV, light: 0.1 });

/** Return true iff every gene in the genome is within its GRASS_SCHEMA range. */
function isSchemaValid(genome) {
  for (const [field, gene] of Object.entries(GRASS_SCHEMA)) {
    const v = genome[field];
    if (gene.kind === 'continuous') {
      const [lo, hi] = gene.range;
      if (typeof v !== 'number' || v < lo || v > hi) return false;
    } else if (gene.kind === 'seed') {
      if ((v >>> 0) !== v) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Suite 1: randomGenome — determinism
// ---------------------------------------------------------------------------

describe('randomGenome — determinism', () => {

  it('same (env, seed) produces deep-equal genome on repeated calls', () => {
    for (const seed of [0, 1, 42, 0xDEADBEEF, 99999]) {
      const g1 = randomGenome(NEUTRAL_ENV, seed);
      const g2 = randomGenome(NEUTRAL_ENV, seed);
      assert.deepEqual(g1, g2, `seed ${seed}: randomGenome not deterministic`);
    }
  });

  it('different seeds produce different genomes', () => {
    const g1 = randomGenome(NEUTRAL_ENV, 1);
    const g2 = randomGenome(NEUTRAL_ENV, 2);
    const same = JSON.stringify(g1) === JSON.stringify(g2);
    assert.equal(same, false, 'different seeds produced identical genomes');
  });

  it('changing seed by 1 changes ≥1 structural gene (draw order consumed)', () => {
    const structuralGenes = ['tillerCount', 'clumpSpread', 'bladeSegments', 'seedHead', 'fanSpread'];
    let anyChanged = false;
    for (let seed = 0; seed < 50; seed++) {
      const g1 = randomGenome(NEUTRAL_ENV, seed);
      const g2 = randomGenome(NEUTRAL_ENV, seed + 1);
      if (structuralGenes.some(f => g1[f] !== g2[f])) {
        anyChanged = true;
        break;
      }
    }
    assert.ok(anyChanged, 'no structural gene changed when seed was incremented by 1');
  });

  it('neutral env and modified env produce different genomes for same seed', () => {
    const gNeutral = randomGenome(NEUTRAL_ENV, 42);
    const gWind    = randomGenome(HIGH_WIND_ENV, 42);
    const same = JSON.stringify(gNeutral) === JSON.stringify(gWind);
    assert.equal(same, false, 'different envs produced identical genomes at same seed');
  });

});

// ---------------------------------------------------------------------------
// Suite 2: randomGenome — all 19 genes in range
// ---------------------------------------------------------------------------

describe('randomGenome — all 39 GRASS_SCHEMA genes in range', () => {

  it('at neutral env, 50 seeds all produce schema-valid genomes', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = randomGenome(NEUTRAL_ENV, seed);
      assert.ok(isSchemaValid(g), `seed ${seed}: genome failed schema validation`);
    }
  });

  it('at high-wind env, 50 seeds all produce schema-valid genomes', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = randomGenome(HIGH_WIND_ENV, seed);
      assert.ok(isSchemaValid(g), `high-wind seed ${seed}: genome failed schema validation`);
    }
  });

  it('at hot-dry env, 50 seeds all produce schema-valid genomes', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = randomGenome(HOT_DRY_ENV, seed);
      assert.ok(isSchemaValid(g), `hot-dry seed ${seed}: genome failed schema validation`);
    }
  });

  it('genome has exactly the GRASS_SCHEMA fields — no more, no less', () => {
    const g = randomGenome(NEUTRAL_ENV, 7);
    const schemaFields = new Set(Object.keys(GRASS_SCHEMA));
    for (const field of Object.keys(g)) {
      assert.ok(schemaFields.has(field), `unexpected field in genome: ${field}`);
    }
    for (const field of schemaFields) {
      assert.ok(Object.prototype.hasOwnProperty.call(g, field),
        `genome missing field: ${field}`);
    }
  });

  it('structuralSeed is a valid uint32 (equals itself >>> 0)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = randomGenome(NEUTRAL_ENV, seed);
      assert.equal(g.structuralSeed >>> 0, g.structuralSeed,
        `seed ${seed}: structuralSeed ${g.structuralSeed} is not a uint32`);
    }
  });

  it('all genes pass clampField round-trip (value === clamp(value))', () => {
    const g = randomGenome(NEUTRAL_ENV, 13);
    for (const [field, gene] of Object.entries(GRASS_SCHEMA)) {
      if (gene.kind === 'seed') continue;
      const clamped = clampField(GRASS_SCHEMA, field, g[field]);
      assert.equal(clamped, g[field],
        `${field}=${g[field]} does not survive clampField (got ${clamped})`);
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 3: default-centered — neutral env offsets are ~0
// ---------------------------------------------------------------------------

describe('randomGenome — default-centered at neutral env', () => {

  it('gene means over 200 seeds at neutral env are near neutral defaults (±0.12 tol)', () => {
    // Neutral defaults from genome.js header
    const NEUTRAL_DEFAULTS = {
      tillerCount:   0.45,
      clumpSpread:   0.30,
      bladeSegments: 0.40,
      bladeLength:   0.35,
      bladeWidth:    0.45,
      bladeTaper:    0.70,
      arch:          0.25,
      stiffness:     0.60,
      verticality:   0.55,
    };

    const N = 200;
    const sums = {};
    for (const field of Object.keys(NEUTRAL_DEFAULTS)) sums[field] = 0;

    for (let seed = 0; seed < N; seed++) {
      const g = randomGenome(NEUTRAL_ENV, seed);
      for (const field of Object.keys(NEUTRAL_DEFAULTS)) {
        sums[field] += g[field];
      }
    }

    const TOL = 0.12;
    for (const [field, neutral] of Object.entries(NEUTRAL_DEFAULTS)) {
      const mean = sums[field] / N;
      assert.ok(
        Math.abs(mean - neutral) <= TOL,
        `${field}: mean ${mean.toFixed(3)} is not within ${TOL} of neutral ${neutral}`
      );
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 4: env-bias direction asserts
// ---------------------------------------------------------------------------

describe('randomGenome — env-bias directions', () => {

  function meanGene(env, field, N = 200) {
    let sum = 0;
    for (let seed = 0; seed < N; seed++) {
      sum += randomGenome(env, seed)[field];
    }
    return sum / N;
  }

  it('high wind → verticality BELOW neutral mean', () => {
    const vNeutral = meanGene(NEUTRAL_ENV, 'verticality');
    const vWind    = meanGene(HIGH_WIND_ENV, 'verticality');
    assert.ok(
      vWind < vNeutral,
      `verticality at high wind (${vWind.toFixed(3)}) should be below neutral (${vNeutral.toFixed(3)})`
    );
  });

  it('high wind → stiffness ABOVE neutral mean', () => {
    const sNeutral = meanGene(NEUTRAL_ENV, 'stiffness');
    const sWind    = meanGene(HIGH_WIND_ENV, 'stiffness');
    assert.ok(
      sWind > sNeutral,
      `stiffness at high wind (${sWind.toFixed(3)}) should exceed neutral (${sNeutral.toFixed(3)})`
    );
  });

  it('high aridity+temperature → bladeLength BELOW neutral mean', () => {
    const lNeutral = meanGene(NEUTRAL_ENV, 'bladeLength');
    const lHotDry  = meanGene(HOT_DRY_ENV, 'bladeLength');
    assert.ok(
      lHotDry < lNeutral,
      `bladeLength at hot-dry (${lHotDry.toFixed(3)}) should be below neutral (${lNeutral.toFixed(3)})`
    );
  });

  it('high aridity+temperature → bladeWidth BELOW neutral mean', () => {
    const wNeutral = meanGene(NEUTRAL_ENV, 'bladeWidth');
    const wHotDry  = meanGene(HOT_DRY_ENV, 'bladeWidth');
    assert.ok(
      wHotDry < wNeutral,
      `bladeWidth at hot-dry (${wHotDry.toFixed(3)}) should be below neutral (${wNeutral.toFixed(3)})`
    );
  });

  it('dim light → bladeLength ABOVE neutral mean', () => {
    const lNeutral = meanGene(NEUTRAL_ENV, 'bladeLength');
    const lDim     = meanGene(DIM_LIGHT_ENV, 'bladeLength');
    assert.ok(
      lDim > lNeutral,
      `bladeLength at dim light (${lDim.toFixed(3)}) should exceed neutral (${lNeutral.toFixed(3)})`
    );
  });

});

// ---------------------------------------------------------------------------
// Suite 5: pigment variety
// ---------------------------------------------------------------------------

describe('randomGenome — pigment variety', () => {

  it('pigment varies widely across seeds (spread > 0.5)', () => {
    let minP = Infinity;
    let maxP = -Infinity;
    for (let seed = 0; seed < 100; seed++) {
      const p = randomGenome(NEUTRAL_ENV, seed).pigment;
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
    }
    const spread = maxP - minP;
    assert.ok(spread > 0.5,
      `pigment spread over 100 seeds was only ${spread.toFixed(3)} — expected full hue variety`);
  });

});

// ---------------------------------------------------------------------------
// Suite 6: resolve — determinism
// ---------------------------------------------------------------------------

describe('resolve — determinism', () => {

  it('resolve(genome, env) is pure: same inputs → deep-equal output', () => {
    const g  = randomGenome(NEUTRAL_ENV, 42);
    const r1 = resolve(g, NEUTRAL_ENV);
    const r2 = resolve(g, NEUTRAL_ENV);
    // Check key structural fields
    assert.deepEqual(r1.boneCount,  r2.boneCount,  'boneCount differs');
    assert.deepEqual(r1.lightDir,   r2.lightDir,   'lightDir differs');
    assert.deepEqual(r1.pigment,    r2.pigment,    'pigment differs');
    assert.deepEqual(r1.stiffness,  r2.stiffness,  'stiffness differs');
    // Check graph structural identity
    assert.equal(r1.graph.nodes.length, r2.graph.nodes.length, 'graph.nodes.length differs');
    assert.equal(r1.graph.bones.length, r2.graph.bones.length, 'graph.bones.length differs');
  });

  it('different structuralSeed → different graph', () => {
    const g1 = randomGenome(NEUTRAL_ENV, 1);
    const g2 = { ...g1, structuralSeed: (g1.structuralSeed + 1) >>> 0 };
    const r1 = resolve(g1, NEUTRAL_ENV);
    const r2 = resolve(g2, NEUTRAL_ENV);
    // At least node positions should differ with a different seed
    const sameNodes = JSON.stringify(r1.graph.nodes) === JSON.stringify(r2.graph.nodes);
    assert.equal(sameNodes, false, 'different structuralSeeds produced identical graphs');
  });

  it('resolve does not mutate genome', () => {
    const g       = randomGenome(NEUTRAL_ENV, 7);
    const snapshot = JSON.stringify(g);
    resolve(g, NEUTRAL_ENV);
    assert.equal(JSON.stringify(g), snapshot, 'resolve mutated the genome');
  });

});

// ---------------------------------------------------------------------------
// Suite 7: resolve — output contract (§2 of GRASS_PLAN.md)
// ---------------------------------------------------------------------------

describe('resolve — output shape (§2 contract)', () => {

  it('boneCount > 0 for default genome at neutral env', () => {
    const g = randomGenome(NEUTRAL_ENV, 0);
    const r = resolve(g, NEUTRAL_ENV);
    assert.ok(typeof r.boneCount === 'number' && r.boneCount > 0,
      `boneCount should be > 0, got ${r.boneCount}`);
  });

  it('boneCount === graph.bones.length', () => {
    const g = randomGenome(NEUTRAL_ENV, 5);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.boneCount, r.graph.bones.length,
      `boneCount ${r.boneCount} !== graph.bones.length ${r.graph.bones.length}`);
  });

  it('graph has nodes and bones arrays', () => {
    const g = randomGenome(NEUTRAL_ENV, 0);
    const r = resolve(g, NEUTRAL_ENV);
    assert.ok(Array.isArray(r.graph.nodes) && r.graph.nodes.length > 0,
      'graph.nodes should be a non-empty array');
    assert.ok(Array.isArray(r.graph.bones),
      'graph.bones should be an array');
  });

  it('graph.meta has lightDir (3-element finite array)', () => {
    const g = randomGenome(NEUTRAL_ENV, 1);
    const r = resolve(g, NEUTRAL_ENV);
    assert.ok(Array.isArray(r.graph.meta.lightDir) && r.graph.meta.lightDir.length === 3,
      'graph.meta.lightDir should be a 3-element array');
    for (const v of r.graph.meta.lightDir) {
      assert.ok(typeof v === 'number' && isFinite(v),
        `graph.meta.lightDir contains non-finite: ${v}`);
    }
  });

  it('lightDir in output matches graph.meta.lightDir', () => {
    const g = randomGenome(NEUTRAL_ENV, 2);
    const r = resolve(g, NEUTRAL_ENV);
    assert.deepEqual(r.lightDir, r.graph.meta.lightDir);
  });

  it('pigment in output matches genome.pigment', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.pigment, g.pigment);
  });

  it('colorVariation in output matches genome.colorVariation', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.colorVariation, g.colorVariation);
  });

  it('bladeWidth in output matches genome.bladeWidth', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.bladeWidth, g.bladeWidth);
  });

  it('bladeTaper in output matches genome.bladeTaper', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.bladeTaper, g.bladeTaper);
  });

  it('midribStrength in output matches genome.midribStrength', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.midribStrength, g.midribStrength);
  });

  it('bladeRaggedness in output matches genome.bladeRaggedness', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.bladeRaggedness, g.bladeRaggedness);
  });

  it('stiffness in output matches genome.stiffness', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.stiffness, g.stiffness);
  });

  it('arch in output matches genome.arch', () => {
    const g = randomGenome(NEUTRAL_ENV, 9);
    const r = resolve(g, NEUTRAL_ENV);
    assert.equal(r.arch, g.arch);
  });

  it('genome passthrough in output matches source', () => {
    const g = randomGenome(NEUTRAL_ENV, 3);
    const r = resolve(g, NEUTRAL_ENV);
    assert.strictEqual(r.genome, g, 'genome passthrough should be the same object reference');
  });

  it('foliage present with count field', () => {
    const g = randomGenome(NEUTRAL_ENV, 0);
    const r = resolve(g, NEUTRAL_ENV);
    assert.ok(r.foliage !== undefined && r.foliage !== null, 'foliage field missing');
    assert.ok(typeof r.foliage.count === 'number', 'foliage.count should be a number');
    assert.ok(r.foliage.count >= 0, `foliage.count should be >= 0, got ${r.foliage.count}`);
  });

  // NOTE: foliage.count === 0 when seedHead === 0 is enforced by Task 4's
  // rewrite of foliage.js; the old tree foliage does not respect seedHead.
  // That acceptance criterion is tested in test/foliage.test.mjs (Task 4).

  it('tree-specific fields are absent from resolve output', () => {
    const g = randomGenome(NEUTRAL_ENV, 0);
    const r = resolve(g, NEUTRAL_ENV);
    // These were in the old tree resolve — should not appear in grass resolve
    for (const field of ['boneAData', 'boneBData', 'boneFlatData', 'blendK', 'materialMode',
                         'uRibbing', 'uSpininess', 'uSegmentation', 'leafSize', 'leafDensity',
                         'leafWidth', 'leafLength', 'leafTip', 'leafSerration', 'leafLobing',
                         'barkColor', 'barkPattern', 'ribbing', 'flatness', 'ribCount',
                         'lightFlux', 'woodiness']) {
      assert.equal(r[field], undefined,
        `tree-only field '${field}' should not appear in grass resolve output`);
    }
  });

  it('no import of roots.js or skin.js in genome.js (file-content check)', async () => {
    // Verify that genome.js does not import deleted modules
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../src/genome.js', import.meta.url), 'utf8');
    assert.ok(!src.includes("from './roots"), "genome.js must not import roots.js");
    assert.ok(!src.includes("from './skin"),  "genome.js must not import skin.js");
    assert.ok(!src.includes("from './archetype"), "genome.js must not import archetype.js");
  });

  it('resolve works across multiple envs without errors', () => {
    const envs = [NEUTRAL_ENV, HIGH_WIND_ENV, HOT_DRY_ENV, DIM_LIGHT_ENV];
    for (const env of envs) {
      const g = randomGenome(env, 1);
      const r = resolve(g, env);
      assert.ok(r.boneCount > 0, `resolve returned boneCount=0 for env wind=${env.wind}`);
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 8: mutate compatibility
// ---------------------------------------------------------------------------

describe('randomGenome → mutate round-trip schema validity', () => {

  it('mutate(randomGenome(neutral, seed), ...) produces a schema-valid child', () => {
    for (let seed = 0; seed < 20; seed++) {
      const parent = randomGenome(NEUTRAL_ENV, seed);
      const rng    = mulberry32(seed + 1000);
      const child  = mutate(parent, rng, 0.5);
      assert.ok(isSchemaValid(child),
        `seed ${seed}: mutate child failed schema validation`);
    }
  });

  it('mutate child has different structuralSeed from parent', () => {
    for (let seed = 0; seed < 20; seed++) {
      const parent = randomGenome(NEUTRAL_ENV, seed);
      const child  = mutate(parent, mulberry32(seed + 5000), 0.5);
      assert.notEqual(child.structuralSeed, parent.structuralSeed,
        `seed ${seed}: child structuralSeed unchanged after mutate`);
    }
  });

  it('mutate never modifies the parent genome', () => {
    const parent   = randomGenome(NEUTRAL_ENV, 77);
    const snapshot = JSON.stringify(parent);
    mutate(parent, mulberry32(88), 0.5);
    assert.equal(JSON.stringify(parent), snapshot, 'mutate mutated parent genome');
  });

  it('resolve(mutate_child, env) succeeds without error', () => {
    const parent = randomGenome(NEUTRAL_ENV, 55);
    const child  = mutate(parent, mulberry32(66), 0.5);
    const r = resolve(child, NEUTRAL_ENV);
    assert.ok(r.boneCount > 0, 'resolve on mutated child returned boneCount=0');
  });

});

// ---------------------------------------------------------------------------
// Suite 8b: computeColorAxes — condition-driven color (directional behavior)
// ---------------------------------------------------------------------------

describe('computeColorAxes — condition-driven color', () => {
  const baseGenome = randomGenome(NEUTRAL_ENV, 3);

  it('all axes are finite and in valid ranges at neutral env', () => {
    const c = computeColorAxes(baseGenome, NEUTRAL_ENV);
    for (const k of ['chlorophyllVigor', 'senescence', 'anthoTint', 'glaucousness', 'speciesHue']) {
      assert.ok(c[k] >= 0 && c[k] <= 1, `${k}=${c[k]} out of [0,1]`);
    }
    assert.ok(Number.isFinite(c.starWarm) && Number.isFinite(c.starDark), 'star terms finite');
  });

  it('higher fertility → higher chlorophyll vigor (greener)', () => {
    const lo = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, fertility: 0.1 });
    const hi = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, fertility: 0.9 });
    assert.ok(hi.chlorophyllVigor > lo.chlorophyllVigor,
      `fertility↑ should raise vigor (${lo.chlorophyllVigor} → ${hi.chlorophyllVigor})`);
  });

  it('drought (aridity↑) → more senescence (gold/straw)', () => {
    const lo = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, aridity: 0.35 });
    const hi = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, aridity: 0.95 });
    assert.ok(hi.senescence > lo.senescence,
      `aridity↑ should raise senescence (${lo.senescence} → ${hi.senescence})`);
  });

  it('cold + bright light → anthocyanin tint; warm → none', () => {
    const cold = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, temperature: 0.05, light: 0.95 });
    const warm = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, temperature: 0.7,  light: 0.95 });
    assert.ok(cold.anthoTint > warm.anthoTint, 'cold+light should reden more than warm');
    assert.ok(warm.anthoTint < 0.05, `warm should have ~no anthocyanin, got ${warm.anthoTint}`);
  });

  it('anthocyanin requires light (dark cold → little tint)', () => {
    const dark = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, temperature: 0.05, light: 0.1 });
    const lit  = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, temperature: 0.05, light: 0.95 });
    assert.ok(dark.anthoTint < lit.anthoTint, 'cold but dark should tint less than cold+bright');
  });

  it('aridity + sun → more glaucous wax', () => {
    const lo = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, aridity: 0.35, sunAngle: 0.1 });
    const hi = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, aridity: 0.95, sunAngle: 0.9 });
    assert.ok(hi.glaucousness > lo.glaucousness,
      `aridity+sun should raise glaucousness (${lo.glaucousness} → ${hi.glaucousness})`);
  });

  it('star: Sun-like default is a no-op (starWarm 0, starDark 1); cool star darkens', () => {
    const sun  = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, starTemp: 0.55 });
    assert.ok(Math.abs(sun.starWarm) < 1e-9, 'Sun starWarm ≈ 0');
    assert.equal(sun.starDark, 1, 'Sun starDark = 1');
    const cool = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, starTemp: 0.0 });
    assert.ok(cool.starWarm < 0, 'cool star warm < 0 (shader reddens)');
    assert.ok(cool.starDark < 1, 'cool star darkens');
    const hot = computeColorAxes(baseGenome, { ...NEUTRAL_ENV, starTemp: 1.0 });
    assert.ok(hot.starWarm > 0, 'hot star warm > 0 (shader yellows)');
  });

  it('deterministic: same (genome, env) → identical axes', () => {
    const a = computeColorAxes(baseGenome, NEUTRAL_ENV);
    const b = computeColorAxes(baseGenome, NEUTRAL_ENV);
    assert.deepEqual(a, b);
  });

  it('resolve() returns a color axes object', () => {
    const r = resolve(baseGenome, NEUTRAL_ENV);
    assert.ok(r.color && typeof r.color.chlorophyllVigor === 'number', 'resolve.color present');
  });
});

// ---------------------------------------------------------------------------
// Suite 9: speciesColor — full-hue HSL mapping
// ---------------------------------------------------------------------------

describe('speciesColor', () => {

  it('returns a CSS rgb() string', () => {
    const g = randomGenome(NEUTRAL_ENV, 1);
    const c = speciesColor(g);
    assert.ok(typeof c === 'string' && c.startsWith('rgb('),
      `speciesColor returned unexpected: ${c}`);
  });

  it('is deterministic: same pigment always produces same string', () => {
    for (const p of [0, 0.1, 0.30, 0.5, 0.7, 1.0]) {
      const c1 = speciesColor({ pigment: p });
      const c2 = speciesColor({ pigment: p });
      assert.equal(c1, c2, `speciesColor not deterministic at pigment=${p}`);
    }
  });

  it('pigment=0.33 (≈120° hue = green) has higher green component than red/blue', () => {
    const c = speciesColor({ pigment: 0.33 });
    const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/);
    assert.ok(m, `unexpected format: ${c}`);
    const [, r, g, b] = m.map(Number);
    assert.ok(g > r, `green channel ${g} should exceed red ${r} at pigment=0.33`);
    assert.ok(g > b, `green channel ${g} should exceed blue ${b} at pigment=0.33`);
  });

  it('distinct pigment values produce distinct colors', () => {
    const colors = new Set();
    for (let i = 0; i < 10; i++) {
      colors.add(speciesColor({ pigment: i / 10 }));
    }
    assert.equal(colors.size, 10,
      `expected 10 distinct colors across pigment 0..0.9, got ${colors.size}`);
  });

  it('clamps out-of-range pigment gracefully', () => {
    const cLow  = speciesColor({ pigment: -1 });
    const cHigh = speciesColor({ pigment: 2 });
    assert.ok(cLow.startsWith('rgb('),  `negative pigment: ${cLow}`);
    assert.ok(cHigh.startsWith('rgb('), `over-range pigment: ${cHigh}`);
    assert.equal(cLow,  speciesColor({ pigment: 0 }), 'pigment<0 should clamp to pigment=0');
    assert.equal(cHigh, speciesColor({ pigment: 1 }), 'pigment>1 should clamp to pigment=1');
  });

});
