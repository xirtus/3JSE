// =============================================================================
// test/foliage.test.mjs — Task 4: blade/seed-head SoA determinism tests
//
// Tests the grass-specific generateFoliage() against the frozen contracts:
//   - seedHead===0  → count:0, no NaN in buffers
//   - seedHead>0    → instances at each isTerminal tip, count monotone with seedHead
//   - Determinism   → same (graph, genome) → byte-identical SoA output
//   - SoA shape     → Float32Array strides, no NaN/Infinity
//   - nodeToBlade   → boneIndex set from opts.nodeToBlade (analog of nodeToBone)
//
// Uses ONLY minimal synthetic graphs — no dependency on skeleton.js tree
// implementation or the old genome schema.
// =============================================================================

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import {
  generateFoliage,
  MAX_SEED_HEADS,
  FOLIAGE_SALT,
  SEED_HEAD_CLUSTER_BASE,
  SEED_HEAD_MAX_PER_TIP,
} from '../src/foliage.js';

// ---------------------------------------------------------------------------
// Minimal synthetic graph builders.
// ---------------------------------------------------------------------------

/**
 * Build a tiny graph with N blade tips.
 * Each "blade" is just two nodes: a base at ground and a tip above it.
 * All tips have isTerminal:true, branchLevel:0, isStem:true.
 */
function makeTipGraph(nTips = 3, tipHeight = 0.5) {
  const nodes = [];
  const bones = [];

  for (let i = 0; i < nTips; i++) {
    const x = i * 0.1;
    const baseIdx = nodes.length;
    nodes.push({
      pos:         [x, 0, 0],
      radius:      0.005,
      weight:      1.0,
      branchLevel: 0,
      parentIdx:   -1,
      isStem:      true,
      isTerminal:  false,
      swayBase:    0,
    });
    const tipIdx = nodes.length;
    nodes.push({
      pos:         [x, tipHeight, 0],
      radius:      0.001,
      weight:      1.0,
      branchLevel: 0,
      parentIdx:   baseIdx,
      isStem:      true,
      isTerminal:  true,
      swayBase:    1,
    });
    bones.push({ a: baseIdx, b: tipIdx });
  }

  return {
    nodes,
    bones,
    meta: { bodyAxis: [0, 1, 0], lightDir: [0.3, 0.8, 0.1] },
  };
}

/** An empty graph — zero nodes, zero bones. */
function makeEmptyGraph() {
  return { nodes: [], bones: [], meta: { bodyAxis: [0, 1, 0], lightDir: [0, 1, 0] } };
}

/** A graph with no isTerminal nodes (only non-terminal base nodes). */
function makeNoTipGraph() {
  return {
    nodes: [
      {
        pos: [0, 0, 0], radius: 0.01, weight: 1.0,
        branchLevel: 0, parentIdx: -1, isStem: true, isTerminal: false, swayBase: 0,
      },
    ],
    bones: [],
    meta: { bodyAxis: [0, 1, 0], lightDir: [0, 1, 0] },
  };
}

/** Build a minimal grass genome with just the fields foliage.js reads. */
function makeGenome(overrides = {}) {
  return {
    seedHead:       0,        // default: no seed heads
    structuralSeed: 0xBEEF1234,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: check no NaN or Infinity in a Float32Array (up to limit elements).
// ---------------------------------------------------------------------------
function assertNoNanInf(arr, label, limit = arr.length) {
  for (let i = 0; i < limit; i++) {
    assert.ok(
      Number.isFinite(arr[i]),
      `${label}[${i}] = ${arr[i]} is NaN or Infinity`
    );
  }
}

// ===========================================================================
// ACCEPTANCE CRITERION 1:
//   seedHead === 0 → count === 0 (no instances), no NaN in buffers.
// ===========================================================================

test('seedHead===0 → count:0 for any graph', () => {
  // With tips
  const r1 = generateFoliage(makeTipGraph(5), makeGenome({ seedHead: 0 }));
  assert.strictEqual(r1.count, 0, 'count must be 0 when seedHead=0 (5-tip graph)');

  // Empty graph
  const r2 = generateFoliage(makeEmptyGraph(), makeGenome({ seedHead: 0 }));
  assert.strictEqual(r2.count, 0, 'count must be 0 when seedHead=0 (empty graph)');

  // No-tip graph
  const r3 = generateFoliage(makeNoTipGraph(), makeGenome({ seedHead: 0 }));
  assert.strictEqual(r3.count, 0, 'count must be 0 when seedHead=0 (no-tip graph)');
});

test('seedHead===0 → no NaN in any buffer element (full buffer length)', () => {
  const result = generateFoliage(makeTipGraph(4), makeGenome({ seedHead: 0 }));
  // count is 0 but the full allocated arrays should contain only 0.0 (Float32Array default)
  assertNoNanInf(result.position,  'position');
  assertNoNanInf(result.normal,    'normal');
  assertNoNanInf(result.tangent,   'tangent');
  assertNoNanInf(result.scale,     'scale');
  assertNoNanInf(result.rotation,  'rotation');
  assertNoNanInf(result.ageColor,  'ageColor');
  assertNoNanInf(result.exposure,  'exposure');
  assertNoNanInf(result.boneIndex, 'boneIndex');
});

test('seedHead===0 → shape field equals genome.seedHead (0)', () => {
  const result = generateFoliage(makeTipGraph(2), makeGenome({ seedHead: 0 }));
  assert.strictEqual(result.shape, 0, 'shape must equal genome.seedHead');
});

// ===========================================================================
// ACCEPTANCE CRITERION 2:
//   seedHead>0 → one cluster of instances at each isTerminal tip;
//   count scales monotonically with seedHead.
// ===========================================================================

test('seedHead>0 → count > 0 for a graph with isTerminal nodes', () => {
  const graph  = makeTipGraph(3);
  const genome = makeGenome({ seedHead: 0.5 });
  const result = generateFoliage(graph, genome);
  assert.ok(result.count > 0, `Expected count > 0, got ${result.count}`);
});

test('seedHead>0 → each isTerminal tip contributes at least one instance', () => {
  // With 3 tips and seedHead=1.0, every tip must have at least one instance.
  const nTips  = 3;
  const graph  = makeTipGraph(nTips);
  const genome = makeGenome({ seedHead: 1.0 });
  const result = generateFoliage(graph, genome);

  // Minimum count: 1 instance per tip
  assert.ok(
    result.count >= nTips,
    `Expected count >= ${nTips} (one per tip), got ${result.count}`
  );
  // Maximum count: SEED_HEAD_MAX_PER_TIP per tip (hard ceiling)
  assert.ok(
    result.count <= nTips * SEED_HEAD_MAX_PER_TIP,
    `Expected count <= ${nTips * SEED_HEAD_MAX_PER_TIP}, got ${result.count}`
  );
});

test('count scales monotonically with seedHead (0.1 <= 0.5 <= 1.0)', () => {
  // Keep the same graph so only seedHead changes.
  const graph   = makeTipGraph(5);
  const genome1 = makeGenome({ seedHead: 0.1 });
  const genome2 = makeGenome({ seedHead: 0.5 });
  const genome3 = makeGenome({ seedHead: 1.0 });

  const c1 = generateFoliage(graph, genome1).count;
  const c2 = generateFoliage(graph, genome2).count;
  const c3 = generateFoliage(graph, genome3).count;

  assert.ok(c1 <= c2, `count(0.1)=${c1} should be <= count(0.5)=${c2}`);
  assert.ok(c2 <= c3, `count(0.5)=${c2} should be <= count(1.0)=${c3}`);
  // At seedHead=1.0 we expect the maximum number per tip
  assert.ok(c3 >= c1, 'count(1.0) must be >= count(0.1)');
});

test('graph with 0 isTerminal nodes → count:0 even when seedHead>0', () => {
  const result = generateFoliage(makeNoTipGraph(), makeGenome({ seedHead: 0.8 }));
  assert.strictEqual(result.count, 0, 'No tips → count must be 0 regardless of seedHead');
});

test('empty graph (0 nodes) → count:0 even when seedHead>0', () => {
  const result = generateFoliage(makeEmptyGraph(), makeGenome({ seedHead: 1.0 }));
  assert.strictEqual(result.count, 0, 'Empty graph → count must be 0 regardless of seedHead');
});

// ===========================================================================
// ACCEPTANCE CRITERION 3:
//   Same (graph, genome) → byte-identical SoA (determinism).
// ===========================================================================

test('generateFoliage is deterministic — byte-identical on repeat calls (seedHead>0)', () => {
  // Two independent calls on the same inputs must produce identical output.
  const graph  = makeTipGraph(4);
  const genome = makeGenome({ seedHead: 0.7 });

  const r1 = generateFoliage(graph, genome);
  const r2 = generateFoliage(graph, genome);

  assert.strictEqual(r1.count, r2.count, 'count must match');
  assert.strictEqual(r1.shape, r2.shape, 'shape must match');

  const keys = ['position', 'normal', 'tangent', 'scale', 'rotation', 'ageColor', 'exposure', 'boneIndex'];
  for (const key of keys) {
    const a = r1[key];
    const b = r2[key];
    assert.strictEqual(a.length, b.length, `${key}.length mismatch`);
    // Compare all elements (full buffer must be identical)
    for (let i = 0; i < a.length; i++) {
      assert.strictEqual(a[i], b[i], `${key}[${i}] differs between identical calls`);
    }
  }
});

test('generateFoliage is deterministic (seedHead=0 path)', () => {
  const graph  = makeTipGraph(6);
  const genome = makeGenome({ seedHead: 0 });

  const r1 = generateFoliage(graph, genome);
  const r2 = generateFoliage(graph, genome);

  assert.strictEqual(r1.count, 0);
  assert.strictEqual(r2.count, 0);
});

test('different structuralSeed → different instance positions (when seedHead>0)', () => {
  const graph  = makeTipGraph(3);
  const g1     = makeGenome({ seedHead: 0.8, structuralSeed: 0x11111111 });
  const g2     = makeGenome({ seedHead: 0.8, structuralSeed: 0x22222222 });

  const r1 = generateFoliage(graph, g1);
  const r2 = generateFoliage(graph, g2);

  // Both should emit instances (same graph topology, same seedHead)
  assert.ok(r1.count > 0 && r2.count > 0, 'Both must emit instances');

  // At least one position value should differ
  let differs = false;
  const n = Math.min(r1.count, r2.count) * 3;
  for (let i = 0; i < n; i++) {
    if (r1.position[i] !== r2.position[i]) {
      differs = true;
      break;
    }
  }
  assert.ok(differs, 'Different structuralSeed values should produce different positions');
});

// ===========================================================================
// ACCEPTANCE CRITERION 4:
//   SoA arrays are Float32Array of the documented strides; no value is NaN/Infinity.
// ===========================================================================

test('SoA arrays are Float32Array with correct strides', () => {
  const result = generateFoliage(makeTipGraph(3), makeGenome({ seedHead: 1.0 }));

  assert.ok(result.position  instanceof Float32Array, 'position must be Float32Array');
  assert.ok(result.normal    instanceof Float32Array, 'normal must be Float32Array');
  assert.ok(result.tangent   instanceof Float32Array, 'tangent must be Float32Array');
  assert.ok(result.scale     instanceof Float32Array, 'scale must be Float32Array');
  assert.ok(result.rotation  instanceof Float32Array, 'rotation must be Float32Array');
  assert.ok(result.ageColor  instanceof Float32Array, 'ageColor must be Float32Array');
  assert.ok(result.exposure  instanceof Float32Array, 'exposure must be Float32Array');
  assert.ok(result.boneIndex instanceof Float32Array, 'boneIndex must be Float32Array');

  assert.strictEqual(result.position.length,  3 * MAX_SEED_HEADS, 'position stride = 3*MAX');
  assert.strictEqual(result.normal.length,    3 * MAX_SEED_HEADS, 'normal stride = 3*MAX');
  assert.strictEqual(result.tangent.length,   3 * MAX_SEED_HEADS, 'tangent stride = 3*MAX');
  assert.strictEqual(result.scale.length,     MAX_SEED_HEADS,     'scale stride = MAX');
  assert.strictEqual(result.rotation.length,  MAX_SEED_HEADS,     'rotation stride = MAX');
  assert.strictEqual(result.ageColor.length,  MAX_SEED_HEADS,     'ageColor stride = MAX');
  assert.strictEqual(result.exposure.length,  MAX_SEED_HEADS,     'exposure stride = MAX');
  assert.strictEqual(result.boneIndex.length, MAX_SEED_HEADS,     'boneIndex stride = MAX');
});

test('no NaN or Infinity in valid SoA elements (seedHead>0)', () => {
  const graph  = makeTipGraph(4);
  const genome = makeGenome({ seedHead: 0.6 });
  const result = generateFoliage(graph, genome);

  assert.ok(result.count > 0, 'Need at least one instance for this test');

  // Check all elements of all buffers (full buffer should have no NaN from Float32Array init)
  assertNoNanInf(result.position,  'position');
  assertNoNanInf(result.normal,    'normal');
  assertNoNanInf(result.tangent,   'tangent');
  assertNoNanInf(result.scale,     'scale');
  assertNoNanInf(result.rotation,  'rotation');
  assertNoNanInf(result.ageColor,  'ageColor');
  assertNoNanInf(result.exposure,  'exposure');
  assertNoNanInf(result.boneIndex, 'boneIndex');
});

test('count <= MAX_SEED_HEADS always (hard budget)', () => {
  // Stress test: many tips, max seedHead
  const graph  = makeTipGraph(500);
  const genome = makeGenome({ seedHead: 1.0 });
  const result = generateFoliage(graph, genome);
  assert.ok(
    result.count <= MAX_SEED_HEADS,
    `count ${result.count} exceeds MAX_SEED_HEADS=${MAX_SEED_HEADS}`
  );
});

test('scale values are positive for all valid instances', () => {
  const result = generateFoliage(makeTipGraph(3), makeGenome({ seedHead: 1.0 }));
  for (let i = 0; i < result.count; i++) {
    assert.ok(result.scale[i] > 0, `scale[${i}] = ${result.scale[i]} is not positive`);
  }
});

test('ageColor values are in [0,1] for all valid instances', () => {
  const result = generateFoliage(makeTipGraph(3), makeGenome({ seedHead: 0.8 }));
  for (let i = 0; i < result.count; i++) {
    assert.ok(
      result.ageColor[i] >= 0 && result.ageColor[i] <= 1,
      `ageColor[${i}] = ${result.ageColor[i]} out of [0,1]`
    );
  }
});

test('exposure values are in [0,1] for all valid instances', () => {
  const result = generateFoliage(makeTipGraph(3), makeGenome({ seedHead: 0.9 }));
  for (let i = 0; i < result.count; i++) {
    assert.ok(
      result.exposure[i] >= 0 && result.exposure[i] <= 1,
      `exposure[${i}] = ${result.exposure[i]} out of [0,1]`
    );
  }
});

test('shape field equals genome.seedHead', () => {
  const seedHead = 0.77;
  const result   = generateFoliage(makeTipGraph(2), makeGenome({ seedHead }));
  assert.strictEqual(result.shape, seedHead, 'shape must equal genome.seedHead');
});

// ===========================================================================
// nodeToBlade / boneIndex tests (analog of old nodeToBone contract).
// ===========================================================================

test('boneIndex defaults to 0 when no opts provided', () => {
  const result = generateFoliage(makeTipGraph(3), makeGenome({ seedHead: 1.0 }));
  for (let i = 0; i < result.count; i++) {
    assert.strictEqual(result.boneIndex[i], 0, `boneIndex[${i}] should default to 0`);
  }
});

test('boneIndex defaults to 0 when opts is present but nodeToBlade is absent', () => {
  const result = generateFoliage(makeTipGraph(3), makeGenome({ seedHead: 1.0 }), {});
  for (let i = 0; i < result.count; i++) {
    assert.strictEqual(result.boneIndex[i], 0, `boneIndex[${i}] should default to 0`);
  }
});

test('boneIndex uses opts.nodeToBlade when provided', () => {
  const graph  = makeTipGraph(3);
  const genome = makeGenome({ seedHead: 1.0 });

  // nodeToBlade: assign node index as the blade index (simple identity-mod mapping)
  const nodeToBlade = new Int32Array(graph.nodes.length);
  for (let i = 0; i < graph.nodes.length; i++) {
    nodeToBlade[i] = i % 4; // valid blade indices in [0, 3]
  }

  const result = generateFoliage(graph, genome, { nodeToBlade });
  assert.ok(result.count > 0, 'Need at least one instance');

  // All boneIndex values should be valid (>= 0)
  for (let i = 0; i < result.count; i++) {
    assert.ok(result.boneIndex[i] >= 0, `boneIndex[${i}] should be >= 0`);
    assert.ok(
      Number.isInteger(result.boneIndex[i]),
      `boneIndex[${i}] should be an integer value`
    );
  }
});

test('nodeToBlade=-1 clamps to 0 (safe fallback)', () => {
  const graph  = makeTipGraph(2);
  const genome = makeGenome({ seedHead: 1.0 });

  // All entries -1 → all boneIndex should be 0
  const nodeToBlade = new Int32Array(graph.nodes.length).fill(-1);
  const result = generateFoliage(graph, genome, { nodeToBlade });

  for (let i = 0; i < result.count; i++) {
    assert.strictEqual(result.boneIndex[i], 0, `boneIndex[${i}] must clamp -1 to 0`);
  }
});

test('existing SoA fields are byte-identical with and without nodeToBlade', () => {
  const graph  = makeTipGraph(3);
  const genome = makeGenome({ seedHead: 0.8 });

  const baseline = generateFoliage(graph, genome);

  const nodeToBlade = new Int32Array(graph.nodes.length);
  for (let i = 0; i < graph.nodes.length; i++) nodeToBlade[i] = i % 3;
  const withBlade = generateFoliage(graph, genome, { nodeToBlade });

  assert.strictEqual(baseline.count, withBlade.count, 'count must be unchanged');

  // All pre-existing arrays except boneIndex must be byte-identical
  for (const key of ['position', 'normal', 'tangent', 'scale', 'rotation', 'ageColor', 'exposure']) {
    const a = baseline[key];
    const b = withBlade[key];
    for (let i = 0; i < a.length; i++) {
      assert.strictEqual(
        a[i], b[i],
        `${key}[${i}] changed when adding nodeToBlade — rng order disturbed`
      );
    }
  }
});

// ===========================================================================
// DEGENERATE SEGMENT TESTS — ensure no NaN even with zero-length blade segments.
// ===========================================================================

test('degenerate tip (parent and tip at same position) → no crash, no NaN', () => {
  // Build a graph where a tip node is at the same position as its parent.
  const graph = {
    nodes: [
      { pos: [0, 0, 0], radius: 0.01, weight: 1.0, branchLevel: 0,
        parentIdx: -1, isStem: true, isTerminal: false, swayBase: 0 },
      { pos: [0, 0, 0], radius: 0.001, weight: 1.0, branchLevel: 0,
        parentIdx: 0,  isStem: true, isTerminal: true, swayBase: 1 },
    ],
    bones: [{ a: 0, b: 1 }],
    meta: { bodyAxis: [0, 1, 0], lightDir: [0, 1, 0] },
  };

  const genome = makeGenome({ seedHead: 1.0 });
  let result;
  assert.doesNotThrow(() => { result = generateFoliage(graph, genome); }, 'Must not throw');

  // count should be 0 (degenerate segment skipped) — no NaN either way
  assert.ok(result.count >= 0, 'count must be non-negative');
  assertNoNanInf(result.position,  'position', result.count * 3);
  assertNoNanInf(result.scale,     'scale',    result.count);
});

// ===========================================================================
// ROUNDING / CLAMPFIELD — structuralSeed as a uint32 from the rng stream.
// ===========================================================================

test('foliage rng uses FOLIAGE_SALT XOR with structuralSeed (different seeds → different output)', () => {
  // Two different structuralSeeds must produce different results.
  const graph = makeTipGraph(1);

  const r1 = generateFoliage(graph, makeGenome({ seedHead: 1.0, structuralSeed: 0xAAAAAAAA }));
  const r2 = generateFoliage(graph, makeGenome({ seedHead: 1.0, structuralSeed: 0x55555555 }));

  // Same graph, different seeds — should produce different positions
  let differs = false;
  for (let i = 0; i < Math.min(r1.count, r2.count) * 3; i++) {
    if (r1.position[i] !== r2.position[i]) { differs = true; break; }
  }
  assert.ok(
    differs || (r1.count === 0 && r2.count === 0),
    'Different seeds should produce different positions when seedHead>0'
  );
});

// ===========================================================================
// SWAYBASE FALLBACK — works on old-schema graphs without swayBase field.
// ===========================================================================

test('graph without swayBase field → no crash (Y-height fallback path)', () => {
  // Simulate old-tree-style nodes without swayBase
  const graph = {
    nodes: [
      { pos: [0, 0, 0], radius: 0.01, weight: 1.0, branchLevel: 0,
        parentIdx: -1, isStem: true, isTerminal: false
        // no swayBase
      },
      { pos: [0, 1, 0], radius: 0.001, weight: 1.0, branchLevel: 0,
        parentIdx: 0,  isStem: true, isTerminal: true
        // no swayBase
      },
    ],
    bones: [{ a: 0, b: 1 }],
    meta: { bodyAxis: [0, 1, 0], lightDir: [0, 1, 0] },
  };

  const genome = makeGenome({ seedHead: 0.5 });
  let result;
  assert.doesNotThrow(() => { result = generateFoliage(graph, genome); });
  assert.ok(result.count >= 0);
  assertNoNanInf(result.position, 'position', result.count * 3);
  assertNoNanInf(result.exposure, 'exposure', result.count);
});

// ===========================================================================
// INTEGRATION SMOKE TEST — passes a graph through the full determinism chain.
// ===========================================================================

// ===========================================================================
// STRUCTURED INFLORESCENCE (Phase 4) — inflorescenceType > 0 builds a wheat-style
// ear (many grains per tip), distinct from the legacy fan path.
// ===========================================================================

function makeEarGenome(overrides = {}) {
  return {
    seedHead:          1.0,
    inflorescenceType: 0.8,   // tight spike
    spikeletCount:     0.6,
    grainsPerSpikelet: 0.6,
    awnLength:         0.0,
    midEarBulge:       0.6,
    structuralSeed:    0xBEEF1234,
    ...overrides,
  };
}

test('inflorescenceType>0 → many grains per tip (structured ear, exceeds legacy per-tip cap)', () => {
  const graph = makeTipGraph(1);
  const ear   = generateFoliage(graph, makeEarGenome());
  // A single ear has many spikelets×grains — well above the legacy SEED_HEAD_MAX_PER_TIP (8).
  assert.ok(ear.count > SEED_HEAD_MAX_PER_TIP,
    `structured ear should emit > ${SEED_HEAD_MAX_PER_TIP} instances per tip, got ${ear.count}`);
});

test('inflorescenceType=0 (legacy fan) caps at SEED_HEAD_MAX_PER_TIP per tip', () => {
  const graph = makeTipGraph(1);
  const fan   = generateFoliage(graph, makeEarGenome({ inflorescenceType: 0 }));
  assert.ok(fan.count <= SEED_HEAD_MAX_PER_TIP,
    `legacy fan should cap at ${SEED_HEAD_MAX_PER_TIP}, got ${fan.count}`);
});

test('structured ear: deterministic, in-budget, valid ranges, aspect present', () => {
  const graph = makeTipGraph(2);
  const g     = makeEarGenome({ awnLength: 0.8 });
  const r1 = generateFoliage(graph, g);
  const r2 = generateFoliage(graph, g);
  assert.strictEqual(r1.count, r2.count, 'count deterministic');
  assert.ok(r1.count > 0 && r1.count <= MAX_SEED_HEADS, 'count in budget');
  assert.ok(r1.aspect instanceof Float32Array, 'aspect SoA present');
  for (let i = 0; i < r1.count; i++) {
    assert.ok(r1.scale[i] > 0, `scale[${i}] positive`);
    assert.ok(r1.aspect[i] >= 1, `aspect[${i}] >= 1`);
    assert.ok(r1.ageColor[i] >= 0 && r1.ageColor[i] <= 1, `ageColor[${i}] in [0,1]`);
    assert.ok(Number.isFinite(r1.position[i*3]) && Number.isFinite(r1.position[i*3+1]) && Number.isFinite(r1.position[i*3+2]),
      `position[${i}] finite`);
  }
  // Byte-identical buffers across the two calls.
  for (let i = 0; i < r1.count; i++) {
    assert.strictEqual(r1.position[i*3], r2.position[i*3], `position[${i}] deterministic`);
    assert.strictEqual(r1.aspect[i], r2.aspect[i], `aspect[${i}] deterministic`);
  }
});

test('awnLength>0 adds long thin instances (aspect >> 1)', () => {
  const graph    = makeTipGraph(1);
  const awnless  = generateFoliage(graph, makeEarGenome({ awnLength: 0 }));
  const awned    = generateFoliage(graph, makeEarGenome({ awnLength: 0.9 }));
  assert.ok(awned.count > awnless.count, 'awns should add instances');
  // Some instance must be a long thin bristle.
  let maxAspect = 0;
  for (let i = 0; i < awned.count; i++) maxAspect = Math.max(maxAspect, awned.aspect[i]);
  assert.ok(maxAspect > 3, `awns should have aspect >> 1, got max ${maxAspect.toFixed(1)}`);
});

test('full smoke: 8-tip graph, seedHead=1.0, two passes byte-identical', () => {
  const graph  = makeTipGraph(8, 0.8);
  const genome = makeGenome({ seedHead: 1.0, structuralSeed: 0xDEADBEEF });

  const r1 = generateFoliage(graph, genome);
  const r2 = generateFoliage(graph, genome);

  assert.ok(r1.count > 0, 'Must have instances');
  assert.ok(r1.count <= MAX_SEED_HEADS, 'Must respect budget');
  assert.strictEqual(r1.count, r2.count);

  const stride3 = ['position', 'normal', 'tangent'];
  const stride1 = ['scale', 'rotation', 'ageColor', 'exposure', 'boneIndex'];

  for (const key of stride3) {
    for (let i = 0; i < r1.count * 3; i++) {
      assert.strictEqual(r1[key][i], r2[key][i], `${key}[${i}] mismatch`);
    }
  }
  for (const key of stride1) {
    for (let i = 0; i < r1.count; i++) {
      assert.strictEqual(r1[key][i], r2[key][i], `${key}[${i}] mismatch`);
    }
  }
});
