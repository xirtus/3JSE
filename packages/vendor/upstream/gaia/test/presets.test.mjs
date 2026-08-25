// =============================================================================
// presets.test.mjs — contract tests for src/presets.js (grass presets)
//
// Run: node --test test/presets.test.mjs
//
// Covers:
//   1. PRESETS / GRASS_DEFAULT structure and completeness
//   2. Every preset genome has all 19 GRASS_SCHEMA fields, each in range
//   3. GRASS_DEFAULT is the spread base for every preset (all its fields survive)
//   4. Distinct structuralSeed per preset
//   5. Category strings match CATEGORY_ORDER
//   6. resolve(preset.genome, neutralEnv) does not throw; valid output shape
//   7. Pairwise distinct gene vectors
//   8. Determinism: resolve twice → deep-equal
//   9. Clone-on-load isolation
// =============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PRESETS, GRASS_DEFAULT, CATEGORY_ORDER } from '../src/presets.js';
import { GRASS_SCHEMA }                           from '../src/genomeSchema.js';
import { resolve }                                from '../src/genome.js';

// ---------------------------------------------------------------------------
// Neutral env — matches the convention used across other test files.
// ---------------------------------------------------------------------------
const NEUTRAL_ENV = Object.freeze({
  gravity:     1,
  medium:      'air',
  light:       0.6,
  sunAngle:    0.25,
  wind:        0.2,
  aridity:     0.35,
  temperature: 0.5,
  energy:      'photo',
  biochem:     'carbon',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCHEMA_FIELDS = Object.keys(GRASS_SCHEMA);

/** Returns the first missing GRASS_SCHEMA field from a genome, or null if all present. */
function firstMissingField(genome) {
  for (const field of SCHEMA_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(genome, field)) return field;
  }
  return null;
}

/** Returns true if two genome objects have identical values for every schema field. */
function genomesEqual(a, b) {
  for (const field of SCHEMA_FIELDS) {
    if (a[field] !== b[field]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Suite 1 — PRESETS / GRASS_DEFAULT structural checks
// ---------------------------------------------------------------------------

describe('PRESETS — structure', () => {

  it('PRESETS is a non-empty array', () => {
    assert.ok(Array.isArray(PRESETS) && PRESETS.length > 0, 'PRESETS must be a non-empty array');
  });

  it('GRASS_DEFAULT is exported and is a plain object', () => {
    assert.ok(GRASS_DEFAULT !== null && typeof GRASS_DEFAULT === 'object',
      'GRASS_DEFAULT must be a plain object');
  });

  it('GRASS_DEFAULT has all GRASS_SCHEMA fields', () => {
    const missing = firstMissingField(GRASS_DEFAULT);
    assert.equal(missing, null, `GRASS_DEFAULT missing field "${missing}"`);
  });

  it('every preset has id, label, category, and genome properties', () => {
    for (const preset of PRESETS) {
      assert.ok(typeof preset.id === 'string' && preset.id.length > 0,
        `preset missing or empty id: ${JSON.stringify(preset)}`);
      assert.ok(typeof preset.label === 'string' && preset.label.length > 0,
        `preset "${preset.id}" missing or empty label`);
      assert.ok(typeof preset.category === 'string' && preset.category.length > 0,
        `preset "${preset.id}" missing or empty category`);
      assert.ok(preset.genome !== null && typeof preset.genome === 'object',
        `preset "${preset.id}" missing genome object`);
    }
  });

  it('preset ids are unique', () => {
    const ids = PRESETS.map(p => p.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `preset ids are not unique: ${ids}`);
  });

  it('CATEGORY_ORDER is a non-empty frozen array', () => {
    assert.ok(Array.isArray(CATEGORY_ORDER) && CATEGORY_ORDER.length > 0,
      'CATEGORY_ORDER must be a non-empty array');
  });

});

// ---------------------------------------------------------------------------
// Suite 2 — every preset genome has all GRASS_SCHEMA fields and is in range
// ---------------------------------------------------------------------------

describe('PRESETS — all GRASS_SCHEMA fields defined in every genome', () => {

  for (const preset of PRESETS) {
    it(`"${preset.id}" genome has every GRASS_SCHEMA field`, () => {
      const missing = firstMissingField(preset.genome);
      assert.equal(missing, null,
        `preset "${preset.id}": missing GRASS_SCHEMA field "${missing}"`);
    });
  }

  it('all preset genomes have defined (non-undefined) values for every field', () => {
    for (const preset of PRESETS) {
      for (const field of SCHEMA_FIELDS) {
        assert.notEqual(preset.genome[field], undefined,
          `preset "${preset.id}": field "${field}" is undefined`);
      }
    }
  });

  it('all continuous-kind fields are finite numbers (no NaN, no Infinity)', () => {
    for (const preset of PRESETS) {
      for (const field of SCHEMA_FIELDS) {
        const gene = GRASS_SCHEMA[field];
        if (gene.kind !== 'continuous') continue;
        const v = preset.genome[field];
        assert.ok(typeof v === 'number' && isFinite(v),
          `preset "${preset.id}": "${field}"=${v} is not a finite number`);
      }
    }
  });

  it('all continuous-kind fields are within GRASS_SCHEMA range', () => {
    for (const preset of PRESETS) {
      for (const field of SCHEMA_FIELDS) {
        const gene = GRASS_SCHEMA[field];
        if (gene.kind !== 'continuous') continue;
        const [lo, hi] = gene.range;
        const v = preset.genome[field];
        assert.ok(v >= lo && v <= hi,
          `preset "${preset.id}": "${field}"=${v} out of range [${lo}, ${hi}]`);
      }
    }
  });

  it('structuralSeed is a valid uint32 in every preset', () => {
    for (const preset of PRESETS) {
      const s = preset.genome.structuralSeed;
      assert.equal(s >>> 0, s,
        `preset "${preset.id}": structuralSeed ${s} is not a uint32`);
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 3 — GRASS_DEFAULT is the spread base for every preset
// ---------------------------------------------------------------------------

describe('PRESETS — GRASS_DEFAULT is spread base for every preset', () => {

  it('every preset genome contains all GRASS_DEFAULT keys with matching values where not overridden', () => {
    // Every key that appears in GRASS_DEFAULT must appear in every preset genome.
    // (Presets may override values, but they must not drop fields.)
    const defaultKeys = Object.keys(GRASS_DEFAULT);
    for (const preset of PRESETS) {
      for (const key of defaultKeys) {
        assert.ok(Object.prototype.hasOwnProperty.call(preset.genome, key),
          `preset "${preset.id}" is missing GRASS_DEFAULT key "${key}"`);
      }
    }
  });

  it('first preset ("lawn") genome equals GRASS_DEFAULT values exactly', () => {
    const lawn = PRESETS[0];
    assert.equal(lawn.id, 'lawn', 'first preset id should be "lawn"');
    for (const field of SCHEMA_FIELDS) {
      assert.equal(lawn.genome[field], GRASS_DEFAULT[field],
        `lawn preset field "${field}" differs from GRASS_DEFAULT`);
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 4 — distinct structuralSeed per preset
// ---------------------------------------------------------------------------

describe('PRESETS — distinct structuralSeed per preset', () => {

  it('all presets have distinct structuralSeeds', () => {
    const seeds = PRESETS.map(p => p.genome.structuralSeed);
    const unique = new Set(seeds);
    assert.equal(unique.size, seeds.length,
      `structuralSeeds are not all distinct: ${seeds}`);
  });

});

// ---------------------------------------------------------------------------
// Suite 5 — category strings match CATEGORY_ORDER
// ---------------------------------------------------------------------------

describe('PRESETS — category strings match CATEGORY_ORDER', () => {

  it('every preset category is in CATEGORY_ORDER', () => {
    const validCats = new Set(CATEGORY_ORDER);
    for (const preset of PRESETS) {
      assert.ok(validCats.has(preset.category),
        `preset "${preset.id}" has unknown category "${preset.category}" — not in CATEGORY_ORDER`);
    }
  });

  it('CATEGORY_ORDER contains exactly the required grass categories', () => {
    const required = ['Lawn', 'Meadow', 'Ornamental', 'Cereal', 'Wetland'];
    for (const cat of required) {
      assert.ok(CATEGORY_ORDER.includes(cat),
        `CATEGORY_ORDER is missing required category "${cat}"`);
    }
  });

  it('every category in CATEGORY_ORDER has at least one preset', () => {
    for (const cat of CATEGORY_ORDER) {
      const count = PRESETS.filter(p => p.category === cat).length;
      assert.ok(count >= 1,
        `category "${cat}" has no presets`);
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 6 — resolve produces valid output for every preset
// ---------------------------------------------------------------------------

describe('PRESETS — resolve produces valid output', () => {

  for (const preset of PRESETS) {
    it(`resolve("${preset.id}", neutralEnv) returns graph.nodes.length > 0`, () => {
      let result;
      assert.doesNotThrow(() => {
        result = resolve(preset.genome, NEUTRAL_ENV);
      }, `resolve threw for preset "${preset.id}"`);

      assert.ok(result !== null && result !== undefined,
        `resolve returned null/undefined for "${preset.id}"`);
      assert.ok(result.graph !== null && result.graph !== undefined,
        `resolve missing .graph for "${preset.id}"`);
      assert.ok(Array.isArray(result.graph.nodes) && result.graph.nodes.length > 0,
        `graph.nodes empty for preset "${preset.id}"`);
    });

    it(`resolve("${preset.id}", neutralEnv) has valid foliage`, () => {
      const result = resolve(preset.genome, NEUTRAL_ENV);
      assert.ok(result.foliage !== null && result.foliage !== undefined,
        `resolve missing .foliage for preset "${preset.id}"`);
      const count = result.foliage.count;
      assert.ok(typeof count === 'number' && count >= 0,
        `foliage.count is not a non-negative number for "${preset.id}": ${count}`);
    });

    it(`resolve("${preset.id}", neutralEnv) has all passthrough fields`, () => {
      const result = resolve(preset.genome, NEUTRAL_ENV);
      // Per §2 of GRASS_PLAN.md: resolve returns these passthrough fields.
      for (const field of ['boneCount', 'lightDir', 'pigment', 'colorVariation',
                           'bladeWidth', 'bladeTaper', 'midribStrength', 'bladeRaggedness',
                           'stiffness', 'arch']) {
        assert.ok(result[field] !== undefined,
          `resolve missing passthrough field "${field}" for preset "${preset.id}"`);
      }
    });
  }

});

// ---------------------------------------------------------------------------
// Suite 7 — pairwise DISTINCT gene vectors
// ---------------------------------------------------------------------------

describe('PRESETS — pairwise distinct gene vectors', () => {

  it('no two presets have identical gene vectors', () => {
    for (let i = 0; i < PRESETS.length; i++) {
      for (let j = i + 1; j < PRESETS.length; j++) {
        const same = genomesEqual(PRESETS[i].genome, PRESETS[j].genome);
        assert.equal(same, false,
          `presets "${PRESETS[i].id}" and "${PRESETS[j].id}" have identical gene vectors`);
      }
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 8 — determinism: resolve twice → deep-equal
// ---------------------------------------------------------------------------

describe('PRESETS — resolve is deterministic', () => {

  for (const preset of PRESETS) {
    it(`resolve("${preset.id}") twice → deep-equal`, () => {
      const r1 = resolve(preset.genome, NEUTRAL_ENV);
      const r2 = resolve(preset.genome, NEUTRAL_ENV);
      assert.deepEqual(r1, r2,
        `resolve is not deterministic for preset "${preset.id}"`);
    });
  }

});

// ---------------------------------------------------------------------------
// Suite 9 — clone-on-load isolation
// ---------------------------------------------------------------------------

describe('PRESETS — preset genomes are safe to clone-on-load', () => {

  it('mutating a cloned genome does not affect the preset source', () => {
    for (const preset of PRESETS) {
      const originalSeed = preset.genome.structuralSeed;
      const clone = { ...preset.genome };
      clone.structuralSeed = 0xDEADBEEF >>> 0;
      assert.equal(preset.genome.structuralSeed, originalSeed,
        `mutating clone.structuralSeed affected preset "${preset.id}" source`);
    }
  });

});
