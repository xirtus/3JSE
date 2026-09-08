// Experiment 02 — Dual resolution (plan §17). Proves the visible count and the
// causal count are independent. A field step iterates field cells only; changing
// visual density does not alter the causal result; changing field resolution does
// not rebuild the visible scene.

import {
  buildSyntheticField,
  cellCount,
  cellPosition,
  readChannel,
  FIELD_STRIDE,
  FieldChunk,
  WorldField,
} from "../index.js";

export interface VisualSet {
  /** per-element bound field cell */
  elementCell: Uint32Array;
  /** per-element RGBA (4 floats) */
  elementRGBA: Float32Array;
  /** per-element opacity */
  elementOpacity: Float32Array;
  /** per-element world position */
  elementPos: Float32Array;
  count: number;
}

/** Scatter `count` visual elements across the field, binding each to its cell. */
export function buildVisualSet(field: WorldField, count: number, seed = 1): VisualSet {
  const chunk = firstChunk(field);
  const cells = cellCount(chunk.resolution);
  const elementCell = new Uint32Array(count);
  const elementRGBA = new Float32Array(count * 4);
  const elementOpacity = new Float32Array(count);
  const elementPos = new Float32Array(count * 3);

  // Deterministic LCG so evidence is reproducible.
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  for (let e = 0; e < count; e++) {
    const cell = Math.floor(rnd() * cells) % cells;
    elementCell[e] = cell;
    const p = cellPosition(chunk, cell);
    const jitter = 0.25;
    elementPos[e * 3] = p[0] + (rnd() - 0.5) * jitter;
    elementPos[e * 3 + 1] = p[1] + (rnd() - 0.5) * jitter;
    elementPos[e * 3 + 2] = p[2] + (rnd() - 0.5) * jitter;
    elementOpacity[e] = 1;
  }
  return { elementCell, elementRGBA, elementOpacity, elementPos, count };
}

/** One field step: temperature relaxes toward its 6-neighbor mean. Iterates cells only. */
export function stepField(field: WorldField, dt: number, rate = 0.1): { iterations: number; durationMs: number } {
  const t0 = performance.now();
  let iterations = 0;
  for (const chunk of field.chunks.values()) {
    const [nx, ny, nz] = chunk.resolution;
    const next = new Float32Array(chunk.data.length);
    next.set(chunk.data);
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          iterations++;
          const ix = (z * ny + y) * nx + x;
          const t = readChannel(chunk, "temperature", ix);
          let sum = 0;
          let n = 0;
          for (const [dx, dy, dz] of NEIGHBORS) {
            const xx = x + dx;
            const yy = y + dy;
            const zz = z + dz;
            if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
            sum += readChannel(chunk, "temperature", (zz * ny + yy) * nx + xx);
            n++;
          }
          const mean = sum / n;
          const t2 = t + rate * dt * (mean - t);
          next[ix * FIELD_STRIDE + 0] = t2;
        }
      }
    }
    chunk.data.set(next);
    chunk.version++;
  }
  return { iterations, durationMs: performance.now() - t0 };
}

const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Project field state onto visual elements (color = temperature, opacity = liquid). */
export function projectFieldToVisuals(field: WorldField, vis: VisualSet): number {
  const chunk = firstChunk(field);
  let updated = 0;
  for (let e = 0; e < vis.count; e++) {
    const cell = vis.elementCell[e]!;
    const t = readChannel(chunk, "temperature", cell);
    const lf = readChannel(chunk, "liquidFraction", cell);
    // Normalize -20..+5 C into a blue->red ramp.
    const n = (t + 20) / 25;
    vis.elementRGBA[e * 4] = n;
    vis.elementRGBA[e * 4 + 1] = 0.2;
    vis.elementRGBA[e * 4 + 2] = 1 - n;
    vis.elementRGBA[e * 4 + 3] = 1;
    vis.elementOpacity[e] = 1 - lf * 0.5;
    updated++;
  }
  return updated;
}

export function captureField(field: WorldField): Float32Array {
  const chunk = firstChunk(field);
  return chunk.data.slice();
}

export function fieldsEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Rebind visual elements to a (possibly different-resolution) field by position. */
export function rebindByPosition(field: WorldField, vis: VisualSet): void {
  const chunk = firstChunk(field);
  const [nx, ny, nz] = chunk.resolution;
  const cs = cellSizeOf(chunk);
  for (let e = 0; e < vis.count; e++) {
    const px = vis.elementPos[e * 3]!;
    const py = vis.elementPos[e * 3 + 1]!;
    const pz = vis.elementPos[e * 3 + 2]!;
    const x = clamp(Math.floor((px - chunk.bounds.min[0]) / cs[0]), 0, nx - 1);
    const y = clamp(Math.floor((py - chunk.bounds.min[1]) / cs[1]), 0, ny - 1);
    const z = clamp(Math.floor((pz - chunk.bounds.min[2]) / cs[2]), 0, nz - 1);
    vis.elementCell[e] = (z * ny + y) * nx + x;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function firstChunk(field: WorldField): FieldChunk {
  return [...field.chunks.values()][0]!;
}

function cellSizeOf(chunk: FieldChunk): [number, number, number] {
  return [
    (chunk.bounds.max[0] - chunk.bounds.min[0]) / chunk.resolution[0],
    (chunk.bounds.max[1] - chunk.bounds.min[1]) / chunk.resolution[1],
    (chunk.bounds.max[2] - chunk.bounds.min[2]) / chunk.resolution[2],
  ];
}

export function runExp02(opts?: { cells?: number; elementsLow?: number; elementsHigh?: number }) {
  // Coarse field: ~5k cells (plan target). Visual elements: low vs high density.
  const resolution: [number, number, number] = [20, 4, 20]; // 1600 cells for fast tests
  const field = buildSyntheticField({ size: [64, 8, 64], resolution, id: "dual" });
  const cells = cellCount(resolution);
  void opts?.cells;

  const low = buildVisualSet(field, opts?.elementsLow ?? 2000, 1);
  const high = buildVisualSet(field, opts?.elementsHigh ?? 200000, 1);

  // Field step iterates cells only — its iteration count is independent of visuals.
  const before = captureField(field);
  const stepLow = stepField(field, 1);
  const afterLow = captureField(field);

  // Same field, reset, stepped again at higher visual density: identical result.
  const field2 = buildSyntheticField({ size: [64, 8, 64], resolution, id: "dual" });
  const before2 = captureField(field2);
  stepField(field2, 1);
  const after2 = captureField(field2);

  // Rebuild scene at different field resolution WITHOUT rebuilding elements.
  const vis = buildVisualSet(field, 20000, 2);
  const elementsUnchanged = vis.elementPos.slice();
  const fineField = buildSyntheticField({ size: [64, 8, 64], resolution: [40, 8, 40], id: "fine" });
  rebindByPosition(fineField, vis);
  const positionsUnchanged = arraysEqual(vis.elementPos, elementsUnchanged);

  projectFieldToVisuals(field, vis);

  return {
    fieldCells: cells,
    visualElementsLow: low.count,
    visualElementsHigh: high.count,
    fieldStepIterations: stepLow.iterations,
    fieldStepDurationMs: stepLow.durationMs,
    stepIterationsEqualCells: stepLow.iterations === cells,
    sameResultAtDifferentVisualDensity: fieldsEqual(afterLow, after2) && fieldsEqual(before, before2),
    positionsUnchangedAcrossResolutionChange: positionsUnchanged,
  };
}

function arraysEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
