// =============================================================================
// test/skeleton.test.mjs — Clump-of-tillers topology tests (Task 2)
//
// Tests for src/skeleton.js after the grass rewrite.
// All acceptance criteria from GRASS_PLAN.md Task 2 are covered here.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSkeleton, MAX_BONES } from '../src/skeleton.js';

// ---------------------------------------------------------------------------
// RNG helper (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Grass genome factory — all GRASS_SCHEMA genes present, sensible defaults.
// ---------------------------------------------------------------------------
function makeGenome(overrides = {}) {
  return {
    tillerCount:     0.45,
    clumpSpread:     0.30,
    bladeSegments:   0.40,
    seedHead:        0.00,
    fanSpread:       0.50,
    bladeLength:     0.35,
    tipDroop:        0.10,
    bladeWidth:      0.45,
    bladeTaper:      0.70,
    arch:            0.25,
    curve:           0.15,
    stiffness:       0.60,
    verticality:     0.55,
    pigment:         0.30,
    bladeRaggedness: 0.10,
    colorVariation:  0.20,
    jitter:          0.40,
    midribStrength:  0.20,
    structuralSeed:  0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count blades as chains rooted at parentIdx === -1 nodes. */
function countBlades(nodes) {
  return nodes.filter(n => n.parentIdx === -1).length;
}

/** Get the tip node of each blade (the isTerminal node). */
function getTipNodes(nodes) {
  return nodes.filter(n => n.isTerminal);
}

// ---------------------------------------------------------------------------
// AC 1: tillerCount=0 → exactly 1 blade chain; tillerCount=1 → ~12 blades
// ---------------------------------------------------------------------------

test('tillerCount=0 → exactly 1 blade chain', () => {
  for (let seed = 0; seed < 20; seed++) {
    const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0 }), mulberry32(seed));
    // tillerCount=0 → fractBlades = 1+0*11 = 1.0 → fullBlades=1, bladeFrac=0 → 1 blade
    const bladeCount = countBlades(nodes);
    assert.strictEqual(bladeCount, 1, `seed=${seed}: expected 1 blade, got ${bladeCount}`);
  }
});

test('tillerCount=1 → ~12 blade chains', () => {
  for (let seed = 0; seed < 20; seed++) {
    const { nodes } = buildSkeleton(makeGenome({ tillerCount: 1.0 }), mulberry32(seed));
    // tillerCount=1 → fractBlades = 1+1*11 = 12.0 → fullBlades=12, bladeFrac=0 → 12 blades
    const bladeCount = countBlades(nodes);
    assert.strictEqual(bladeCount, 12, `seed=${seed}: expected 12 blades, got ${bladeCount}`);
  }
});

test('tillerCount fractional crossfade: bladeCount transitions smoothly', () => {
  // tillerCount=0.4: fractBlades = 1 + 0.4*11 = 5.4 → fullBlades=5, bladeFrac=0.4 → 6 blades total
  // tillerCount=0.5: fractBlades = 1 + 0.5*11 = 6.5 → fullBlades=6, bladeFrac=0.5 → 7 blades total
  const seed = 42;
  const { nodes: n1 } = buildSkeleton(makeGenome({ tillerCount: 0.4 }), mulberry32(seed));
  const { nodes: n2 } = buildSkeleton(makeGenome({ tillerCount: 0.5 }), mulberry32(seed));
  assert.strictEqual(countBlades(n1), 6, 'tillerCount=0.4: expected 6 blades (5 full + 1 crossfade)');
  assert.strictEqual(countBlades(n2), 7, 'tillerCount=0.5: expected 7 blades (6 full + 1 crossfade)');
});

test('crossfade blade has weight < 1 (fractional weight)', () => {
  // tillerCount=0.6: fractBlades = 1 + 0.6*11 = 7.6 → fullBlades=7, bladeFrac=0.6
  // The crossfade blade base node should have weight ≈ 0.6
  const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0.6 }), mulberry32(7));
  const bases = nodes.filter(n => n.parentIdx === -1);
  assert.strictEqual(bases.length, 8, 'tillerCount=0.6: expected 8 blades');
  // The crossfade blade is the last one — its weight should be bladeFrac ≈ 0.6
  const bladeFrac = (1 + 0.6 * 11) - Math.floor(1 + 0.6 * 11); // ≈ 0.6
  const crossfadeBase = bases[bases.length - 1];
  assert.ok(
    Math.abs(crossfadeBase.weight - bladeFrac) < 1e-6,
    `crossfade blade weight=${crossfadeBase.weight}, expected ≈ ${bladeFrac}`
  );
});

// ---------------------------------------------------------------------------
// AC 2: Every node has branchLevel===0, isStem===true, parentIdx < ownIndex;
//         no node has isWoody or isRoot
// ---------------------------------------------------------------------------

test('all nodes have branchLevel===0, isStem===true', () => {
  for (let seed = 0; seed < 20; seed++) {
    const { nodes } = buildSkeleton(makeGenome(), mulberry32(seed));
    for (let i = 0; i < nodes.length; i++) {
      assert.strictEqual(nodes[i].branchLevel, 0, `seed=${seed} node[${i}] branchLevel must be 0`);
      assert.strictEqual(nodes[i].isStem, true, `seed=${seed} node[${i}] isStem must be true`);
    }
  }
});

test('parentIdx < ownIndex for all non-root nodes', () => {
  for (let seed = 0; seed < 30; seed++) {
    const { nodes } = buildSkeleton(makeGenome(), mulberry32(seed));
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.parentIdx === -1) continue;
      assert.ok(
        typeof n.parentIdx === 'number' && n.parentIdx < i,
        `seed=${seed} node[${i}]: parentIdx=${n.parentIdx} must be < ${i}`
      );
    }
  }
});

test('no node has isWoody or isRoot', () => {
  const genomes = [
    makeGenome({ tillerCount: 0 }),
    makeGenome({ tillerCount: 1.0 }),
    makeGenome({ tillerCount: 0.5, clumpSpread: 0.8 }),
  ];
  for (const g of genomes) {
    for (let seed = 0; seed < 10; seed++) {
      const { nodes } = buildSkeleton(g, mulberry32(seed));
      for (let i = 0; i < nodes.length; i++) {
        assert.ok(!('isWoody' in nodes[i]), `seed=${seed} node[${i}] must not have isWoody`);
        assert.ok(!('isRoot'  in nodes[i]), `seed=${seed} node[${i}] must not have isRoot`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// AC 3: Exactly one isTerminal node per blade; swayBase is 0 at blade base
//         and 1 at blade tip
// ---------------------------------------------------------------------------

test('exactly one isTerminal per blade', () => {
  const bladeConfigs = [
    { tillerCount: 0   },   // 1 blade
    { tillerCount: 0.5 },   // 7 blades
    { tillerCount: 1.0 },   // 12 blades
  ];

  for (const cfg of bladeConfigs) {
    for (let seed = 0; seed < 10; seed++) {
      const { nodes } = buildSkeleton(makeGenome(cfg), mulberry32(seed));
      const bladeCount    = countBlades(nodes);
      const terminalCount = nodes.filter(n => n.isTerminal).length;
      assert.strictEqual(
        terminalCount, bladeCount,
        `seed=${seed} tillerCount=${cfg.tillerCount}: expected ${bladeCount} terminal nodes, got ${terminalCount}`
      );
    }
  }
});

test('swayBase=0 at blade base nodes and swayBase=1 at blade tips', () => {
  for (let seed = 0; seed < 10; seed++) {
    const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0.5 }), mulberry32(seed));

    // Base nodes (parentIdx === -1) must have swayBase === 0
    const baseNodes = nodes.filter(n => n.parentIdx === -1);
    for (const bn of baseNodes) {
      assert.strictEqual(bn.swayBase, 0, `seed=${seed}: base node swayBase must be 0, got ${bn.swayBase}`);
    }

    // Terminal nodes must have swayBase === 1
    const tipNodes = getTipNodes(nodes);
    for (const tn of tipNodes) {
      assert.strictEqual(tn.swayBase, 1, `seed=${seed}: tip node swayBase must be 1, got ${tn.swayBase}`);
    }
  }
});

test('swayBase increases monotonically from 0 to 1 along each blade chain', () => {
  for (let seed = 0; seed < 5; seed++) {
    const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0.3 }), mulberry32(seed));

    // Build a children map first.
    const childrenOf = new Array(nodes.length).fill(null).map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i].parentIdx;
      if (p >= 0) childrenOf[p].push(i);
    }

    // Find all blade roots.
    const bladeRoots = nodes.map((n, i) => n.parentIdx === -1 ? i : -1).filter(i => i !== -1);
    for (const rootIdx of bladeRoots) {
      let cur = rootIdx;
      let prevSway = -1;
      while (cur !== -1) {
        const sway = nodes[cur].swayBase;
        assert.ok(sway > prevSway, `seed=${seed} node[${cur}]: swayBase=${sway} must be > prev ${prevSway}`);
        prevSway = sway;
        // Walk to the next node in the chain (each node has at most one child in grass).
        const children = childrenOf[cur];
        cur = children.length > 0 ? children[0] : -1;
      }
    }
  }
});

// ---------------------------------------------------------------------------
// AC 4: Determinism — same (genome, rng-seed) → deep-equal graph
//         jitterAmp does NOT change node/bone counts (rng draw count invariant)
// ---------------------------------------------------------------------------

test('determinism: same (genome, rng-seed) → deep-equal output', () => {
  for (let seed = 0; seed < 20; seed++) {
    const g = makeGenome();
    const r1 = buildSkeleton(g, mulberry32(seed));
    const r2 = buildSkeleton(g, mulberry32(seed));
    assert.deepStrictEqual(r1, r2, `seed=${seed}: outputs differ — not deterministic`);
  }
});

test('jitterAmp does NOT change node or bone counts (rng draw count invariant)', () => {
  for (let seed = 0; seed < 10; seed++) {
    const g = makeGenome();
    const { nodes: n0, bones: b0 } = buildSkeleton(g, mulberry32(seed), 0);
    const { nodes: n1, bones: b1 } = buildSkeleton(g, mulberry32(seed), 1.5);
    assert.strictEqual(n0.length, n1.length, `seed=${seed}: jitterAmp changed node count`);
    assert.strictEqual(b0.length, b1.length, `seed=${seed}: jitterAmp changed bone count`);
  }
});

test('jitterAmp=0 vs jitterAmp=1 → same bones topology (a/b indices identical)', () => {
  const g = makeGenome({ tillerCount: 0.5 });
  for (let seed = 0; seed < 5; seed++) {
    const { bones: b0 } = buildSkeleton(g, mulberry32(seed), 0);
    const { bones: b1 } = buildSkeleton(g, mulberry32(seed), 1.0);
    assert.deepStrictEqual(b0, b1, `seed=${seed}: jitterAmp changed bone topology`);
  }
});

// ---------------------------------------------------------------------------
// AC 5: clumpSpread=0 → all blade bases at same XZ point;
//         clumpSpread=1 → bases spread on a ring of the max radius
// ---------------------------------------------------------------------------

test('clumpSpread=0 → all blade bases at (0, 0) XZ (single-point clump)', () => {
  const EPSILON = 1e-10;
  for (let seed = 0; seed < 10; seed++) {
    const { nodes } = buildSkeleton(makeGenome({ clumpSpread: 0, tillerCount: 0.5 }), mulberry32(seed));
    const bases = nodes.filter(n => n.parentIdx === -1);
    for (let i = 0; i < bases.length; i++) {
      const distXZ = Math.sqrt(bases[i].pos[0]**2 + bases[i].pos[2]**2);
      assert.ok(
        distXZ < EPSILON,
        `seed=${seed} blade[${i}] base XZ dist=${distXZ} — expected 0 for clumpSpread=0`
      );
    }
  }
});

test('clumpSpread=0 single blade case: base at origin', () => {
  const { nodes } = buildSkeleton(makeGenome({ clumpSpread: 0, tillerCount: 0 }), mulberry32(0));
  assert.strictEqual(nodes[0].pos[0], 0, 'single blade X must be 0');
  assert.strictEqual(nodes[0].pos[2], 0, 'single blade Z must be 0');
});

test('clumpSpread=1 → blade bases spread away from origin (multi-blade)', () => {
  // With clumpSpread=1 and tillerCount=0.5 (≥2 blades), at least some bases
  // should be away from the origin.
  for (let seed = 0; seed < 10; seed++) {
    const { nodes } = buildSkeleton(
      makeGenome({ clumpSpread: 1.0, tillerCount: 0.5 }),
      mulberry32(seed)
    );
    const bases = nodes.filter(n => n.parentIdx === -1);
    if (bases.length <= 1) continue; // single-blade exception
    const maxDistXZ = Math.max(...bases.map(b => Math.sqrt(b.pos[0]**2 + b.pos[2]**2)));
    assert.ok(maxDistXZ > 0.001, `seed=${seed}: clumpSpread=1 but all bases at origin`);
  }
});

test('single-blade exception: clumpSpread has no effect when tillerCount=0', () => {
  // With exactly 1 blade, base must always be at origin regardless of clumpSpread.
  for (const spread of [0, 0.5, 1.0]) {
    const { nodes } = buildSkeleton(makeGenome({ clumpSpread: spread, tillerCount: 0 }), mulberry32(5));
    const base = nodes.find(n => n.parentIdx === -1);
    assert.ok(Math.abs(base.pos[0]) < 1e-10 && Math.abs(base.pos[2]) < 1e-10,
      `tillerCount=0 clumpSpread=${spread}: base not at origin`);
  }
});

// ---------------------------------------------------------------------------
// Graph connectivity / structural invariants
// ---------------------------------------------------------------------------

test('graph is acyclic (no cycles in parent chain)', () => {
  for (let seed = 0; seed < 10; seed++) {
    const { nodes } = buildSkeleton(makeGenome(), mulberry32(seed));
    for (let i = 0; i < nodes.length; i++) {
      const visited = new Set();
      let cur = i;
      while (cur !== -1) {
        assert.ok(!visited.has(cur), `seed=${seed} cycle detected at node ${i}`);
        visited.add(cur);
        cur = nodes[cur].parentIdx ?? -1;
      }
    }
  }
});

test('all nodes reachable from blade root nodes', () => {
  for (let seed = 0; seed < 10; seed++) {
    const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0.5 }), mulberry32(seed));
    const roots = nodes.map((n, i) => n.parentIdx === -1 ? i : -1).filter(i => i !== -1);

    const childrenMap = new Array(nodes.length).fill(null).map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i].parentIdx;
      if (p >= 0) childrenMap[p].push(i);
    }

    const reachable = new Set(roots);
    const queue = [...roots];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const child of childrenMap[cur]) {
        if (!reachable.has(child)) {
          reachable.add(child);
          queue.push(child);
        }
      }
    }
    assert.strictEqual(
      reachable.size, nodes.length,
      `seed=${seed}: ${nodes.length - reachable.size} nodes not reachable from roots`
    );
  }
});

test('bones array entries reference valid node indices with a < b', () => {
  for (let seed = 0; seed < 10; seed++) {
    const { nodes, bones } = buildSkeleton(makeGenome({ tillerCount: 0.4 }), mulberry32(seed));
    for (let bi = 0; bi < bones.length; bi++) {
      const { a, b } = bones[bi];
      assert.ok(a >= 0 && a < nodes.length, `bone[${bi}].a=${a} out of range [0, ${nodes.length})`);
      assert.ok(b >= 0 && b < nodes.length, `bone[${bi}].b=${b} out of range [0, ${nodes.length})`);
      assert.ok(a < b, `bone[${bi}]: a=${a} must be < b=${b}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Segment count contract
// ---------------------------------------------------------------------------

test('segment count per blade follows bladeSegments mapping [3,8]', () => {
  // bladeSegments=0 → round(0*5)=0 → 3+0=3 segments
  // bladeSegments=1 → round(1*5)=5 → 3+5=8 segments
  // Each blade has segCount+1 nodes (base + segCount chain nodes).
  // With tillerCount=0 (1 blade), total nodes = 1 + segCount.

  const cases = [
    { bladeSegments: 0,   expectedSegs: 3 },
    { bladeSegments: 0.4, expectedSegs: 5 }, // round(0.4*5)=round(2)=2 → 3+2=5
    { bladeSegments: 0.5, expectedSegs: 6 }, // round(0.5*5)=round(2.5)=3 → 3+3=6 (JS rounds 2.5→3)
    { bladeSegments: 1.0, expectedSegs: 8 },
  ];

  for (const { bladeSegments, expectedSegs } of cases) {
    const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0, bladeSegments }), mulberry32(0));
    // 1 blade = base node + segCount intermediate/tip nodes
    const totalNodes = nodes.length;
    const actualSegs = totalNodes - 1; // base is not a "segment"
    assert.strictEqual(
      actualSegs, expectedSegs,
      `bladeSegments=${bladeSegments}: expected ${expectedSegs} chain nodes, got ${actualSegs}`
    );
  }
});

// ---------------------------------------------------------------------------
// meta shape
// ---------------------------------------------------------------------------

test('meta.bodyAxis is [0,1,0] and meta.lightDir is a length-3 array', () => {
  const { meta } = buildSkeleton(makeGenome(), mulberry32(0));
  assert.deepStrictEqual(meta.bodyAxis, [0, 1, 0]);
  assert.ok(Array.isArray(meta.lightDir) && meta.lightDir.length === 3);
});

// ---------------------------------------------------------------------------
// Bone budget within MAX_BONES
// ---------------------------------------------------------------------------

test('bones.length <= MAX_BONES across extreme genomes and seeds', () => {
  const extremes = [
    makeGenome({ tillerCount: 1.0, bladeSegments: 1.0 }), // 12 blades × 8 segs = 96 bones
    makeGenome({ tillerCount: 1.0, bladeSegments: 0.0 }), // 12 blades × 3 segs = 36 bones
    makeGenome({ tillerCount: 0.0, bladeSegments: 1.0 }), // 1 blade × 8 segs = 8 bones
  ];
  for (const g of extremes) {
    for (let seed = 0; seed < 20; seed++) {
      const { bones } = buildSkeleton(g, mulberry32(seed));
      assert.ok(
        bones.length <= MAX_BONES,
        `seed=${seed}: bones=${bones.length} exceeds MAX_BONES=${MAX_BONES}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// No NaN in positions, swayBase, weight, radius
// ---------------------------------------------------------------------------

test('no NaN in any node field', () => {
  const genomes = [
    makeGenome({ tillerCount: 0 }),
    makeGenome({ tillerCount: 1.0 }),
    makeGenome({ tillerCount: 0.5, clumpSpread: 1.0, fanSpread: 1.0 }),
    makeGenome({ tillerCount: 0.7, clumpSpread: 0, fanSpread: 0 }),
    makeGenome({ bladeLength: 0, curve: 1.0, jitter: 1.5 }),
    makeGenome({ bladeLength: 1.0, structuralSeed: 0xDEADBEEF }),
  ];
  for (const g of genomes) {
    for (let seed = 0; seed < 5; seed++) {
      const { nodes } = buildSkeleton(g, mulberry32(seed));
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        assert.ok(!isNaN(n.pos[0]) && !isNaN(n.pos[1]) && !isNaN(n.pos[2]),
          `seed=${seed} node[${i}] pos has NaN`);
        assert.ok(!isNaN(n.radius),   `seed=${seed} node[${i}] radius is NaN`);
        assert.ok(!isNaN(n.weight),   `seed=${seed} node[${i}] weight is NaN`);
        assert.ok(!isNaN(n.swayBase), `seed=${seed} node[${i}] swayBase is NaN`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// fanSpread distribution check
// ---------------------------------------------------------------------------

test('fanSpread=0 → blade bases cluster at the same azimuth (parallel blades)', () => {
  // fanSpread=0 → fanAngle=0 → deterministicAz=0 for all blades.
  // With jitter=0, all bases should be on the positive-X axis.
  const { nodes } = buildSkeleton(
    makeGenome({ fanSpread: 0, tillerCount: 0.5, clumpSpread: 0.3, jitter: 0 }),
    mulberry32(0)
  );
  const bases = nodes.filter(n => n.parentIdx === -1);
  // With jitter=0 and jitterAmp=1, jAmp=0 → jitterAz=0 → all deterministicAz=0.
  // All bases should be on the positive-X axis (az=0).
  for (const b of bases) {
    const angle = Math.atan2(b.pos[2], b.pos[0]);
    // angle should be near 0 (positive X direction)
    assert.ok(
      Math.abs(angle) < 0.01,
      `fanSpread=0 jitter=0: blade base angle=${angle.toFixed(4)} should be ~0 (all parallel)`
    );
  }
});

test('fanSpread=1 → blade bases distributed across full 360°', () => {
  // fanSpread=1 → fanAngle=2π → blades evenly spread, max azimuthal coverage.
  // Multiple blades should span a wide azimuthal range.
  const { nodes } = buildSkeleton(
    makeGenome({ fanSpread: 1.0, tillerCount: 0.8, clumpSpread: 0.5, jitter: 0 }),
    mulberry32(0)
  );
  const bases = nodes.filter(n => n.parentIdx === -1);
  if (bases.length <= 2) return; // skip if not enough bases for a meaningful check
  const angles = bases.map(b => Math.atan2(b.pos[2], b.pos[0]));
  const minAngle = Math.min(...angles);
  const maxAngle = Math.max(...angles);
  const spread   = maxAngle - minAngle;
  // With jitter=0 and even spacing over 2π, spread should be > π (wide fan).
  assert.ok(spread > Math.PI * 0.5, `fanSpread=1: azimuthal spread=${spread.toFixed(4)} is too narrow`);
});

// ---------------------------------------------------------------------------
// swayBase contract across different segment counts
// ---------------------------------------------------------------------------

test('swayBase values form evenly-spaced sequence 0, 1/N, 2/N, ... 1 for each blade', () => {
  // Single blade, different segment counts.
  const segCases = [3, 5, 8];
  for (const expectedSegs of segCases) {
    // bladeSegments = (expectedSegs - 3) / 5
    const bladeSegments = (expectedSegs - 3) / 5;
    const { nodes } = buildSkeleton(
      makeGenome({ tillerCount: 0, bladeSegments }),
      mulberry32(0)
    );
    // Nodes in single blade: base + segCount chain nodes
    const swayBases = nodes.map(n => n.swayBase);
    assert.strictEqual(swayBases[0], 0, 'first node swayBase must be 0');
    assert.strictEqual(swayBases[swayBases.length - 1], 1, 'last node swayBase must be 1');
    // Check even spacing
    for (let i = 1; i < swayBases.length; i++) {
      const expected = i / expectedSegs;
      assert.ok(
        Math.abs(swayBases[i] - expected) < 1e-10,
        `bladeSegments=${bladeSegments}: node[${i}] swayBase=${swayBases[i]} expected ${expected}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// isTerminal nodes carry attachPos
// ---------------------------------------------------------------------------

test('isTerminal nodes have an attachPos field', () => {
  for (let seed = 0; seed < 5; seed++) {
    const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0.5 }), mulberry32(seed));
    const terminalNodes = nodes.filter(n => n.isTerminal);
    assert.ok(terminalNodes.length > 0, `seed=${seed}: no terminal nodes found`);
    for (const tn of terminalNodes) {
      assert.ok(Array.isArray(tn.attachPos) && tn.attachPos.length === 3,
        `seed=${seed}: terminal node missing attachPos`);
      assert.ok(!isNaN(tn.attachPos[0]) && !isNaN(tn.attachPos[1]) && !isNaN(tn.attachPos[2]),
        `seed=${seed}: terminal node attachPos contains NaN`);
    }
  }
});

// ---------------------------------------------------------------------------
// Structural determinism with different genome field values
// ---------------------------------------------------------------------------

test('different structuralSeed → different positions (curvature varies)', () => {
  // Two genomes differing only in structuralSeed should produce different node positions.
  const g0 = makeGenome({ structuralSeed: 0,      curve: 0.8, tillerCount: 0.5 });
  const g1 = makeGenome({ structuralSeed: 123456, curve: 0.8, tillerCount: 0.5 });
  const r0 = buildSkeleton(g0, mulberry32(0));
  const r1 = buildSkeleton(g1, mulberry32(0));
  // Node counts should be the same (same tillerCount + bladeSegments)
  assert.strictEqual(r0.nodes.length, r1.nodes.length, 'structuralSeed should not change node count');
  // But at least some positions should differ
  let hasDiff = false;
  for (let i = 0; i < r0.nodes.length && !hasDiff; i++) {
    const p0 = r0.nodes[i].pos;
    const p1 = r1.nodes[i].pos;
    const dist = Math.sqrt((p0[0]-p1[0])**2 + (p0[1]-p1[1])**2 + (p0[2]-p1[2])**2);
    if (dist > 1e-6) hasDiff = true;
  }
  assert.ok(hasDiff, 'different structuralSeed should yield different node positions');
});

test('determinism across changing tillerCount: same seed reproducible', () => {
  for (let seed = 0; seed < 5; seed++) {
    for (const tc of [0, 0.3, 0.7, 1.0]) {
      const g = makeGenome({ tillerCount: tc });
      const r1 = buildSkeleton(g, mulberry32(seed));
      const r2 = buildSkeleton(g, mulberry32(seed));
      assert.deepStrictEqual(r1, r2, `tillerCount=${tc} seed=${seed}: not deterministic`);
    }
  }
});

// ---------------------------------------------------------------------------
// fanSpread full-sweep fix: last blade reaches the end of the fan angle
// ---------------------------------------------------------------------------

test('fanSpread: last blade azimuth reaches baseFanAngle (no angular gap)', () => {
  // With jitter=0, blade[N-1] should land at deterministicAz = (N-1)*step
  // = (N-1) * (baseFanAngle / (N-1)) = baseFanAngle.
  // For fanSpread=0.5 with 5 blades (tillerCount≈0.36, 5 full blades):
  //   baseFanAngle = 0.5*2π = π
  //   old step = π/5 → last blade at 4*(π/5) = 0.8π (gap of 0.2π)
  //   new step = π/4 → last blade at 4*(π/4) = π (no gap)
  //
  // We use tillerCount that gives exactly 5 full blades + 0 crossfade.
  // tillerCount = (5-1)/11 ≈ 0.3636 → fractBlades=5 exactly → 5 full blades
  const tillerCount = (5 - 1) / 11; // fractBlades = 5.0, bladeFrac = 0
  const { nodes } = buildSkeleton(
    makeGenome({ fanSpread: 0.5, tillerCount, clumpSpread: 0.5, jitter: 0 }),
    mulberry32(0)
  );
  const bases = nodes.filter(n => n.parentIdx === -1);
  assert.strictEqual(bases.length, 5, `expected 5 blades, got ${bases.length}`);

  // Compute azimuths of each base (jitter=0 → exact deterministicAz).
  const azimuths = bases.map(b => Math.atan2(b.pos[2], b.pos[0]));
  // Normalise to [0, 2π)
  const normalised = azimuths.map(a => (a + 2 * Math.PI) % (2 * Math.PI));
  normalised.sort((a, b) => a - b);

  const baseFanAngle = 0.5 * Math.PI * 2; // π
  // Last azimuth should be ≈ baseFanAngle (within a small tolerance for floating-point).
  assert.ok(
    Math.abs(normalised[normalised.length - 1] - baseFanAngle) < 1e-6,
    `fanSpread=0.5 last blade azimuth should be ≈ π (${baseFanAngle.toFixed(6)}), got ${normalised[normalised.length - 1].toFixed(6)}`
  );

  // First azimuth should be ≈ 0.
  assert.ok(
    Math.abs(normalised[0]) < 1e-6,
    `fanSpread=0.5 first blade azimuth should be ≈ 0, got ${normalised[0].toFixed(6)}`
  );
});

// ---------------------------------------------------------------------------
// Per-blade variation: two-point ranges (bladeLengthMax etc.) make each blade
// in a clump sample its own value, so a clump has varied tillers.
// ---------------------------------------------------------------------------

/** Heights (tip Y) of the FULL blades only (weight ≈ 1; excludes the crossfade). */
function fullBladeTipHeights(nodes) {
  return nodes.filter(n => n.isTerminal && (n.weight === undefined || n.weight > 0.99)).map(n => n.pos[1]);
}

test('bladeLengthMax > bladeLength → blades in a clump have varied heights', () => {
  // curve:0 → straight-up blades, so tip Y directly reflects length.
  const g = makeGenome({ tillerCount: 0.8, bladeLength: 0.35, bladeLengthMax: 0.7, curve: 0, structuralSeed: 123 });
  const { nodes } = buildSkeleton(g, mulberry32(g.structuralSeed));
  const h = fullBladeTipHeights(nodes);
  assert.ok(h.length >= 4, `need several full blades, got ${h.length}`);
  const spread = Math.max(...h) - Math.min(...h);
  assert.ok(spread > 0.05, `blades should vary in height, spread=${spread.toFixed(3)}`);
});

test('bladeLengthMax === bladeLength (or absent) → all full blades same height', () => {
  // Absent (makeGenome has no …Max) → fallback max=min → no length variation.
  // curve:0 isolates length (lateral curvature would otherwise nudge tip Y).
  const { nodes } = buildSkeleton(makeGenome({ tillerCount: 0.8, curve: 0, structuralSeed: 123 }), mulberry32(123));
  const h = fullBladeTipHeights(nodes);
  const spread = Math.max(...h) - Math.min(...h);
  assert.ok(spread < 1e-6, `no range → uniform height, but spread=${spread}`);
});

test('per-blade sampled values are stored on base nodes (vWidth/vTaper/vArch/vTipDroop)', () => {
  const g = makeGenome({ tillerCount: 0.8, bladeWidthMax: 0.9, bladeWidth: 0.2, structuralSeed: 5 });
  const { nodes } = buildSkeleton(g, mulberry32(5));
  const bases = nodes.filter(n => n.parentIdx === -1);
  for (const b of bases) {
    for (const k of ['vWidth', 'vTaper', 'vArch', 'vTipDroop']) {
      assert.ok(typeof b[k] === 'number' && isFinite(b[k]), `base node missing ${k}`);
    }
  }
  // width values should differ across blades (range 0.2–0.9).
  const ws = bases.filter(b => b.weight > 0.99).map(b => b.vWidth);
  assert.ok(Math.max(...ws) - Math.min(...ws) > 0.05, 'vWidth should vary across blades');
});

test('per-blade variation is deterministic (same genome+seed → identical heights)', () => {
  const g = makeGenome({ tillerCount: 0.8, bladeLengthMax: 0.7, structuralSeed: 42 });
  const a = fullBladeTipHeights(buildSkeleton(g, mulberry32(42)).nodes);
  const b = fullBladeTipHeights(buildSkeleton(g, mulberry32(42)).nodes);
  assert.deepEqual(a, b);
});
