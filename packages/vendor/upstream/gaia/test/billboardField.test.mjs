// =============================================================================
// test/billboardField.test.mjs — billboardField tests
//
// Covers:
//   buildCrossQuadGeometry:
//     - vertex count = 4 * N_QUADS per clump
//     - triangle count = 2 * N_QUADS per clump
//     - all bottom vertices have y = 0
//     - all top vertices have y = height
//     - no NaN/Infinity in positions or UVs
//     - UVs are in [0, 1]
//     - all indices < vertexCount
//     - determinism: same height → byte-identical output
//     - different height → different top-vertex y positions
//     - quads are rotated at distinct angles (top-left X positions differ)
//
//   buildBillboardField:
//     - instance count == scatter.count
//     - aColorJitter attribute length == scatter.count
//     - aColorJitter values match scatter.colorJitter
//     - aColorJitter defaults to 0 when scatter.colorJitter is absent
//     - instanceMatrix has been updated (needsUpdate true before first call)
//     - transform composition: position/rotation/scale correctly encoded
//     - determinism: same scatter → byte-identical instance matrices
//     - material has alphaTest = 0.05, DoubleSide, map set
//
// NOTE: makeGrassBillboardTexture is browser-only (canvas API required) and
// is excluded from Node tests.  Its guard (returns null when no canvas) is
// tested here via a mock THREE that records CanvasTexture construction.
//
// TESTING APPROACH:
//   buildCrossQuadGeometry is fully pure — tested directly.
//   buildBillboardField requires a fake/minimal THREE object.
//   The fake THREE does not depend on a GL context; it only tracks constructor
//   calls and stores data in plain JS structures.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCrossQuadGeometry,
  buildBillboardField,
  makeGrassBillboardTexture,
} from '../src/billboardField.js';

// ---------------------------------------------------------------------------
// N_QUADS constant — must match the module's internal constant.
// 3 quads per clump is the spec; assert vertex/triangle counts with this.
// ---------------------------------------------------------------------------
const N_QUADS = 3;

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

/**
 * Build a minimal fake THREE that implements just enough for buildBillboardField.
 * Stores geometry/attribute/index data in plain JS so tests can inspect it.
 */
function makeFakeTHREE() {
  // Track ALL InstancedMesh calls to inspect the last one.
  let lastMesh = null;

  class FakeBufferAttribute {
    constructor(array, itemSize) {
      this.array    = array;
      this.itemSize = itemSize;
    }
  }

  class FakeInstancedBufferAttribute {
    constructor(array, itemSize) {
      this.array    = array;
      this.itemSize = itemSize;
    }
  }

  class FakeBufferGeometry {
    constructor() {
      this.attributes = {};
      this.index      = null;
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
    }
    setIndex(attr) {
      this.index = attr;
    }
    computeVertexNormals() {
      // no-op in tests
    }
  }

  class FakeMeshStandardMaterial {
    constructor(params) {
      Object.assign(this, params);
      this.userData   = {};
      this.needsUpdate = false;
    }
  }

  class FakeMatrix4 {
    constructor() { this._m = new Float32Array(16); this._m[0]=1; this._m[5]=1; this._m[10]=1; this._m[15]=1; }
    compose(position, quaternion, scale) {
      // Store compose args for inspection.
      this._composed = { position: { x: position.x, y: position.y, z: position.z },
                         quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
                         scale: { x: scale.x, y: scale.y, z: scale.z } };
      // Build a real 4×4 from SRT decomposition.
      const { x:qx, y:qy, z:qz, w:qw } = quaternion;
      const { x:sx, y:sy, z:sz } = scale;
      const { x:px, y:py, z:pz } = position;

      // Rotation matrix from quaternion
      const x2=qx+qx, y2=qy+qy, z2=qz+qz;
      const xx=qx*x2, xy=qx*y2, xz=qx*z2;
      const yy=qy*y2, yz=qy*z2, zz=qz*z2;
      const wx=qw*x2, wy=qw*y2, wz=qw*z2;

      this._m[0] = (1-(yy+zz))*sx;
      this._m[1] = (xy+wz)*sx;
      this._m[2] = (xz-wy)*sx;
      this._m[3] = 0;
      this._m[4] = (xy-wz)*sy;
      this._m[5] = (1-(xx+zz))*sy;
      this._m[6] = (yz+wx)*sy;
      this._m[7] = 0;
      this._m[8] = (xz+wy)*sz;
      this._m[9] = (yz-wx)*sz;
      this._m[10]= (1-(xx+yy))*sz;
      this._m[11]= 0;
      this._m[12]= px;
      this._m[13]= py;
      this._m[14]= pz;
      this._m[15]= 1;
    }
  }

  class FakeVector3 {
    constructor(x=0, y=0, z=0) { this.x=x; this.y=y; this.z=z; }
    set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
  }

  class FakeQuaternion {
    constructor() { this.x=0; this.y=0; this.z=0; this.w=1; }
    setFromAxisAngle(axis, angle) {
      const half = angle * 0.5;
      const s = Math.sin(half);
      this.x = axis.x * s;
      this.y = axis.y * s;
      this.z = axis.z * s;
      this.w = Math.cos(half);
      return this;
    }
  }

  // Fake InstancedMesh stores setMatrixAt calls.
  class FakeInstancedMesh {
    constructor(geo, mat, count) {
      this.geometry = geo;
      this.material = mat;
      this.count    = count;
      this._matrices = [];
      this.instanceMatrix = { needsUpdate: false };
      lastMesh = this;
    }
    setMatrixAt(i, matrix) {
      this._matrices[i] = { ...matrix._composed, _m: Float32Array.from(matrix._m) };
    }
  }

  const THREE = {
    BufferGeometry:            FakeBufferGeometry,
    BufferAttribute:           FakeBufferAttribute,
    InstancedBufferAttribute:  FakeInstancedBufferAttribute,
    MeshStandardMaterial:      FakeMeshStandardMaterial,
    InstancedMesh:             FakeInstancedMesh,
    Matrix4:                   FakeMatrix4,
    Vector3:                   FakeVector3,
    Quaternion:                FakeQuaternion,
    DoubleSide:                2,
  };

  return { THREE, getLastMesh: () => lastMesh };
}

/**
 * Build a minimal scatter with the extended contract fields.
 * count clumps placed along the X axis, 1 unit apart.
 */
function makeScatter(count, opts = {}) {
  const positions   = new Float32Array(count * 3);
  const rotationsY  = new Float32Array(count);
  const scalesXZ    = new Float32Array(count);
  const scalesY     = new Float32Array(count);
  const colorJitter = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = i * 1.0;  // X spaced 1 apart
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    rotationsY[i]  = opts.rotationsY  ? opts.rotationsY[i]  : (i * 0.5);
    scalesXZ[i]    = opts.scalesXZ    ? opts.scalesXZ[i]    : (0.9 + i * 0.01);
    scalesY[i]     = opts.scalesY     ? opts.scalesY[i]     : (1.0 + i * 0.02);
    colorJitter[i] = opts.colorJitter ? opts.colorJitter[i] : ((i % 3) * 0.3 - 0.3);
  }

  return { count, positions, rotationsY, scalesXZ, scalesY, colorJitter };
}

// ---------------------------------------------------------------------------
// SECTION 1: buildCrossQuadGeometry tests
// ---------------------------------------------------------------------------

test('buildCrossQuadGeometry: vertex count is 4 * N_QUADS', () => {
  const g = buildCrossQuadGeometry(1.0);
  assert.strictEqual(g.vertexCount, 4 * N_QUADS);
  assert.strictEqual(g.positions.length, 4 * N_QUADS * 3);
});

test('buildCrossQuadGeometry: triangle count is 2 * N_QUADS', () => {
  const g = buildCrossQuadGeometry(1.0);
  assert.strictEqual(g.triangleCount, 2 * N_QUADS);
  assert.strictEqual(g.indices.length, 2 * N_QUADS * 3);
});

test('buildCrossQuadGeometry: all bottom-row vertices have y = 0', () => {
  const g = buildCrossQuadGeometry(1.5);
  // Each quad: vertices at indices qi*4+0 (BL) and qi*4+1 (BR) have y=0
  for (let qi = 0; qi < N_QUADS; qi++) {
    const blY = g.positions[(qi * 4 + 0) * 3 + 1];
    const brY = g.positions[(qi * 4 + 1) * 3 + 1];
    assert.strictEqual(blY, 0, `quad ${qi} BL.y should be 0`);
    assert.strictEqual(brY, 0, `quad ${qi} BR.y should be 0`);
  }
});

test('buildCrossQuadGeometry: all top-row vertices have y = height', () => {
  const h = 1.8;
  const g = buildCrossQuadGeometry(h);
  // Each quad: vertices qi*4+2 (TR) and qi*4+3 (TL) have y=height
  for (let qi = 0; qi < N_QUADS; qi++) {
    const trY = g.positions[(qi * 4 + 2) * 3 + 1];
    const tlY = g.positions[(qi * 4 + 3) * 3 + 1];
    assert.ok(Math.abs(trY - h) < 1e-6, `quad ${qi} TR.y expected ${h}, got ${trY}`);
    assert.ok(Math.abs(tlY - h) < 1e-6, `quad ${qi} TL.y expected ${h}, got ${tlY}`);
  }
});

test('buildCrossQuadGeometry: height default 1 when argument <= 0', () => {
  const g0 = buildCrossQuadGeometry(0);
  const g1 = buildCrossQuadGeometry(1.0);
  // Both should have top vertices at y=1
  const trY0 = g0.positions[(0 * 4 + 2) * 3 + 1];
  const trY1 = g1.positions[(0 * 4 + 2) * 3 + 1];
  assert.strictEqual(trY0, trY1, 'height=0 should default to 1.0');
});

test('buildCrossQuadGeometry: no NaN or Infinity in positions', () => {
  assertNoNaN(buildCrossQuadGeometry(1.0).positions, 'positions');
  assertNoNaN(buildCrossQuadGeometry(2.5).positions, 'positions-2.5');
});

test('buildCrossQuadGeometry: no NaN or Infinity in UVs', () => {
  assertNoNaN(buildCrossQuadGeometry(1.0).uvs, 'uvs');
});

test('buildCrossQuadGeometry: all UV values are in [0, 1]', () => {
  const g = buildCrossQuadGeometry(1.0);
  for (let i = 0; i < g.uvs.length; i++) {
    assert.ok(
      g.uvs[i] >= 0 - 1e-6 && g.uvs[i] <= 1 + 1e-6,
      `uvs[${i}]=${g.uvs[i]} out of [0,1]`
    );
  }
});

test('buildCrossQuadGeometry: all indices are < vertexCount', () => {
  const g = buildCrossQuadGeometry(1.0);
  for (let i = 0; i < g.indices.length; i++) {
    assert.ok(
      g.indices[i] < g.vertexCount,
      `index[${i}]=${g.indices[i]} >= vertexCount=${g.vertexCount}`
    );
  }
});

test('buildCrossQuadGeometry: determinism — same height → identical output', () => {
  const g1 = buildCrossQuadGeometry(1.2);
  const g2 = buildCrossQuadGeometry(1.2);

  assert.strictEqual(g1.positions.length, g2.positions.length);
  for (let i = 0; i < g1.positions.length; i++) {
    assert.strictEqual(g1.positions[i], g2.positions[i], `positions[${i}] mismatch`);
  }
  for (let i = 0; i < g1.indices.length; i++) {
    assert.strictEqual(g1.indices[i], g2.indices[i], `indices[${i}] mismatch`);
  }
});

test('buildCrossQuadGeometry: different height → different top-vertex y positions', () => {
  const g1 = buildCrossQuadGeometry(1.0);
  const g2 = buildCrossQuadGeometry(2.0);
  // top-right Y of first quad
  const trY1 = g1.positions[(0 * 4 + 2) * 3 + 1];
  const trY2 = g2.positions[(0 * 4 + 2) * 3 + 1];
  assert.ok(trY1 !== trY2, 'different heights should produce different top-vertex Y positions');
  assert.ok(Math.abs(trY2 - 2 * trY1) < 1e-5, 'top-vertex Y should scale with height');
});

test('buildCrossQuadGeometry: quads are at distinct angles (top-left X positions differ)', () => {
  const g = buildCrossQuadGeometry(1.0);
  // TL = vertex qi*4+3; x-component differs per quad (rotated by qi * π/N_QUADS)
  const xVals = [];
  for (let qi = 0; qi < N_QUADS; qi++) {
    xVals.push(g.positions[(qi * 4 + 3) * 3 + 0]);  // TL x
  }
  // All must be distinct
  for (let i = 0; i < xVals.length; i++) {
    for (let j = i + 1; j < xVals.length; j++) {
      assert.ok(
        Math.abs(xVals[i] - xVals[j]) > 1e-6,
        `quad ${i} and quad ${j} TL x-positions are the same: ${xVals[i]}`
      );
    }
  }
});

test('buildCrossQuadGeometry: quad 0 has TL/TR with z = 0 (lies in XY plane, unrotated)', () => {
  const g = buildCrossQuadGeometry(1.0);
  // Quad 0 (angle=0): rotation is identity, all z = 0
  for (let vi = 0; vi < 4; vi++) {
    const z = g.positions[(0 * 4 + vi) * 3 + 2];
    assert.ok(Math.abs(z) < 1e-7, `quad 0 vertex ${vi} z=${z} should be 0`);
  }
});

test('buildCrossQuadGeometry: triangles reference correct winding for first quad', () => {
  const g = buildCrossQuadGeometry(1.0);
  // Quad 0, tri 0: should be (0, 1, 2) = BL, BR, TR
  assert.strictEqual(g.indices[0], 0, 'tri0[0] = BL');
  assert.strictEqual(g.indices[1], 1, 'tri0[1] = BR');
  assert.strictEqual(g.indices[2], 2, 'tri0[2] = TR');
  // Quad 0, tri 1: should be (0, 2, 3) = BL, TR, TL
  assert.strictEqual(g.indices[3], 0, 'tri1[0] = BL');
  assert.strictEqual(g.indices[4], 2, 'tri1[1] = TR');
  assert.strictEqual(g.indices[5], 3, 'tri1[2] = TL');
});

// ---------------------------------------------------------------------------
// SECTION 2: buildBillboardField tests
// ---------------------------------------------------------------------------

test('buildBillboardField: instance count equals scatter.count', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(7);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.strictEqual(mesh.count, 7, 'mesh.count should equal scatter.count');
});

test('buildBillboardField: instance count with larger scatter', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(50);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.strictEqual(mesh.count, 50);
});

test('buildBillboardField: aColorJitter attribute length equals scatter.count', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const count = 5;
  const scatter = makeScatter(count);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  const jitterAttr = mesh.geometry.attributes.aColorJitter;
  assert.ok(jitterAttr, 'aColorJitter attribute should be set');
  assert.strictEqual(jitterAttr.array.length, count, 'aColorJitter array length = count');
});

test('buildBillboardField: aColorJitter values match scatter.colorJitter', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const count = 4;
  const colorJitter = new Float32Array([0.5, -0.3, 0.1, -0.8]);
  const scatter = makeScatter(count, { colorJitter });
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  const jitterAttr = mesh.geometry.attributes.aColorJitter;
  for (let i = 0; i < count; i++) {
    assert.strictEqual(
      jitterAttr.array[i],
      colorJitter[i],
      `aColorJitter[${i}] expected ${colorJitter[i]}, got ${jitterAttr.array[i]}`
    );
  }
});

test('buildBillboardField: aColorJitter defaults to 0 when scatter.colorJitter absent', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(3);
  delete scatter.colorJitter;  // remove colorJitter to simulate old scatter contract
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  const jitterAttr = mesh.geometry.attributes.aColorJitter;
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(jitterAttr.array[i], 0.0, `aColorJitter[${i}] should default to 0`);
  }
});

test('buildBillboardField: instanceMatrix needsUpdate set true after setting all matrices', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(3);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.strictEqual(mesh.instanceMatrix.needsUpdate, true, 'instanceMatrix.needsUpdate should be true');
});

test('buildBillboardField: transforms encode correct position for each instance', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const count = 3;
  const scatter = makeScatter(count, { rotationsY: new Float32Array([0, 0, 0]) });
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();

  for (let i = 0; i < count; i++) {
    const m = mesh._matrices[i];
    assert.ok(m, `matrix ${i} should be set`);
    // Position should match scatter.positions
    const px = scatter.positions[i * 3];
    const py = scatter.positions[i * 3 + 1];
    const pz = scatter.positions[i * 3 + 2];
    // The matrix stores position in m[12..14] (column-major); we read _m
    assert.ok(Math.abs(m._m[12] - px) < 1e-5, `matrix[${i}] tx=${m._m[12]} != ${px}`);
    assert.ok(Math.abs(m._m[13] - py) < 1e-5, `matrix[${i}] ty=${m._m[13]} != ${py}`);
    assert.ok(Math.abs(m._m[14] - pz) < 1e-5, `matrix[${i}] tz=${m._m[14]} != ${pz}`);
  }
});

test('buildBillboardField: transforms encode independent scalesXZ and scalesY', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  // Use rotation=0 so scale can be read directly from matrix diagonal
  const count = 2;
  const scalesXZ    = new Float32Array([1.1, 0.9]);
  const scalesY     = new Float32Array([1.3, 0.8]);
  const rotationsY  = new Float32Array([0, 0]);
  const scatter = makeScatter(count, { scalesXZ, scalesY, rotationsY });
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();

  // Instance 0: scalesXZ=1.1, scalesY=1.3
  // Column-major, rotation=0: m[0]=sx, m[5]=sy, m[10]=sz
  const m0 = mesh._matrices[0]._m;
  assert.ok(Math.abs(m0[0]  - scalesXZ[0]) < 1e-5, `m0[0] (xScale) expected ${scalesXZ[0]}, got ${m0[0]}`);
  assert.ok(Math.abs(m0[5]  - scalesY[0])  < 1e-5, `m0[5] (yScale) expected ${scalesY[0]}, got ${m0[5]}`);
  assert.ok(Math.abs(m0[10] - scalesXZ[0]) < 1e-5, `m0[10] (zScale) expected ${scalesXZ[0]}, got ${m0[10]}`);

  // Instance 1: scalesXZ=0.9, scalesY=0.8
  const m1 = mesh._matrices[1]._m;
  assert.ok(Math.abs(m1[0]  - scalesXZ[1]) < 1e-5, `m1[0] (xScale) expected ${scalesXZ[1]}, got ${m1[0]}`);
  assert.ok(Math.abs(m1[5]  - scalesY[1])  < 1e-5, `m1[5] (yScale) expected ${scalesY[1]}, got ${m1[5]}`);
  assert.ok(Math.abs(m1[10] - scalesXZ[1]) < 1e-5, `m1[10] (zScale) expected ${scalesXZ[1]}, got ${m1[10]}`);
});

test('buildBillboardField: Y rotation is correctly applied to first instance', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const count = 1;
  // Rotate 90° around Y: expect m[0]=0, m[2]=-1 (approx), m[8]=1
  const rotationsY = new Float32Array([Math.PI / 2]);
  const scatter = makeScatter(count, {
    rotationsY,
    scalesXZ: new Float32Array([1.0]),
    scalesY:  new Float32Array([1.0]),
  });
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  const m = mesh._matrices[0]._m;
  // After 90° Y-rotation with uniform scale=1: m[0]≈0, m[2]≈-1, m[8]≈1
  // (column-major: col 0 = [cos90, 0, -sin90, 0] = [0, 0, -1, 0])
  assert.ok(Math.abs(m[0])  < 1e-5, `m[0] should be ~0 for 90° rotation, got ${m[0]}`);
  assert.ok(Math.abs(m[2] - (-1.0)) < 1e-5, `m[2] should be ~-1 for 90° rotation, got ${m[2]}`);
  assert.ok(Math.abs(m[8] - 1.0)    < 1e-5, `m[8] should be ~1 for 90° rotation, got ${m[8]}`);
});

test('buildBillboardField: determinism — same scatter → identical matrices', () => {
  const scatter = makeScatter(10);

  const { THREE: THREE1, getLastMesh: getM1 } = makeFakeTHREE();
  buildBillboardField(THREE1, { texture: null, scatter, height: 1.0 });
  const mesh1 = getM1();

  const { THREE: THREE2, getLastMesh: getM2 } = makeFakeTHREE();
  buildBillboardField(THREE2, { texture: null, scatter, height: 1.0 });
  const mesh2 = getM2();

  assert.strictEqual(mesh1._matrices.length, mesh2._matrices.length);
  for (let i = 0; i < mesh1._matrices.length; i++) {
    const m1 = mesh1._matrices[i]._m;
    const m2 = mesh2._matrices[i]._m;
    for (let j = 0; j < 16; j++) {
      assert.ok(
        Math.abs(m1[j] - m2[j]) < 1e-7,
        `matrix[${i}][${j}]: ${m1[j]} vs ${m2[j]} — should be identical`
      );
    }
  }
});

test('buildBillboardField: material has alphaTest = 0.05', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.strictEqual(mesh.material.alphaTest, 0.05, 'alphaTest should be 0.05');
});

test('buildBillboardField: material has side = DoubleSide', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.strictEqual(mesh.material.side, THREE.DoubleSide, 'side should be DoubleSide');
});

test('buildBillboardField: material has transparent = false', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.strictEqual(mesh.material.transparent, false, 'transparent should be false');
});

test('buildBillboardField: material map is the provided texture', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  const fakeTexture = { isFakeTexture: true };
  buildBillboardField(THREE, { texture: fakeTexture, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.strictEqual(mesh.material.map, fakeTexture, 'material.map should be the provided texture');
});

test('buildBillboardField: material has onBeforeCompile for aColorJitter injection', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.ok(
    typeof mesh.material.onBeforeCompile === 'function',
    'material should have onBeforeCompile for aColorJitter injection'
  );
});

test('buildBillboardField: onBeforeCompile injects aColorJitter attribute declaration', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();

  const mockShader = {
    vertexShader:   '#include <common>\n#include <begin_vertex>\nvoid main() {}',
    fragmentShader: '#include <common>\n#include <lights_physical_fragment>\n#include <output_fragment>',
    uniforms: {},
  };
  mesh.material.onBeforeCompile(mockShader);
  assert.ok(
    mockShader.vertexShader.includes('aColorJitter'),
    'compiled vertex shader should declare aColorJitter attribute'
  );
});

test('buildBillboardField: onBeforeCompile injects vColorJitter varying', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();

  const mockShader = {
    vertexShader:   '#include <common>\n#include <begin_vertex>\nvoid main() {}',
    fragmentShader: '#include <common>\n#include <lights_physical_fragment>\n#include <output_fragment>',
    uniforms: {},
  };
  mesh.material.onBeforeCompile(mockShader);
  assert.ok(
    mockShader.vertexShader.includes('vColorJitter'),
    'vertex shader should declare vColorJitter varying'
  );
  assert.ok(
    mockShader.fragmentShader.includes('vColorJitter'),
    'fragment shader should read vColorJitter varying'
  );
});

test('buildBillboardField: geometry has position and uv attributes', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(2);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.ok(mesh.geometry.attributes.position, 'geometry should have position attribute');
  assert.ok(mesh.geometry.attributes.uv,       'geometry should have uv attribute');
});

test('buildBillboardField: geometry has an index buffer', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(2);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  assert.ok(mesh.geometry.index, 'geometry should have an index buffer');
});

test('buildBillboardField: geometry vertex count matches N_QUADS * 4', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const scatter = makeScatter(1);
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();
  const posAttr = mesh.geometry.attributes.position;
  assert.strictEqual(posAttr.array.length, N_QUADS * 4 * 3,
    `geometry position array length should be N_QUADS*4*3=${N_QUADS * 4 * 3}`);
});

test('buildBillboardField: scalesXZ/scalesY default to 1.0 when absent', () => {
  const { THREE, getLastMesh } = makeFakeTHREE();
  const count = 2;
  // Build scatter without scalesXZ/scalesY
  const scatter = {
    count,
    positions:  new Float32Array([0, 0, 0,  1, 0, 0]),
    rotationsY: new Float32Array([0, 0]),
  };
  buildBillboardField(THREE, { texture: null, scatter, height: 1.0 });
  const mesh = getLastMesh();

  // With scale=1.0 and rotation=0, diagonal entries should be 1.0
  for (let i = 0; i < count; i++) {
    const m = mesh._matrices[i]._m;
    assert.ok(Math.abs(m[0]  - 1.0) < 1e-5, `instance ${i} m[0] (xScale) should be 1.0`);
    assert.ok(Math.abs(m[5]  - 1.0) < 1e-5, `instance ${i} m[5] (yScale) should be 1.0`);
    assert.ok(Math.abs(m[10] - 1.0) < 1e-5, `instance ${i} m[10] (zScale) should be 1.0`);
  }
});

// ---------------------------------------------------------------------------
// SECTION 3: makeGrassBillboardTexture guard test
//
// In Node.js (no canvas), the function should return null without throwing.
// ---------------------------------------------------------------------------

test('makeGrassBillboardTexture: returns null in Node.js (no canvas)', () => {
  // Node.js has no OffscreenCanvas or document by default.
  // The function should guard and return null.
  const hasCanvas = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';

  if (!hasCanvas) {
    const result = makeGrassBillboardTexture({ CanvasTexture: class {} });
    assert.strictEqual(result, null, 'should return null when no canvas available');
  } else {
    // In a canvas environment (e.g. JSDOM), just assert it does not throw.
    assert.doesNotThrow(() => {
      makeGrassBillboardTexture({ CanvasTexture: class { constructor() {} } });
    });
  }
});
