// Replication priority + bandwidth model (docs/NETWORKING.md, docs/ENGINE_GAP_ANALYSIS.md §8 —
// "a replication priority/bandwidth model"). The Unreal replication-graph / push-model analog:
// per-connection, decide *which* entities go in *this* tick's snapshot given a byte budget.

export interface RepEntity {
  netId: number;
  /** designer weight — a player/boss is higher than a pickup */
  basePriority: number;
  /** world position, for distance falloff and interest culling */
  position: [number, number, number];
  /** estimated serialized size in bytes */
  size: number;
  /** always replicate regardless of budget (owning player's pawn, etc.) */
  alwaysRelevant?: boolean;
}

export interface RepConnection {
  /** the observer (camera / pawn) this connection follows */
  viewpoint: [number, number, number];
  /** entities outside this radius are not replicated to this connection at all */
  interestRadius: number;
  /** bytes this connection may receive this tick */
  byteBudget: number;
}

/** Per-entity accumulator: rises while an entity is starved, resets when it's sent. One per
 *  (connection, netId). */
export class PriorityAccumulator {
  private readonly staleness = new Map<number, number>();

  /** Rank `entities` for `conn`, cull by interest, then pick a set that fits `byteBudget`.
   *  Chosen entities' staleness resets; the rest accumulate. Deterministic. */
  select(conn: RepConnection, entities: RepEntity[], dt = 1): { netId: number; priority: number }[] {
    const scored: { e: RepEntity; priority: number; dist: number }[] = [];
    for (const e of entities) {
      const dist = distance(conn.viewpoint, e.position);
      if (!e.alwaysRelevant && dist > conn.interestRadius) {
        // out of interest — decay its staleness so it doesn't spike on re-entry
        this.staleness.set(e.netId, 0);
        continue;
      }
      const falloff = e.alwaysRelevant ? 1 : Math.max(0.05, 1 - dist / conn.interestRadius);
      const stale = (this.staleness.get(e.netId) ?? 0) + dt;
      this.staleness.set(e.netId, stale);
      const priority = e.basePriority * falloff + stale * 0.5 + (e.alwaysRelevant ? 1e6 : 0);
      scored.push({ e, priority, dist });
    }
    scored.sort((a, b) => b.priority - a.priority || a.e.netId - b.e.netId);

    const chosen: { netId: number; priority: number }[] = [];
    let spent = 0;
    for (const s of scored) {
      if (!s.e.alwaysRelevant) {
        if (spent + s.e.size > conn.byteBudget) continue;
        spent += s.e.size; // always-relevant entities don't consume the budget
      }
      this.staleness.set(s.e.netId, 0); // sent — reset
      chosen.push({ netId: s.e.netId, priority: round(s.priority) });
    }
    return chosen;
  }

  stalenessOf(netId: number): number {
    return this.staleness.get(netId) ?? 0;
  }
  forget(netId: number): void {
    this.staleness.delete(netId);
  }
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function round(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
