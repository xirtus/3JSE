import { instantiatePrefab, type Entity, type Prefab, type SystemDef } from "@3jse/runtime";
import { SPAWN_REGISTRY_RESOURCE, SpawnRegistry } from "./ObjectPool.js";
import type { SpawnedData, SpawnPointData } from "./components.js";

// Per-SpawnPoint runtime state, keyed by entity id. Kept outside the component (it's derived
// bookkeeping, not authored data — docs/ENTITY_COMPONENT_MODEL.md: components are plain data)
// and cleared when the point stops matching.
interface PointState {
  timer: number;
  totalSpawned: number;
  primed: boolean;
}

export interface SpawnSystemOptions {
  /** use pooling for these prefab keys instead of instantiate/destroy (projectiles, VFX) */
  pooled?: string[];
  /** called after each spawn — position it, give it velocity, etc. */
  onSpawn?: (spawned: Entity, point: Entity, data: SpawnPointData) => void;
}

/**
 * docs/GAMEPLAY_FRAMEWORK.md's Spawning system. One System over every `SpawnPoint` entity:
 * counts down `interval`, respects `maxAlive` (live entities carrying a `Spawned` component
 * pointing back at this point) and `totalLimit`, spawns from the SpawnRegistry resource —
 * pooled where asked, plain `instantiatePrefab` otherwise.
 *
 * Deterministic given a fixed dt and a seeded jitter source (default jitter is off), so it
 * satisfies docs/RUNTIME.md's determinism posture and is headless-testable.
 */
export function createSpawnSystem(opts: SpawnSystemOptions = {}): SystemDef {
  const pooled = new Set(opts.pooled ?? []);
  const state = new Map<string, PointState>();

  return {
    name: "SpawnSystem",
    stage: "fixed",
    query: ["SpawnPoint"],
    run: (points, { world, level, dt }) => {
      const registry = world.getResource<SpawnRegistry>(SPAWN_REGISTRY_RESOURCE);
      if (!registry) return;

      // count live spawns per source in one pass
      const liveBySource = new Map<string, number>();
      for (const e of level.query(["Spawned"])) {
        const s = e.getComponent<SpawnedData>("Spawned");
        if (!s) continue;
        // a parked pool entity is not "alive" for maxAlive purposes
        if (e.object3D && e.object3D.userData.pooledActive === false) continue;
        liveBySource.set(s.sourceId, (liveBySource.get(s.sourceId) ?? 0) + 1);
      }

      const seen = new Set<string>();
      for (const point of points) {
        seen.add(point.id);
        const data = point.getComponent<SpawnPointData>("SpawnPoint");
        if (!data) continue;
        let st = state.get(point.id);
        if (!st) {
          st = { timer: 0, totalSpawned: 0, primed: data.spawnOnStart };
          state.set(point.id, st);
        }
        if (!data.enabled || data.interval < 0) continue;

        st.timer += dt;
        const due = st.primed || st.timer >= data.interval;
        if (!due) continue;

        const alive = liveBySource.get(point.id) ?? 0;
        const atAliveCap = data.maxAlive > 0 && alive >= data.maxAlive;
        const atTotalCap = data.totalLimit > 0 && st.totalSpawned >= data.totalLimit;
        if (atAliveCap || atTotalCap) {
          st.timer = 0;
          st.primed = false;
          continue;
        }

        const prefab = registry.getPrefab(data.prefab);
        if (!prefab) {
          st.primed = false;
          st.timer = 0;
          continue;
        }

        const spawned = spawnOne(level, point, prefab, data, registry, pooled);
        st.totalSpawned++;
        st.timer = 0;
        st.primed = false;
        liveBySource.set(point.id, alive + 1);
        opts.onSpawn?.(spawned, point, data);
      }

      // drop bookkeeping for points no longer in the query
      for (const id of [...state.keys()]) if (!seen.has(id)) state.delete(id);
    },
  };
}

function spawnOne(
  level: Parameters<SystemDef["run"]>[1]["level"],
  point: Entity,
  prefab: Prefab,
  data: SpawnPointData,
  registry: SpawnRegistry,
  pooled: Set<string>,
): Entity {
  let spawned: Entity;
  if (pooled.has(data.prefab)) {
    const pool = registry.pool(data.prefab, level)!;
    spawned = pool.acquire();
  } else {
    spawned = instantiatePrefab(level, prefab);
  }

  if (spawned.object3D && point.object3D) {
    spawned.object3D.position.copy(point.object3D.position);
    if (data.jitterRadius > 0) {
      spawned.object3D.position.x += (Math.random() * 2 - 1) * data.jitterRadius;
      spawned.object3D.position.z += (Math.random() * 2 - 1) * data.jitterRadius;
    }
  }
  if (!spawned.hasComponent("Spawned")) spawned.addComponent("Spawned");
  const tag = spawned.getComponent<SpawnedData>("Spawned")!;
  tag.sourceId = point.id;
  tag.pool = pooled.has(data.prefab) ? data.prefab : "";
  return spawned;
}
