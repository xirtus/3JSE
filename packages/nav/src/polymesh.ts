// Polygon navmesh seam. The grid path (grid.ts / pathfind.ts) covers RTS/tactics/RPG movement;
// for arbitrary 3D level geometry, a real polygon navmesh is better. Rather than reimplement
// Recast, @3jse/nav defines this interface and adapts recast-navigation-js
// (github.com/isaac-mason/recast-navigation-js, MIT — the standard WASM Recast/Detour port)
// through `createRecastNavMesh`. The lib is an optional peer; a grid-backed implementation of
// the same interface keeps code portable without it.

import { findPath as gridFindPath, buildFlowField, nearestWalkable, type Vec2 } from "./pathfind.js";
import { cellCentre, type NavGrid } from "./grid.js";

export type Vec3 = [number, number, number];

export interface PolyNavMesh {
  /** world-space path from `start` to `end` (empty if unreachable) */
  findPath(start: Vec3, end: Vec3): Vec3[];
  /** nearest point on the navmesh to `p` */
  closestPoint(p: Vec3): Vec3 | null;
  /** first blocked point along a ground ray from `from` toward `to`, or `to` if clear */
  raycast(from: Vec3, to: Vec3): Vec3;
}

// --- recast-navigation adapter (lib injected) -------------------------------------------------

/** The slice of the recast-navigation API this adapter uses — matches @recast-navigation/core. */
export interface RecastNavMeshQuery {
  computePath(start: Vec3, end: Vec3): { success: boolean; path: Vec3[] };
  findClosestPoint(p: Vec3): { success: boolean; point: Vec3 };
  raycast(start: Vec3, end: Vec3): { hit: boolean; hitPoint: Vec3 };
}

/** Wrap a constructed recast NavMeshQuery as a PolyNavMesh. Build the query with
 *  `@recast-navigation/three`'s `threeToSoloNavMesh(meshes, config)` then `new NavMeshQuery(navMesh)`. */
export function createRecastNavMesh(query: RecastNavMeshQuery): PolyNavMesh {
  return {
    findPath(start, end) {
      const r = query.computePath(start, end);
      return r.success ? r.path : [];
    },
    closestPoint(p) {
      const r = query.findClosestPoint(p);
      return r.success ? r.point : null;
    },
    raycast(from, to) {
      const r = query.raycast(from, to);
      return r.hit ? r.hitPoint : to;
    },
  };
}

// --- grid-backed fallback ------------------------------------------------------------------------

/** Present a NavGrid as a PolyNavMesh (Y taken from a ground sampler or 0). Lets terrain/tactics
 *  code target the polygon API before a real navmesh bake exists. */
export function gridAsPolyNavMesh(grid: NavGrid, ground: (x: number, z: number) => number = () => 0): PolyNavMesh {
  const to2 = (p: Vec3): Vec2 => [p[0], p[2]];
  const to3 = (p: Vec2): Vec3 => [p[0], ground(p[0], p[1]), p[1]];
  return {
    findPath(start, end) {
      return gridFindPath(grid, to2(start), to2(end), { smooth: true }).map(to3);
    },
    closestPoint(p) {
      const c = nearestWalkable(grid, p[0], p[2]);
      if (!c) return null;
      const [wx, wz] = cellCentre(grid, c[0], c[1]);
      return [wx, ground(wx, wz), wz];
    },
    raycast(from, to) {
      // step along the segment until a non-walkable cell; grid string-pull uses the same idea
      const [fx, fz] = to2(from);
      const [tx, tz] = to2(to);
      const steps = Math.ceil(Math.hypot(tx - fx, tz - fz) / grid.cellSize) || 1;
      let last: Vec2 = [fx, fz];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = fx + (tx - fx) * t;
        const z = fz + (tz - fz) * t;
        if (!nearestWalkableAt(grid, x, z)) return to3(last);
        last = [x, z];
      }
      return to;
    },
  };
}

function nearestWalkableAt(grid: NavGrid, x: number, z: number): boolean {
  const c = nearestWalkable(grid, x, z, 0);
  return c !== null;
}

/** Flow-field group pathing over the grid, exposed alongside a PolyNavMesh for RTS movement. */
export { buildFlowField };
