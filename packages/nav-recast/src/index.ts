// @3jse/nav-recast — bakes a real polygon navmesh from THREE level geometry with
// recast-navigation-js (github.com/isaac-mason/recast-navigation-js, MIT — the standard WASM
// Recast/Detour port) and presents it through @3jse/nav's `PolyNavMesh` interface.
//
// Kept out of @3jse/nav itself so that package stays WASM-free and three-free (headless grid
// nav has no such deps). Add this package only when a game actually needs a polygon navmesh
// over arbitrary 3D level geometry; the grid path in @3jse/nav still covers RTS/tactics/RPG AI.

import type { Object3D, Mesh } from "three";
import { init, NavMeshQuery } from "@recast-navigation/core";
import { threeToSoloNavMesh } from "@recast-navigation/three";
import { createRecastNavMesh, type PolyNavMesh, type RecastNavMeshQuery, type NavVec3 } from "@3jse/nav";

/** Subset of recast's SoloNavMeshGeneratorConfig (cell size, agent metrics, …). Passed through
 *  to `threeToSoloNavMesh` verbatim — see recast-navigation docs for the full list. */
export type RecastBakeConfig = Partial<Record<string, number | boolean | [number[], number[]]>>;

let wasmReady: Promise<unknown> | null = null;

/** Bake a solo navmesh from `meshes` (the walkable world geometry) and return a `PolyNavMesh`.
 *  Async: recast's WASM initialises on the first call (memoised thereafter). Throws if the
 *  generator fails (e.g. no walkable surface in the input). */
export async function bakeRecastNavMesh(meshes: Mesh[], config: RecastBakeConfig = {}): Promise<PolyNavMesh> {
  wasmReady ??= init();
  await wasmReady;

  const result = threeToSoloNavMesh(meshes, config as Parameters<typeof threeToSoloNavMesh>[1]);
  if (!result.success || !result.navMesh) {
    throw new Error(`bakeRecastNavMesh: navmesh generation failed${"error" in result ? ` — ${result.error}` : ""}`);
  }

  const query = new NavMeshQuery(result.navMesh);
  return createRecastNavMesh(toRecastQuery(query));
}

/** Adapt a constructed recast `NavMeshQuery` to the small shape `@3jse/nav` consumes. Exported
 *  so callers who bake a navmesh through another recast route (tiled, tile-cache, a cached
 *  `importNavMesh`) can reuse the same adapter. */
export function toRecastQuery(query: NavMeshQuery): RecastNavMeshQuery {
  const obj = ([x, y, z]: NavVec3) => ({ x, y, z });
  const vec = (p: { x: number; y: number; z: number }): NavVec3 => [p.x, p.y, p.z];

  return {
    computePath(start, end) {
      const r = query.computePath(obj(start), obj(end));
      const path = (r.path ?? []).map(vec);
      return { success: r.success !== false && path.length > 0, path };
    },
    findClosestPoint(p) {
      const r = query.findClosestPoint(obj(p));
      return { success: r.success !== false && !!r.point, point: r.point ? vec(r.point) : [0, 0, 0] };
    },
    raycast(start, end) {
      const near = query.findNearestPoly(obj(start));
      if (!near.success || !near.nearestRef) return { hit: false, hitPoint: end };
      const r = query.raycast(near.nearestRef, obj(start), obj(end));
      // Detour: t is the hit parameter along start→end; t > 1 means the segment cleared.
      const t = r.t ?? Number.POSITIVE_INFINITY;
      if (!r.success || t > 1) return { hit: false, hitPoint: end };
      return {
        hit: true,
        hitPoint: [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          start[2] + (end[2] - start[2]) * t,
        ],
      };
    },
  };
}

/** Gather the meshes under `root` that should contribute to the bake. Skips anything whose name
 *  or parent chain is tagged `nav:ignore` (props, FX, trigger volumes). */
export function collectWalkable(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    for (let n: Object3D | null = o; n; n = n.parent) if (/nav:ignore/i.test(n.name)) return;
    out.push(o as Mesh);
  });
  return out;
}
