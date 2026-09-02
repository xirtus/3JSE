// Splat maps + brush painting for terrain materials (docs/ENGINE_GAP_ANALYSIS.md §6.6 "paint
// tools"). A SplatMap is a grid of per-cell layer weights; the editor's brush edits it, the
// material blends N textures by those weights. Headless, deterministic — the editor's paint
// interaction is just repeated `paintSplat` calls; a shipped game samples it for footstep/decal
// surface type.

export interface SplatMap {
  /** cells per edge (square) */
  resolution: number;
  /** number of material layers */
  layers: number;
  /** world-space extent one edge covers */
  worldSize: number;
  /** world-space origin (min corner) */
  originX: number;
  originZ: number;
  /** resolution*resolution*layers, row-major, layer-innermost. Weights per cell sum to 1. */
  weights: Float32Array;
}

export function createSplatMap(opts: { resolution: number; layers: number; worldSize: number; originX?: number; originZ?: number; baseLayer?: number }): SplatMap {
  const { resolution, layers, worldSize } = opts;
  const weights = new Float32Array(resolution * resolution * layers);
  const base = opts.baseLayer ?? 0;
  for (let i = 0; i < resolution * resolution; i++) weights[i * layers + base] = 1;
  return { resolution, layers, worldSize, originX: opts.originX ?? 0, originZ: opts.originZ ?? 0, weights };
}

export interface SplatBrush {
  /** world-space centre */
  x: number;
  z: number;
  /** world-space radius */
  radius: number;
  /** layer to paint toward */
  layer: number;
  /** 0..1 — how hard the brush pushes weight toward `layer` at its centre */
  strength: number;
  /** 0..1 — 0 = hard edge, 1 = fully soft falloff to the radius */
  falloff?: number;
}

/** Paint one brush stamp into `map`, renormalising each touched cell's weights to sum 1. */
export function paintSplat(map: SplatMap, brush: SplatBrush): number {
  const { resolution: R, layers: L, worldSize, originX, originZ, weights } = map;
  const cell = worldSize / R;
  const soft = Math.max(0, Math.min(1, brush.falloff ?? 0.6));
  const cx = (brush.x - originX) / cell;
  const cz = (brush.z - originZ) / cell;
  const rCells = brush.radius / cell;
  const x0 = Math.max(0, Math.floor(cx - rCells));
  const x1 = Math.min(R - 1, Math.ceil(cx + rCells));
  const z0 = Math.max(0, Math.floor(cz - rCells));
  const z1 = Math.min(R - 1, Math.ceil(cz + rCells));
  let touched = 0;

  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / (rCells || 1);
      if (d > 1) continue;
      // falloff: 1 at centre, easing to 0 at the edge; `soft` controls how quickly it drops
      const edge = soft <= 0 ? (d < 1 ? 1 : 0) : Math.pow(1 - d, 1 / (1 - Math.min(0.99, soft)));
      const amount = brush.strength * edge;
      if (amount <= 0) continue;
      const cellBase = (z * R + x) * L;
      // lerp every layer toward the target: target layer up, others down, then renormalise
      for (let l = 0; l < L; l++) {
        const target = l === brush.layer ? 1 : 0;
        weights[cellBase + l] = weights[cellBase + l]! * (1 - amount) + target * amount;
      }
      let sum = 0;
      for (let l = 0; l < L; l++) sum += weights[cellBase + l]!;
      if (sum > 0) for (let l = 0; l < L; l++) weights[cellBase + l]! /= sum;
      touched++;
    }
  }
  return touched;
}

/** Bilinearly-sampled layer weights at a world point — for surface-type queries (footsteps, etc.). */
export function sampleSplat(map: SplatMap, x: number, z: number): number[] {
  const { resolution: R, layers: L, worldSize, originX, originZ, weights } = map;
  const cell = worldSize / R;
  const fx = clamp((x - originX) / cell - 0.5, 0, R - 1);
  const fz = clamp((z - originZ) / cell - 0.5, 0, R - 1);
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const x1 = Math.min(R - 1, x0 + 1), z1 = Math.min(R - 1, z0 + 1);
  const tx = fx - x0, tz = fz - z0;
  const out = new Array(L).fill(0) as number[];
  const acc = (cx: number, cz: number, w: number) => {
    const b = (cz * R + cx) * L;
    for (let l = 0; l < L; l++) out[l]! += weights[b + l]! * w;
  };
  acc(x0, z0, (1 - tx) * (1 - tz));
  acc(x1, z0, tx * (1 - tz));
  acc(x0, z1, (1 - tx) * tz);
  acc(x1, z1, tx * tz);
  return out;
}

/** Pack the splat map to an RGBA-ish Float32Array (4 layers/texel) for upload as a DataTexture. */
export function splatToTexture(map: SplatMap): { data: Float32Array; width: number; height: number; channels: number } {
  const { resolution: R, layers: L, weights } = map;
  const channels = Math.min(4, L);
  const data = new Float32Array(R * R * 4);
  for (let i = 0; i < R * R; i++) {
    for (let c = 0; c < channels; c++) data[i * 4 + c] = weights[i * L + c]!;
  }
  return { data, width: R, height: R, channels };
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
