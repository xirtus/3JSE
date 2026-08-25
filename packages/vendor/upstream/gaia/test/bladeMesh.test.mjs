// =============================================================================
// test/bladeMesh.test.mjs — Blade-ribbon mesher tests (Task 5)
//
// Covers all acceptance criteria from GRASS_PLAN.md Task 5:
//   - Empty graph → zero-length arrays, no throw.
//   - Single straight blade: vertex/triangle counts match formula.
//   - swayFactor is 0 at base vertices, 1 at tip apex.
//   - bladeTaper/bladeWidth/midribStrength/bladeRaggedness opts change geometry.
//   - bounds AABB contains all vertices; no NaN in any buffer.
//   - nodeToBlade maps each rendered node to a valid blade index.
//   - Pure function: two calls on same graph+opts → byte-identical arrays.
//   - GLSL token 'windOffset' is present in createBladeMaterial's onBeforeCompile
//     injection string.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBladeGeometry, createBladeMaterial, createBladeDepthMaterial } from '../src/bladeMesh.js';
import { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS } from '../src/windGlsl.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal straight blade graph of N nodes.
 * Nodes go from y=0 (base) to y=worldLen (tip).
 * All nodes: branchLevel=0, isStem=true.
 * swayBase: 0 at base, 1 at tip.
 */
function makeBladeGraph(N = 4, worldLen = 1.0) {
  const nodes = [];
  const bones = [];
  const segLen = worldLen / (N - 1);

  for (let i = 0; i < N; i++) {
    const swayBase = i / (N - 1);
    nodes.push({
      pos:         [0, i * segLen, 0],
      radius:      0.015 * (1 - 0.8 * swayBase),
      weight:      1.0,
      branchLevel: 0,
      parentIdx:   i === 0 ? -1 : i - 1,
      isStem:      true,
      isTerminal:  i === N - 1,
      swayBase,
    });
    if (i > 0) {
      bones.push({ a: i - 1, b: i });
    }
  }

  return {
    nodes,
    bones,
    meta: { bodyAxis: [0, 1, 0], lightDir: [0.4, 0.9, 0.3] },
  };
}

/**
 * Build a multi-blade (clump) graph with `bladeCount` blades, each of N nodes.
 */
function makeClumpGraph(bladeCount = 3, nodesPerBlade = 4) {
  const nodes = [];
  const bones = [];

  for (let bi = 0; bi < bladeCount; bi++) {
    const baseX = bi * 0.1;
    const baseIdx = nodes.length;

    for (let ni = 0; ni < nodesPerBlade; ni++) {
      const swayBase = ni / (nodesPerBlade - 1);
      nodes.push({
        pos:         [baseX, ni * 0.25, 0],
        radius:      0.015 * (1 - 0.8 * swayBase),
        weight:      1.0,
        branchLevel: 0,
        parentIdx:   ni === 0 ? -1 : baseIdx + ni - 1,
        isStem:      true,
        isTerminal:  ni === nodesPerBlade - 1,
        swayBase,
      });
      if (ni > 0) {
        bones.push({ a: baseIdx + ni - 1, b: baseIdx + ni });
      }
    }
  }

  return {
    nodes,
    bones,
    meta: { bodyAxis: [0, 1, 0], lightDir: [0.4, 0.9, 0.3] },
  };
}

/**
 * Assert no NaN or Infinity in a typed array.
 */
function assertNoNaN(arr, label) {
  for (let i = 0; i < arr.length; i++) {
    assert.ok(
      isFinite(arr[i]) && !isNaN(arr[i]),
      `${label}[${i}] = ${arr[i]} is NaN or non-finite`
    );
  }
}

/**
 * Compare two typed arrays for byte-identical equality.
 */
function assertTypedArrayEqual(a, b, label) {
  assert.strictEqual(a.length, b.length, `${label}: length mismatch (${a.length} vs ${b.length})`);
  for (let i = 0; i < a.length; i++) {
    assert.strictEqual(a[i], b[i], `${label}[${i}] mismatch: ${a[i]} vs ${b[i]}`);
  }
}

// ---------------------------------------------------------------------------
// AC: Empty graph → zero-length arrays, never throws.
// ---------------------------------------------------------------------------

test('empty graph (0 bones) → zero-length arrays, vertexCount/triangleCount===0', () => {
  const emptyGraph = { nodes: [], bones: [], meta: {} };
  let result;
  assert.doesNotThrow(() => {
    result = buildBladeGeometry(emptyGraph);
  });
  assert.strictEqual(result.vertexCount, 0);
  assert.strictEqual(result.triangleCount, 0);
  assert.strictEqual(result.positions.length, 0);
  assert.strictEqual(result.normals.length, 0);
  assert.strictEqual(result.uvs.length, 0);
  assert.strictEqual(result.ao.length, 0);
  assert.strictEqual(result.swayFactor.length, 0);
  assert.strictEqual(result.colorSeed.length, 0);
  assert.strictEqual(result.indices.length, 0);
  assert.deepStrictEqual(result.bounds, { min: [0,0,0], max: [0,0,0] });
});

test('null/undefined bones → zero-length arrays, never throws', () => {
  const badGraph = { nodes: [{ pos:[0,0,0], parentIdx:-1, swayBase:0, branchLevel:0 }], bones: null, meta: {} };
  let result;
  assert.doesNotThrow(() => {
    result = buildBladeGeometry(badGraph);
  });
  assert.strictEqual(result.vertexCount, 0);
  assert.strictEqual(result.triangleCount, 0);
});

// ---------------------------------------------------------------------------
// AC: Single straight blade of N nodes: vertex/triangle counts match formula.
// Without midrib: V = 2*(N-1)+1, T = 2*(N-1)-1
//   (Tip fan is 1 tri; side:DoubleSide renders back face — the old coplanar
//    reverse tri caused z-fighting and was removed.)
// With midrib:    V = 3*(N-1)+1, T = 4*(N-2)+2 for N >= 3; T=2 for N=2
// ---------------------------------------------------------------------------

test('single blade N=2 (1 bone) without midrib: V=3, T=1', () => {
  const graph = makeBladeGraph(2);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });
  assert.strictEqual(result.vertexCount, 3, `V expected 3, got ${result.vertexCount}`);
  assert.strictEqual(result.triangleCount, 1, `T expected 1, got ${result.triangleCount}`);
});

test('single blade N=3 (2 bones) without midrib: V=5, T=3', () => {
  const graph = makeBladeGraph(3);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });
  assert.strictEqual(result.vertexCount, 5);
  assert.strictEqual(result.triangleCount, 3);
});

test('single blade N=4 (3 bones) without midrib: V=7, T=5', () => {
  const graph = makeBladeGraph(4);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });
  assert.strictEqual(result.vertexCount, 7);
  assert.strictEqual(result.triangleCount, 5);
});

test('single blade N=6 (5 bones) without midrib: V=11, T=9', () => {
  const graph = makeBladeGraph(6);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });
  assert.strictEqual(result.vertexCount, 11);
  assert.strictEqual(result.triangleCount, 9);
});

test('single blade N=4 with midrib: V=10, T=10', () => {
  // V = 3*(N-1)+1 = 3*3+1 = 10
  // T = 4*(N-2)+2 = 4*2+2 = 10 ... wait, re-check
  // N=4: (N-2)=2 quad pairs → 4*2=8 tris + 2 tip tris = 10
  const graph = makeBladeGraph(4);
  const result = buildBladeGeometry(graph, { midribStrength: 0.3 });
  const expectedV = 3 * (4 - 1) + 1;  // 10
  const expectedT = 4 * (4 - 2) + 2;  // 10
  assert.strictEqual(result.vertexCount, expectedV, `V: expected ${expectedV}, got ${result.vertexCount}`);
  assert.strictEqual(result.triangleCount, expectedT, `T: expected ${expectedT}, got ${result.triangleCount}`);
});

test('single blade N=2 with midrib: V=4, T=2', () => {
  // V = 3*(2-1)+1 = 4
  // T: N-2=0 quad pairs → 0 + 2 tip tris = 2
  const graph = makeBladeGraph(2);
  const result = buildBladeGeometry(graph, { midribStrength: 0.3 });
  assert.strictEqual(result.vertexCount, 4);
  assert.strictEqual(result.triangleCount, 2);
});

// ---------------------------------------------------------------------------
// AC: swayFactor is 0 at base vertices and 1 at the tip apex.
// ---------------------------------------------------------------------------

test('swayFactor: base ring vertices = 0, tip apex = 1', () => {
  const graph = makeBladeGraph(5);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });

  // Base ring (ring 0): vertices 0 and 1 should have swayFactor = 0.
  assert.strictEqual(result.swayFactor[0], 0, 'base left vertex swayFactor should be 0');
  assert.strictEqual(result.swayFactor[1], 0, 'base right vertex swayFactor should be 0');

  // Tip apex: last vertex should have swayFactor = 1.
  const lastVI = result.vertexCount - 1;
  assert.strictEqual(result.swayFactor[lastVI], 1, `tip apex swayFactor should be 1, got ${result.swayFactor[lastVI]}`);
});

test('swayFactor is monotonically non-decreasing along a single blade', () => {
  const N = 6;
  const graph = makeBladeGraph(N);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });

  // swayFactor per ring: ring[i] gets swayBase of nodes[chain[i]].
  // Rings are emitted in order, 2 verts per ring.
  const vpp = 2; // verts per ring
  let prevSway = -1;
  for (let ri = 0; ri < N - 1; ri++) {
    const sway = result.swayFactor[ri * vpp];
    assert.ok(sway >= prevSway - 1e-6, `swayFactor at ring ${ri} (${sway}) < prev (${prevSway})`);
    prevSway = sway;
  }
  // Apex
  const apexSway = result.swayFactor[result.vertexCount - 1];
  assert.ok(apexSway >= prevSway - 1e-6, 'apex swayFactor should be >= last ring');
  assert.strictEqual(apexSway, 1, 'apex swayFactor must be exactly 1');
});

// ---------------------------------------------------------------------------
// AC: opts change geometry.
// ---------------------------------------------------------------------------

test('parallel body + tip taper: lower blade stays full width; only the upper portion narrows', () => {
  // N=6 → rings at t = 0, 0.2, 0.4, 0.6, 0.8 (TIP_START=0.6, so only t>0.6 tapers).
  const graph = makeBladeGraph(6);

  const flat    = buildBladeGeometry(graph, { bladeWidth: 0.02, bladeTaper: 0,   midribStrength: 0 });
  const tapered = buildBladeGeometry(graph, { bladeWidth: 0.02, bladeTaper: 0.9, midribStrength: 0 });

  function ringWidth(res, ringIdx) {
    const base = ringIdx * 2;  // 2 verts per ring without midrib
    const lx = res.positions[base*3],     ly = res.positions[base*3+1],     lz = res.positions[base*3+2];
    const rx = res.positions[(base+1)*3], ry = res.positions[(base+1)*3+1], rz = res.positions[(base+1)*3+2];
    return Math.sqrt((rx-lx)**2 + (ry-ly)**2 + (rz-lz)**2);
  }

  // bladeTaper=0 → fully parallel: every ring equals the base.
  for (let r = 1; r <= 4; r++) {
    assert.ok(Math.abs(ringWidth(flat, r) - ringWidth(flat, 0)) / ringWidth(flat, 0) < 0.01,
      `taper=0: ring ${r} should equal base (parallel)`);
  }

  // bladeTaper=0.9 → lower rings (t<=0.6) still ~full width (parallel body)...
  const base = ringWidth(tapered, 0);
  for (let r = 1; r <= 3; r++) { // rings at t=0.2,0.4,0.6
    assert.ok(Math.abs(ringWidth(tapered, r) - base) / base < 0.02,
      `taper=0.9: lower ring ${r} (t<=0.6) should stay ~full width, not taper from the base`);
  }
  // ...and the upper ring (t=0.8) is clearly narrower (the tip taper).
  assert.ok(ringWidth(tapered, 4) < base * 0.9,
    `taper=0.9: upper ring (t=0.8) width ${ringWidth(tapered,4).toFixed(4)} should be < 0.9·base ${base.toFixed(4)}`);
});

test('midribStrength=0 vs midribStrength=0.5 gives different vertex counts', () => {
  const graph = makeBladeGraph(5);
  const flat   = buildBladeGeometry(graph, { midribStrength: 0 });
  const midrib = buildBladeGeometry(graph, { midribStrength: 0.5 });
  assert.notEqual(flat.vertexCount, midrib.vertexCount, 'midrib should add extra vertices');
  // flat: 2*(N-1)+1; midrib: 3*(N-1)+1
  assert.strictEqual(flat.vertexCount,  2*(5-1)+1);
  assert.strictEqual(midrib.vertexCount, 3*(5-1)+1);
});

test('bladeRaggedness=0.5 vs bladeRaggedness=0: different positions, same counts', () => {
  const graph = makeBladeGraph(5);
  const smooth  = buildBladeGeometry(graph, { bladeRaggedness: 0 });
  const ragged  = buildBladeGeometry(graph, { bladeRaggedness: 0.5 });
  assert.strictEqual(smooth.vertexCount, ragged.vertexCount);
  // At least one position should differ.
  let differs = false;
  for (let i = 0; i < smooth.positions.length; i++) {
    if (smooth.positions[i] !== ragged.positions[i]) { differs = true; break; }
  }
  assert.ok(differs, 'bladeRaggedness should change edge positions');
});

test('bladeWidth scales the ribbon width proportionally', () => {
  const graph = makeBladeGraph(4);
  const narrow = buildBladeGeometry(graph, { bladeWidth: 0.01, bladeTaper: 0, midribStrength: 0 });
  const wide   = buildBladeGeometry(graph, { bladeWidth: 0.04, bladeTaper: 0, midribStrength: 0 });

  // Measure base ring L-R distance.
  function dist(res, i0, i1) {
    const dx = res.positions[i0*3] - res.positions[i1*3];
    const dy = res.positions[i0*3+1] - res.positions[i1*3+1];
    const dz = res.positions[i0*3+2] - res.positions[i1*3+2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  const wNarrow = dist(narrow, 0, 1);
  const wWide   = dist(wide,   0, 1);
  assert.ok(wWide > wNarrow * 3.5, `wide (${wWide.toFixed(4)}) should be ~4× narrow (${wNarrow.toFixed(4)})`);
});

// ---------------------------------------------------------------------------
// AC: bounds AABB contains all vertices; no NaN in any buffer.
// ---------------------------------------------------------------------------

test('bounds AABB contains all vertices', () => {
  const graph = makeBladeGraph(6);
  const result = buildBladeGeometry(graph, { midribStrength: 0.2 });
  const { bounds, positions, vertexCount } = result;

  for (let vi = 0; vi < vertexCount; vi++) {
    const x = positions[vi*3];
    const y = positions[vi*3+1];
    const z = positions[vi*3+2];
    assert.ok(x >= bounds.min[0] - 1e-4, `vertex ${vi} x=${x} below bounds.min.x=${bounds.min[0]}`);
    assert.ok(x <= bounds.max[0] + 1e-4, `vertex ${vi} x=${x} above bounds.max.x=${bounds.max[0]}`);
    assert.ok(y >= bounds.min[1] - 1e-4, `vertex ${vi} y=${y} below bounds.min.y=${bounds.min[1]}`);
    assert.ok(y <= bounds.max[1] + 1e-4, `vertex ${vi} y=${y} above bounds.max.y=${bounds.max[1]}`);
    assert.ok(z >= bounds.min[2] - 1e-4, `vertex ${vi} z=${z} below bounds.min.z=${bounds.min[2]}`);
    assert.ok(z <= bounds.max[2] + 1e-4, `vertex ${vi} z=${z} above bounds.max.z=${bounds.max[2]}`);
  }
});

test('no NaN in any buffer for typical grass blade', () => {
  const graph = makeBladeGraph(6, 0.9);
  const result = buildBladeGeometry(graph, {
    bladeWidth:     0.015,
    bladeTaper:     0.7,
    midribStrength: 0.3,
    bladeRaggedness: 0.1,
  });

  assertNoNaN(result.positions,  'positions');
  assertNoNaN(result.normals,    'normals');
  assertNoNaN(result.uvs,        'uvs');
  assertNoNaN(result.ao,         'ao');
  assertNoNaN(result.swayFactor, 'swayFactor');
  assertNoNaN(result.colorSeed,  'colorSeed');
  // indices are integer, not checked for NaN (always 0 if unfilled)
});

test('no NaN for multi-blade clump', () => {
  const graph = makeClumpGraph(5, 5);
  const result = buildBladeGeometry(graph, { bladeWidth: 0.012, bladeTaper: 0.65 });

  assertNoNaN(result.positions,  'positions');
  assertNoNaN(result.normals,    'normals');
  assertNoNaN(result.swayFactor, 'swayFactor');
  assertNoNaN(result.colorSeed,  'colorSeed');
  assertNoNaN(result.ao,         'ao');
});

// ---------------------------------------------------------------------------
// AC: ao range is [0.55, 1.0].
// Floor raised from 0.35 to 0.55: the fragment shader's canopy normal bias
// keeps blades above the horizon, so the old dark floor no longer looks natural.
// ---------------------------------------------------------------------------

test('ao values are in [0.55, 1.0]', () => {
  const graph = makeClumpGraph(3, 6);
  const result = buildBladeGeometry(graph);
  for (let i = 0; i < result.ao.length; i++) {
    assert.ok(result.ao[i] >= 0.55 - 1e-6, `ao[${i}]=${result.ao[i]} < 0.55`);
    assert.ok(result.ao[i] <= 1.0 + 1e-6, `ao[${i}]=${result.ao[i]} > 1.0`);
  }
});

// ---------------------------------------------------------------------------
// AC: nodeToBlade maps rendered nodes to valid blade indices; -1 for unrendered.
// ---------------------------------------------------------------------------

test('nodeToBlade: all nodes in a single blade map to blade index 0', () => {
  const N = 5;
  const graph = makeBladeGraph(N);
  const result = buildBladeGeometry(graph);

  assert.strictEqual(result.nodeToBlade.length, N);
  for (let i = 0; i < N; i++) {
    assert.strictEqual(result.nodeToBlade[i], 0, `node ${i} should map to blade 0`);
  }
});

test('nodeToBlade: 3-blade clump → each node maps to its blade index', () => {
  const bladeCount = 3;
  const nodesPerBlade = 4;
  const graph = makeClumpGraph(bladeCount, nodesPerBlade);
  const result = buildBladeGeometry(graph);

  const totalNodes = bladeCount * nodesPerBlade;
  assert.strictEqual(result.nodeToBlade.length, totalNodes);

  for (let bi = 0; bi < bladeCount; bi++) {
    for (let ni = 0; ni < nodesPerBlade; ni++) {
      const nodeIdx = bi * nodesPerBlade + ni;
      assert.strictEqual(
        result.nodeToBlade[nodeIdx], bi,
        `node ${nodeIdx} should map to blade ${bi}, got ${result.nodeToBlade[nodeIdx]}`
      );
    }
  }
});

test('nodeToBlade: no -1 entries for a valid graph', () => {
  const graph = makeClumpGraph(4, 5);
  const result = buildBladeGeometry(graph);
  for (let i = 0; i < result.nodeToBlade.length; i++) {
    assert.ok(result.nodeToBlade[i] >= 0, `nodeToBlade[${i}] is -1 but all nodes should be rendered`);
  }
});

// ---------------------------------------------------------------------------
// AC: Pure function determinism — two calls on same graph+opts → byte-identical.
// ---------------------------------------------------------------------------

test('pure function: two calls on same graph+opts → byte-identical arrays', () => {
  const graph = makeClumpGraph(4, 6);
  const opts  = { bladeWidth: 0.018, bladeTaper: 0.6, midribStrength: 0.25, bladeRaggedness: 0.15 };

  const r1 = buildBladeGeometry(graph, opts);
  const r2 = buildBladeGeometry(graph, opts);

  assertTypedArrayEqual(r1.positions,  r2.positions,  'positions');
  assertTypedArrayEqual(r1.normals,    r2.normals,    'normals');
  assertTypedArrayEqual(r1.uvs,        r2.uvs,        'uvs');
  assertTypedArrayEqual(r1.ao,         r2.ao,         'ao');
  assertTypedArrayEqual(r1.swayFactor, r2.swayFactor, 'swayFactor');
  assertTypedArrayEqual(r1.colorSeed,  r2.colorSeed,  'colorSeed');
  assertTypedArrayEqual(r1.indices,    r2.indices,    'indices');
  assert.deepStrictEqual(r1.bounds, r2.bounds, 'bounds');
});

test('determinism: different blade counts produce different geometry', () => {
  const graph1 = makeClumpGraph(2, 5);
  const graph3 = makeClumpGraph(4, 5);
  const r1 = buildBladeGeometry(graph1);
  const r3 = buildBladeGeometry(graph3);
  assert.notEqual(r1.vertexCount, r3.vertexCount);
});

// ---------------------------------------------------------------------------
// AC: indices are valid (each index < vertexCount).
// ---------------------------------------------------------------------------

test('all indices are < vertexCount', () => {
  const graph = makeClumpGraph(5, 6);
  const result = buildBladeGeometry(graph, { midribStrength: 0.2 });
  const { indices, vertexCount } = result;
  for (let i = 0; i < indices.length; i++) {
    assert.ok(
      indices[i] < vertexCount,
      `index[${i}]=${indices[i]} >= vertexCount=${vertexCount}`
    );
  }
});

// ---------------------------------------------------------------------------
// AC: uv.u is in [0,1], uv.v is in [0,1].
// ---------------------------------------------------------------------------

test('UV coordinates are in [0,1]', () => {
  const graph = makeBladeGraph(6);
  const result = buildBladeGeometry(graph);
  for (let vi = 0; vi < result.vertexCount; vi++) {
    const u = result.uvs[vi*2];
    const v = result.uvs[vi*2+1];
    assert.ok(u >= -1e-6 && u <= 1+1e-6, `u[${vi}]=${u} out of [0,1]`);
    assert.ok(v >= -1e-6 && v <= 1+1e-6, `v[${vi}]=${v} out of [0,1]`);
  }
});

// ---------------------------------------------------------------------------
// AC: colorSeed values are in [0,1].
// ---------------------------------------------------------------------------

test('colorSeed values are in [0,1]', () => {
  const graph = makeClumpGraph(6, 4);
  const result = buildBladeGeometry(graph);
  for (let vi = 0; vi < result.vertexCount; vi++) {
    assert.ok(
      result.colorSeed[vi] >= 0 && result.colorSeed[vi] <= 1,
      `colorSeed[${vi}]=${result.colorSeed[vi]} out of [0,1]`
    );
  }
});

// ---------------------------------------------------------------------------
// AC: createBladeMaterial injects 'windOffset' token into the shader.
//     We verify the token is present in the GLSL strings that would be injected.
//     (Full GPU compilation is not available in Node — we assert the string is present.)
// ---------------------------------------------------------------------------

test('createBladeMaterial: windOffset GLSL token is present in wind injection strings', () => {
  // The key requirement: WIND_FUNCTION_GLSL from windGlsl.js must define windOffset,
  // and createBladeMaterial must reference it in its injection.
  //
  // We test this by constructing a mock THREE object and capturing the shader
  // modification that onBeforeCompile performs.

  // Build a minimal windGlsl-shaped object (imported at top of file).
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  // Mock THREE.MeshStandardMaterial that records what onBeforeCompile does.
  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  // The material should have an onBeforeCompile function.
  assert.ok(typeof mat.onBeforeCompile === 'function', 'onBeforeCompile should be set');

  // Simulate onBeforeCompile by calling it with a mock shader.
  const mockShader = {
    uniforms: {},
    vertexShader: [
      'void main() {',
      '#include <common>',
      '#include <project_vertex>',
      '}',
    ].join('\n'),
    fragmentShader: '#include <common>\n#include <normal_fragment_begin>\n#include <lights_fragment_end>',
  };

  mat.onBeforeCompile(mockShader);

  // The compiled vertex shader should contain 'windOffset'.
  assert.ok(
    mockShader.vertexShader.includes('windOffset'),
    'compiled vertex shader should contain "windOffset"'
  );

  // It should also contain the aSwayFactor attribute declaration.
  assert.ok(
    mockShader.vertexShader.includes('aSwayFactor'),
    'compiled vertex shader should contain "aSwayFactor"'
  );

  // The wind uniforms should have been injected into the shader.
  assert.ok('uTime' in mockShader.uniforms, 'uTime uniform should be injected');
  assert.ok('uWindStrength' in mockShader.uniforms, 'uWindStrength uniform should be injected');
  assert.ok('uWindDir' in mockShader.uniforms, 'uWindDir uniform should be injected');
});

test('createBladeDepthMaterial: windOffset GLSL token is present', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshDepthMaterial: MockMaterial,
    RGBADepthPacking: 3201,
    Vector2: MockVector2,
  };

  const mat = createBladeDepthMaterial(MockTHREE, { windGlsl });

  assert.ok(typeof mat.onBeforeCompile === 'function', 'depth material onBeforeCompile should be set');

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };
  mat.onBeforeCompile(mockShader);

  assert.ok(
    mockShader.vertexShader.includes('windOffset'),
    'depth shader should contain "windOffset"'
  );
  assert.ok(
    mockShader.vertexShader.includes('aSwayFactor'),
    'depth shader should contain "aSwayFactor"'
  );
});

// ---------------------------------------------------------------------------
// AC: createBladeMaterial without windGlsl → still returns a valid material,
//     no onBeforeCompile set (graceful degradation).
// ---------------------------------------------------------------------------

test('createBladeMaterial without windGlsl → valid material, no onBeforeCompile', () => {
  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: class { constructor(x, z) {} },
  };

  const mat = createBladeMaterial(MockTHREE, {});
  // No windGlsl → no onBeforeCompile injected.
  assert.ok(mat.onBeforeCompile === undefined, 'onBeforeCompile should not be set without windGlsl');
});

// ---------------------------------------------------------------------------
// AC: createBladeMaterial stores colorUniforms on userData (viewer wiring).
// ---------------------------------------------------------------------------

test('createBladeMaterial: userData.colorUniforms are present with correct structure', () => {
  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, {
    color: { chlorophyllVigor: 0.8, senescence: 0.3, glaucousness: 0.5, speciesHue: 0.4 },
    colorVariation: 0.2,
  });

  assert.ok(mat.userData.colorUniforms !== undefined, 'userData.colorUniforms should be set');
  const cu = mat.userData.colorUniforms;
  for (const k of ['uChlorophyllVigor', 'uSenescence', 'uAnthoTint', 'uGlaucousness', 'uSpeciesHue', 'uStarWarm', 'uStarDark', 'uColorVariation']) {
    assert.ok(k in cu, `colorUniforms should have ${k}`);
  }
  assert.strictEqual(cu.uChlorophyllVigor.value, 0.8, 'uChlorophyllVigor matches color opt');
  assert.strictEqual(cu.uSenescence.value, 0.3, 'uSenescence matches color opt');
  assert.strictEqual(cu.uGlaucousness.value, 0.5, 'uGlaucousness matches color opt');
  assert.strictEqual(cu.uColorVariation.value, 0.2, 'uColorVariation matches opt');
});

test('createBladeMaterial: default colorUniforms match defaults (pigment=0.30, colorVariation=0)', () => {
  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: class { constructor(x, z) {} },
  };

  const mat = createBladeMaterial(MockTHREE, {});
  assert.ok(mat.userData.colorUniforms !== undefined, 'colorUniforms always present');
  assert.strictEqual(mat.userData.colorUniforms.uChlorophyllVigor.value, 0.6, 'default chlorophyllVigor = 0.6 (healthy green)');
  assert.strictEqual(mat.userData.colorUniforms.uSenescence.value, 0, 'default senescence = 0');
  assert.strictEqual(mat.userData.colorUniforms.uStarDark.value, 1, 'default starDark = 1 (Sun)');
  assert.strictEqual(mat.userData.colorUniforms.uColorVariation.value, 0, 'default colorVariation = 0');
});

// ---------------------------------------------------------------------------
// AC: compiled vertex shader contains colorSeed consumption and USE_INSTANCING
//     guard for per-instance world position.
// ---------------------------------------------------------------------------

test('createBladeMaterial: compiled shader contains colorSeed attribute and vColor write', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  // colorSeed attribute must be declared in the shader.
  assert.ok(
    mockShader.vertexShader.includes('colorSeed'),
    'compiled vertex shader should declare colorSeed attribute'
  );

  // vColor must be written (this is what fixes the pure-black render).
  assert.ok(
    mockShader.vertexShader.includes('vColor'),
    'compiled vertex shader should write to vColor'
  );

  // pigment-stack + colorVariation uniforms must be declared.
  assert.ok(
    mockShader.vertexShader.includes('uChlorophyllVigor'),
    'compiled vertex shader should declare uChlorophyllVigor uniform'
  );
  assert.ok(
    mockShader.vertexShader.includes('uColorVariation'),
    'compiled vertex shader should declare uColorVariation uniform'
  );

  // The colorUniforms should be injected into the shader.
  assert.ok('uChlorophyllVigor' in mockShader.uniforms, 'uChlorophyllVigor uniform should be injected into shader');
  assert.ok('uColorVariation' in mockShader.uniforms, 'uColorVariation uniform should be injected into shader');
});

test('createBladeMaterial: compiled shader contains #ifdef USE_INSTANCING for world position', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  // The shader must have the USE_INSTANCING guard for per-instance world position.
  assert.ok(
    mockShader.vertexShader.includes('#ifdef USE_INSTANCING'),
    'compiled vertex shader should contain #ifdef USE_INSTANCING for field view world position'
  );

  // instanceMatrix must be applied in the guarded block.
  assert.ok(
    mockShader.vertexShader.includes('instanceMatrix'),
    'compiled vertex shader should apply instanceMatrix for field view'
  );
});

test('createBladeDepthMaterial: compiled shader contains #ifdef USE_INSTANCING', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshDepthMaterial: MockMaterial,
    RGBADepthPacking: 3201,
    Vector2: MockVector2,
  };

  const mat = createBladeDepthMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  assert.ok(
    mockShader.vertexShader.includes('#ifdef USE_INSTANCING'),
    'depth shader should contain #ifdef USE_INSTANCING for shadow correctness'
  );
  assert.ok(
    mockShader.vertexShader.includes('instanceMatrix'),
    'depth shader should apply instanceMatrix'
  );
});

// ---------------------------------------------------------------------------
// NIT 5: Symmetric raggedness — verify edge perturbations are independent
// (centerline does not shift by more than one half-jitter amplitude across nodes).
// ---------------------------------------------------------------------------

test('bladeRaggedness: centerline stays symmetric (left and right offsets are independent)', () => {
  // With symmetric raggedness, left and right edges are independently perturbed
  // so they are NOT mirrored (old behavior: rightOffset = halfW - jitter was a
  // strict mirror of leftOffset = halfW + jitter, giving leftOffset + rightOffset = 2*halfW always).
  // New behavior: leftJitter and rightJitter use different hash seeds, so their
  // signed values are independent — the sum leftOffset + rightOffset is no longer
  // always exactly 2*halfW.
  //
  // For a vertical blade (tangent=[0,1,0]), frameU=[0,0,-1] so the edges spread
  // along Z. node.pos has Z=0 (the blade centerline). We measure each edge's
  // distance from Z=0 (the known centerline), not from the midpoint.
  const graph = makeBladeGraph(6, 1.0);
  const bladeWidth = 0.04;
  const opts = { bladeWidth, bladeTaper: 0, midribStrength: 0, bladeRaggedness: 0.8 };
  const result = buildBladeGeometry(graph, opts);

  // For each non-tip ring, measure:
  //   leftOffset  = distance of L vertex from Z=0 (node centerline Z)
  //   rightOffset = distance of R vertex from Z=0
  // These should differ at some rings (independent jitter, not mirrors of each other).
  let foundDifferentJitter = false;

  for (let ri = 0; ri < 5; ri++) {
    const base = ri * 2;  // 2 verts per ring (L=base, R=base+1)
    const lpz = result.positions[base * 3 + 2];        // L vertex Z
    const rpz = result.positions[(base + 1) * 3 + 2];  // R vertex Z

    // Both edges are on opposite sides of Z=0 (frameU = [0,0,-1]):
    // L.z = 0 - leftOffset * (-1) = +leftOffset
    // R.z = 0 + rightOffset * (-1) = -rightOffset
    const leftOff  = Math.abs(lpz);
    const rightOff = Math.abs(rpz);

    // Under the old coupled code: rightOffset = halfW - jitter, leftOffset = halfW + jitter
    // → leftOff + rightOff = 2*halfW (always). Under the new independent code, they differ.
    // We check leftOff != rightOff as a proxy for independence.
    if (Math.abs(leftOff - rightOff) > 1e-6) {
      foundDifferentJitter = true;
    }
  }

  assert.ok(
    foundDifferentJitter,
    'left and right edge offsets should be independently jittered (different hash inputs) so their magnitudes from the centerline differ at some rings'
  );
});

// ---------------------------------------------------------------------------
// Multi-blade clump: vertex count equals sum of individual blade counts.
// ---------------------------------------------------------------------------

test('multi-blade: total vertex count equals sum of per-blade counts', () => {
  const bladeCount   = 4;
  const nodesPerBlade = 5;
  const graph = makeClumpGraph(bladeCount, nodesPerBlade);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });

  // Each blade: V = 2*(N-1)+1
  const perBladeV = 2 * (nodesPerBlade - 1) + 1;
  const expectedV = bladeCount * perBladeV;
  assert.strictEqual(result.vertexCount, expectedV, `Expected ${expectedV} vertices, got ${result.vertexCount}`);

  // Each blade: T = 2*(N-1)-1  (tip fan is 1 tri, not 2 — removed coplanar reverse)
  const perBladeT = 2 * (nodesPerBlade - 1) - 1;
  const expectedT = bladeCount * perBladeT;
  assert.strictEqual(result.triangleCount, expectedT, `Expected ${expectedT} triangles, got ${result.triangleCount}`);
});

// ---------------------------------------------------------------------------
// swayFactor range test across the whole buffer: all values in [0,1].
// ---------------------------------------------------------------------------

test('swayFactor all values in [0,1]', () => {
  const graph = makeClumpGraph(5, 7);
  const result = buildBladeGeometry(graph);
  for (let i = 0; i < result.swayFactor.length; i++) {
    assert.ok(
      result.swayFactor[i] >= 0 - 1e-6 && result.swayFactor[i] <= 1 + 1e-6,
      `swayFactor[${i}]=${result.swayFactor[i]} out of [0,1]`
    );
  }
});

// ---------------------------------------------------------------------------
// AC: instance-local counter-rotation fix — both materials must contain
//     inverse(mat3(instanceMatrix)) inside a USE_INSTANCING guard, applied
//     to the wind displacement.  vBladeTint must be absent everywhere.
// ---------------------------------------------------------------------------

test('createBladeMaterial: compiled shader contains inverse(mat3(instanceMatrix)) under USE_INSTANCING for wind', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  // The counter-rotation must be present.
  assert.ok(
    mockShader.vertexShader.includes('inverse(mat3(instanceMatrix))'),
    'main material: compiled shader must contain inverse(mat3(instanceMatrix)) for wind counter-rotation'
  );

  // It must be guarded by USE_INSTANCING.
  const useInstancingIdx = mockShader.vertexShader.indexOf('#ifdef USE_INSTANCING');
  const inverseIdx       = mockShader.vertexShader.indexOf('inverse(mat3(instanceMatrix))');
  assert.ok(
    useInstancingIdx !== -1 && inverseIdx > useInstancingIdx,
    'main material: inverse(mat3(instanceMatrix)) must appear after a #ifdef USE_INSTANCING guard'
  );

  // vBladeTint must not appear.
  assert.ok(
    !mockShader.vertexShader.includes('vBladeTint'),
    'main material: compiled vertex shader must not contain vBladeTint (dead varying removed)'
  );
});

test('createBladeDepthMaterial: compiled shader contains inverse(mat3(instanceMatrix)) under USE_INSTANCING for wind', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshDepthMaterial: MockMaterial,
    RGBADepthPacking: 3201,
    Vector2: MockVector2,
  };

  const mat = createBladeDepthMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  // The counter-rotation must be present.
  assert.ok(
    mockShader.vertexShader.includes('inverse(mat3(instanceMatrix))'),
    'depth material: compiled shader must contain inverse(mat3(instanceMatrix)) for wind counter-rotation'
  );

  // It must be guarded by USE_INSTANCING.
  const useInstancingIdx = mockShader.vertexShader.indexOf('#ifdef USE_INSTANCING');
  const inverseIdx       = mockShader.vertexShader.indexOf('inverse(mat3(instanceMatrix))');
  assert.ok(
    useInstancingIdx !== -1 && inverseIdx > useInstancingIdx,
    'depth material: inverse(mat3(instanceMatrix)) must appear after a #ifdef USE_INSTANCING guard'
  );

  // vBladeTint must not appear.
  assert.ok(
    !mockShader.vertexShader.includes('vBladeTint'),
    'depth material: compiled vertex shader must not contain vBladeTint (dead varying removed)'
  );
});

test('neither material compiled shader contains vBladeTint', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREEStd = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };
  const MockTHREEDepth = {
    MeshDepthMaterial: MockMaterial,
    RGBADepthPacking: 3201,
    Vector2: MockVector2,
  };

  const matStd   = createBladeMaterial(MockTHREEStd, { windGlsl });
  const matDepth = createBladeDepthMaterial(MockTHREEDepth, { windGlsl });

  const shaderStd   = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>' };
  const shaderDepth = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>' };

  matStd.onBeforeCompile(shaderStd);
  matDepth.onBeforeCompile(shaderDepth);

  assert.ok(
    !shaderStd.vertexShader.includes('vBladeTint'),
    'main material vertex shader must not contain vBladeTint'
  );
  assert.ok(
    !shaderDepth.vertexShader.includes('vBladeTint'),
    'depth material vertex shader must not contain vBladeTint'
  );
});

// ---------------------------------------------------------------------------
// AC: normals are unit-length and up-biased (y > 0) for soft canopy shading.
// ---------------------------------------------------------------------------

test('normals are unit-length (within 1e-5) for a typical blade', () => {
  const graph = makeBladeGraph(6, 1.0);
  const result = buildBladeGeometry(graph, {
    bladeWidth: 0.015,
    bladeTaper: 0.7,
    midribStrength: 0.3,
  });

  const { normals, vertexCount } = result;
  for (let vi = 0; vi < vertexCount; vi++) {
    const nx = normals[vi * 3];
    const ny = normals[vi * 3 + 1];
    const nz = normals[vi * 3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    assert.ok(
      Math.abs(len - 1.0) < 1e-5,
      `normal[${vi}] length=${len.toFixed(7)} is not unit-length`
    );
  }
});

test('normals are unit-length for a multi-blade clump (no midrib)', () => {
  const graph = makeClumpGraph(5, 5);
  const result = buildBladeGeometry(graph, { bladeWidth: 0.012, bladeTaper: 0.65 });

  const { normals, vertexCount } = result;
  for (let vi = 0; vi < vertexCount; vi++) {
    const nx = normals[vi * 3];
    const ny = normals[vi * 3 + 1];
    const nz = normals[vi * 3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    assert.ok(
      Math.abs(len - 1.0) < 1e-5,
      `clump normal[${vi}] length=${len.toFixed(7)} is not unit-length`
    );
  }
});

test('normals have non-negative y-component (geometry up-bias is 0; fragment shader owns canopy bias)', () => {
  // NORMAL_UP_BIAS = 0.0 — the geometry no longer applies an up-bias at the CPU
  // level.  The view-space canopy bias (k=0.65) is injected into the fragment
  // shader via onBeforeCompile so it applies in view space using the live
  // viewMatrix.  At the CPU/geometry level, blades pointing horizontally will
  // have ny=0 (face normal in the XZ plane), which is correct.
  // Assertion: ny >= 0 (no downward-pointing normals from a valid blade graph,
  // because the fan and lean-derived frameNorm only tilt horizontally or upward).
  const graph = makeClumpGraph(4, 5);
  const result = buildBladeGeometry(graph, { midribStrength: 0 });

  const { normals, vertexCount } = result;
  for (let vi = 0; vi < vertexCount; vi++) {
    const ny = normals[vi * 3 + 1];
    assert.ok(
      ny >= -1e-6,
      `normal[${vi}].y = ${ny.toFixed(6)} is negative — unexpected downward normal`
    );
  }
});

// ---------------------------------------------------------------------------
// AC: Lean-correlation — Fix 1 acceptance test.
//
// The face normal must track the blade's real lean direction.
// A blade leaning toward +X+Z should face (and thus be brighter under) a sun
// at (25, 50, 25), while a blade leaning the opposite direction (-X-Z) should
// read darker (lower dot product).
//
// We build two single blades that are identical except for their tip position:
//   blade A: tip leans toward +X+Z
//   blade B: tip leans toward -X-Z
// We take the centre-vertex normal (widthT=0) of each blade's first ring and
// dot it with the normalised sun direction.  Blade A must produce a strictly
// higher dot than blade B.
// ---------------------------------------------------------------------------

/**
 * Build a single blade graph that leans in the given horizontal direction.
 * Base at origin, tip at (lx * lean, height, lz * lean).
 */
function makeLeanedBlade(lx, lz, lean = 0.25, height = 0.8, N = 4) {
  const nodes = [];
  const bones = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    nodes.push({
      pos:         [lx * lean * t, height * t, lz * lean * t],
      radius:      0.015 * (1 - 0.8 * t),
      weight:      1.0,
      branchLevel: 0,
      parentIdx:   i === 0 ? -1 : i - 1,
      isStem:      true,
      isTerminal:  i === N - 1,
      swayBase:    t,
    });
    if (i > 0) bones.push({ a: i - 1, b: i });
  }
  return { nodes, bones, meta: {} };
}

test('lean-correlation: face normal tracks lean direction (Fix 1 acceptance)', () => {
  // Sun at (25, 50, 25) — normalized.
  const sunX = 25, sunY = 50, sunZ = 25;
  const sunLen = Math.sqrt(sunX*sunX + sunY*sunY + sunZ*sunZ);
  const sunNx = sunX / sunLen, sunNy = sunY / sunLen, sunNz = sunZ / sunLen;

  const opts = { midribStrength: 0, bladeWidth: 0.015 };

  // Blade A: leans toward +X+Z (toward the sun's XZ projection).
  const graphA = makeLeanedBlade( 1,  1);
  const resA   = buildBladeGeometry(graphA, opts);

  // Blade B: leans toward -X-Z (away from the sun's XZ projection).
  const graphB = makeLeanedBlade(-1, -1);
  const resB   = buildBladeGeometry(graphB, opts);

  // Centre vertex of first ring = vertex index 0 (L) or we use the centre
  // of ring 0 directly.  For no-midrib, ring 0 has L=0, R=1.
  // The centre normal is the average of L and R normals (or use L, since
  // both should have the same face normal as widthT= ±1 only fans them slightly).
  // Better: read the apex vertex normal (widthT=0, pure face normal after biasing).
  const apexIdxA = resA.vertexCount - 1;
  const apexIdxB = resB.vertexCount - 1;

  const nAxA = resA.normals[apexIdxA * 3];
  const nAyA = resA.normals[apexIdxA * 3 + 1];
  const nAzA = resA.normals[apexIdxA * 3 + 2];

  const nAxB = resB.normals[apexIdxB * 3];
  const nAyB = resB.normals[apexIdxB * 3 + 1];
  const nAzB = resB.normals[apexIdxB * 3 + 2];

  const dotA = nAxA * sunNx + nAyA * sunNy + nAzA * sunNz;
  const dotB = nAxB * sunNx + nAyB * sunNy + nAzB * sunNz;

  assert.ok(
    dotA > dotB,
    `lean-correlation FAILED: blade leaning toward sun (dotA=${dotA.toFixed(4)}) ` +
    `should be brighter than blade leaning away (dotB=${dotB.toFixed(4)}). ` +
    `If equal, face normals are still world-locked (Fix 1 not applied).`
  );

  // Also assert that the lean-toward-sun blade is actually receiving positive
  // net illumination (dot > 0 after up-bias) and the away blade is lower.
  assert.ok(
    dotA > 0,
    `blade leaning toward sun should have dotA > 0, got ${dotA.toFixed(4)}`
  );
});

// ---------------------------------------------------------------------------
// AC: aColorJitter instanced attribute — declared in compiled shader, default 0 safe.
// ---------------------------------------------------------------------------

test('createBladeMaterial: compiled shader declares aColorJitter attribute', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  assert.ok(
    mockShader.vertexShader.includes('aColorJitter'),
    'compiled vertex shader must declare aColorJitter attribute for per-clump variation'
  );
});

test('createBladeMaterial: compiled shader passes aColorJitter to bladeColorTint', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  // bladeColorTint call must pass aColorJitter as third argument.
  assert.ok(
    mockShader.vertexShader.includes('bladeColorTint(colorSeed, aSwayFactor, aColorJitter)'),
    'compiled shader must call bladeColorTint with (colorSeed, aSwayFactor, aColorJitter)'
  );
});

// ---------------------------------------------------------------------------
// AC: tip-gradient — bladeColorTint uses swayFrac to drive tip lightness/hue.
// ---------------------------------------------------------------------------

test('createBladeMaterial: compiled shader contains the pigment-stack anchors + tip gradient', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  // The pigment-stack anchors must be present (green vigour mix + senescence stops).
  assert.ok(
    mockShader.vertexShader.includes('PALE') && mockShader.vertexShader.includes('DEEP'),
    'compiled vertex shader must contain the pale/deep green vigour anchors'
  );
  assert.ok(
    mockShader.vertexShader.includes('uChlorophyllVigor') && mockShader.vertexShader.includes('uSenescence'),
    'compiled vertex shader must use the chlorophyll-vigour + senescence axes'
  );

  // swayFrac parameter must still drive the base→tip gradient.
  assert.ok(
    mockShader.vertexShader.includes('swayFrac'),
    'bladeColorTint function must accept swayFrac for tip-to-base gradient'
  );
});

test('createBladeMaterial: compiled shader contains colorVariation usage in bladeColorTint', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
  };

  mat.onBeforeCompile(mockShader);

  // Per-blade variation: colorSeed × uColorVariation must drive a multiplier.
  assert.ok(
    mockShader.vertexShader.includes('uColorVariation') && mockShader.vertexShader.includes('seed'),
    'compiled shader must apply per-blade variation (seed × uColorVariation)'
  );

  // Per-clump variation: aColorJitter / clumpJitter must be applied.
  assert.ok(
    mockShader.vertexShader.includes('clumpJitter') || mockShader.vertexShader.includes('aColorJitter'),
    'compiled shader must apply per-clump variation (aColorJitter)'
  );
});

// ---------------------------------------------------------------------------
// AC: fragment shader canopy shading model — canopy normal bias, wrap diffuse,
//     translucency.  These are injected via onBeforeCompile into fragmentShader.
// ---------------------------------------------------------------------------

/**
 * Helper: build a mock THREE + mock shader pair, invoke onBeforeCompile, and
 * return the resulting { vertexShader, fragmentShader } strings.
 */
function compileGrassMaterial() {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };

  class MockMaterial {
    constructor(params) { Object.assign(this, params); this.userData = {}; }
  }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }

  const MockTHREE = {
    MeshStandardMaterial: MockMaterial,
    DoubleSide: 2,
    Vector2: MockVector2,
  };

  const mat = createBladeMaterial(MockTHREE, { windGlsl });

  const mockShader = {
    uniforms: {},
    // Provide enough fragment anchors that all replacements fire.
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: [
      '#include <common>',
      '#include <normal_fragment_begin>',
      '#include <lights_fragment_end>',
    ].join('\n'),
  };

  mat.onBeforeCompile(mockShader);
  return mockShader;
}

test('createBladeMaterial: fragment shader receives vSwayFactor varying declaration', () => {
  const shader = compileGrassMaterial();
  assert.ok(
    shader.fragmentShader.includes('vSwayFactor'),
    'fragment shader must declare vSwayFactor varying for translucency'
  );
});

test('createBladeMaterial: fragment shader contains view-space up-bias (upView)', () => {
  const shader = compileGrassMaterial();
  // The canopy bias uses viewMatrix * (0,1,0,0) to get view-space up.
  assert.ok(
    shader.fragmentShader.includes('upView') || shader.fragmentShader.includes('_upView'),
    'fragment shader must compute view-space up vector (_upView) for canopy normal bias'
  );
  // viewMatrix must be used to transform the up vector (ensures view-space correctness).
  assert.ok(
    shader.fragmentShader.includes('viewMatrix'),
    'fragment shader must use viewMatrix to compute view-space up (not raw vec3(0,1,0))'
  );
});

test('createBladeMaterial: fragment shader mixes normal toward up (canopy bias k=0.65)', () => {
  const shader = compileGrassMaterial();
  // The bias uses mix(Nbent, upView, 0.65) or equivalent.
  assert.ok(
    shader.fragmentShader.includes('mix') && shader.fragmentShader.includes('0.65'),
    'fragment shader must blend toward up with k=0.65 (mix with 0.65 coefficient)'
  );
  // Result must be assigned back to `normal` so all subsequent lighting uses it.
  assert.ok(
    shader.fragmentShader.includes('normal = '),
    'fragment shader must overwrite `normal` with the biased result for downstream lighting'
  );
});

test('createBladeMaterial: fragment shader applies canopy normal bias toward view-space up', () => {
  const shader = compileGrassMaterial();
  // Back faces are flipped automatically by side:DoubleSide (three applies
  // `normal *= faceDirection`); the injected code must NOT re-flip (that would
  // double-flip and un-flip back faces). It only biases the normal toward up.
  assert.ok(
    shader.fragmentShader.includes('_upView'),
    'fragment shader must bias the normal toward view-space up (canopy normal)'
  );
  assert.ok(
    shader.fragmentShader.includes('normal = _Nbent'),
    'biased normal must overwrite the shading normal used by lighting'
  );
});

test('createBladeMaterial: fragment shader contains wrap/half-Lambert diffuse term', () => {
  const shader = compileGrassMaterial();
  // Wrap formula: (dot(N,L)+0.5)/1.5 or equivalent.
  // We check for the key constant 0.5/1.5 pattern.
  assert.ok(
    shader.fragmentShader.includes('_wrapDot') || shader.fragmentShader.includes('wrapDiff') ||
    (shader.fragmentShader.includes('+ 0.5') && shader.fragmentShader.includes('/ 1.5')),
    'fragment shader must contain wrap/half-Lambert diffuse computation'
  );
  assert.ok(
    shader.fragmentShader.includes('reflectedLight.directDiffuse'),
    'fragment shader must write wrap contribution into reflectedLight.directDiffuse'
  );
});

test('createBladeMaterial: fragment shader contains thin-blade translucency term', () => {
  const shader = compileGrassMaterial();
  // Translucency: backDot = dot(V,-L), trans = pow(backDot,4)*0.5, gated by vSwayFactor.
  assert.ok(
    shader.fragmentShader.includes('vSwayFactor'),
    'fragment shader translucency must be gated by vSwayFactor'
  );
  // The green-biased translucency colour vec3(0.55, 0.75, 0.30).
  assert.ok(
    shader.fragmentShader.includes('0.55') && shader.fragmentShader.includes('0.75') && shader.fragmentShader.includes('0.30'),
    'fragment shader must contain translucency colour vec3(0.55, 0.75, 0.30)'
  );
  assert.ok(
    shader.fragmentShader.includes('pow'),
    'fragment shader translucency must use pow() for the backDot exponent'
  );
});

test('createBladeMaterial: vertex shader emits vSwayFactor varying', () => {
  const shader = compileGrassMaterial();
  // vSwayFactor = aSwayFactor must appear in vertex shader.
  assert.ok(
    shader.vertexShader.includes('vSwayFactor') && shader.vertexShader.includes('aSwayFactor'),
    'vertex shader must write vSwayFactor = aSwayFactor so the fragment shader receives it'
  );
});

test('NORMAL_UP_BIAS is 0 — geometry-level bias removed, fragment shader owns it', () => {
  // With NORMAL_UP_BIAS = 0.0, the bladeNormal() function applies no up-bias at
  // the CPU level.  We verify by checking that a blade with a purely horizontal
  // face normal (XZ-plane lean) produces a purely horizontal geometric normal at
  // the centre vertex (ny should be near 0 without any geometry bias).
  function makeLeanedBladeHoriz() {
    // Tip leans along +X only, height=0 → purely horizontal blade is degenerate,
    // so we use a slight lean: tip is at (0.5, 0.01, 0) to keep a tiny Y but
    // make the XZ lean dominant.
    const N = 3;
    const nodes = [];
    const bones = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      nodes.push({
        pos: [0.5 * t, 0.01 * t, 0],
        radius: 0.015,
        weight: 1.0,
        branchLevel: 0,
        parentIdx: i === 0 ? -1 : i - 1,
        isStem: true,
        isTerminal: i === N - 1,
        swayBase: t,
      });
      if (i > 0) bones.push({ a: i - 1, b: i });
    }
    return { nodes, bones, meta: {} };
  }

  const graph = makeLeanedBladeHoriz();
  const result = buildBladeGeometry(graph, { midribStrength: 0 });

  // The apex vertex (last) has the centre normal (widthT=0, no fan tilt).
  // With NORMAL_UP_BIAS=0, the centre normal is essentially the face normal
  // which for a near-horizontal blade should have a very small ny.
  // We assert ny < 0.3 to confirm the geometry is NOT applying a 0.65 up-bias.
  const apexIdx = result.vertexCount - 1;
  const ny = result.normals[apexIdx * 3 + 1];
  assert.ok(
    ny < 0.3,
    `NORMAL_UP_BIAS=0 check: apex ny=${ny.toFixed(4)} should be < 0.3 for near-horizontal blade ` +
    `(if >= 0.3, the geometry is still applying an up-bias that belongs in the fragment shader)`
  );
});

// ---------------------------------------------------------------------------
// Blade silhouette profile: bladeShape / widestPos (+ bladeTaper tip sharpness).
//
// Identity (bladeShape=0) reproduces the taper-only ribbon. bladeShape/widestPos
// deform the width profile; bladeTaper controls tip narrowing + sharpness.
// ---------------------------------------------------------------------------

/** Measure a non-tip ring's full L→R width (no-midrib topology: 2 verts/ring). */
function ringWidthNoMidrib(res, ringIdx) {
  const b = ringIdx * 2;
  const dx = res.positions[(b + 1) * 3]     - res.positions[b * 3];
  const dy = res.positions[(b + 1) * 3 + 1] - res.positions[b * 3 + 1];
  const dz = res.positions[(b + 1) * 3 + 2] - res.positions[b * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

test('silhouette identity: bladeShape=0 == omitting the shape opts (byte-identical)', () => {
  const graph = makeBladeGraph(6, 1.0);
  const base = { bladeWidth: 0.02, bladeTaper: 0.7, midribStrength: 0, bladeRaggedness: 0 };
  const a = buildBladeGeometry(graph, base);
  const b = buildBladeGeometry(graph, { ...base, bladeShape: 0, widestPos: 0.5 });
  assertTypedArrayEqual(a.positions, b.positions, 'positions (identity)');
  assertTypedArrayEqual(a.normals,   b.normals,   'normals (identity)');
});

test('bladeShape>0 widens the mid-blade ring relative to the base (belly)', () => {
  const graph = makeBladeGraph(5, 1.0);  // sways 0, .25, .5, .75 at the 4 rings
  const opts  = { bladeWidth: 0.02, bladeTaper: 0, midribStrength: 0 };
  const flat   = buildBladeGeometry(graph, { ...opts, bladeShape: 0 });
  const belly  = buildBladeGeometry(graph, { ...opts, bladeShape: 0.8, widestPos: 0.5 });

  // Flat (taper 0, shape 0): every ring is the same width.
  assert.ok(Math.abs(ringWidthNoMidrib(flat, 2) - ringWidthNoMidrib(flat, 0)) < 1e-6,
    'flat blade should have uniform width');
  // Belly: the ring at sway≈0.5 (ring 2) must be wider than the base ring (0).
  assert.ok(ringWidthNoMidrib(belly, 2) > ringWidthNoMidrib(belly, 0) * 1.2,
    `belly mid-ring (${ringWidthNoMidrib(belly, 2).toFixed(4)}) should exceed base (${ringWidthNoMidrib(belly, 0).toFixed(4)})`);
});

test('widestPos shifts where the blade is widest', () => {
  const graph = makeBladeGraph(5, 1.0);  // rings at sway 0, .25, .5, .75
  const opts  = { bladeWidth: 0.02, bladeTaper: 0, midribStrength: 0, bladeShape: 0.9 };
  const lowP  = buildBladeGeometry(graph, { ...opts, widestPos: 0.25 });
  const highP = buildBladeGeometry(graph, { ...opts, widestPos: 0.75 });

  // With widest near base (0.25): ring 1 (sway .25) wider than ring 3 (sway .75).
  assert.ok(ringWidthNoMidrib(lowP, 1) > ringWidthNoMidrib(lowP, 3),
    'widestPos=0.25 → lower ring should be widest');
  // With widest near tip (0.75): ring 3 wider than ring 1.
  assert.ok(ringWidthNoMidrib(highP, 3) > ringWidthNoMidrib(highP, 1),
    'widestPos=0.75 → upper ring should be widest');
});

test('higher bladeTaper narrows the tip faster (sharper) but leaves the base unchanged', () => {
  const graph  = makeBladeGraph(5, 1.0);
  const opts   = { bladeWidth: 0.02, midribStrength: 0, bladeShape: 0 };
  const gentle = buildBladeGeometry(graph, { ...opts, bladeTaper: 0.3 });
  const sharp  = buildBladeGeometry(graph, { ...opts, bladeTaper: 0.9 });

  // Base ring (sway 0) is identical: (1 - taper*0)^pow = 1 for any taper.
  assert.ok(Math.abs(ringWidthNoMidrib(sharp, 0) - ringWidthNoMidrib(gentle, 0)) < 1e-6,
    'bladeTaper must not change the base width');
  // A near-tip ring (ring 3, sway .75) is narrower with a sharper taper.
  assert.ok(ringWidthNoMidrib(sharp, 3) < ringWidthNoMidrib(gentle, 3),
    `sharper-taper tip ring (${ringWidthNoMidrib(sharp, 3).toFixed(4)}) should be < gentle (${ringWidthNoMidrib(gentle, 3).toFixed(4)})`);
});

test('silhouette opts: pure function (same opts → byte-identical) and no NaN', () => {
  const graph = makeClumpGraph(4, 6);
  const opts  = { bladeWidth: 0.018, bladeTaper: 0.6, bladeShape: 0.5, widestPos: 0.4, midribStrength: 0.25 };
  const r1 = buildBladeGeometry(graph, opts);
  const r2 = buildBladeGeometry(graph, opts);
  assertTypedArrayEqual(r1.positions, r2.positions, 'positions (shape determinism)');
  assertNoNaN(r1.positions, 'positions');
  assertNoNaN(r1.normals,   'normals');
});

// ---------------------------------------------------------------------------
// Cross-section curl (Phase 2): crossSectionCurl cups the blade into a channel.
// ---------------------------------------------------------------------------

test('crossSectionCurl>0 triggers the 3-vertex (midrib) ring even when midribStrength=0', () => {
  const graph = makeBladeGraph(5);
  const flat = buildBladeGeometry(graph, { midribStrength: 0, crossSectionCurl: 0 });
  const cupped = buildBladeGeometry(graph, { midribStrength: 0, crossSectionCurl: 0.5 });
  // Flat → 2 verts/ring: V = 2*(N-1)+1. Cupped → 3 verts/ring: V = 3*(N-1)+1.
  assert.strictEqual(flat.vertexCount, 2 * (5 - 1) + 1);
  assert.strictEqual(cupped.vertexCount, 3 * (5 - 1) + 1);
});

test('crossSectionCurl=0 is identity (byte-identical to omitting it)', () => {
  const graph = makeBladeGraph(6);
  const a = buildBladeGeometry(graph, { bladeWidth: 0.02, bladeTaper: 0.6, midribStrength: 0.3 });
  const b = buildBladeGeometry(graph, { bladeWidth: 0.02, bladeTaper: 0.6, midribStrength: 0.3, crossSectionCurl: 0 });
  assertTypedArrayEqual(a.positions, b.positions, 'positions (curl identity)');
  assertTypedArrayEqual(a.normals,   b.normals,   'normals (curl identity)');
});

test('crossSectionCurl lifts the edges out of the centre plane (channel) and tilts edge normals inward', () => {
  // Vertical blade: tangent +Y, so frameNorm/frameU lie in the XZ plane and the
  // curl displaces edges along frameNorm (a horizontal axis here).
  const graph = makeBladeGraph(4, 1.0);
  const flat   = buildBladeGeometry(graph, { bladeWidth: 0.03, bladeTaper: 0, midribStrength: 0, crossSectionCurl: 0.0001 });
  const cupped = buildBladeGeometry(graph, { bladeWidth: 0.03, bladeTaper: 0, midribStrength: 0, crossSectionCurl: 0.8 });

  // 3 verts/ring: L=base, M=base+1, R=base+2. Compare base ring (ring 0).
  // The L and R vertices of the cupped blade must be displaced relative to the
  // near-flat blade (edges lifted along frameNorm).
  function vtx(res, i) { return [res.positions[i*3], res.positions[i*3+1], res.positions[i*3+2]]; }
  const lFlat = vtx(flat, 0), lCup = vtx(cupped, 0);
  const moved = Math.abs(lFlat[0]-lCup[0]) + Math.abs(lFlat[1]-lCup[1]) + Math.abs(lFlat[2]-lCup[2]);
  assert.ok(moved > 1e-4, 'curl should displace the left edge vertex (channel lift)');

  // Edge normals must differ from the centre normal (the fold is shaded).
  const nL = [cupped.normals[0], cupped.normals[1], cupped.normals[2]];
  const nM = [cupped.normals[3], cupped.normals[4], cupped.normals[5]];
  const dot = nL[0]*nM[0] + nL[1]*nM[1] + nL[2]*nM[2];
  assert.ok(dot < 0.999, `curled edge normal should differ from centre normal (dot=${dot.toFixed(4)})`);

  // All normals remain unit length.
  for (let vi = 0; vi < cupped.vertexCount; vi++) {
    const nx = cupped.normals[vi*3], ny = cupped.normals[vi*3+1], nz = cupped.normals[vi*3+2];
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    assert.ok(Math.abs(len - 1) < 1e-5, `curl normal[${vi}] not unit-length: ${len}`);
  }
});

test('crossSectionCurl: pure function + no NaN', () => {
  const graph = makeClumpGraph(4, 6);
  const opts  = { bladeWidth: 0.018, bladeTaper: 0.5, crossSectionCurl: 0.7, midribStrength: 0.2 };
  const r1 = buildBladeGeometry(graph, opts);
  const r2 = buildBladeGeometry(graph, opts);
  assertTypedArrayEqual(r1.positions, r2.positions, 'positions (curl determinism)');
  assertNoNaN(r1.positions, 'positions');
  assertNoNaN(r1.normals,   'normals');
});

// ---------------------------------------------------------------------------
// Procedural blade texture (Phase 3): createBladeMaterial injects the texture
// shader (aBladeU attribute, vBladeU varying, uVeining uniform, vein math) and
// stores a uVeining color uniform for the viewer to drive.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Blade twist (Phase 5): bladeTwist spirals the ribbon along its length.
// ---------------------------------------------------------------------------

test('bladeTwist=0 is identity; bladeTwist>0 rotates the width axis toward the tip', () => {
  const graph = makeBladeGraph(6, 1.0);
  const base  = { bladeWidth: 0.03, bladeTaper: 0, midribStrength: 0 };
  const flat  = buildBladeGeometry(graph, { ...base, bladeTwist: 0 });
  const twist = buildBladeGeometry(graph, { ...base, bladeTwist: 0.8 });

  // Identity: bladeTwist=0 equals omitting it.
  const flat2 = buildBladeGeometry(graph, base);
  assertTypedArrayEqual(flat.positions, flat2.positions, 'positions (twist=0 identity)');

  // Base ring (ring 0, sway 0) must be UNCHANGED by twist (no roll at the base).
  for (let k = 0; k < 6; k++) {
    assert.ok(Math.abs(flat.positions[k] - twist.positions[k]) < 1e-6,
      `base ring vertex coord ${k} should be unchanged by twist`);
  }
  // A tip-side ring must differ (the frame has rolled by then).
  const ring = 3, b = ring * 2;
  let moved = 0;
  for (let k = 0; k < 3; k++) moved += Math.abs(flat.positions[b*3+k] - twist.positions[b*3+k]);
  assert.ok(moved > 1e-4, 'twist should rotate the ribbon edges on tip-side rings');

  assertNoNaN(twist.positions, 'positions');
  assertNoNaN(twist.normals,   'normals');
});

// ---------------------------------------------------------------------------
// Stem roundness (leaf↔stalk): stemRoundness>0 builds a closed round TUBE.
// ---------------------------------------------------------------------------

test('stemRoundness=0 is identity (flat ribbon, byte-identical to omitting it)', () => {
  const graph = makeBladeGraph(6, 1.0);
  const base  = { bladeWidth: 0.02, bladeTaper: 0.6, midribStrength: 0 };
  const a = buildBladeGeometry(graph, base);
  const b = buildBladeGeometry(graph, { ...base, stemRoundness: 0 });
  assertTypedArrayEqual(a.positions, b.positions, 'positions (stemRoundness=0 identity)');
});

test('stemRoundness>0 → closed tube topology with K-gon rings (V = 8*(N-1)+1)', () => {
  const N = 5, K = 8;
  const graph  = makeBladeGraph(N);
  const tube   = buildBladeGeometry(graph, { stemRoundness: 1.0, bladeWidth: 0.02 });
  // Closed tube: K verts per non-tip ring + apex.
  assert.strictEqual(tube.vertexCount, K * (N - 1) + 1,
    `tube V expected ${K*(N-1)+1}, got ${tube.vertexCount}`);
  // Triangles: 2K per gap (N-2 gaps) + K tip cone.
  assert.strictEqual(tube.triangleCount, 2 * K * (N - 2) + K,
    `tube T expected ${2*K*(N-2)+K}, got ${tube.triangleCount}`);
});

test('round tube: cross-section has real depth along the face axis (not flat)', () => {
  // A flat ribbon for a vertical blade lies (nearly) in one plane through node.pos;
  // a round tube occupies a tube of radius ~halfW in BOTH frame axes. Verify the
  // first ring's vertices span a 2-D footprint (not collinear).
  const graph = makeBladeGraph(4, 1.0);
  const tube  = buildBladeGeometry(graph, { stemRoundness: 1.0, bladeWidth: 0.03, bladeTaper: 0 });
  // Ring 0 = first 8 verts. Measure spread in X and Z (the non-up axes for a vertical blade).
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let j = 0; j < 8; j++) {
    const x = tube.positions[j*3], z = tube.positions[j*3+2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  assert.ok((maxX - minX) > 1e-3, 'tube ring should span width');
  assert.ok((maxZ - minZ) > 1e-3, 'tube ring should have depth (round cross-section, not flat)');
});

test('round tube: unit normals, no NaN, deterministic', () => {
  const graph = makeClumpGraph(3, 6);
  const opts  = { stemRoundness: 0.8, bladeWidth: 0.02, bladeTaper: 0.4, bladeTwist: 0.3 };
  const r1 = buildBladeGeometry(graph, opts);
  const r2 = buildBladeGeometry(graph, opts);
  assertTypedArrayEqual(r1.positions, r2.positions, 'positions (tube determinism)');
  assertNoNaN(r1.positions, 'positions');
  assertNoNaN(r1.normals,   'normals');
  for (let vi = 0; vi < r1.vertexCount; vi++) {
    const nx = r1.normals[vi*3], ny = r1.normals[vi*3+1], nz = r1.normals[vi*3+2];
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    assert.ok(Math.abs(len - 1) < 1e-5, `tube normal[${vi}] not unit-length: ${len}`);
  }
  // indices valid
  for (let i = 0; i < r1.indices.length; i++) {
    assert.ok(r1.indices[i] < r1.vertexCount, `index ${r1.indices[i]} >= V ${r1.vertexCount}`);
  }
});

test('createBladeMaterial: injects procedural-texture shader (aBladeU / vBladeU / uVeining / color_fragment)', () => {
  const windGlsl = { WIND_UNIFORM_DECLS, WIND_FUNCTION_GLSL, WIND_UNIFORM_DEFAULTS };
  class MockMaterial { constructor(p) { Object.assign(this, p); this.userData = {}; } }
  class MockVector2 { constructor(x, z) { this.x = x; this.z = z; } }
  const MockTHREE = { MeshStandardMaterial: MockMaterial, DoubleSide: 2, Vector2: MockVector2 };

  const mat = createBladeMaterial(MockTHREE, { windGlsl, veining: 0.6 });

  // uVeining color uniform stored for viewer wiring.
  assert.ok(mat.userData.colorUniforms.uVeining !== undefined, 'colorUniforms.uVeining should exist');
  assert.strictEqual(mat.userData.colorUniforms.uVeining.value, 0.6, 'uVeining.value should match opt');

  const mockShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_begin>\n#include <lights_fragment_end>',
  };
  mat.onBeforeCompile(mockShader);

  // Vertex: aBladeU attribute + vBladeU varying declared and written.
  assert.ok(mockShader.vertexShader.includes('attribute float aBladeU'), 'vertex must declare aBladeU');
  assert.ok(mockShader.vertexShader.includes('vBladeU = aBladeU'), 'vertex must write vBladeU');

  // Fragment: vBladeU + uVeining declared; the vein math runs after color_fragment.
  assert.ok(mockShader.fragmentShader.includes('varying float vBladeU'), 'fragment must declare vBladeU');
  assert.ok(mockShader.fragmentShader.includes('uniform float uVeining'), 'fragment must declare uVeining');
  assert.ok(mockShader.fragmentShader.includes('gFbm'), 'fragment must include the fbm helper');
  // uVeining uniform injected into the program.
  assert.ok('uVeining' in mockShader.uniforms, 'uVeining uniform should be injected');

  // The texture apply must come AFTER color_fragment (so diffuseColor exists).
  const cfIdx  = mockShader.fragmentShader.indexOf('#include <color_fragment>');
  const texIdx = mockShader.fragmentShader.indexOf('procedural blade texture');
  assert.ok(cfIdx !== -1 && texIdx > cfIdx, 'texture modulation must be injected after color_fragment');
});
