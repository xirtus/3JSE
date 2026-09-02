// A* over the nav grid + a flow field for group pathing (ENGINE_GAP_ANALYSIS §5 "@3jse/nav
// group pathing"). Deterministic.

import { bakeNavGrid as _unused, canStep, cellCentre, isWalkable, worldToCell, type NavGrid } from "./grid.js";
void _unused;

export type Vec2 = [number, number]; // world x, z

const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Nearest walkable cell to (x,z), spiralling out — so a path can start/end just off the mesh. */
export function nearestWalkable(g: NavGrid, x: number, z: number, maxRing = 8): [number, number] | null {
  const [cx, cz] = worldToCell(g, x, z);
  if (isWalkable(g, cx, cz)) return [cx, cz];
  for (let r = 1; r <= maxRing; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (isWalkable(g, cx + dx, cz + dz)) return [cx + dx, cz + dz];
      }
    }
  }
  return null;
}

export interface PathOptions {
  maxStep?: number;
  /** collapse collinear waypoints + string-pull line-of-sight shortcuts */
  smooth?: boolean;
}

/** A* from world `start` to world `goal`. Returns world waypoints, or [] if unreachable. */
export function findPath(g: NavGrid, start: Vec2, goal: Vec2, opts: PathOptions = {}): Vec2[] {
  const s = nearestWalkable(g, start[0], start[1]);
  const e = nearestWalkable(g, goal[0], goal[1]);
  if (!s || !e) return [];
  const key = (x: number, z: number) => z * g.cols + x;
  const startK = key(s[0], s[1]);
  const goalK = key(e[0], e[1]);
  const maxStep = opts.maxStep ?? Infinity;

  const gScore = new Map<number, number>([[startK, 0]]);
  const cameFrom = new Map<number, number>();
  const open = new MinHeap();
  open.push(startK, heur(s, e));
  const closed = new Set<number>();

  while (open.size) {
    const cur = open.pop()!;
    if (cur === goalK) return reconstruct(g, cameFrom, cur, opts.smooth ?? true);
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % g.cols;
    const cz = (cur - cx) / g.cols;
    for (const [dx, dz, cost] of NEIGHBORS) {
      const nx = cx + dx, nz = cz + dz;
      if (!canStep(g, cx, cz, nx, nz, maxStep)) continue;
      const nk = key(nx, nz);
      if (closed.has(nk)) continue;
      const tentative = gScore.get(cur)! + cost;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, cur);
        gScore.set(nk, tentative);
        open.push(nk, tentative + heur([nx, nz], e));
      }
    }
  }
  return [];
}

function heur(a: [number, number], b: [number, number]): number {
  const dx = Math.abs(a[0] - b[0]);
  const dz = Math.abs(a[1] - b[1]);
  return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); // octile
}

function reconstruct(g: NavGrid, cameFrom: Map<number, number>, end: number, smooth: boolean): Vec2[] {
  const cells: [number, number][] = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    const cx = cur % g.cols;
    cells.push([cx, (cur - cx) / g.cols]);
    cur = cameFrom.get(cur);
  }
  cells.reverse();
  let pts: Vec2[] = cells.map(([cx, cz]) => cellCentre(g, cx, cz));
  if (smooth) pts = stringPull(g, pts);
  return pts;
}

/** Remove waypoints the previous one has clear line of sight to (grid raycast). */
function stringPull(g: NavGrid, pts: Vec2[]): Vec2[] {
  if (pts.length <= 2) return pts;
  const out: Vec2[] = [pts[0]!];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!lineClear(g, pts[anchor]!, pts[i]!)) {
      out.push(pts[i - 1]!);
      anchor = i - 1;
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function lineClear(g: NavGrid, a: Vec2, b: Vec2): boolean {
  const [ax, az] = worldToCell(g, a[0], a[1]);
  const [bx, bz] = worldToCell(g, b[0], b[1]);
  let x = ax, z = az;
  const dx = Math.abs(bx - ax), dz = Math.abs(bz - az);
  const sx = ax < bx ? 1 : -1, sz = az < bz ? 1 : -1;
  let err = dx - dz;
  for (;;) {
    if (!isWalkable(g, x, z)) return false;
    if (x === bx && z === bz) return true;
    const e2 = 2 * err;
    if (e2 > -dz) { err -= dz; x += sx; }
    if (e2 < dx) { err += dx; z += sz; }
  }
}

/**
 * Dijkstra flow field toward `goal` — per-cell direction to the next cell on the cheapest path
 * out. One bake serves an army: every unit reads its cell's vector (ENGINE_GAP_ANALYSIS §5).
 */
export function buildFlowField(g: NavGrid, goal: Vec2): { dir: Float32Array; cost: Float32Array } {
  const n = g.cols * g.rows;
  const cost = new Float32Array(n).fill(Infinity);
  const dir = new Float32Array(n * 2);
  const [gx, gz] = worldToCell(g, goal[0], goal[1]);
  const gk = gz * g.cols + gx;
  if (!isWalkable(g, gx, gz)) return { dir, cost };
  cost[gk] = 0;
  const heap = new MinHeap();
  heap.push(gk, 0);
  while (heap.size) {
    const cur = heap.pop()!;
    const cx = cur % g.cols;
    const cz = (cur - cx) / g.cols;
    for (const [dx, dz, w] of NEIGHBORS) {
      const nx = cx + dx, nz = cz + dz;
      if (!canStep(g, nx, nz, cx, cz)) continue;
      const nk = nz * g.cols + nx;
      const nc = cost[cur]! + w;
      if (nc < cost[nk]!) {
        cost[nk] = nc;
        const len = Math.hypot(dx, dz) || 1;
        dir[nk * 2] = -dx / len; // toward the lower-cost neighbour
        dir[nk * 2 + 1] = -dz / len;
        heap.push(nk, nc);
      }
    }
  }
  return { dir, cost };
}

// tiny binary min-heap keyed by priority
class MinHeap {
  private items: { k: number; p: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(k: number, p: number): void {
    const a = this.items;
    a.push({ k, p });
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (a[par]!.p <= a[i]!.p) break;
      [a[par], a[i]] = [a[i]!, a[par]!];
      i = par;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0]!.k;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < a.length && a[l]!.p < a[s]!.p) s = l;
        if (r < a.length && a[r]!.p < a[s]!.p) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i]!, a[s]!];
        i = s;
      }
    }
    return top;
  }
}
