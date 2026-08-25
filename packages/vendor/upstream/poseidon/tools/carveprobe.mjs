// Monte-Carlo the pre-de-tiling carve against the current one on the REAL bake
// (via makeDetailTexture, so the 8-bit quantisation and the dither are included)
// and report E[coverage] at each cov. Answers "did a change to the carve move
// foam AREA" in a second, without a render, and it is the check to run BEFORE
// touching CARVE_TRIM: matching a composite's mean and sigma does NOT guarantee
// its pass fraction 2-3 sigma out on the tail, which is where fEdge cuts.
//
//   node tools/carveprobe.mjs [CARVE_TRIM]
//
// Last run: the AC3 three-density decode over the warped/rotated non-harmonic
// taps measures 1.015 of the shipped area summed over the cov grid, and within
// +/-8% at every individual cov, at TRIM = 1.0 — so the carve rework is
// area-neutral and CARVE_TRIM stays 1.0. Keep the constants below in step with
// oceanSurfaceMaterial.js.
import { makeDetailTexture } from '../src/ocean/detailTexture.js';

const tex = makeDetailTexture();
const N = 512;
const D = tex.image.data;
const MEAN = 0.4089;
const STD = 0.1328;

// bilinear, wrapped, in TILE units (uv in [0,1) repeats)
function samp(u, v, c) {
  const x = u * N - 0.5;
  const y = v * N - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const g = (xx, yy) => D[((((yy % N) + N) % N) * N + (((xx % N) + N) % N)) * 4 + c] / 255;
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy)
    + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
}

const PHI3 = 3 + (1 + Math.sqrt(5)) / 2;
const TILE_C = 17;
const TILE_F = TILE_C / PHI3;
const ROT = Math.atan(2 / (1 + Math.sqrt(5)));
const RC = Math.cos(ROT);
const RS = Math.sin(ROT);
const WARP_AMP = 8.0;
const RHO = 0.249;
const ORTH = 1 / Math.sqrt(1 - RHO * RHO);
const SPARSE_CLIP = -2 * STD;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// deterministic pseudo-random world points
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const covs = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.85, 1.0];
const M = 400000;
const shipSum = covs.map(() => 0);
const newSum = covs.map(() => 0);
let shipS = 0; let shipS2 = 0; let newS = 0; let newS2 = 0;

const TRIM = Number(process.argv[2] ?? 1.0);
const fineFade = 1; // near field: the regime the rail band is mostly in

for (let i = 0; i < M; i++) {
  const px = (rnd() - 0.5) * 4000;
  const pz = (rnd() - 0.5) * 4000;
  // shipped: B at 17 m, A at 3.4 m, unwarped
  const ship = 0.62 * samp(px / 17, pz / 17, 2) + 0.38 * samp(px / 3.4, pz / 3.4, 3);
  // reconciled: warp -> coarse fbm B at 17 m; rotate -> fine tap R (inverted,
  // clipped) + G at 17/(3+phi)
  const wb = samp(px / 110 + 0.23, pz / 110 + 0.23, 2);
  const wa = samp(px / 110 + 0.23, pz / 110 + 0.23, 3);
  const wx = wb - MEAN;
  const wy = (wa - MEAN - wx * RHO) * ORTH;
  const qx = px + wx * WARP_AMP;
  const qz = pz + wy * WARP_AMP;
  const fx = qx * RC - qz * RS;
  const fz = qz * RC + qx * RS;
  const fA = samp(qx / TILE_C, qz / TILE_C, 2);
  const fR = samp(fx / TILE_F, fz / TILE_F, 0);
  const fB = samp(fx / TILE_F, fz / TILE_F, 1);
  const sparseDev = Math.max(MEAN - fR, SPARSE_CLIP);

  shipS += ship; shipS2 += ship * ship;

  for (let c = 0; c < covs.length; c++) {
    const cov = covs[c];
    const rampT = smoothstep(0.10, 0.80, cov);
    const wS = (0.25 + 0.75 * rampT) * fineFade;
    const wM = smoothstep(0.45, 0.80, cov) * 0.50 * fineFade;
    const dev = (fA - MEAN) + sparseDev * wS + (fB - MEAN) * wM;
    const sigMix = Math.sqrt(1 + wS * wS + wM * wM);
    const sigShip = Math.sqrt(0.62 * 0.62 + (0.38 * fineFade) ** 2);
    const carve = dev * (sigShip / sigMix) * TRIM + MEAN;
    const fEdge = 0.60 - cov * 0.42;
    const gate = Math.min(1, cov * 2.4);
    shipSum[c] += smoothstep(fEdge, fEdge + 0.15, ship) * gate;
    newSum[c] += smoothstep(fEdge, fEdge + 0.15, carve) * gate;
    if (c === 4) { newS += carve; newS2 += carve * carve; }
  }
}
const sm = shipS / M;
const nm = newS / M;
console.log('TRIM', TRIM);
console.log('shipped  mean', sm.toFixed(4), 'std', Math.sqrt(shipS2 / M - sm * sm).toFixed(5));
console.log('new(cov.4) mean', nm.toFixed(4), 'std', Math.sqrt(newS2 / M - nm * nm).toFixed(5));
let wsum = 0; let wship = 0;
for (let c = 0; c < covs.length; c++) {
  const a = shipSum[c] / M; const bb = newSum[c] / M;
  console.log(`cov ${covs[c].toFixed(2)}  ship ${a.toFixed(5)}  new ${bb.toFixed(5)}  ratio ${(bb / Math.max(a, 1e-9)).toFixed(3)}`);
  wsum += bb; wship += a;
}
console.log('area ratio, summed over cov grid:', (wsum / wship).toFixed(4));
