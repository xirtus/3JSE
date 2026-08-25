// =============================================================================
// proportions.test.mjs — Grass solver: arch/verticality/radius tests
//
// Acceptance criteria (Task 3):
//   1. arch=0, verticality=0.5, stiffness=1 → blades are straight and upright
//   2. Increasing arch monotonically lowers mean tip Y
//   3. Increasing verticality past 0.5 lowers tip elevation monotonically
//   4. Radius decreases monotonically from base to tip; tip radius hits floor
//   5. No NaN in any node position/radius across the full gene range
//   6. Same (graph, env, genome) → deep-equal output (determinism)
//   7. Zero randomness (Math.random never called)
// =============================================================================

import { test }  from 'node:test';
import assert    from 'node:assert/strict';
import { solveProportions } from '../src/proportions.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseEnvelope = {
  gravity:   1.0,
  medium:    'air',
  light:     0.6,
  sunAngle:  0.25,
  wind:      0.2,
  aridity:   0.35,
};

// ---------------------------------------------------------------------------
// Build a minimal single-blade graph with N segments.
//
// Nodes are emitted in the same shape as buildSkeleton (Task 2):
//   node 0:   base (swayBase=0, parentIdx=-1, isStem=true)
//   node 1..N: segments (swayBase=k/N, parentIdx=prev)
//   node N:   isTerminal=true, swayBase=1
//
// The blade starts straight upright; each segment is segLen tall.
// ---------------------------------------------------------------------------
function makeStraightBlade(nSegs = 5, segLen = 0.2, xOffset = 0) {
  const nodes = [];
  const bones = [];

  nodes.push({
    pos:         [xOffset, 0, 0],
    radius:      0.02,
    weight:      1.0,
    branchLevel: 0,
    parentIdx:   -1,
    isStem:      true,
    isTerminal:  false,
    swayBase:    0,
  });

  for (let s = 1; s <= nSegs; s++) {
    const isLast = s === nSegs;
    nodes.push({
      pos:         [xOffset, s * segLen, 0],
      radius:      0.02 * (1 - 0.8 * (s / nSegs)),
      weight:      1.0,
      branchLevel: 0,
      parentIdx:   s - 1,
      isStem:      true,
      isTerminal:  isLast,
      swayBase:    s / nSegs,
    });
    bones.push({ a: s - 1, b: s });
  }

  return { nodes, bones, meta: { bodyAxis: [0, 1, 0] } };
}

// Build a clump of two blades (offset bases on XZ ring) for clump tests.
function makeTwoBladeSClump(nSegs = 5) {
  const nodes = [];
  const bones = [];
  const SEG_LEN = 0.2;
  const offsets = [[0.2, 0, 0], [-0.2, 0, 0]];

  for (const [bx, by, bz] of offsets) {
    const baseIdx = nodes.length;
    nodes.push({
      pos: [bx, by, bz], radius: 0.02, weight: 1.0,
      branchLevel: 0, parentIdx: -1, isStem: true, isTerminal: false, swayBase: 0,
    });
    for (let s = 1; s <= nSegs; s++) {
      const isLast = s === nSegs;
      const newIdx = nodes.length;
      nodes.push({
        pos:         [bx, s * SEG_LEN, bz],
        radius:      0.02,
        weight:      1.0,
        branchLevel: 0,
        parentIdx:   newIdx - 1,
        isStem:      true,
        isTerminal:  isLast,
        swayBase:    s / nSegs,
      });
      bones.push({ a: newIdx - 1, b: newIdx });
    }
  }

  return { nodes, bones, meta: { bodyAxis: [0, 1, 0] } };
}

function cloneGraph(g) {
  return JSON.parse(JSON.stringify(g));
}

// Get the single terminal node (for single-blade fixtures).
function tip(graph) {
  return graph.nodes.find(n => n.isTerminal === true);
}

// Get all terminal nodes.
function tips(graph) {
  return graph.nodes.filter(n => n.isTerminal === true);
}

// Mean Y of all terminal nodes.
function meanTipY(graph) {
  const ts = tips(graph);
  if (!ts.length) return 0;
  return ts.reduce((s, n) => s + n.pos[1], 0) / ts.length;
}

// ---------------------------------------------------------------------------
// 1. arch=0 + verticality=0.5 + stiffness=1 → blade is straight and upright
//    (tip directly above base within tolerance)
// ---------------------------------------------------------------------------

test('arch=0, verticality=0.5, stiffness=1 → blade is straight and upright', () => {
  const graph = cloneGraph(makeStraightBlade(5, 0.2, 0));
  solveProportions(graph, baseEnvelope, {
    arch: 0, verticality: 0.5, stiffness: 1,
    bladeWidth: 0.5, bladeTaper: 0.5, tipDroop: 0,
  });

  const base = graph.nodes[0];
  const tipNode = tip(graph);

  // With zero arch and erect verticality, the tip should be directly above the base.
  const dx = tipNode.pos[0] - base.pos[0];
  const dz = tipNode.pos[2] - base.pos[2];
  const horizontalDrift = Math.sqrt(dx * dx + dz * dz);

  // Allow small floating-point drift (< 1e-8).
  assert.ok(
    horizontalDrift < 1e-7,
    `arch=0 stiffness=1 verticality=0.5: tip should be directly above base; horizontal drift=${horizontalDrift}`
  );

  // Tip Y must be above base Y (blade stands upright).
  assert.ok(
    tipNode.pos[1] > base.pos[1],
    `tip Y (${tipNode.pos[1]}) must be above base Y (${base.pos[1]})`
  );
});

// ---------------------------------------------------------------------------
// 2. Increasing arch monotonically lowers mean tip Y
// ---------------------------------------------------------------------------

test('increasing arch monotonically lowers mean tip Y', () => {
  const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const tipYs = steps.map(a => {
    const g = cloneGraph(makeStraightBlade(5, 0.2, 0.1));
    solveProportions(g, baseEnvelope, {
      arch: a, verticality: 0.5, stiffness: 0,
      bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
    });
    return meanTipY(g);
  });

  for (let i = 1; i < tipYs.length; i++) {
    assert.ok(
      tipYs[i] <= tipYs[i - 1] + 1e-9,
      `arch monotonicity violated at step ${i}: tipY=${tipYs[i]} > prev tipY=${tipYs[i - 1]}`
    );
  }

  // arch=1 must produce substantially lower tips than arch=0.
  assert.ok(
    tipYs[tipYs.length - 1] < tipYs[0],
    `arch=1 tipY (${tipYs[tipYs.length - 1]}) must be lower than arch=0 tipY (${tipYs[0]})`
  );
});

// ---------------------------------------------------------------------------
// 3a. Increasing verticality PAST 0.5 lowers tip elevation monotonically
//     (v=0.5 is peak/erect; v→1 is pendulous/low)
// ---------------------------------------------------------------------------

test('verticality 0.5→1: tip elevation decreases monotonically (pendulous past erect)', () => {
  // The plan says "increasing verticality past 0.5 lowers tip elevation monotonically."
  // Test the [0.5, 1.0] half of the range.
  const steps = [0.5, 0.625, 0.75, 0.875, 1.0];
  const elevations = steps.map(v => {
    const g = cloneGraph(makeStraightBlade(5, 0.2, 0.3));
    solveProportions(g, baseEnvelope, {
      arch: 0, verticality: v, stiffness: 1,
      bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
    });
    return tip(g).pos[1];
  });

  for (let i = 1; i < elevations.length; i++) {
    assert.ok(
      elevations[i] <= elevations[i - 1] + 1e-9,
      `verticality monotonicity violated at step ${i} (v=${steps[i]}): elevation=${elevations[i]} > prev=${elevations[i - 1]}`
    );
  }

  // v=0.5 (erect) must have the highest elevation in the range.
  assert.ok(
    elevations[0] > elevations[elevations.length - 1],
    `verticality=0.5 tip (${elevations[0]}) must be higher than verticality=1 tip (${elevations[elevations.length - 1]})`
  );
});

// ---------------------------------------------------------------------------
// 3b. Below 0.5 spreads outward: v=0 gives lower elevation than v=0.5 (erect)
// ---------------------------------------------------------------------------

test('verticality below 0.5 spreads outward: v=0 tip is lower than v=0.5 (erect)', () => {
  const gErect = cloneGraph(makeStraightBlade(5, 0.2, 0.3));
  solveProportions(gErect, baseEnvelope, {
    arch: 0, verticality: 0.5, stiffness: 1,
    bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
  });

  const gProstrate = cloneGraph(makeStraightBlade(5, 0.2, 0.3));
  solveProportions(gProstrate, baseEnvelope, {
    arch: 0, verticality: 0, stiffness: 1,
    bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
  });

  assert.ok(
    tip(gProstrate).pos[1] < tip(gErect).pos[1],
    `verticality=0 (prostrate/outward) tip Y (${tip(gProstrate).pos[1].toFixed(4)}) should be below verticality=0.5 erect tip Y (${tip(gErect).pos[1].toFixed(4)})`
  );
});

// ---------------------------------------------------------------------------
// 3c. verticality=1 (pendulous) → tip Y is below base Y
// ---------------------------------------------------------------------------

test('verticality=1 (pendulous): tip is below the blade base elevation', () => {
  const g = cloneGraph(makeStraightBlade(5, 0.2, 0.3));
  solveProportions(g, baseEnvelope, {
    arch: 0, verticality: 1, stiffness: 1,
    bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
  });
  const base = g.nodes[0];
  const tipNode = tip(g);
  assert.ok(
    tipNode.pos[1] < base.pos[1],
    `verticality=1 (pendulous): tip Y (${tipNode.pos[1]}) should be below base Y (${base.pos[1]})`
  );
});

// ---------------------------------------------------------------------------
// 4a. Radius decreases monotonically from base to tip within each blade
// ---------------------------------------------------------------------------

test('radius decreases monotonically from base to tip (bladeTaper=1)', () => {
  const g = cloneGraph(makeStraightBlade(6, 0.2, 0));
  solveProportions(g, baseEnvelope, {
    bladeWidth: 0.5, bladeTaper: 1.0,
    arch: 0, verticality: 0.5, stiffness: 1, tipDroop: 0,
  });

  const radii = g.nodes.map(n => n.radius);

  for (let i = 1; i < radii.length; i++) {
    assert.ok(
      radii[i] <= radii[i - 1] + 1e-9,
      `Radius not monotonically decreasing at node ${i}: ${radii[i]} > ${radii[i - 1]}`
    );
  }
});

// ---------------------------------------------------------------------------
// 4b. Tip radius hits the documented floor (TIP_RADIUS_FLOOR = 0.001)
// ---------------------------------------------------------------------------

test('tip radius is at TIP_RADIUS_FLOOR (0.001) when bladeTaper=1', () => {
  const g = cloneGraph(makeStraightBlade(5, 0.2, 0));
  solveProportions(g, baseEnvelope, {
    bladeWidth: 0.5, bladeTaper: 1.0,
    arch: 0, verticality: 0.5, stiffness: 1, tipDroop: 0,
  });
  const tipNode = tip(g);
  assert.ok(
    tipNode.radius <= 0.005,
    `Tip radius (${tipNode.radius}) should be at the floor (~0.001); got ${tipNode.radius}`
  );
  assert.ok(
    tipNode.radius >= 0.001 - 1e-9,
    `Tip radius (${tipNode.radius}) should be >= TIP_RADIUS_FLOOR=0.001`
  );
});

// ---------------------------------------------------------------------------
// 4c. bladeTaper=0 → parallel-sided ribbon (all nodes same radius)
// ---------------------------------------------------------------------------

test('bladeTaper=0 → parallel-sided ribbon (all nodes have the same radius)', () => {
  const g = cloneGraph(makeStraightBlade(5, 0.2, 0));
  solveProportions(g, baseEnvelope, {
    bladeWidth: 0.5, bladeTaper: 0,
    arch: 0, verticality: 0.5, stiffness: 1, tipDroop: 0,
  });
  const r0 = g.nodes[0].radius;
  for (const n of g.nodes) {
    assert.ok(
      Math.abs(n.radius - r0) < 1e-9,
      `bladeTaper=0: all radii must equal base radius ${r0}, got ${n.radius}`
    );
  }
});

// ---------------------------------------------------------------------------
// 5. No NaN in any node position/radius across full gene range (fuzz)
// ---------------------------------------------------------------------------

test('no NaN in any node position/radius across extreme gene combinations', () => {
  const extremes = [
    { arch: 0,   verticality: 0,   stiffness: 0,   bladeWidth: 0,   bladeTaper: 0,   tipDroop: 0   },
    { arch: 1,   verticality: 1,   stiffness: 1,   bladeWidth: 1,   bladeTaper: 1,   tipDroop: 1   },
    { arch: 0.5, verticality: 0.5, stiffness: 0.5, bladeWidth: 0.5, bladeTaper: 0.5, tipDroop: 0.5 },
    { arch: 1,   verticality: 0,   stiffness: 0,   bladeWidth: 1,   bladeTaper: 1,   tipDroop: 1   },
    { arch: 0,   verticality: 1,   stiffness: 1,   bladeWidth: 0,   bladeTaper: 0,   tipDroop: 0   },
  ];

  for (const genome of extremes) {
    const g = cloneGraph(makeStraightBlade(5, 0.2, 0.2));
    solveProportions(g, baseEnvelope, genome);

    for (let i = 0; i < g.nodes.length; i++) {
      const n = g.nodes[i];
      assert.ok(Number.isFinite(n.pos[0]), `node[${i}].pos[0] is NaN/Inf: ${n.pos[0]}, genome=${JSON.stringify(genome)}`);
      assert.ok(Number.isFinite(n.pos[1]), `node[${i}].pos[1] is NaN/Inf: ${n.pos[1]}, genome=${JSON.stringify(genome)}`);
      assert.ok(Number.isFinite(n.pos[2]), `node[${i}].pos[2] is NaN/Inf: ${n.pos[2]}, genome=${JSON.stringify(genome)}`);
      assert.ok(Number.isFinite(n.radius) && n.radius > 0, `node[${i}].radius is NaN/Inf/<=0: ${n.radius}, genome=${JSON.stringify(genome)}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Determinism: same (graph, env, genome) → deep-equal output on two calls
// ---------------------------------------------------------------------------

test('determinism: same inputs produce deep-equal output on two calls', () => {
  const genome = {
    arch: 0.4, verticality: 0.3, stiffness: 0.5,
    bladeWidth: 0.5, bladeTaper: 0.7, tipDroop: 0.3,
  };

  const r1 = solveProportions(cloneGraph(makeStraightBlade(5, 0.2, 0.1)), baseEnvelope, genome);
  const r2 = solveProportions(cloneGraph(makeStraightBlade(5, 0.2, 0.1)), baseEnvelope, genome);

  assert.deepStrictEqual(
    r1.nodes.map(n => ({ radius: n.radius, pos: n.pos.slice() })),
    r2.nodes.map(n => ({ radius: n.radius, pos: n.pos.slice() })),
    'Repeated calls with same inputs must produce identical results'
  );
});

// ---------------------------------------------------------------------------
// 7. Zero randomness: Math.random is never called during solveProportions
// ---------------------------------------------------------------------------

test('zero-rng: Math.random is never called during solveProportions', () => {
  let called = false;
  const orig = Math.random;
  Math.random = () => { called = true; return orig(); };
  try {
    solveProportions(cloneGraph(makeStraightBlade(5, 0.2, 0.1)), baseEnvelope, {
      arch: 0.5, verticality: 0.5, stiffness: 0.5,
      bladeWidth: 0.5, bladeTaper: 0.5, tipDroop: 0.5,
    });
    assert.strictEqual(called, false, 'Math.random must not be called');
  } finally {
    Math.random = orig;
  }
});

// ---------------------------------------------------------------------------
// 8. genome=null → no crash, produces finite output (tolerant guard)
// ---------------------------------------------------------------------------

test('genome=null produces finite output (tolerant defaults)', () => {
  const g = cloneGraph(makeStraightBlade(5, 0.2, 0));
  solveProportions(g, baseEnvelope, null);
  for (const n of g.nodes) {
    assert.ok(Number.isFinite(n.pos[1]), `genome=null: pos[1] must be finite, got ${n.pos[1]}`);
    assert.ok(Number.isFinite(n.radius) && n.radius > 0, `genome=null: radius must be positive, got ${n.radius}`);
  }
});

// ---------------------------------------------------------------------------
// 9. parentIdx ordering invariant: violation throws
// ---------------------------------------------------------------------------

test('parentIdx >= ownIndex throws ordering invariant error', () => {
  const g = cloneGraph(makeStraightBlade(3, 0.2, 0));
  g.nodes[1].parentIdx = 2; // child points to a later node — violation
  assert.throws(
    () => solveProportions(g, baseEnvelope),
    /ordering invariant/,
    'should throw on parentIdx >= ownIndex'
  );
});

// ---------------------------------------------------------------------------
// 10. lightDir is written to graph.meta after solve
// ---------------------------------------------------------------------------

test('sunAngle → lightDir is written to graph.meta after solve', () => {
  const g = cloneGraph(makeStraightBlade(4, 0.2, 0));
  solveProportions(g, baseEnvelope);
  assert.ok(Array.isArray(g.meta.lightDir), 'meta.lightDir should be an array');
  assert.strictEqual(g.meta.lightDir.length, 3, 'lightDir should have 3 components');
  const len = Math.sqrt(g.meta.lightDir.reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(len - 1) < 1e-9, `lightDir should be unit length, got ${len}`);
});

// ---------------------------------------------------------------------------
// 11. tipDroop increases downward bend in the distal third
// ---------------------------------------------------------------------------

test('tipDroop > 0 produces more tip droop than tipDroop = 0', () => {
  const baseGenome = {
    arch: 0.3, verticality: 0.5, stiffness: 0,
    bladeWidth: 0.5, bladeTaper: 0,
  };

  const g0 = cloneGraph(makeStraightBlade(6, 0.2, 0.1));
  solveProportions(g0, baseEnvelope, { ...baseGenome, tipDroop: 0 });

  const g1 = cloneGraph(makeStraightBlade(6, 0.2, 0.1));
  solveProportions(g1, baseEnvelope, { ...baseGenome, tipDroop: 0.8 });

  // The terminal tip should be lower when tipDroop > 0.
  assert.ok(
    tip(g1).pos[1] < tip(g0).pos[1],
    `tipDroop=0.8 tip Y (${tip(g1).pos[1].toFixed(4)}) must be lower than tipDroop=0 tip Y (${tip(g0).pos[1].toFixed(4)})`
  );
});

// ---------------------------------------------------------------------------
// 12. stiffness=1 → near-zero arch (blades barely bend regardless of arch gene)
// ---------------------------------------------------------------------------

test('stiffness=1 → arch effect is near-zero (blade stays upright)', () => {
  const g = cloneGraph(makeStraightBlade(5, 0.2, 0));
  const gNoArch = cloneGraph(makeStraightBlade(5, 0.2, 0));

  // With stiffness=1 and arch=1.
  solveProportions(g, baseEnvelope, {
    arch: 1.0, verticality: 0.5, stiffness: 1.0,
    bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
  });

  // With stiffness=1 and arch=0 (identity baseline).
  solveProportions(gNoArch, baseEnvelope, {
    arch: 0, verticality: 0.5, stiffness: 1.0,
    bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
  });

  // The tip Y at stiffness=1 + arch=1 should be very close to stiffness=1 + arch=0.
  const diff = Math.abs(tip(g).pos[1] - tip(gNoArch).pos[1]);
  assert.ok(
    diff < 0.05,
    `stiffness=1: arch=1 tip Y (${tip(g).pos[1].toFixed(4)}) should be near arch=0 tip Y (${tip(gNoArch).pos[1].toFixed(4)}), diff=${diff}`
  );
});

// ---------------------------------------------------------------------------
// 13. bladeWidth gene scales radius monotonically
// ---------------------------------------------------------------------------

test('bladeWidth gene: radius scales monotonically with gene', () => {
  const steps = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const baseRadii = steps.map(w => {
    const g = cloneGraph(makeStraightBlade(4, 0.2, 0));
    solveProportions(g, baseEnvelope, {
      bladeWidth: w, bladeTaper: 0,
      arch: 0, verticality: 0.5, stiffness: 1, tipDroop: 0,
    });
    return g.nodes[0].radius; // base node radius
  });

  for (let i = 1; i < baseRadii.length; i++) {
    assert.ok(
      baseRadii[i] >= baseRadii[i - 1] - 1e-9,
      `bladeWidth monotonicity violated at step ${i}: ${baseRadii[i]} < ${baseRadii[i - 1]}`
    );
  }
});

// ---------------------------------------------------------------------------
// 14. Tolerant: isWoody and isRoot nodes present → no throw, no NaN
// ---------------------------------------------------------------------------

test('tolerant guards: isWoody + isRoot nodes in graph do not throw or produce NaN', () => {
  // Build a graph with isWoody and isRoot tags (these are absent in grass but
  // should not cause a crash — we need tolerant behaviour per the plan).
  const g = cloneGraph(makeStraightBlade(4, 0.2, 0));
  // Add legacy tree tags to nodes (must not crash).
  g.nodes[0].isWoody = true;
  g.nodes[0].isRoot  = true;
  g.nodes[1].isWoody = true;

  assert.doesNotThrow(
    () => solveProportions(g, baseEnvelope, { bladeWidth: 0.5, bladeTaper: 0.5, arch: 0.3 }),
    'Should not throw when isWoody/isRoot tags are present'
  );

  for (const n of g.nodes) {
    assert.ok(Number.isFinite(n.pos[1]), `node pos[1] must be finite after tolerant solve, got ${n.pos[1]}`);
    assert.ok(Number.isFinite(n.radius) && n.radius > 0, `node radius must be positive, got ${n.radius}`);
  }
});

// ---------------------------------------------------------------------------
// 15. Multi-blade clump: all tips are finite and non-NaN
// ---------------------------------------------------------------------------

test('multi-blade clump: all tips are finite and non-NaN', () => {
  const g = cloneGraph(makeTwoBladeSClump(5));
  solveProportions(g, baseEnvelope, {
    arch: 0.4, verticality: 0.4, stiffness: 0.3,
    bladeWidth: 0.5, bladeTaper: 0.6, tipDroop: 0.3,
  });

  const ts = tips(g);
  assert.ok(ts.length >= 2, `Expected at least 2 tips, got ${ts.length}`);

  for (const n of ts) {
    assert.ok(Number.isFinite(n.pos[0]), `tip pos[0] NaN: ${n.pos[0]}`);
    assert.ok(Number.isFinite(n.pos[1]), `tip pos[1] NaN: ${n.pos[1]}`);
    assert.ok(Number.isFinite(n.pos[2]), `tip pos[2] NaN: ${n.pos[2]}`);
  }
});

// ---------------------------------------------------------------------------
// 16. Determinism on multi-blade clump
// ---------------------------------------------------------------------------

test('determinism: multi-blade clump produces deep-equal output on two calls', () => {
  const genome = { arch: 0.5, verticality: 0.3, stiffness: 0.4, bladeWidth: 0.4, bladeTaper: 0.8, tipDroop: 0.2 };

  const r1 = solveProportions(cloneGraph(makeTwoBladeSClump(5)), baseEnvelope, genome);
  const r2 = solveProportions(cloneGraph(makeTwoBladeSClump(5)), baseEnvelope, genome);

  assert.deepStrictEqual(
    r1.nodes.map(n => ({ radius: n.radius, pos: n.pos.slice() })),
    r2.nodes.map(n => ({ radius: n.radius, pos: n.pos.slice() })),
    'Multi-blade clump must be deterministic'
  );
});

// ---------------------------------------------------------------------------
// Build a clump of N blades all rooted at the origin (clumpSpread=0 case).
// Blades point straight up — no lateral curvature — to exercise the
// per-chain index fallback in the tilt-axis derivation.
// ---------------------------------------------------------------------------
function makeOriginClump(bladeCount = 4, nSegs = 5, segLen = 0.2) {
  const nodes = [];
  const bones = [];
  for (let bi = 0; bi < bladeCount; bi++) {
    const baseIdx = nodes.length;
    nodes.push({
      pos: [0, 0, 0], radius: 0.02, weight: 1.0,
      branchLevel: 0, parentIdx: -1, isStem: true, isTerminal: false, swayBase: 0,
    });
    for (let s = 1; s <= nSegs; s++) {
      const newIdx = nodes.length;
      nodes.push({
        pos:         [0, s * segLen, 0],
        radius:      0.02,
        weight:      1.0,
        branchLevel: 0,
        parentIdx:   newIdx - 1,
        isStem:      true,
        isTerminal:  s === nSegs,
        swayBase:    s / nSegs,
      });
      bones.push({ a: newIdx - 1, b: newIdx });
    }
  }
  return { nodes, bones, meta: { bodyAxis: [0, 1, 0] } };
}

// ---------------------------------------------------------------------------
// 17. clumpSpread=0 tilt-axis fix: blades at origin get distinct tilt axes
//     so they fan radially rather than all bending in the same plane.
// ---------------------------------------------------------------------------

test('clumpSpread=0: blades at origin fan radially (distinct tilt axes)', () => {
  // 4 blades, all bases at (0,0,0) — the clumpSpread=0 case.
  // With arch > 0 and verticality != 0.5, each blade should bend in a
  // different XZ direction thanks to per-chain-index fallback tilt axes.
  const g = cloneGraph(makeOriginClump(4, 5, 0.2));
  solveProportions(g, baseEnvelope, {
    arch: 0.5, verticality: 0.3, stiffness: 0,
    bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
  });

  // Collect tip XZ positions.
  const terminalNodes = g.nodes.filter(n => n.isTerminal);
  assert.strictEqual(terminalNodes.length, 4, 'expected 4 tips');

  // Each blade's tip should have a distinct XZ direction (unique heading).
  const azimuths = terminalNodes.map(n => Math.atan2(n.pos[2], n.pos[0]));
  const uniqueAzimuths = new Set(azimuths.map(a => a.toFixed(4)));
  assert.ok(
    uniqueAzimuths.size === 4,
    `clumpSpread=0: expected 4 distinct tip azimuths, got ${uniqueAzimuths.size} (${[...uniqueAzimuths].join(', ')})`
  );
});

test('clumpSpread=0: single blade at origin does not crash and bends correctly', () => {
  // Single blade — the single-chain case should use bladeAngle=0 (chain 0 of 1).
  const g = cloneGraph(makeOriginClump(1, 5, 0.2));
  assert.doesNotThrow(() => {
    solveProportions(g, baseEnvelope, {
      arch: 0.5, verticality: 0.3, stiffness: 0,
      bladeWidth: 0.5, bladeTaper: 0, tipDroop: 0,
    });
  }, 'single blade at origin must not throw');
  const tipNode = g.nodes.find(n => n.isTerminal);
  assert.ok(Number.isFinite(tipNode.pos[0]), 'tip pos[0] must be finite');
  assert.ok(Number.isFinite(tipNode.pos[1]), 'tip pos[1] must be finite');
  assert.ok(Number.isFinite(tipNode.pos[2]), 'tip pos[2] must be finite');
});
