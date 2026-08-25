// =============================================================================
// test/fieldScatter.test.mjs — fieldScatter Poisson-disk acceptance criteria
//
// Covers:
//   - Determinism: same seed + opts → byte-identical typed arrays.
//   - Seed sensitivity: different seed → different layout.
//   - Min-distance guarantee: no two accepted points are closer than minDist.
//   - Disc containment: all accepted points lie within the disc of the given radius.
//   - Count sanity: count > 0 and within a plausible range for the disc area.
//   - Y-rotation values are in [0, 2π).
//   - scalesXZ values are in [WIDTH_MIN, WIDTH_MAX] (~[0.80, 1.20]).
//   - scalesY values are in [HEIGHT_MIN, HEIGHT_MAX] (~[0.75, 1.35]).
//   - colorJitter values are in [-1, 1].
//   - No NaN or Infinity in any output array.
//   - Default opts apply when opts are omitted.
//   - Array lengths are consistent with count.
//   - scalesXZ and scalesY are independent (not always equal).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFieldScatter } from '../src/fieldScatter.js';

const TWO_PI = Math.PI * 2;

// Pinned tuning constants (must match fieldScatter.js).
const WIDTH_MIN  = 0.80;
const WIDTH_MAX  = 1.20;
const HEIGHT_MIN = 0.75;
const HEIGHT_MAX = 1.35;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertNoNaN(arr, label) {
  for (let i = 0; i < arr.length; i++) {
    assert.ok(
      isFinite(arr[i]) && !isNaN(arr[i]),
      `${label}[${i}] = ${arr[i]} is NaN or non-finite`
    );
  }
}

function assertTypedArrayEqual(a, b, label) {
  assert.strictEqual(a.length, b.length, `${label}: length mismatch`);
  for (let i = 0; i < a.length; i++) {
    assert.strictEqual(a[i], b[i], `${label}[${i}] mismatch: ${a[i]} vs ${b[i]}`);
  }
}

// ---------------------------------------------------------------------------
// AC: Determinism — same (seed, opts) → byte-identical output
// ---------------------------------------------------------------------------

test('determinism: same seed → identical output', () => {
  const opts = { radius: 6, minDist: 0.9, k: 30 };
  const r1 = computeFieldScatter(42, opts);
  const r2 = computeFieldScatter(42, opts);

  assert.strictEqual(r1.count, r2.count, 'count must be identical');
  assertTypedArrayEqual(r1.positions,   r2.positions,   'positions');
  assertTypedArrayEqual(r1.rotationsY,  r2.rotationsY,  'rotationsY');
  assertTypedArrayEqual(r1.scalesXZ,    r2.scalesXZ,    'scalesXZ');
  assertTypedArrayEqual(r1.scalesY,     r2.scalesY,     'scalesY');
  assertTypedArrayEqual(r1.colorJitter, r2.colorJitter, 'colorJitter');
});

test('determinism: repeated calls with same seed produce same count', () => {
  const seed = 9001;
  const opts = { radius: 8, minDist: 0.9 };
  const r1 = computeFieldScatter(seed, opts);
  const r2 = computeFieldScatter(seed, opts);
  assert.strictEqual(r1.count, r2.count);
});

// ---------------------------------------------------------------------------
// AC: Seed sensitivity — different seed → different layout
// ---------------------------------------------------------------------------

test('different seeds → different positions', () => {
  const opts = { radius: 6, minDist: 0.9 };
  const r1 = computeFieldScatter(1, opts);
  const r2 = computeFieldScatter(2, opts);

  let differs = false;
  const len = Math.min(r1.positions.length, r2.positions.length);
  for (let i = 0; i < len; i++) {
    if (r1.positions[i] !== r2.positions[i]) { differs = true; break; }
  }
  assert.ok(differs, 'different seeds should produce different positions');
});

test('different seeds → different rotations', () => {
  const opts = { radius: 6, minDist: 0.9 };
  const r1 = computeFieldScatter(100, opts);
  const r2 = computeFieldScatter(200, opts);

  let differs = false;
  const len = Math.min(r1.rotationsY.length, r2.rotationsY.length);
  for (let i = 0; i < len; i++) {
    if (r1.rotationsY[i] !== r2.rotationsY[i]) { differs = true; break; }
  }
  assert.ok(differs, 'different seeds should produce different rotations');
});

test('different seeds → different scalesXZ', () => {
  const opts = { radius: 6, minDist: 0.9 };
  const r1 = computeFieldScatter(10, opts);
  const r2 = computeFieldScatter(20, opts);

  let differs = false;
  const len = Math.min(r1.scalesXZ.length, r2.scalesXZ.length);
  for (let i = 0; i < len; i++) {
    if (r1.scalesXZ[i] !== r2.scalesXZ[i]) { differs = true; break; }
  }
  assert.ok(differs, 'different seeds should produce different scalesXZ');
});

test('different seeds → different colorJitter', () => {
  const opts = { radius: 6, minDist: 0.9 };
  const r1 = computeFieldScatter(30, opts);
  const r2 = computeFieldScatter(40, opts);

  let differs = false;
  const len = Math.min(r1.colorJitter.length, r2.colorJitter.length);
  for (let i = 0; i < len; i++) {
    if (r1.colorJitter[i] !== r2.colorJitter[i]) { differs = true; break; }
  }
  assert.ok(differs, 'different seeds should produce different colorJitter');
});

// ---------------------------------------------------------------------------
// AC: Min-distance guarantee — no two points closer than minDist
// ---------------------------------------------------------------------------

test('min-distance guarantee: no two points closer than minDist (default opts)', () => {
  const minDist = 0.9;
  const result = computeFieldScatter(42, { radius: 8, minDist });
  const minDistSq = minDist * minDist;
  const n = result.count;

  for (let i = 0; i < n; i++) {
    const xi = result.positions[i * 3];
    const zi = result.positions[i * 3 + 2];
    for (let j = i + 1; j < n; j++) {
      const dx = xi - result.positions[j * 3];
      const dz = zi - result.positions[j * 3 + 2];
      const distSq = dx * dx + dz * dz;
      assert.ok(
        distSq >= minDistSq - 1e-6,
        `Points ${i} and ${j} are only ${Math.sqrt(distSq).toFixed(4)} apart (minDist=${minDist})`
      );
    }
  }
});

test('min-distance guarantee: custom minDist=1.5', () => {
  const minDist = 1.5;
  const result = computeFieldScatter(77, { radius: 8, minDist });
  const minDistSq = minDist * minDist;
  const n = result.count;

  for (let i = 0; i < n; i++) {
    const xi = result.positions[i * 3];
    const zi = result.positions[i * 3 + 2];
    for (let j = i + 1; j < n; j++) {
      const dx = xi - result.positions[j * 3];
      const dz = zi - result.positions[j * 3 + 2];
      const distSq = dx * dx + dz * dz;
      assert.ok(
        distSq >= minDistSq - 1e-6,
        `Points ${i} and ${j} are ${Math.sqrt(distSq).toFixed(4)} apart; expected >= ${minDist}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// AC: Disc containment — all accepted points inside the disc
// ---------------------------------------------------------------------------

test('all points lie within the disc of given radius', () => {
  const radius = 8;
  const result = computeFieldScatter(12, { radius, minDist: 0.9 });
  const radiusSq = radius * radius;

  for (let i = 0; i < result.count; i++) {
    const x = result.positions[i * 3];
    const z = result.positions[i * 3 + 2];
    const distSq = x * x + z * z;
    assert.ok(
      distSq <= radiusSq + 1e-6,
      `Point ${i} at (${x.toFixed(3)}, ${z.toFixed(3)}) is outside disc radius=${radius}`
    );
  }
});

test('all points lie within disc (small radius)', () => {
  const radius = 3;
  const result = computeFieldScatter(55, { radius, minDist: 0.5 });
  const radiusSq = radius * radius;

  for (let i = 0; i < result.count; i++) {
    const x = result.positions[i * 3];
    const z = result.positions[i * 3 + 2];
    assert.ok(
      x * x + z * z <= radiusSq + 1e-6,
      `Point ${i} outside disc`
    );
  }
});

// ---------------------------------------------------------------------------
// AC: Count — positive and within plausible range for disc area
// ---------------------------------------------------------------------------

test('count > 0', () => {
  const result = computeFieldScatter(1, { radius: 8, minDist: 0.9 });
  assert.ok(result.count > 0, 'should produce at least one point');
});

test('count is within plausible bounds for radius=8, minDist=0.9', () => {
  // Theoretical max packing (hex): area / (sqrt(3)/2 * minDist^2) ≈ 280 for r=8
  // Bridson typically achieves ~60-80% of hex packing.
  // Expect somewhere between 50 and 300.
  const result = computeFieldScatter(42, { radius: 8, minDist: 0.9 });
  assert.ok(result.count >= 50,  `count=${result.count} seems too low`);
  assert.ok(result.count <= 300, `count=${result.count} seems impossibly high`);
  // Report actual count for the task return value.
  console.log(`[INFO] radius=8 minDist=0.9 → count=${result.count}`);
});

test('larger radius → more points than smaller radius', () => {
  const r1 = computeFieldScatter(42, { radius: 4,  minDist: 0.9 });
  const r2 = computeFieldScatter(42, { radius: 10, minDist: 0.9 });
  assert.ok(r2.count > r1.count, `radius=10 (${r2.count}) should produce more points than radius=4 (${r1.count})`);
});

test('larger minDist → fewer points', () => {
  const r1 = computeFieldScatter(42, { radius: 8, minDist: 0.5 });
  const r2 = computeFieldScatter(42, { radius: 8, minDist: 2.0 });
  assert.ok(r1.count > r2.count, `minDist=0.5 (${r1.count}) should produce more points than minDist=2.0 (${r2.count})`);
});

// ---------------------------------------------------------------------------
// AC: Array lengths consistent with count
// ---------------------------------------------------------------------------

test('array lengths are consistent with count', () => {
  const result = computeFieldScatter(99, { radius: 6, minDist: 0.9 });
  assert.strictEqual(result.positions.length,   result.count * 3, 'positions length = count * 3');
  assert.strictEqual(result.rotationsY.length,  result.count,     'rotationsY length = count');
  assert.strictEqual(result.scalesXZ.length,    result.count,     'scalesXZ length = count');
  assert.strictEqual(result.scalesY.length,     result.count,     'scalesY length = count');
  assert.strictEqual(result.colorJitter.length, result.count,     'colorJitter length = count');
});

// ---------------------------------------------------------------------------
// AC: Y positions are always 0
// ---------------------------------------------------------------------------

test('all Y positions are 0', () => {
  const result = computeFieldScatter(777, { radius: 6, minDist: 0.9 });
  for (let i = 0; i < result.count; i++) {
    assert.strictEqual(result.positions[i * 3 + 1], 0, `positions[${i}].y should be 0`);
  }
});

// ---------------------------------------------------------------------------
// AC: Y-rotation values are in [0, 2π)
// ---------------------------------------------------------------------------

test('Y-rotation values are in [0, 2π)', () => {
  const result = computeFieldScatter(555, { radius: 8, minDist: 0.9 });
  for (let i = 0; i < result.count; i++) {
    assert.ok(
      result.rotationsY[i] >= 0 && result.rotationsY[i] < TWO_PI + 1e-9,
      `rotationsY[${i}]=${result.rotationsY[i]} out of [0, 2π)`
    );
  }
});

test('Y-rotation values use the full range (some > π)', () => {
  const result = computeFieldScatter(12345, { radius: 8, minDist: 0.9 });
  let hasLarge = false;
  for (let i = 0; i < result.count; i++) {
    if (result.rotationsY[i] > Math.PI) { hasLarge = true; break; }
  }
  assert.ok(hasLarge, 'some Y-rotations should exceed π (full 0..2π range)');
});

// ---------------------------------------------------------------------------
// AC: scalesXZ values are in [WIDTH_MIN, WIDTH_MAX]
// ---------------------------------------------------------------------------

test('scalesXZ values are in [WIDTH_MIN, WIDTH_MAX]', () => {
  const result = computeFieldScatter(888, { radius: 8, minDist: 0.9 });
  for (let i = 0; i < result.count; i++) {
    assert.ok(
      result.scalesXZ[i] >= WIDTH_MIN - 1e-6 && result.scalesXZ[i] <= WIDTH_MAX + 1e-6,
      `scalesXZ[${i}]=${result.scalesXZ[i]} out of [${WIDTH_MIN}, ${WIDTH_MAX}]`
    );
  }
});

test('scalesXZ values vary (not all identical)', () => {
  const result = computeFieldScatter(9999, { radius: 8, minDist: 0.9 });
  let differs = false;
  for (let i = 1; i < result.count; i++) {
    if (Math.abs(result.scalesXZ[i] - result.scalesXZ[0]) > 1e-6) { differs = true; break; }
  }
  assert.ok(differs, 'scalesXZ should vary across instances');
});

// ---------------------------------------------------------------------------
// AC: scalesY values are in [HEIGHT_MIN, HEIGHT_MAX]
// ---------------------------------------------------------------------------

test('scalesY values are in [HEIGHT_MIN, HEIGHT_MAX]', () => {
  const result = computeFieldScatter(1234, { radius: 8, minDist: 0.9 });
  for (let i = 0; i < result.count; i++) {
    assert.ok(
      result.scalesY[i] >= HEIGHT_MIN - 1e-6 && result.scalesY[i] <= HEIGHT_MAX + 1e-6,
      `scalesY[${i}]=${result.scalesY[i]} out of [${HEIGHT_MIN}, ${HEIGHT_MAX}]`
    );
  }
});

test('scalesY values vary (not all identical)', () => {
  const result = computeFieldScatter(5678, { radius: 8, minDist: 0.9 });
  let differs = false;
  for (let i = 1; i < result.count; i++) {
    if (Math.abs(result.scalesY[i] - result.scalesY[0]) > 1e-6) { differs = true; break; }
  }
  assert.ok(differs, 'scalesY should vary across instances');
});

// ---------------------------------------------------------------------------
// AC: scalesXZ and scalesY are independent
// ---------------------------------------------------------------------------

test('scalesXZ and scalesY are independent (not always equal)', () => {
  const result = computeFieldScatter(42, { radius: 8, minDist: 0.9 });
  let differs = false;
  for (let i = 0; i < result.count; i++) {
    if (Math.abs(result.scalesXZ[i] - result.scalesY[i]) > 1e-6) { differs = true; break; }
  }
  assert.ok(differs, 'scalesXZ and scalesY should differ — they are drawn independently');
});

// ---------------------------------------------------------------------------
// AC: colorJitter values are in [-1, 1]
// ---------------------------------------------------------------------------

test('colorJitter values are in [-1, 1]', () => {
  const result = computeFieldScatter(7777, { radius: 8, minDist: 0.9 });
  for (let i = 0; i < result.count; i++) {
    assert.ok(
      result.colorJitter[i] >= -1 - 1e-6 && result.colorJitter[i] <= 1 + 1e-6,
      `colorJitter[${i}]=${result.colorJitter[i]} out of [-1, 1]`
    );
  }
});

test('colorJitter has both positive and negative values', () => {
  const result = computeFieldScatter(3210, { radius: 8, minDist: 0.9 });
  let hasPos = false;
  let hasNeg = false;
  for (let i = 0; i < result.count; i++) {
    if (result.colorJitter[i] > 0.05) hasPos = true;
    if (result.colorJitter[i] < -0.05) hasNeg = true;
    if (hasPos && hasNeg) break;
  }
  assert.ok(hasPos, 'some colorJitter values should be positive');
  assert.ok(hasNeg, 'some colorJitter values should be negative');
});

// ---------------------------------------------------------------------------
// AC: No NaN or Infinity in any output array
// ---------------------------------------------------------------------------

test('no NaN in positions, rotationsY, scalesXZ, scalesY, colorJitter (default params)', () => {
  const result = computeFieldScatter(1337, { radius: 8, minDist: 0.9 });
  assertNoNaN(result.positions,   'positions');
  assertNoNaN(result.rotationsY,  'rotationsY');
  assertNoNaN(result.scalesXZ,    'scalesXZ');
  assertNoNaN(result.scalesY,     'scalesY');
  assertNoNaN(result.colorJitter, 'colorJitter');
});

test('no NaN with small radius and large minDist', () => {
  const result = computeFieldScatter(7, { radius: 3, minDist: 1.0 });
  assertNoNaN(result.positions,   'positions');
  assertNoNaN(result.rotationsY,  'rotationsY');
  assertNoNaN(result.scalesXZ,    'scalesXZ');
  assertNoNaN(result.scalesY,     'scalesY');
  assertNoNaN(result.colorJitter, 'colorJitter');
});

// ---------------------------------------------------------------------------
// AC: Default opts apply when omitted
// ---------------------------------------------------------------------------

test('defaults apply when opts are fully omitted', () => {
  const r1 = computeFieldScatter(42);
  const r2 = computeFieldScatter(42, { radius: 8, minDist: 0.35, k: 30 });

  assert.strictEqual(r1.count, r2.count, 'default count should match explicit defaults');
  assertTypedArrayEqual(r1.positions,   r2.positions,   'positions with defaults');
  assertTypedArrayEqual(r1.rotationsY,  r2.rotationsY,  'rotationsY with defaults');
  assertTypedArrayEqual(r1.scalesXZ,    r2.scalesXZ,    'scalesXZ with defaults');
  assertTypedArrayEqual(r1.scalesY,     r2.scalesY,     'scalesY with defaults');
  assertTypedArrayEqual(r1.colorJitter, r2.colorJitter, 'colorJitter with defaults');
});

test('defaults apply when opts object is empty', () => {
  const r1 = computeFieldScatter(42, {});
  const r2 = computeFieldScatter(42, { radius: 8, minDist: 0.35, k: 30 });
  assert.strictEqual(r1.count, r2.count);
  assertTypedArrayEqual(r1.positions, r2.positions, 'positions with empty opts');
});

// ---------------------------------------------------------------------------
// AC: Output shape — no legacy 'scales' field
// ---------------------------------------------------------------------------

test('output does not contain legacy "scales" field', () => {
  const result = computeFieldScatter(42, { radius: 6, minDist: 0.9 });
  assert.strictEqual(result.scales, undefined, 'legacy "scales" field must not exist');
});
