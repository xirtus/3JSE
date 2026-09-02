// Bounded residency: keep a ring of meshed chunks around a focus point (usually the camera or
// player), adding/removing as it moves. The "field is authoritative, residency is derived"
// posture from BUILD_PROMPT.md's super-terrain reference.

import { lodResolution, meshChunk, type ChunkDesc, type ChunkMesh } from "./mesher.js";
import type { HeightSampler } from "./heightfield.js";

export interface StreamerOptions {
  chunkSize: number;
  /** chunks kept in each direction from the focus chunk (radius, in chunks) */
  ring: number;
  /** quads per chunk edge at the highest LOD */
  baseResolution: number;
}

export interface ResidentChunk {
  key: string;
  desc: ChunkDesc;
  mesh: ChunkMesh;
  resolution: number;
}

export interface StreamDelta {
  added: ResidentChunk[];
  removed: string[];
  /** re-meshed because their LOD changed */
  updated: ResidentChunk[];
}

const keyOf = (cx: number, cz: number) => `${cx},${cz}`;

export class TerrainStreamer {
  private readonly resident = new Map<string, ResidentChunk>();

  constructor(
    private readonly sampler: HeightSampler,
    private readonly opts: StreamerOptions,
  ) {}

  /** Update residency for a focus at world (x,z). Returns what changed. Pure w.r.t. the sampler. */
  update(focusX: number, focusZ: number): StreamDelta {
    const { chunkSize, ring, baseResolution } = this.opts;
    const fcx = Math.floor(focusX / chunkSize);
    const fcz = Math.floor(focusZ / chunkSize);

    const wanted = new Set<string>();
    const added: ResidentChunk[] = [];
    const updated: ResidentChunk[] = [];

    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const cx = fcx + dx;
        const cz = fcz + dz;
        const key = keyOf(cx, cz);
        wanted.add(key);
        const centreX = (cx + 0.5) * chunkSize;
        const centreZ = (cz + 0.5) * chunkSize;
        const dist = Math.hypot(centreX - focusX, centreZ - focusZ);
        const res = lodResolution(dist, baseResolution, chunkSize);
        const existing = this.resident.get(key);
        if (!existing) {
          const desc: ChunkDesc = { cx, cz, size: chunkSize };
          const rc: ResidentChunk = { key, desc, mesh: meshChunk(this.sampler, desc, res), resolution: res };
          this.resident.set(key, rc);
          added.push(rc);
        } else if (existing.resolution !== res) {
          existing.mesh = meshChunk(this.sampler, existing.desc, res);
          existing.resolution = res;
          updated.push(existing);
        }
      }
    }

    const removed: string[] = [];
    for (const key of [...this.resident.keys()]) {
      if (!wanted.has(key)) {
        this.resident.delete(key);
        removed.push(key);
      }
    }
    return { added, removed, updated };
  }

  chunks(): ResidentChunk[] {
    return [...this.resident.values()];
  }
  get residentCount(): number {
    return this.resident.size;
  }

  /** Height at a world point via the resident sampler — for gameplay grounding queries. */
  heightAt(x: number, z: number): number {
    return this.sampler(x, z);
  }
}
