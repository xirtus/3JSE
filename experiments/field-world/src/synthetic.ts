// Synthetic test fields (plan §16) and deterministic serialization (plan §8.4,
// §32). Everything is headless and renderer-free.

import { createChunk, createWorldField, FieldChunk, cellCount, writeChannel, WorldField } from "./field.js";
import { AABB, Vec3 } from "./types.js";

export interface SyntheticOpts {
  /** x/y/z extent, e.g. [64, 8, 64] */
  size: Vec3;
  resolution: [number, number, number];
  id?: string;
}

/** A synthetic field with a cold-dry region (-x), a warm-wet region (+x), and a transition band. */
export function buildSyntheticField(opts: SyntheticOpts): WorldField {
  const bounds: AABB = {
    min: [-opts.size[0] / 2, 0, -opts.size[2] / 2],
    max: [opts.size[0] / 2, opts.size[1], opts.size[2] / 2],
  };
  const chunk = createChunk({
    id: opts.id ?? "synthetic",
    bounds,
    resolution: opts.resolution,
    defaultResponse: 0,
  });
  const [nx, ny, nz] = opts.resolution;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        // Normalized -1..1 across x.
        const nx0 = x / (nx - 1);
        const t = nx0 * 2 - 1; // -1 cold .. +1 warm
        const ix = (z * ny + y) * nx + x;
        const temperature = -20 + (t + 1) / 2 * 25; // -20 .. +5 C
        const liquidFraction = t > 0 ? t * 0.6 : 0;
        const moisture = 0.1 + (t + 1) / 2 * 0.8;
        writeChannel(chunk, "temperature", ix, temperature);
        writeChannel(chunk, "liquidFraction", ix, liquidFraction);
        writeChannel(chunk, "moisture", ix, moisture);
        writeChannel(chunk, "density", ix, 0.2 + moisture * 0.4);
      }
    }
  }
  return createWorldField([chunk]);
}

export interface SerializedChunk {
  id: string;
  bounds: AABB;
  resolution: [number, number, number];
  data: number[];
  responseIndex: number[];
  semanticIndex: number[];
  version: number;
}

export function serializeChunk(chunk: FieldChunk): SerializedChunk {
  return {
    id: chunk.id,
    bounds: chunk.bounds,
    resolution: chunk.resolution,
    data: Array.from(chunk.data),
    responseIndex: Array.from(chunk.responseIndex),
    semanticIndex: Array.from(chunk.semanticIndex),
    version: chunk.version,
  };
}

export function deserializeChunk(s: SerializedChunk): FieldChunk {
  const chunk = createChunk({
    id: s.id,
    bounds: s.bounds,
    resolution: s.resolution,
    defaultResponse: 0,
  });
  chunk.data.set(s.data);
  chunk.responseIndex.set(s.responseIndex);
  chunk.semanticIndex.set(s.semanticIndex);
  chunk.version = s.version;
  return chunk;
}

export function fieldCellCount(field: WorldField): number {
  let n = 0;
  for (const c of field.chunks.values()) n += cellCount(c.resolution);
  return n;
}
