import { Vector3 } from "three";

// Contact-time annotation — a port of Daniel Holden's heuristics
// (theorangeduck.com/page/inverse-kinematics-foot-locking, MIT, 2024). Threshold toe velocity
// (primary signal; feet don't slide when in contact) and height (sanity check; a foot held still
// in the air is not a contact), then median-filter (majority vote) to kill single-frame
// flicker and optionally Gaussian-smooth so a runtime threshold can tune how early/late contact
// kicks in. Output is a per-frame value 0..1 (or 0/1 without smoothing) feeding foot locking.

export interface ContactAnnotationOptions {
  /** seconds per frame (default 1/60) */
  dt?: number;
  /** toe speed below which the foot counts as planted (m/s, default 0.3) */
  velocityThreshold?: number;
  /** toe height below which a planted foot counts as in contact (default 0.1; ground at y=0) */
  heightThreshold?: number;
  /** median-filter window width in frames (odd, default 5); 1 = off */
  majorityVoteWidth?: number;
  /** Gaussian kernel sigma in frames (default 1.5); 0 = off (binary output) */
  smoothingSigma?: number;
}

/** Per-frame velocity magnitude (m/s) of a toe, finite-differenced. Frame 0 is 0. */
export function toeVelocities(toePositions: Vector3[], dt: number): Float32Array {
  const out = new Float32Array(toePositions.length);
  for (let i = 1; i < toePositions.length; i++) {
    out[i] = toePositions[i]!.distanceTo(toePositions[i - 1]!) / Math.max(dt, 1e-8);
  }
  return out;
}

/** Binary contact signal from velocity + height thresholds (both must pass). */
export function thresholdContacts(
  toePositions: Vector3[],
  velocities: Float32Array,
  velocityThreshold: number,
  heightThreshold: number,
): Float32Array {
  const out = new Float32Array(toePositions.length);
  for (let i = 0; i < toePositions.length; i++) {
    out[i] = velocities[i]! < velocityThreshold && toePositions[i]!.y < heightThreshold ? 1 : 0;
  }
  return out;
}

/** Sliding-window majority vote over a binary signal (median filter). */
export function majorityVote(signal: Float32Array, width: number): Float32Array {
  if (width <= 1) return signal.slice();
  const out = new Float32Array(signal.length);
  const half = Math.floor(width / 2);
  for (let i = 0; i < signal.length; i++) {
    let ones = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= signal.length) continue;
      ones += signal[j]!;
      n++;
    }
    out[i] = ones > n / 2 ? 1 : 0;
  }
  return out;
}

/** Gaussian convolution (normalized, symmetric kernel truncated at 3σ). */
export function gaussianSmooth(signal: Float32Array, sigma: number): Float32Array {
  if (sigma <= 0) return signal.slice();
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const weights: number[] = [];
  for (let j = -radius; j <= radius; j++) weights.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    let acc = 0;
    let wsum = 0;
    for (let j = -radius; j <= radius; j++) {
      const k = i + j;
      if (k < 0 || k >= signal.length) continue;
      const w = weights[j + radius]! / sum;
      acc += signal[k]! * w;
      wsum += w;
    }
    out[i] = wsum > 0 ? acc / wsum : signal[i]!;
  }
  return out;
}

/** Full annotation pipeline: threshold → majority vote → (optional) Gaussian smoothing. */
export function annotateContacts(
  toePositions: Vector3[],
  opts: ContactAnnotationOptions = {},
): Float32Array {
  const dt = opts.dt ?? 1 / 60;
  const velocityThreshold = opts.velocityThreshold ?? 0.3;
  const heightThreshold = opts.heightThreshold ?? 0.1;
  const width = opts.majorityVoteWidth ?? 5;
  const sigma = opts.smoothingSigma ?? 1.5;

  const vel = toeVelocities(toePositions, dt);
  let signal = thresholdContacts(toePositions, vel, velocityThreshold, heightThreshold);
  signal = majorityVote(signal, width);
  return gaussianSmooth(signal, sigma);
}
