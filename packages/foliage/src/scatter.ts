// Deterministic foliage scatter (BUILD_TASKS.md 5.1; BUILD_PROMPT.md's super-terrain reference:
// "the field is authoritative and everything inside it is derived — a forest can exist anywhere
// without storing painted data"). Headless: a seeded jittered-grid sampler produces InstancedMesh
// instance transforms; a vitest asserts count, determinism, and constraint filtering.

import { sampleSlope, type HeightSampler } from "@3jse/terrain";

/** Splittable-mix32 PRNG — deterministic, fast, good enough for scatter. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

export interface ScatterArea {
  /** world-space rectangle */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface ScatterConstraints {
  /** max ground slope (radians) an instance may sit on */
  slopeMax?: number;
  /** allowed ground-height band */
  heightRange?: { min: number; max: number };
  /** circular no-grow zones (paths, buildings) */
  exclusions?: { x: number; z: number; radius: number }[];
  /** keep-in polygon boundary test — return true if (x,z) is inside the field spline */
  inField?: (x: number, z: number) => boolean;
}

export interface Instance {
  position: [number, number, number];
  /** Y-axis rotation, radians */
  rotationY: number;
  /** uniform scale */
  scale: number;
}

export interface ScatterOptions {
  /** instances per square world unit (before constraint rejection) */
  density: number;
  seed: number;
  /** ground height sampler (usually the TerrainStreamer's) */
  ground: HeightSampler;
  constraints?: ScatterConstraints;
  /** scale range */
  scale?: { min: number; max: number };
  /** how far an instance may jitter off its grid cell centre, 0..0.5 of the cell */
  jitter?: number;
}

/**
 * Jittered-grid scatter: divide the area into cells sized so the per-cell probability matches
 * `density`, place one candidate per cell at a seed-jittered position, reject candidates that
 * fail a constraint. Deterministic in `seed` — same inputs, byte-identical instances.
 */
export function scatterArea(area: ScatterArea, opts: ScatterOptions): Instance[] {
  const w = area.maxX - area.minX;
  const h = area.maxZ - area.minZ;
  if (w <= 0 || h <= 0 || opts.density <= 0) return [];

  const cell = 1 / Math.sqrt(opts.density); // one candidate per cell
  const cols = Math.max(1, Math.round(w / cell));
  const rows = Math.max(1, Math.round(h / cell));
  const jit = Math.max(0, Math.min(0.5, opts.jitter ?? 0.4));
  const sMin = opts.scale?.min ?? 0.8;
  const sMax = opts.scale?.max ?? 1.2;
  const c = opts.constraints ?? {};

  const rand = prng(opts.seed);
  const out: Instance[] = [];

  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const jx = (rand() - 0.5) * 2 * jit;
      const jz = (rand() - 0.5) * 2 * jit;
      const x = area.minX + ((ix + 0.5 + jx) / cols) * w;
      const z = area.minZ + ((iz + 0.5 + jz) / rows) * h;
      const rScale = sMin + rand() * (sMax - sMin);
      const rRot = rand() * Math.PI * 2;

      if (c.inField && !c.inField(x, z)) continue;
      if (c.exclusions?.some((e) => Math.hypot(x - e.x, z - e.z) < e.radius)) continue;
      const y = opts.ground(x, z);
      if (c.heightRange && (y < c.heightRange.min || y > c.heightRange.max)) continue;
      if (c.slopeMax != null && sampleSlope(opts.ground, x, z) > c.slopeMax) continue;

      out.push({ position: [x, y, z], rotationY: rRot, scale: rScale });
    }
  }
  return out;
}

/** Flatten instances to a single Float32Array of 4x4 column-major matrices, ready for an
 *  InstancedMesh's instanceMatrix. */
export function toInstanceMatrices(instances: Instance[]): Float32Array {
  const out = new Float32Array(instances.length * 16);
  instances.forEach((it, i) => {
    const [x, y, z] = it.position;
    const c = Math.cos(it.rotationY) * it.scale;
    const s = Math.sin(it.rotationY) * it.scale;
    const o = i * 16;
    // column-major: rotation about Y * uniform scale
    out[o] = c;     out[o + 1] = 0;        out[o + 2] = -s;   out[o + 3] = 0;
    out[o + 4] = 0; out[o + 5] = it.scale; out[o + 6] = 0;    out[o + 7] = 0;
    out[o + 8] = s; out[o + 9] = 0;        out[o + 10] = c;   out[o + 11] = 0;
    out[o + 12] = x; out[o + 13] = y;      out[o + 14] = z;   out[o + 15] = 1;
  });
  return out;
}
