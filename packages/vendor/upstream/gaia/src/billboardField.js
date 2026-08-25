// =============================================================================
// billboardField.js — billboard grass field rendering
//
// Two exports:
//
//   makeGrassBillboardTexture(THREE)
//     Draws a grass tuft on a canvas (several thin tapered green blades on a
//     transparent background) and returns a THREE.CanvasTexture.
//     Browser-only: guarded so it does not throw in Node / no-canvas contexts.
//
//   buildBillboardField(THREE, { texture, scatter, height })
//     Returns a THREE.InstancedMesh of CROSS-QUAD clumps.  Each clump is 2–3
//     intersecting vertical alpha-tested double-sided quads so the billboard
//     looks volumetric from any horizontal angle without per-frame camera
//     facing.  Instance transforms are set from scatter (positions, rotationsY,
//     scalesXZ for width, scalesY for height) and a per-instance aColorJitter
//     attribute is bound from scatter.colorJitter.
//
// GEOMETRY (buildCrossQuadGeometry):
//   Pure function — no THREE.js calls.  Takes a height and returns plain JS
//   arrays so it can be tested in Node without a GL context.
//   A cross-quad clump of N_QUADS quads (default 3):
//     Each quad is a pair of triangles (4 vertices, 6 indices — two tris sharing
//     a diagonal).  The N_QUADS quads are evenly rotated around the Y axis
//     (step = π/N_QUADS) so they interlock into an asterisk when viewed from above.
//   Per quad:
//     BL (−halfW, 0,      0)  →  UV (0, 0)
//     BR (+halfW, 0,      0)  →  UV (1, 0)
//     TR (+halfW, height, 0)  →  UV (1, 1)
//     TL (−halfW, height, 0)  →  UV (0, 1)
//   Vertices for quad i are pre-rotated by (i * π / N_QUADS) around Y.
//   Triangle winding: each quad emits 2 CCW tris (material is DoubleSide so
//   back-face is rendered automatically).
//
// MATERIAL:
//   MeshStandardMaterial with the grass texture as map, alphaTest=0.05,
//   transparent=false, side=THREE.DoubleSide.
//   aColorJitter drives a SMALL hue+value shift via onBeforeCompile.
//
// DETERMINISM:
//   buildBillboardField is a pure function of its inputs — no Math.random,
//   no Date, no global state.  Same scatter → byte-identical instance matrices.
//
// NODE TESTABILITY:
//   buildCrossQuadGeometry is exported as a named export for tests.
//   buildBillboardField accepts any THREE-shaped object; the geometry builder
//   itself does not call THREE at all.
// =============================================================================

// Number of intersecting quads per clump.  3 gives a good asterisk silhouette
// with minimal overdraw; 2 is cheaper but thinner from some angles.
const N_QUADS = 3;

// Half-width of each quad in local clump space.  The actual rendered width is
// scaled by scatter.scalesXZ per instance.
const QUAD_HALF_WIDTH = 0.5;

const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------------------
// buildCrossQuadGeometry(height)
//
// Pure geometry builder — no THREE.js.  Returns plain typed arrays describing
// N_QUADS intersecting vertical quads.
//
// Returns:
//   {
//     positions: Float32Array(3 * V),   // XYZ per vertex
//     uvs:       Float32Array(2 * V),   // UV per vertex
//     indices:   Uint16Array(3 * T),    // triangle indices
//     vertexCount:   V,                 // total vertices
//     triangleCount: T,                 // total triangles
//   }
//
// V = 4 * N_QUADS,  T = 2 * N_QUADS.
// ---------------------------------------------------------------------------
export function buildCrossQuadGeometry(height) {
  const h = (typeof height === 'number' && height > 0) ? height : 1.0;
  const V = 4 * N_QUADS;   // 4 vertices per quad
  const T = 2 * N_QUADS;   // 2 triangles per quad

  const positions = new Float32Array(V * 3);
  const uvs       = new Float32Array(V * 2);
  const indices   = new Uint16Array(T * 3);

  for (let qi = 0; qi < N_QUADS; qi++) {
    // Each quad is rotated around Y by (qi * π / N_QUADS) so N_QUADS=3 quads
    // are at 0°, 60°, 120° — evenly filling a half-turn.
    const angle = qi * Math.PI / N_QUADS;
    const cosA  = Math.cos(angle);
    const sinA  = Math.sin(angle);

    // 4 corners in local quad space (before Y-rotation):
    //   BL = (−halfW, 0, 0)
    //   BR = (+halfW, 0, 0)
    //   TR = (+halfW, h, 0)
    //   TL = (−halfW, h, 0)
    // After Y-rotation by angle:
    //   x' =  x * cosA  (z stays 0 for a quad in the XY plane → x,z change)
    //   z' = -x * sinA
    //   y' =  y

    const vBase = qi * 4;  // vertex base index for this quad

    // BL — bottom left
    const blX = -QUAD_HALF_WIDTH;
    positions[(vBase + 0) * 3 + 0] =  blX * cosA;
    positions[(vBase + 0) * 3 + 1] =  0;
    positions[(vBase + 0) * 3 + 2] = -blX * sinA;
    uvs[(vBase + 0) * 2 + 0] = 0;
    uvs[(vBase + 0) * 2 + 1] = 0;

    // BR — bottom right
    const brX = QUAD_HALF_WIDTH;
    positions[(vBase + 1) * 3 + 0] =  brX * cosA;
    positions[(vBase + 1) * 3 + 1] =  0;
    positions[(vBase + 1) * 3 + 2] = -brX * sinA;
    uvs[(vBase + 1) * 2 + 0] = 1;
    uvs[(vBase + 1) * 2 + 1] = 0;

    // TR — top right
    const trX = QUAD_HALF_WIDTH;
    positions[(vBase + 2) * 3 + 0] =  trX * cosA;
    positions[(vBase + 2) * 3 + 1] =  h;
    positions[(vBase + 2) * 3 + 2] = -trX * sinA;
    uvs[(vBase + 2) * 2 + 0] = 1;
    uvs[(vBase + 2) * 2 + 1] = 1;

    // TL — top left
    const tlX = -QUAD_HALF_WIDTH;
    positions[(vBase + 3) * 3 + 0] =  tlX * cosA;
    positions[(vBase + 3) * 3 + 1] =  h;
    positions[(vBase + 3) * 3 + 2] = -tlX * sinA;
    uvs[(vBase + 3) * 2 + 0] = 0;
    uvs[(vBase + 3) * 2 + 1] = 1;

    // 2 CCW triangles per quad (front face = +Z when angle=0):
    //   tri 0: BL, BR, TR
    //   tri 1: BL, TR, TL
    const tBase = qi * 2;
    indices[(tBase + 0) * 3 + 0] = vBase + 0;  // BL
    indices[(tBase + 0) * 3 + 1] = vBase + 1;  // BR
    indices[(tBase + 0) * 3 + 2] = vBase + 2;  // TR

    indices[(tBase + 1) * 3 + 0] = vBase + 0;  // BL
    indices[(tBase + 1) * 3 + 1] = vBase + 2;  // TR
    indices[(tBase + 1) * 3 + 2] = vBase + 3;  // TL
  }

  return { positions, uvs, indices, vertexCount: V, triangleCount: T };
}

// ---------------------------------------------------------------------------
// makeGrassBillboardTexture(THREE)
//
// Draws a grass tuft on an OffscreenCanvas (or document canvas as fallback)
// and returns a THREE.CanvasTexture.  Browser-only: returns null safely in
// environments without canvas support.
//
// The tuft has several thin tapered blades radiating from the base, in shades
// of green, on a fully transparent background.
// ---------------------------------------------------------------------------
export function makeGrassBillboardTexture(THREE) {
  // Guard: no canvas API available (Node.js without canvas polyfill).
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
  const hasDocument  = typeof document !== 'undefined';

  if (!hasOffscreen && !hasDocument) {
    return null;
  }

  const SIZE = 256;
  let canvas;
  if (hasOffscreen) {
    canvas = new OffscreenCanvas(SIZE, SIZE);
  } else {
    canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Transparent background.
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Draw several thin tapered grass blades radiating upward.
  const blades = [
    { baseX: 0.50, lean: -0.15, width: 0.08, color: '#4a8c3f' },
    { baseX: 0.40, lean:  0.08, width: 0.07, color: '#3d7a35' },
    { baseX: 0.60, lean: -0.06, width: 0.07, color: '#5a9a4a' },
    { baseX: 0.30, lean:  0.20, width: 0.06, color: '#427838' },
    { baseX: 0.70, lean: -0.18, width: 0.06, color: '#4f8e44' },
    { baseX: 0.50, lean:  0.05, width: 0.09, color: '#3c7033' },
    { baseX: 0.45, lean: -0.25, width: 0.05, color: '#5c9e4c' },
  ];

  for (const blade of blades) {
    const bx  = blade.baseX * SIZE;
    const by  = SIZE;                     // bottom of canvas = ground line
    const tx  = (blade.baseX + blade.lean) * SIZE;
    const ty  = SIZE * 0.05;             // tip near the top

    const halfBaseW = blade.width * SIZE * 0.5;

    // Taper: base is halfBaseW wide, tip collapses to a point.
    const dx = tx - bx;
    const dy = ty - by;  // negative (upward)
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len;   // perpendicular to blade direction
    const perpY =  dx / len;

    ctx.beginPath();
    // Base left
    ctx.moveTo(bx - perpX * halfBaseW, by - perpY * halfBaseW);
    // Base right
    ctx.lineTo(bx + perpX * halfBaseW, by + perpY * halfBaseW);
    // Tip (converges to point)
    ctx.lineTo(tx, ty);
    ctx.closePath();

    const grad = ctx.createLinearGradient(bx, by, tx, ty);
    grad.addColorStop(0, blade.color + 'cc');   // ~80% opaque at base
    grad.addColorStop(1, blade.color + '00');   // transparent at tip
    ctx.fillStyle = grad;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// COLOR-JITTER GLSL — injected via onBeforeCompile.
//
// Reads the per-instance aColorJitter float attribute (range [-1, 1]).
// Applies a small hue and value delta to the base material color.
// When aColorJitter is absent (specimen view), it defaults to 0 so the
// material behaves identically to a plain MeshStandardMaterial.
// ---------------------------------------------------------------------------

const JITTER_ATTRIBUTE_DECL = /* glsl */`
attribute float aColorJitter;
`;

const JITTER_VERTEX_CODE = /* glsl */`
// Pass jitter to fragment shader via a varying.
vColorJitter = aColorJitter;
`;

const JITTER_VARYING_VERT = /* glsl */`
varying float vColorJitter;
`;

const JITTER_VARYING_FRAG = /* glsl */`
varying float vColorJitter;
`;

// Fragment-shader injection: apply a small HSV-style shift.
// Keeps the shift realistic: max ±8% hue, ±12% value.
const JITTER_FRAGMENT_CODE = /* glsl */`
// Apply per-instance color jitter as a small brightness and tint shift.
// vColorJitter in [-1, 1]; 0 = no change (specimen view default).
float _jitterBright = 1.0 + vColorJitter * 0.12;
diffuseColor.rgb *= clamp(_jitterBright, 0.7, 1.35);
// Subtle hue shift: mix toward yellow (warm) or blue-green (cool).
vec3 _jitterTint = mix(vec3(0.95, 1.05, 0.85), vec3(1.05, 0.95, 1.10), vColorJitter * 0.5 + 0.5);
diffuseColor.rgb *= clamp(_jitterTint, vec3(0.5), vec3(1.5));
`;

// ---------------------------------------------------------------------------
// createBillboardMaterial(THREE, texture)
//
// Internal — creates the billboard MeshStandardMaterial with:
//   - texture as map
//   - alphaTest 0.05 (alpha-tested, not transparent blending; texture alpha fades 0.8→0)
//   - transparent false
//   - side DoubleSide
//   - onBeforeCompile that injects aColorJitter support
// ---------------------------------------------------------------------------
function createBillboardMaterial(THREE, texture) {
  const mat = new THREE.MeshStandardMaterial({
    map:       texture,
    alphaTest: 0.05,
    transparent: false,
    side:      THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0.0,
  });

  mat.onBeforeCompile = function (shader) {
    // Vertex shader: declare attribute + varying, write vColorJitter.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      [
        '#include <common>',
        JITTER_ATTRIBUTE_DECL,
        JITTER_VARYING_VERT,
      ].join('\n')
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        JITTER_VERTEX_CODE,
      ].join('\n')
    );

    // Fragment shader: declare varying, apply jitter to diffuseColor.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      [
        '#include <common>',
        JITTER_VARYING_FRAG,
      ].join('\n')
    );

    // Insert just before lights_physical_fragment so the diffuseColor jitter
    // happens before lighting is applied (not after), giving visible tint effect.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      [
        JITTER_FRAGMENT_CODE,
        '#include <lights_physical_fragment>',
      ].join('\n')
    );
  };

  mat.needsUpdate = true;
  return mat;
}

// ---------------------------------------------------------------------------
// buildBillboardField(THREE, { texture, scatter, height })
//
// Builds and returns a THREE.InstancedMesh of cross-quad billboard clumps.
//
// Parameters:
//   THREE    — three.js module (or compatible mock for tests)
//   texture  — THREE.Texture for the grass tuft (from makeGrassBillboardTexture)
//   scatter  — result of computeFieldScatter (extended contract):
//                { count, positions, rotationsY, scalesXZ, scalesY, colorJitter }
//              Falls back gracefully when scalesXZ/scalesY/colorJitter are absent
//              (uses 1.0 for scales, 0.0 for colorJitter).
//   height   — base clump height before scalesY scaling (default: 1.0)
//
// Returns:
//   THREE.InstancedMesh  — count instances, one per scatter clump.
//
// DETERMINISM: same inputs → byte-identical instance matrices and attributes.
// ---------------------------------------------------------------------------
export function buildBillboardField(THREE, { texture, scatter, height = 1.0 }) {
  const count = scatter.count;

  // Build shared geometry (pure, no THREE).
  const geomData = buildCrossQuadGeometry(height);

  // Convert to THREE.BufferGeometry.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(geomData.positions, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(geomData.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(geomData.indices, 1));

  // Normals: compute flat normals for standard lighting.  The cross-quads face
  // different directions so we can't just point them all the same way — three.js
  // computeVertexNormals() handles the averaging correctly.
  geo.computeVertexNormals();

  // Build material.
  const mat = createBillboardMaterial(THREE, texture);

  // Build InstancedMesh.
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  // Per-instance aColorJitter attribute.
  // InstancedBufferAttribute: one float per instance.
  const colorJitterData = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colorJitterData[i] = scatter.colorJitter
      ? scatter.colorJitter[i]
      : 0.0;
  }
  geo.setAttribute(
    'aColorJitter',
    new THREE.InstancedBufferAttribute(colorJitterData, 1)
  );

  // Write per-instance transform matrices.
  // Scale: (scalesXZ * QUAD_HALF_WIDTH * 2, scalesY * height, scalesXZ * QUAD_HALF_WIDTH * 2)
  // The geometry is already built with QUAD_HALF_WIDTH = 0.5 (full width = 1.0),
  // so scalesXZ directly controls width relative to height.
  const matrix     = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position   = new THREE.Vector3();
  const scale      = new THREE.Vector3();
  const axisY      = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < count; i++) {
    position.set(
      scatter.positions[i * 3],
      scatter.positions[i * 3 + 1],
      scatter.positions[i * 3 + 2]
    );

    const rotY    = scatter.rotationsY ? scatter.rotationsY[i] : 0;
    const sXZ     = scatter.scalesXZ  ? scatter.scalesXZ[i]   : 1.0;
    const sY      = scatter.scalesY   ? scatter.scalesY[i]    : 1.0;

    quaternion.setFromAxisAngle(axisY, rotY);
    scale.set(sXZ, sY, sXZ);

    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}
