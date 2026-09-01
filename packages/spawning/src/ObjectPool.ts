import { instantiatePrefab, type Entity, type Level, type Prefab } from "@3jse/runtime";

/**
 * docs/GAMEPLAY_FRAMEWORK.md's "`ObjectPool` resource for high-churn entities (projectiles,
 * VFX)". Recycles Entity trees instead of create/destroy per shot — the pooling discipline
 * PULSEHOP and MANDELHOP both prove (docs/REFERENCE_GAMES.md: "zero per-frame allocation in
 * the hot loop").
 *
 * A pooled entity is never removed from the Level; on `release` it's parked (moved far away,
 * marked inactive via userData) and reused on the next `acquire`. Callers that need the entity
 * hidden from rendering toggle `object3D.visible` — the pool only owns lifecycle, not looks.
 */
export class ObjectPool {
  private readonly free: Entity[] = [];
  private readonly live = new Set<Entity>();

  constructor(
    readonly key: string,
    private readonly level: Level,
    private readonly prefab: Prefab,
    /** pre-instantiate this many on construction */
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(this._make());
  }

  private _make(): Entity {
    const e = instantiatePrefab(this.level, this.prefab);
    this._park(e);
    return e;
  }

  private _park(e: Entity): void {
    if (e.object3D) {
      e.object3D.visible = false;
      e.object3D.position.set(0, -10000, 0);
    }
    e.object3D && (e.object3D.userData.pooledActive = false);
  }

  acquire(): Entity {
    const e = this.free.pop() ?? this._make();
    if (e.object3D) {
      e.object3D.visible = true;
      e.object3D.userData.pooledActive = true;
    }
    this.live.add(e);
    return e;
  }

  release(e: Entity): void {
    if (!this.live.delete(e)) return;
    this._park(e);
    this.free.push(e);
  }

  releaseAll(): void {
    for (const e of [...this.live]) this.release(e);
  }

  get liveCount(): number {
    return this.live.size;
  }
  get freeCount(): number {
    return this.free.length;
  }
  liveEntities(): Entity[] {
    return [...this.live];
  }
}

export const SPAWN_REGISTRY_RESOURCE = "SpawnRegistry";

/** Resource: maps a `SpawnPoint.prefab` string to the Prefab (and optionally a shared pool)
 *  it spawns. Keeps Level files as plain string references. */
export class SpawnRegistry {
  private readonly prefabs = new Map<string, Prefab>();
  private readonly pools = new Map<string, ObjectPool>();

  register(key: string, prefab: Prefab): void {
    this.prefabs.set(key, prefab);
  }

  getPrefab(key: string): Prefab | undefined {
    return this.prefabs.get(key);
  }

  /** Lazily create (or fetch) a pool for `key` bound to `level`. */
  pool(key: string, level: Level, prewarm = 0): ObjectPool | undefined {
    let p = this.pools.get(key);
    if (!p) {
      const prefab = this.prefabs.get(key);
      if (!prefab) return undefined;
      p = new ObjectPool(key, level, prefab, prewarm);
      this.pools.set(key, p);
    }
    return p;
  }

  hasPool(key: string): boolean {
    return this.pools.has(key);
  }
}
