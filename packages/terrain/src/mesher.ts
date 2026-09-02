// Chunk mesher: a heightfield region -> a triangle mesh (positions/normals/indices/uvs), the
// piece BUILD_TASKS.md 5.1 calls out as missing. Headless — returns typed arrays a test can
// assert vertex/triangle counts and normal directions on; the editor feeds them to a
// BufferGeometry.

import { sampleNormal, type HeightSampler } from "./heightfield.js";

export interface ChunkDesc {
  /** chunk grid coords */
  cx: number;
  cz: number;
  /** world-space size of one chunk edge */
  size: number;
}

export interface ChunkMesh {
  positions: Float32Array; // xyz, (res+1)^2 verts
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array; // res*res*6
  /** world AABB min/max, for culling + residency */
  aabb: { min: [number, number, number]; max: [number, number, number] };
}

/** Mesh one chunk at `resolution` quads per edge. `res` doubles down for lower LOD. */
export function meshChunk(sampler: HeightSampler, chunk: ChunkDesc, resolution: number): ChunkMesh {
  const res = Math.max(1, resolution | 0);
  const step = chunk.size / res;
  const originX = chunk.cx * chunk.size;
  const originZ = chunk.cz * chunk.size;
  const vpe = res + 1; // verts per edge
  const vertCount = vpe * vpe;

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  let minY = Infinity, maxY = -Infinity;

  for (let z = 0; z <= res; z++) {
    for (let x = 0; x <= res; x++) {
      const i = z * vpe + x;
      const wx = originX + x * step;
      const wz = originZ + z * step;
      const wy = sampler(wx, wz);
      positions[i * 3] = wx;
      positions[i * 3 + 1] = wy;
      positions[i * 3 + 2] = wz;
      const n = sampleNormal(sampler, wx, wz, step * 0.5);
      normals[i * 3] = n[0];
      normals[i * 3 + 1] = n[1];
      normals[i * 3 + 2] = n[2];
      uvs[i * 2] = x / res;
      uvs[i * 2 + 1] = z / res;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
  }

  const indices = new Uint32Array(res * res * 6);
  let t = 0;
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const a = z * vpe + x;
      const b = a + 1;
      const c = a + vpe;
      const d = c + 1;
      indices[t++] = a; indices[t++] = c; indices[t++] = b;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    aabb: {
      min: [originX, minY, originZ],
      max: [originX + chunk.size, maxY, originZ + chunk.size],
    },
  };
}

/** LOD resolution for a chunk given camera distance to its centre. */
export function lodResolution(distance: number, baseRes: number, chunkSize: number): number {
  const rings = distance / chunkSize;
  if (rings < 1.5) return baseRes;
  if (rings < 3) return Math.max(2, baseRes >> 1);
  if (rings < 6) return Math.max(2, baseRes >> 2);
  return Math.max(1, baseRes >> 3);
}
