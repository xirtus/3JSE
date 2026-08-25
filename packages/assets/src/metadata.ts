import type { GltfDocument } from "./gltfTypes.js";

export interface BoundingBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface AssetMetadata {
  triangleCount: number;
  materialCount: number;
  boneCount: number;
  nodeCount: number;
  /** Model-local bounds from POSITION accessors' own `min`/`max` — not node-transform-aware
   *  (doesn't walk the scene graph applying each node's matrix), so a mesh placed off-origin by
   *  its node transform won't shift this box. Real future work if a project needs true
   *  world-space bounds pre-render; every number here is still exactly what the file itself
   *  declares, not estimated. `null` when no primitive has a POSITION accessor with bounds. */
  localBounds: BoundingBox | null;
  /** SHA-256 of the exact source bytes handed to `importAsset()` — docs/ASSET_PIPELINE.md's
   *  "Storage model": "content-addressed internally... re-importing an identical file is a
   *  no-op." This is that content address. */
  sourceHash: string;
}

/** glTF primitive mode 4 (TRIANGLES) is the only one counted as triangles here — TRIANGLE_STRIP
 *  (5) and TRIANGLE_FAN (6) primitives (rare in practice, common DCC tools emit TRIANGLES) are
 *  real future work, not silently miscounted: their vertices are excluded from the total rather
 *  than counted as if they were separate triangles. */
const TRIANGLES_MODE = 4;

export function computeMetadata(doc: GltfDocument, sourceHash: string): AssetMetadata {
  let triangleCount = 0;
  let boneCount = 0;
  const bounds: BoundingBox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let sawBounds = false;

  for (const mesh of doc.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const mode = (prim as { mode?: number }).mode ?? TRIANGLES_MODE;
      if (mode !== TRIANGLES_MODE) continue;

      const indicesAccessor = prim.indices !== undefined ? doc.accessors?.[prim.indices] : undefined;
      const positionAccessorIndex = prim.attributes.POSITION;
      const positionAccessor = positionAccessorIndex !== undefined ? doc.accessors?.[positionAccessorIndex] : undefined;

      const vertexCount = indicesAccessor?.count ?? positionAccessor?.count ?? 0;
      triangleCount += Math.floor(vertexCount / 3);

      if (positionAccessor?.min && positionAccessor.max && positionAccessor.min.length >= 3 && positionAccessor.max.length >= 3) {
        sawBounds = true;
        for (let axis = 0; axis < 3; axis++) {
          bounds.min[axis] = Math.min(bounds.min[axis]!, positionAccessor.min[axis]!);
          bounds.max[axis] = Math.max(bounds.max[axis]!, positionAccessor.max[axis]!);
        }
      }
    }
  }

  for (const skin of doc.skins ?? []) boneCount += skin.joints.length;

  return {
    triangleCount,
    materialCount: doc.materials?.length ?? 0,
    boneCount,
    nodeCount: doc.nodes?.length ?? 0,
    localBounds: sawBounds ? bounds : null,
    sourceHash,
  };
}

/** SHA-256 via Web Crypto (`globalThis.crypto.subtle`) — available in every modern browser and
 *  in Node without extra dependencies (Node 19+ exposes it as a global; earlier LTS lines need
 *  `--experimental-global-webcrypto` or the `node:crypto` polyfill, matching this monorepo's
 *  `engines.node >= 20` floor in the root package.json, already satisfied). No hashing library
 *  dependency needed. */
export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
