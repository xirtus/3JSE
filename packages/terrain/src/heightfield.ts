// Heightfield sampling + a deterministic value-noise generator. The generation cores from the
// vendored upstreams (demiurge, hls-webgpu-terrain) plug in here as a `HeightSampler`; this
// package owns the runtime meshing/streaming that turns a sampler into a live scene
// (docs/VENDOR_INTEGRATIONS.md's "build the adapter layer", BUILD_TASKS.md 5.1).

export type HeightSampler = (x: number, z: number) => number;

/** Deterministic 2D value noise (seeded) — a stand-in generator so terrain works with zero
 *  external dependency; swap in a vendored core for real worlds. */
export function valueNoise2D(seed = 1): HeightSampler {
  const hash = (xi: number, zi: number) => {
    let h = (xi * 374761393 + zi * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x, z) => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = smooth(x - x0), fz = smooth(z - z0);
    const n00 = hash(x0, z0), n10 = hash(x0 + 1, z0);
    const n01 = hash(x0, z0 + 1), n11 = hash(x0 + 1, z0 + 1);
    return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fz);
  };
}

/** Fractal Brownian motion over a base sampler — octaves of detail. */
export function fbm(base: HeightSampler, octaves = 4, lacunarity = 2, gain = 0.5, amplitude = 1, frequency = 1): HeightSampler {
  return (x, z) => {
    let sum = 0, amp = amplitude, freq = frequency;
    for (let i = 0; i < octaves; i++) {
      sum += base(x * freq, z * freq) * amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum;
  };
}

/** Central-difference surface normal at (x,z) for a sampler; `eps` in world units. */
export function sampleNormal(sampler: HeightSampler, x: number, z: number, eps = 0.5): [number, number, number] {
  const hL = sampler(x - eps, z);
  const hR = sampler(x + eps, z);
  const hD = sampler(x, z - eps);
  const hU = sampler(x, z + eps);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * eps;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** Slope in radians (angle from straight up) at (x,z). */
export function sampleSlope(sampler: HeightSampler, x: number, z: number, eps = 0.5): number {
  const [, ny] = sampleNormal(sampler, x, z, eps);
  return Math.acos(Math.max(-1, Math.min(1, ny)));
}
