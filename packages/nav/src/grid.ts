// Grid navigation: bake a walkable-cell grid from a ground sampler + obstacles (a full polygon
// navmesh is a later step; a grid graph covers RTS/tactics/RPG AI movement, ENGINE_GAP_ANALYSIS
// §5). Headless — bake, path, and flow-field all run in a vitest.

export interface NavBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface NavBakeOptions {
  cellSize: number;
  /** ground height at a world point */
  ground?: (x: number, z: number) => number;
  /** max walkable slope, radians */
  maxSlope?: number;
  /** max height difference between adjacent cells before the edge is blocked (a step/ledge) */
  maxStep?: number;
  /** circular obstacles (x,z,radius) — cells inside are blocked, dilated by agentRadius */
  obstacles?: { x: number; z: number; radius: number }[];
  agentRadius?: number;
}

export interface NavGrid {
  cols: number;
  rows: number;
  cellSize: number;
  origin: { x: number; z: number };
  /** rows*cols; true = walkable */
  walkable: Uint8Array;
  /** ground height per cell centre */
  height: Float32Array;
}

const idx = (g: NavGrid, cx: number, cz: number) => cz * g.cols + cx;

export function cellCentre(g: NavGrid, cx: number, cz: number): [number, number] {
  return [g.origin.x + (cx + 0.5) * g.cellSize, g.origin.z + (cz + 0.5) * g.cellSize];
}
export function worldToCell(g: NavGrid, x: number, z: number): [number, number] {
  return [
    Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.origin.x) / g.cellSize))),
    Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.origin.z) / g.cellSize))),
  ];
}
export function isWalkable(g: NavGrid, cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < g.cols && cz < g.rows && g.walkable[idx(g, cx, cz)] === 1;
}

export function bakeNavGrid(bounds: NavBounds, opts: NavBakeOptions): NavGrid {
  const cs = opts.cellSize;
  const cols = Math.max(1, Math.round((bounds.maxX - bounds.minX) / cs));
  const rows = Math.max(1, Math.round((bounds.maxZ - bounds.minZ) / cs));
  const ground = opts.ground ?? (() => 0);
  const maxSlope = opts.maxSlope ?? Math.PI / 4;
  const agentR = opts.agentRadius ?? 0;

  const g: NavGrid = {
    cols, rows, cellSize: cs,
    origin: { x: bounds.minX, z: bounds.minZ },
    walkable: new Uint8Array(cols * rows).fill(1),
    height: new Float32Array(cols * rows),
  };

  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const [wx, wz] = cellCentre(g, cx, cz);
      g.height[idx(g, cx, cz)] = ground(wx, wz);
      // slope: central difference over one cell
      const dx = ground(wx + cs, wz) - ground(wx - cs, wz);
      const dz = ground(wx, wz + cs) - ground(wx, wz - cs);
      const slope = Math.atan2(Math.hypot(dx, dz), 2 * cs);
      if (slope > maxSlope) g.walkable[idx(g, cx, cz)] = 0;
      if (opts.obstacles?.some((o) => Math.hypot(wx - o.x, wz - o.z) < o.radius + agentR)) {
        g.walkable[idx(g, cx, cz)] = 0;
      }
    }
  }
  return g;
}

/** 8-neighbour walkable step check, honouring maxStep (ledge) between the two cells. */
export function canStep(g: NavGrid, ax: number, az: number, bx: number, bz: number, maxStep = Infinity): boolean {
  if (!isWalkable(g, ax, az) || !isWalkable(g, bx, bz)) return false;
  if (Math.abs(g.height[idx(g, ax, az)]! - g.height[idx(g, bx, bz)]!) > maxStep) return false;
  // no diagonal cutting a blocked corner
  if (ax !== bx && az !== bz) {
    if (!isWalkable(g, ax, bz) || !isWalkable(g, bx, az)) return false;
  }
  return true;
}
