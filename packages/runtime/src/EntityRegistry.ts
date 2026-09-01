import type { Entity } from "./Entity.js";

/**
 * Generational entity handles — docs/ROADMAP.md Phase 1.1's "`EntityId` registry".
 *
 * `Entity.id` is a stable *string* good for project files and diffs. A `EntityHandle` is a
 * compact *number* good for hot paths (netcode, replay, spawn pools, a System holding a
 * reference across frames): it packs a slot index with a generation counter, so a handle to a
 * destroyed Entity resolves to `undefined` instead of silently pointing at whatever reused the
 * slot. This is the standard slot-map / generational-index pattern (bitECS, EnTT, Bevy).
 *
 * Layout: bits [0..19] = slot index (up to ~1M live entities), bits [20..30] = generation
 * (2047 reuses before wrap). Generation starts at 1 so a valid handle is never 0 — 0 is the
 * "null handle".
 */
export type EntityHandle = number;

export const NULL_HANDLE: EntityHandle = 0;

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const MAX_GENERATION = (1 << (31 - INDEX_BITS)) - 1;

export class EntityRegistry {
  private readonly slots: (Entity | null)[] = [];
  private readonly generations: number[] = [];
  private readonly freeList: number[] = [];

  /** Bind `entity` to a fresh handle. */
  allocate(entity: Entity): EntityHandle {
    let index: number;
    const reused = this.freeList.pop();
    if (reused !== undefined) {
      index = reused;
    } else {
      index = this.slots.length;
      this.slots.push(null);
      this.generations.push(1);
    }
    this.slots[index] = entity;
    return (this.generations[index]! << INDEX_BITS) | index;
  }

  /** The Entity for `handle`, or `undefined` if it was never valid or has since been freed. */
  resolve(handle: EntityHandle): Entity | undefined {
    if (handle === NULL_HANDLE) return undefined;
    const index = handle & INDEX_MASK;
    const generation = handle >>> INDEX_BITS;
    if (index >= this.slots.length || this.generations[index] !== generation) return undefined;
    return this.slots[index] ?? undefined;
  }

  isLive(handle: EntityHandle): boolean {
    return this.resolve(handle) !== undefined;
  }

  /** Release `handle`'s slot and bump its generation so the old handle can never resolve again. */
  free(handle: EntityHandle): void {
    if (handle === NULL_HANDLE) return;
    const index = handle & INDEX_MASK;
    const generation = handle >>> INDEX_BITS;
    if (index >= this.slots.length || this.generations[index] !== generation) return;
    this.slots[index] = null;
    this.generations[index] = generation >= MAX_GENERATION ? 1 : generation + 1;
    this.freeList.push(index);
  }

  /** Live entity count — what a debugger/Profiler shows. */
  get liveCount(): number {
    return this.slots.length - this.freeList.length;
  }

  /** Drop every binding (used by World/Level snapshot restore, which rebuilds from scratch). */
  clear(): void {
    this.slots.length = 0;
    this.generations.length = 0;
    this.freeList.length = 0;
  }
}
