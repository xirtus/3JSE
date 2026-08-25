// =============================================================================
// fieldScatter.js — deterministic clump transform set for the field view
//
// Pure data module: no THREE.js, no DOM, no global state.
// Node-testable.
//
// EXPORTED API:
//   computeFieldScatter(seed, opts) -> FieldScatterResult
//
// FieldScatterResult:
//   count:        number                       — total number of instances (variable)
//   positions:    Float32Array(3 * count)      — XYZ center of each clump (Y=0)
//   rotationsY:   Float32Array(count)          — per-instance Y rotation in radians [0, 2π)
//   scalesXZ:     Float32Array(count)          — per-instance footprint/width scale  ~[0.80, 1.20]
//   scalesY:      Float32Array(count)          — per-instance height scale           ~[0.75, 1.35]
//   colorJitter:  Float32Array(count)          — per-instance hue+value delta        ~[-1, 1]
//
// opts (all optional):
//   radius   {number}  disc radius in world units (default: 8). Field is a disc
//                      centered at the origin.
//   minDist  {number}  minimum center-to-center spacing between clumps (default: 0.35).
//                      Should track the clump footprint so clumps interlock —
//                      a value well under 2× the clump footprint radius gives a
//                      gap-free field without visible ground showing through.
//   k        {number}  Bridson candidate attempts per active sample (default: 30).
//                      Higher k → denser packing but slower; 30 is the standard value.
//
// SCALE / COLOR TUNING CONSTANTS (non-uniform, independent per axis):
//   WIDTH_MIN / WIDTH_MAX   footprint/width scale range (scalesXZ)   [0.80, 1.20]
//   HEIGHT_MIN / HEIGHT_MAX height scale range (scalesY)             [0.75, 1.35]
//   COLOR_JITTER_RANGE      half-width of color jitter in [-1,1]     (full ±1)
// These ranges are deliberately tight so the field looks natural without looking
// plasticky (uniform) or chaotic. Adjust here — nowhere else.
//
// ALGORITHM: Bridson (2007) fast Poisson-disk sampling, 2-D on the XZ plane.
// The field region is a disc of the given radius; candidate points outside the
// disc are rejected so all accepted points satisfy |p| ≤ radius.
//
// DETERMINISM: same (seed, opts) → byte-identical output.
// Uses mulberry32 seeded PRNG; draws are consumed in this FIXED order:
//
//   PHASE 1 — sampling (Bridson loop; point count is not known in advance)
//     Initial point:
//       Draw 1: angle    (0..2π)
//       Draw 2: r-frac   (√-uniform in [0,1) maps to [0, radius])
//     Per active-sample iteration (while active list non-empty):
//       k times per active point:
//         Draw A: candidate angle    (0..2π)
//         Draw B: candidate r-frac   (uniform in [0,1) maps to [minDist, 2*minDist])
//       Active point is removed when all k candidates are rejected.
//
//   PHASE 2 — decoration (over accepted points in INSERTION ORDER)
//     Per accepted point i:
//       Draw 1: rotationY   (0..2π)
//       Draw 2: scaleXZ     (WIDTH_MIN..WIDTH_MAX)
//       Draw 3: scaleY      (HEIGHT_MIN..HEIGHT_MAX)
//       Draw 4: colorJitter (-1..1)
//
// The two-phase approach guarantees that decoration draws never interfere with
// sampling: the point set is finalised before any decoration value is drawn.
// =============================================================================

import { mulberry32 } from './rng.js';

// Default scatter parameters.
const DEFAULT_RADIUS   = 8;
const DEFAULT_MIN_DIST = 0.35; // well under clump footprint (r≈0.275) → clumps interlock
const DEFAULT_K        = 30;

// Non-uniform scale tuning constants.
// Keep these tight so the field looks organic but not chaotic.
const WIDTH_MIN  = 0.80; // scalesXZ lower bound (footprint/width)
const WIDTH_MAX  = 1.20; // scalesXZ upper bound
const HEIGHT_MIN = 0.75; // scalesY lower bound (blade height)
const HEIGHT_MAX = 1.35; // scalesY upper bound

// Color jitter: full signed range [-1, 1]. The material maps this to a
// small natural hue+value delta; the raw value is intentionally ±1 so the
// material author controls the perceptual magnitude via its own multiplier.
const COLOR_JITTER_RANGE = 1.0;

const TWO_PI = Math.PI * 2;

/**
 * computeFieldScatter(seed, opts)
 *
 * Returns a deterministic Poisson-disk sample set of per-instance transforms
 * for the field view. Each instance is one grass clump at Y=0, distributed
 * with blue-noise spacing (no grid rows, no gaps, no overlaps).
 *
 * @param {number} seed  uint32 seed for the mulberry32 PRNG.
 * @param {object} [opts]
 * @param {number} [opts.radius=8]     Disc radius (world units). Field is a disc
 *                                     centered at the origin; all clumps lie inside.
 * @param {number} [opts.minDist=0.35] Minimum center-to-center distance (m).
 * @param {number} [opts.k=30]         Bridson candidate attempts per active point.
 *
 * @returns {{
 *   count:       number,
 *   positions:   Float32Array,  // 3 * count floats (XYZ, Y always 0)
 *   rotationsY:  Float32Array,  // count floats (radians, 0..2π)
 *   scalesXZ:    Float32Array,  // count floats (footprint/width, ~[0.85, 1.20])
 *   scalesY:     Float32Array,  // count floats (height, ~[0.80, 1.30])
 *   colorJitter: Float32Array,  // count floats (signed, ~[-1, 1])
 * }}
 */
export function computeFieldScatter(seed, opts = {}) {
  const radius  = (opts.radius  !== undefined) ? opts.radius  : DEFAULT_RADIUS;
  const minDist = (opts.minDist !== undefined) ? opts.minDist : DEFAULT_MIN_DIST;
  const k       = (opts.k      !== undefined) ? opts.k       : DEFAULT_K;

  const rng = mulberry32(seed >>> 0);

  // -------------------------------------------------------------------------
  // PHASE 1: Bridson Poisson-disk sampling on XZ disc
  // -------------------------------------------------------------------------
  // Background grid cell size: minDist / sqrt(2) ensures each cell holds at
  // most one sample (standard Bridson property).
  const cellSize = minDist / Math.SQRT2;

  // Grid spans [-radius, radius] in both X and Z. Add 1 cell of padding to
  // avoid off-by-one on the boundary.
  const gridDim = Math.ceil((2 * radius) / cellSize) + 1;
  // grid[row * gridDim + col] = index into acceptedX/Z arrays, or -1 if empty.
  const grid = new Int32Array(gridDim * gridDim).fill(-1);

  const acceptedX = [];
  const acceptedZ = [];

  /**
   * Convert world XZ to grid col/row. Returns [-1,-1] if out of grid bounds.
   */
  function toGrid(x, z) {
    const col = Math.floor((x + radius) / cellSize);
    const row = Math.floor((z + radius) / cellSize);
    return { col, row };
  }

  /**
   * Check whether candidate (cx, cz) is too close to any existing sample.
   * Searches the 5×5 neighbourhood in grid space (covers 2*minDist radius).
   */
  function tooClose(cx, cz) {
    const { col, row } = toGrid(cx, cz);
    const minDistSq = minDist * minDist;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r2 = row + dr;
        const c2 = col + dc;
        if (r2 < 0 || r2 >= gridDim || c2 < 0 || c2 >= gridDim) continue;
        const idx = grid[r2 * gridDim + c2];
        if (idx < 0) continue;
        const dx = cx - acceptedX[idx];
        const dz = cz - acceptedZ[idx];
        if (dx * dx + dz * dz < minDistSq) return true;
      }
    }
    return false;
  }

  /**
   * Accept a point: push to accepted arrays, write grid cell.
   * Returns the index of the accepted point.
   */
  function acceptPoint(x, z) {
    const idx = acceptedX.length;
    acceptedX.push(x);
    acceptedZ.push(z);
    const { col, row } = toGrid(x, z);
    grid[row * gridDim + col] = idx;
    return idx;
  }

  // --- Initial point ---
  // Draw 1: angle in [0, 2π)
  const initAngle = rng() * TWO_PI;
  // Draw 2: uniform in [0,1) → sqrt-mapped to produce uniform area distribution
  const initR     = Math.sqrt(rng()) * radius;
  const initX     = Math.cos(initAngle) * initR;
  const initZ     = Math.sin(initAngle) * initR;

  acceptPoint(initX, initZ);
  const active = [0]; // indices into accepted arrays

  // --- Main Bridson loop ---
  while (active.length > 0) {
    // Pick a random active point (without consuming extra rng draws — use the
    // last element for O(1) removal, standard Bridson approach).
    const activeIdx = active.length - 1;
    const srcIdx    = active[activeIdx];
    const sx        = acceptedX[srcIdx];
    const sz        = acceptedZ[srcIdx];

    let found = false;
    for (let attempt = 0; attempt < k; attempt++) {
      // Draw A: angle for candidate direction
      const angle = rng() * TWO_PI;
      // Draw B: distance in [minDist, 2*minDist)
      const dist  = minDist + rng() * minDist;
      const cx    = sx + Math.cos(angle) * dist;
      const cz    = sz + Math.sin(angle) * dist;

      // Reject if outside disc.
      if (cx * cx + cz * cz > radius * radius) continue;
      // Reject if too close to an existing sample.
      if (tooClose(cx, cz)) continue;

      const newIdx = acceptPoint(cx, cz);
      active.push(newIdx);
      found = true;
      break;
    }

    if (!found) {
      // Remove this active point (swap with last, then pop).
      active[activeIdx] = active[active.length - 1];
      active.pop();
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 2: Decoration — fixed draw order per accepted point (insertion order)
  //   Draw 1: rotationY   (0..2π)
  //   Draw 2: scaleXZ     (WIDTH_MIN..WIDTH_MAX)
  //   Draw 3: scaleY      (HEIGHT_MIN..HEIGHT_MAX)
  //   Draw 4: colorJitter (-COLOR_JITTER_RANGE..+COLOR_JITTER_RANGE)
  // -------------------------------------------------------------------------
  const count       = acceptedX.length;
  const positions   = new Float32Array(count * 3);
  const rotationsY  = new Float32Array(count);
  const scalesXZ    = new Float32Array(count);
  const scalesY     = new Float32Array(count);
  const colorJitter = new Float32Array(count);

  const widthRange  = WIDTH_MAX  - WIDTH_MIN;
  const heightRange = HEIGHT_MAX - HEIGHT_MIN;

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = acceptedX[i];
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = acceptedZ[i];

    // Draw 1: Y-rotation in [0, 2π)
    rotationsY[i] = rng() * TWO_PI;
    // Draw 2: footprint/width scale in [WIDTH_MIN, WIDTH_MAX)
    scalesXZ[i] = WIDTH_MIN + rng() * widthRange;
    // Draw 3: height scale in [HEIGHT_MIN, HEIGHT_MAX)
    scalesY[i] = HEIGHT_MIN + rng() * heightRange;
    // Draw 4: color jitter in [-COLOR_JITTER_RANGE, +COLOR_JITTER_RANGE)
    colorJitter[i] = (rng() * 2 - 1) * COLOR_JITTER_RANGE;
  }

  return { count, positions, rotationsY, scalesXZ, scalesY, colorJitter };
}
