// =============================================================================
// grassSchema.test.mjs — contract tests for the GRASS_SCHEMA
//
// Run: node --test test/grassSchema.test.mjs
//
// Covers:
//   1. Gene catalogue: all 19 grass genes present with correct tier/kind/range
//   2. Derived tier field lists correct and frozen
//   3. clampField per-gene clamping
//   4. genomeDistance: zero identity, symmetry, [0,1] range, tier weights
//   5. FLORA_SCHEMA alias points to GRASS_SCHEMA (mutate.js compat)
// =============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRASS_SCHEMA,
  FLORA_SCHEMA,
  STRUCTURAL_FIELDS,
  PROPORTIONS_FIELDS,
  COSMETIC_FIELDS,
  clampField,
  genomeDistance,
} from '../src/genomeSchema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** mulberry32 — deterministic PRNG. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 4294967296;
  };
}

/** Build a mid-range sample genome with every gene set to the midpoint of its range. */
function makeSampleGenome() {
  const g = {};
  for (const [field, gene] of Object.entries(GRASS_SCHEMA)) {
    if (gene.kind === 'continuous') {
      const [lo, hi] = gene.range;
      g[field] = (lo + hi) / 2;
    } else if (gene.kind === 'seed') {
      g[field] = 0xCAFEBABE >>> 0;
    }
  }
  return g;
}

/** Return true iff the genome passes schema validity. */
function isSchemaValid(genome, schema) {
  for (const [field, gene] of Object.entries(schema)) {
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
// Expected gene catalogue (19 genes per §1 of GRASS_PLAN.md)
// ---------------------------------------------------------------------------

const EXPECTED_STRUCTURAL = [
  'tillerCount', 'clumpSpread', 'bladeSegments', 'seedHead', 'fanSpread',
  'inflorescenceType', 'spikeletCount', 'grainsPerSpikelet',
];

const EXPECTED_PROPORTIONS = [
  'bladeLength', 'bladeWidth', 'bladeTaper', 'arch', 'curve',
  'stiffness', 'verticality', 'tipDroop',
  'bladeShape', 'widestPos', 'crossSectionCurl',
  'bladeTwist', 'stemRoundness', 'awnLength', 'midEarBulge',
  'bladeLengthMax', 'bladeWidthMax', 'bladeTaperMax', 'archMax', 'tipDroopMax',
];

const EXPECTED_COSMETIC = [
  'pigment', 'bladeRaggedness', 'colorVariation', 'jitter',
  'midribStrength', 'veining',
  'chlorophyll', 'senescence', 'anthoPropensity', 'glaucousness',
  'structuralSeed',
];

const EXPECTED_RANGES = {
  // Structural
  tillerCount:     [0, 1],
  clumpSpread:     [0, 1],
  bladeSegments:   [0, 1],
  seedHead:        [0, 1],
  fanSpread:       [0, 1],
  inflorescenceType: [0, 1],
  spikeletCount:     [0, 1],
  grainsPerSpikelet: [0, 1],
  // Proportions
  bladeLength:     [0, 1],
  bladeWidth:      [0, 1],
  bladeTaper:      [0, 1],
  arch:            [0, 1],
  curve:           [0, 1],
  stiffness:       [0, 1],
  verticality:     [0, 1],
  tipDroop:        [0, 1],
  bladeLengthMax:  [0, 1],
  bladeWidthMax:   [0, 1],
  bladeTaperMax:   [0, 1],
  archMax:         [0, 1],
  tipDroopMax:     [0, 1],
  bladeShape:      [0, 1],
  widestPos:       [0, 1],
  crossSectionCurl: [0, 1],
  bladeTwist:      [0, 1],
  stemRoundness:   [0, 1],
  awnLength:       [0, 1],
  midEarBulge:     [0, 1],
  // Cosmetic (continuous)
  pigment:         [0, 1],
  bladeRaggedness: [0, 1],
  colorVariation:  [0, 1],
  jitter:          [0, 1.5],
  midribStrength:  [0, 1],
  veining:         [0, 1],
  chlorophyll:     [0, 1],
  senescence:      [0, 1],
  anthoPropensity: [0, 1],
  glaucousness:    [0, 1],
};

// ---------------------------------------------------------------------------
// Suite 1: Schema catalogue — 19 genes
// ---------------------------------------------------------------------------

describe('GRASS_SCHEMA — gene catalogue', () => {

  it('schema has exactly 39 genes', () => {
    assert.equal(Object.keys(GRASS_SCHEMA).length, 39,
      `expected 39 genes, got ${Object.keys(GRASS_SCHEMA).length}: ${Object.keys(GRASS_SCHEMA).join(', ')}`);
  });

  it('all 8 structural genes present with correct tier/kind/range', () => {
    for (const field of EXPECTED_STRUCTURAL) {
      const gene = GRASS_SCHEMA[field];
      assert.ok(gene, `${field} missing from GRASS_SCHEMA`);
      assert.equal(gene.tier, 'structural', `${field}: expected tier 'structural'`);
      assert.equal(gene.kind, 'continuous', `${field}: expected kind 'continuous'`);
      const [elo, ehi] = EXPECTED_RANGES[field];
      assert.deepEqual(
        Array.from(gene.range),
        [elo, ehi],
        `${field}: range mismatch — got [${gene.range}], want [${elo},${ehi}]`
      );
    }
  });

  it('all 20 proportions genes present with correct tier/kind/range', () => {
    for (const field of EXPECTED_PROPORTIONS) {
      const gene = GRASS_SCHEMA[field];
      assert.ok(gene, `${field} missing from GRASS_SCHEMA`);
      assert.equal(gene.tier, 'proportions', `${field}: expected tier 'proportions'`);
      assert.equal(gene.kind, 'continuous', `${field}: expected kind 'continuous'`);
      const [elo, ehi] = EXPECTED_RANGES[field];
      assert.deepEqual(
        Array.from(gene.range),
        [elo, ehi],
        `${field}: range mismatch — got [${gene.range}], want [${elo},${ehi}]`
      );
    }
  });

  it('all 11 cosmetic genes present with correct tier/kind/range', () => {
    for (const field of EXPECTED_COSMETIC) {
      const gene = GRASS_SCHEMA[field];
      assert.ok(gene, `${field} missing from GRASS_SCHEMA`);
      assert.equal(gene.tier, 'cosmetic', `${field}: expected tier 'cosmetic'`);
      if (field === 'structuralSeed') {
        assert.equal(gene.kind, 'seed', `structuralSeed: expected kind 'seed'`);
      } else {
        assert.equal(gene.kind, 'continuous', `${field}: expected kind 'continuous'`);
        const [elo, ehi] = EXPECTED_RANGES[field];
        assert.deepEqual(
          Array.from(gene.range),
          [elo, ehi],
          `${field}: range mismatch — got [${gene.range}], want [${elo},${ehi}]`
        );
      }
    }
  });

  it('every gene is either continuous or seed — no categorical or int kinds', () => {
    for (const [field, gene] of Object.entries(GRASS_SCHEMA)) {
      assert.ok(
        gene.kind === 'continuous' || gene.kind === 'seed',
        `${field}: unexpected kind '${gene.kind}'`
      );
    }
  });

  it('tree-only genes are absent from GRASS_SCHEMA', () => {
    const treeGenes = [
      'branchiness', 'branchFactorN', 'tillering', 'radialOrder', 'appendageBreadth',
      'appendageDensity', 'segmentation', 'trunkHeight', 'succulence', 'stemGirth',
      'taper', 'rigidity', 'ribbing', 'spininess', 'branchAngle', 'lengthRatio',
      'apicalBias', 'droopBias', 'leafSize', 'leafDensity', 'leafWidth', 'leafLength',
      'leafTip', 'leafSerration', 'leafLobing', 'barkColor', 'barkPattern', 'weep',
      'rootCount', 'rootDepth', 'rootSpread', 'rootFlare', 'rootButtress',
      'rootBranchiness', 'rootTaper',
    ];
    for (const field of treeGenes) {
      assert.equal(
        GRASS_SCHEMA[field],
        undefined,
        `tree gene '${field}' should not be in GRASS_SCHEMA`
      );
    }
  });

  it('FLORA_SCHEMA alias is the same object as GRASS_SCHEMA (back-compat)', () => {
    assert.strictEqual(FLORA_SCHEMA, GRASS_SCHEMA,
      'FLORA_SCHEMA must === GRASS_SCHEMA for mutate.js/biosphere.js compat');
  });

});

// ---------------------------------------------------------------------------
// Suite 2: Derived tier field lists
// ---------------------------------------------------------------------------

describe('STRUCTURAL_FIELDS / PROPORTIONS_FIELDS / COSMETIC_FIELDS', () => {

  it('STRUCTURAL_FIELDS matches exactly the 5 expected structural genes', () => {
    assert.deepEqual(
      [...STRUCTURAL_FIELDS].sort(),
      [...EXPECTED_STRUCTURAL].sort(),
      'STRUCTURAL_FIELDS content mismatch'
    );
  });

  it('PROPORTIONS_FIELDS matches exactly the 8 expected proportions genes', () => {
    assert.deepEqual(
      [...PROPORTIONS_FIELDS].sort(),
      [...EXPECTED_PROPORTIONS].sort(),
      'PROPORTIONS_FIELDS content mismatch'
    );
  });

  it('COSMETIC_FIELDS matches exactly the 6 expected cosmetic genes', () => {
    assert.deepEqual(
      [...COSMETIC_FIELDS].sort(),
      [...EXPECTED_COSMETIC].sort(),
      'COSMETIC_FIELDS content mismatch'
    );
  });

  it('the three tier lists together cover every field in GRASS_SCHEMA exactly once', () => {
    const allDerived = new Set([...STRUCTURAL_FIELDS, ...PROPORTIONS_FIELDS, ...COSMETIC_FIELDS]);
    for (const field of Object.keys(GRASS_SCHEMA)) {
      assert.ok(allDerived.has(field), `${field} missing from all three tier lists`);
    }
    assert.equal(
      allDerived.size,
      Object.keys(GRASS_SCHEMA).length,
      'combined tier lists have duplicate or extra entries'
    );
  });

  it('tier lists are frozen arrays', () => {
    assert.ok(Object.isFrozen(STRUCTURAL_FIELDS));
    assert.ok(Object.isFrozen(PROPORTIONS_FIELDS));
    assert.ok(Object.isFrozen(COSMETIC_FIELDS));
  });

});

// ---------------------------------------------------------------------------
// Suite 3: clampField
// ---------------------------------------------------------------------------

describe('clampField — per-gene clamping', () => {

  const PROBE_01 = [
    { input: -1,   expected: 0   },
    { input:  0,   expected: 0   },
    { input:  0.5, expected: 0.5 },
    { input:  1,   expected: 1   },
    { input:  2,   expected: 1   },
  ];

  // All [0,1] genes
  const UNIT_GENES = [
    'tillerCount', 'clumpSpread', 'bladeSegments', 'seedHead', 'fanSpread',
    'inflorescenceType', 'spikeletCount', 'grainsPerSpikelet',
    'bladeLength', 'bladeWidth', 'bladeTaper', 'arch', 'curve',
    'stiffness', 'verticality', 'tipDroop',
    'bladeShape', 'widestPos', 'crossSectionCurl',
    'bladeTwist', 'stemRoundness', 'awnLength', 'midEarBulge',
    'bladeLengthMax', 'bladeWidthMax', 'bladeTaperMax', 'archMax', 'tipDroopMax',
    'pigment', 'bladeRaggedness', 'colorVariation', 'midribStrength', 'veining',
    'chlorophyll', 'senescence', 'anthoPropensity', 'glaucousness',
  ];

  for (const field of UNIT_GENES) {
    it(`${field}: clamps correctly at probe inputs -1,0,0.5,1,2`, () => {
      for (const { input, expected } of PROBE_01) {
        const result = clampField(GRASS_SCHEMA, field, input);
        assert.equal(result, expected, `${field}(${input}) → ${result}, want ${expected}`);
      }
    });
  }

  it('jitter: clamps to [0.0, 1.5] at probe inputs', () => {
    assert.equal(clampField(GRASS_SCHEMA, 'jitter', -1),   0);
    assert.equal(clampField(GRASS_SCHEMA, 'jitter',  0),   0);
    assert.equal(clampField(GRASS_SCHEMA, 'jitter',  0.5), 0.5);
    assert.equal(clampField(GRASS_SCHEMA, 'jitter',  1),   1);
    assert.equal(clampField(GRASS_SCHEMA, 'jitter',  2),   1.5);
  });

  it('structuralSeed (seed): coerces to uint32 — masks fractional / negative inputs', () => {
    assert.equal(clampField(GRASS_SCHEMA, 'structuralSeed', 0xDEADBEEF), 0xDEADBEEF >>> 0);
    assert.equal(clampField(GRASS_SCHEMA, 'structuralSeed', 0), 0);
    assert.equal(clampField(GRASS_SCHEMA, 'structuralSeed', 3.9), 3);
    assert.equal(clampField(GRASS_SCHEMA, 'structuralSeed', -1), 0xFFFFFFFF);
  });

  it('unknown field is returned unchanged', () => {
    assert.equal(clampField(GRASS_SCHEMA, 'notAField', 99), 99);
    assert.equal(clampField(GRASS_SCHEMA, 'notAField', 'hello'), 'hello');
  });

  it('clampField round-trips: clamp(clamp(v)) === clamp(v) for all genes', () => {
    const probeValues = [-5, -1, -0.1, 0, 0.3, 0.5, 0.7, 1, 1.2, 2, 99];
    for (const field of Object.keys(GRASS_SCHEMA)) {
      if (GRASS_SCHEMA[field].kind === 'seed') continue;
      for (const v of probeValues) {
        const once  = clampField(GRASS_SCHEMA, field, v);
        const twice = clampField(GRASS_SCHEMA, field, once);
        assert.equal(twice, once, `${field}(${v}): clamp not idempotent — ${once} → ${twice}`);
      }
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 4: genomeDistance
// ---------------------------------------------------------------------------

describe('genomeDistance', () => {

  it('distance(g, g) === 0 for any genome', () => {
    const g = makeSampleGenome();
    assert.equal(genomeDistance(g, g, GRASS_SCHEMA), 0);
  });

  it('distance is symmetric: d(a,b) === d(b,a)', () => {
    const rng = mulberry32(42);
    const a = makeSampleGenome();
    const b = makeSampleGenome();
    for (const [field, gene] of Object.entries(GRASS_SCHEMA)) {
      if (gene.kind === 'continuous') {
        const [lo, hi] = gene.range;
        a[field] = lo + rng() * (hi - lo);
        b[field] = lo + rng() * (hi - lo);
      }
    }
    const dAB = genomeDistance(a, b, GRASS_SCHEMA);
    const dBA = genomeDistance(b, a, GRASS_SCHEMA);
    assert.equal(dAB, dBA, `distance not symmetric: d(a,b)=${dAB}, d(b,a)=${dBA}`);
  });

  it('distance ∈ [0, 1] for randomly sampled pairs', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const a = {};
      const b = {};
      for (const [field, gene] of Object.entries(GRASS_SCHEMA)) {
        if (gene.kind === 'continuous') {
          const [lo, hi] = gene.range;
          a[field] = lo + rng() * (hi - lo);
          b[field] = lo + rng() * (hi - lo);
        } else {
          a[field] = 0;
          b[field] = 0;
        }
      }
      const d = genomeDistance(a, b, GRASS_SCHEMA);
      assert.ok(d >= 0 && d <= 1, `Trial ${i}: distance ${d} outside [0,1]`);
    }
  });

  it('max-separated genomes give distance exactly 1', () => {
    const lo = {};
    const hi = {};
    for (const [field, gene] of Object.entries(GRASS_SCHEMA)) {
      if (gene.kind === 'continuous') {
        lo[field] = gene.range[0];
        hi[field] = gene.range[1];
      } else {
        lo[field] = 0;
        hi[field] = 0;
      }
    }
    const d = genomeDistance(lo, hi, GRASS_SCHEMA);
    assert.ok(d >= 0 && d <= 1, `Max-separated distance ${d} outside [0,1]`);
    assert.equal(d, 1);
  });

  it('structuralSeed change does not affect distance (seeds excluded)', () => {
    const a = makeSampleGenome();
    const b = { ...a, structuralSeed: 0xDEADBEEF };
    assert.equal(genomeDistance(a, b, GRASS_SCHEMA), 0);
  });

  it('tier weights: structural distance > proportions > cosmetic (same span)', () => {
    const base = makeSampleGenome();

    function distOnField(field) {
      const gene = GRASS_SCHEMA[field];
      if (!gene || gene.kind !== 'continuous') return null;
      const [lo, hi] = gene.range;
      const a = { ...base, [field]: lo };
      const b = { ...base, [field]: hi };
      return genomeDistance(a, b, GRASS_SCHEMA);
    }

    const dStruct   = distOnField('tillerCount');  // structural ×3
    const dProp     = distOnField('bladeLength');  // proportions ×1.5
    const dCosmetic = distOnField('pigment');      // cosmetic ×0.5

    assert.ok(
      dStruct > dProp,
      `structural distance (${dStruct}) should exceed proportions (${dProp})`
    );
    assert.ok(
      dProp > dCosmetic,
      `proportions distance (${dProp}) should exceed cosmetic (${dCosmetic})`
    );
  });

});
