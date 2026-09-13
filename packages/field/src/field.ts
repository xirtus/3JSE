// Chunked world field (plan §8). The field is authoritative; sampling is
// backend-independent and renderer-free. A field step iterates field cells, never
// visual Gaussians.

import {
  AABB,
  CHANNEL_OFFSET,
  FieldChannel,
  FIELD_STRIDE,
  Vec3,
  WorldSample,
  WorldSampleState,
  ZERO_STATE,
  aabbContains,
  aabbIntersects,
  clamp,
} from "./types.js";

export type Resolution = [number, number, number];

export interface FieldChunk {
  id: string;
  bounds: AABB;
  resolution: Resolution;
  /** interleaved state buffer: cellCount * FIELD_STRIDE floats */
  data: Float32Array;
  /** per-cell index into a shared response palette */
  responseIndex: Uint32Array;
  /** per-cell index into a shared semantic dictionary */
  semanticIndex: Uint32Array;
  version: number;
}

export function cellCount(res: Resolution): number {
  return res[0] * res[1] * res[2];
}

export function cellIndex(res: Resolution, x: number, y: number, z: number): number {
  return (z * res[1] + y) * res[0] + x;
}

export function cellSize(bounds: AABB, res: Resolution): Vec3 {
  return [
    (bounds.max[0] - bounds.min[0]) / res[0],
    (bounds.max[1] - bounds.min[1]) / res[1],
    (bounds.max[2] - bounds.min[2]) / res[2],
  ];
}

export function createChunk(opts: {
  id: string;
  bounds: AABB;
  resolution: Resolution;
  defaultResponse?: number;
}): FieldChunk {
  const n = cellCount(opts.resolution);
  const data = new Float32Array(n * FIELD_STRIDE);
  const responseIndex = new Uint32Array(n).fill(opts.defaultResponse ?? 0);
  const semanticIndex = new Uint32Array(n).fill(0);
  return {
    id: opts.id,
    bounds: opts.bounds,
    resolution: opts.resolution,
    data,
    responseIndex,
    semanticIndex,
    version: 1,
  };
}

export function readChannel(chunk: FieldChunk, channel: FieldChannel, ix: number): number {
  return chunk.data[ix * FIELD_STRIDE + CHANNEL_OFFSET[channel]]!;
}

export function writeChannel(chunk: FieldChunk, channel: FieldChannel, ix: number, v: number): void {
  chunk.data[ix * FIELD_STRIDE + CHANNEL_OFFSET[channel]] = v;
}

export function cellPosition(chunk: FieldChunk, ix: number): Vec3 {
  const [nx, ny, nz] = chunk.resolution;
  const z = Math.floor(ix / (nx * ny));
  const rem = ix - z * nx * ny;
  const y = Math.floor(rem / nx);
  const x = rem - y * nx;
  const cs = cellSize(chunk.bounds, chunk.resolution);
  return [
    chunk.bounds.min[0] + (x + 0.5) * cs[0],
    chunk.bounds.min[1] + (y + 0.5) * cs[1],
    chunk.bounds.min[2] + (z + 0.5) * cs[2],
  ];
}

/** Trilinear interpolation of every channel at an arbitrary position. */
export function sampleChunk(chunk: FieldChunk, position: Vec3): WorldSampleState {
  const b = chunk.bounds;
  const [nx, ny, nz] = chunk.resolution;
  const cs = cellSize(b, chunk.resolution);

  const fx = clamp((position[0] - b.min[0]) / cs[0] - 0.5, 0, nx - 1.000001);
  const fy = clamp((position[1] - b.min[1]) / cs[1] - 0.5, 0, ny - 1.000001);
  const fz = clamp((position[2] - b.min[2]) / cs[2] - 0.5, 0, nz - 1.000001);

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, nx - 1);
  const y1 = Math.min(y0 + 1, ny - 1);
  const z1 = Math.min(z0 + 1, nz - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;

  const out = ZERO_STATE();
  for (const ch of Object.keys(CHANNEL_OFFSET) as FieldChannel[]) {
    const i000 = cellIndex([nx, ny, nz], x0, y0, z0);
    const i100 = cellIndex([nx, ny, nz], x1, y0, z0);
    const i010 = cellIndex([nx, ny, nz], x0, y1, z0);
    const i110 = cellIndex([nx, ny, nz], x1, y1, z0);
    const i001 = cellIndex([nx, ny, nz], x0, y0, z1);
    const i101 = cellIndex([nx, ny, nz], x1, y0, z1);
    const i011 = cellIndex([nx, ny, nz], x0, y1, z1);
    const i111 = cellIndex([nx, ny, nz], x1, y1, z1);

    const c000 = readChannel(chunk, ch, i000);
    const c100 = readChannel(chunk, ch, i100);
    const c010 = readChannel(chunk, ch, i010);
    const c110 = readChannel(chunk, ch, i110);
    const c001 = readChannel(chunk, ch, i001);
    const c101 = readChannel(chunk, ch, i101);
    const c011 = readChannel(chunk, ch, i011);
    const c111 = readChannel(chunk, ch, i111);

    const v =
      c000 * (1 - tx) * (1 - ty) * (1 - tz) +
      c100 * tx * (1 - ty) * (1 - tz) +
      c010 * (1 - tx) * ty * (1 - tz) +
      c110 * tx * ty * (1 - tz) +
      c001 * (1 - tx) * (1 - ty) * tz +
      c101 * tx * (1 - ty) * tz +
      c011 * (1 - tx) * ty * tz +
      c111 * tx * ty * tz;
    setChannelValue(out, ch, v);
  }
  return out;
}

function setChannelValue(state: WorldSampleState, ch: FieldChannel, v: number): void {
  switch (ch) {
    case "temperature": state.temperature = v; break;
    case "moisture": state.moisture = v; break;
    case "liquidFraction": state.liquidFraction = v; break;
    case "density": state.density = v; break;
    case "pressure": state.pressure = v; break;
    case "phase": state.phase = v; break;
    case "velocityX": state.velocity[0] = v; break;
    case "velocityY": state.velocity[1] = v; break;
    case "velocityZ": state.velocity[2] = v; break;
    case "fuel": state.fuel = v; break;
    case "biomass": state.biomass = v; break;
    case "sediment": state.sediment = v; break;
    case "carbonization": state.carbonization = v; break;
    case "smoke": state.smoke = v; break;
    case "compaction": state.compaction = v; break;
    case "compression": state.compression = v; break;
  }
}

/** Central-difference gradient of one channel. */
export function sampleGradient(chunk: FieldChunk, position: Vec3, channel: FieldChannel, h = 0.5): Vec3 {
  const cs = cellSize(chunk.bounds, chunk.resolution);
  const dx = cs[0] * h;
  const dy = cs[1] * h;
  const dz = cs[2] * h;
  const gx = readStateChannel(sampleChunk(chunk, [position[0] + dx, position[1], position[2]]), channel) -
             readStateChannel(sampleChunk(chunk, [position[0] - dx, position[1], position[2]]), channel);
  const gy = readStateChannel(sampleChunk(chunk, [position[0], position[1] + dy, position[2]]), channel) -
             readStateChannel(sampleChunk(chunk, [position[0], position[1] - dy, position[2]]), channel);
  const gz = readStateChannel(sampleChunk(chunk, [position[0], position[1], position[2] + dz]), channel) -
             readStateChannel(sampleChunk(chunk, [position[0], position[1], position[2] - dz]), channel);
  return [gx / (2 * dx), gy / (2 * dy), gz / (2 * dz)];
}

function readStateChannel(state: WorldSampleState, ch: FieldChannel): number {
  return stateValue(state, ch);
}

export type WriteOperation = (state: WorldSampleState) => WorldSampleState;

/** Apply `op` to every cell whose center lies in `region`; returns count written. */
export function writeChunk(chunk: FieldChunk, region: AABB, op: WriteOperation): number {
  const n = cellCount(chunk.resolution);
  let written = 0;
  for (let ix = 0; ix < n; ix++) {
    const p = cellPosition(chunk, ix);
    if (!aabbContains(region, p)) continue;
    const before = stateAt(chunk, ix);
    const after = op(before);
    writeState(chunk, ix, after);
    written++;
  }
  if (written > 0) chunk.version++;
  return written;
}

export function stateAt(chunk: FieldChunk, ix: number): WorldSampleState {
  const out = ZERO_STATE();
  for (const ch of Object.keys(CHANNEL_OFFSET) as FieldChannel[]) {
    setChannelValue(out, ch, readChannel(chunk, ch, ix));
  }
  return out;
}

export function writeState(chunk: FieldChunk, ix: number, state: WorldSampleState): void {
  for (const ch of Object.keys(CHANNEL_OFFSET) as FieldChannel[]) {
    writeChannel(chunk, ch, ix, stateValue(state, ch));
  }
}

function stateValue(state: WorldSampleState, ch: FieldChannel): number {
  switch (ch) {
    case "temperature": return state.temperature;
    case "moisture": return state.moisture;
    case "liquidFraction": return state.liquidFraction;
    case "density": return state.density;
    case "pressure": return state.pressure;
    case "phase": return state.phase;
    case "velocityX": return state.velocity[0];
    case "velocityY": return state.velocity[1];
    case "velocityZ": return state.velocity[2];
    case "fuel": return state.fuel;
    case "biomass": return state.biomass;
    case "sediment": return state.sediment;
    case "carbonization": return state.carbonization;
    case "smoke": return state.smoke;
    case "compaction": return state.compaction;
    case "compression": return state.compression;
  }
}

export interface WorldField {
  chunks: Map<string, FieldChunk>;
  palettes: number[]; // placeholder: palette ids referenced by cells
}

export function createWorldField(chunks: FieldChunk[] = []): WorldField {
  const f: WorldField = { chunks: new Map(), palettes: [] };
  for (const c of chunks) f.chunks.set(c.id, c);
  return f;
}

export function sampleField(field: WorldField, position: Vec3): WorldSample | null {
  for (const chunk of field.chunks.values()) {
    if (!aabbContains(chunk.bounds, position)) continue;
    const ix = positionToCell(chunk, position);
    return {
      position,
      state: sampleChunk(chunk, position),
      response: { paletteId: chunk.responseIndex[ix]! },
      semantic: { dictionaryId: chunk.semanticIndex[ix]! },
    };
  }
  return null;
}

export function gradientField(field: WorldField, position: Vec3, channel: FieldChannel): Vec3 | null {
  for (const chunk of field.chunks.values()) {
    if (!aabbContains(chunk.bounds, position)) continue;
    return sampleGradient(chunk, position, channel);
  }
  return null;
}

export function queryField(field: WorldField, region: AABB, predicate: (s: WorldSample) => boolean): WorldSample[] {
  const out: WorldSample[] = [];
  for (const chunk of field.chunks.values()) {
    if (!aabbIntersects(chunk.bounds, region)) continue;
    const n = cellCount(chunk.resolution);
    for (let ix = 0; ix < n; ix++) {
      const p = cellPosition(chunk, ix);
      if (!aabbContains(region, p)) continue;
      const s: WorldSample = {
        position: p,
        state: stateAt(chunk, ix),
        response: { paletteId: chunk.responseIndex[ix]! },
        semantic: { dictionaryId: chunk.semanticIndex[ix]! },
      };
      if (predicate(s)) out.push(s);
    }
  }
  return out;
}

export function writeField(field: WorldField, region: AABB, op: WriteOperation): number {
  let written = 0;
  for (const chunk of field.chunks.values()) {
    if (!aabbIntersects(chunk.bounds, region)) continue;
    written += writeChunk(chunk, region, op);
  }
  return written;
}

function positionToCell(chunk: FieldChunk, position: Vec3): number {
  const [nx, ny, nz] = chunk.resolution;
  const cs = cellSize(chunk.bounds, chunk.resolution);
  const x = clamp(Math.floor((position[0] - chunk.bounds.min[0]) / cs[0]), 0, nx - 1);
  const y = clamp(Math.floor((position[1] - chunk.bounds.min[1]) / cs[1]), 0, ny - 1);
  const z = clamp(Math.floor((position[2] - chunk.bounds.min[2]) / cs[2]), 0, nz - 1);
  return cellIndex([nx, ny, nz], x, y, z);
}
