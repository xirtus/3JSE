// Server-side lag compensation (docs/ENGINE_GAP_ANALYSIS.md §8). Keep a bounded history of past
// entity positions by tick; when a client reports a hit taken at their (older) view of the
// world, rewind to that tick to validate it. Headless and deterministic.

export interface Snapshot3D {
  tick: number;
  /** netId -> position at that tick */
  positions: Map<number, [number, number, number]>;
}

export class HistoryBuffer {
  private readonly ring: Snapshot3D[] = [];

  constructor(private readonly capacity = 64) {}

  /** Record every replicated entity's position for `tick`. Call once per server tick. */
  record(tick: number, positions: Iterable<[number, [number, number, number]]>): void {
    const map = new Map<number, [number, number, number]>();
    for (const [id, p] of positions) map.set(id, [p[0], p[1], p[2]]);
    this.ring.push({ tick, positions: map });
    if (this.ring.length > this.capacity) this.ring.shift();
  }

  /** The recorded state at (or interpolated to) `tick`. `null` if it's older than the buffer. */
  at(tick: number): Snapshot3D | null {
    if (this.ring.length === 0) return null;
    if (tick <= this.ring[0]!.tick) return this.ring[0]!.tick === tick ? this.ring[0]! : null;
    if (tick >= this.ring[this.ring.length - 1]!.tick) return this.ring[this.ring.length - 1]!;
    // find the bracketing pair and lerp
    for (let i = 0; i < this.ring.length - 1; i++) {
      const a = this.ring[i]!;
      const b = this.ring[i + 1]!;
      if (tick >= a.tick && tick <= b.tick) {
        const t = (tick - a.tick) / (b.tick - a.tick || 1);
        const out = new Map<number, [number, number, number]>();
        for (const [id, pa] of a.positions) {
          const pb = b.positions.get(id) ?? pa;
          out.set(id, [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t), lerp(pa[2], pb[2], t)]);
        }
        return { tick, positions: out };
      }
    }
    return this.ring[this.ring.length - 1]!;
  }

  /**
   * Validate a hitscan the client fired at `clientTick`: rewind, then test the ray
   * `origin -> dir` (unit) against each candidate's position as a sphere of `radius`. Returns
   * the nearest hit netId or null.
   */
  validateHit(
    clientTick: number,
    origin: [number, number, number],
    dir: [number, number, number],
    radius: number,
    candidates: number[],
    maxDist = 1000,
  ): number | null {
    const snap = this.at(clientTick);
    if (!snap) return null;
    let best: number | null = null;
    let bestT = maxDist;
    for (const id of candidates) {
      const c = snap.positions.get(id);
      if (!c) continue;
      const t = raySphere(origin, dir, c, radius);
      if (t !== null && t < bestT) { bestT = t; best = id; }
    }
    return best;
  }

  get length(): number {
    return this.ring.length;
  }
  get oldestTick(): number | null {
    return this.ring[0]?.tick ?? null;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ray (origin + t·dir, dir unit) vs sphere. Returns the nearest non-negative t or null. */
function raySphere(
  o: [number, number, number],
  d: [number, number, number],
  c: [number, number, number],
  r: number,
): number | null {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  const t2 = -b + sq;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}
