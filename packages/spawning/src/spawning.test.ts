import { describe, expect, it } from "vitest";
import { World, createPrefab } from "@3jse/runtime";
import { SpawnRegistry, SPAWN_REGISTRY_RESOURCE, ObjectPool } from "./ObjectPool.js";
import { createSpawnSystem } from "./systems.js";
import "./components.js";

function setup() {
  const world = new World();
  const level = world.createLevel("Test");
  // a prefab to spawn: a plain named entity
  const template = level.createEntity("Bullet");
  template.object3D!.position.set(0, 0, 0);
  const prefab = createPrefab("Bullet", template);
  level.destroyEntity(template.id);

  const registry = new SpawnRegistry();
  registry.register("bullet", prefab);
  world.setResource(SPAWN_REGISTRY_RESOURCE, registry);
  return { world, level, registry, prefab };
}

describe("@3jse/spawning", () => {
  it("SpawnPoint emits on start, then every interval, respecting maxAlive", () => {
    const { world, level } = setup();
    world.scheduler.register(createSpawnSystem());
    const point = level.createEntity("Point");
    point.addComponent("SpawnPoint", { prefab: "bullet", interval: 1, maxAlive: 3, spawnOnStart: true });

    world.step(0.1); // spawnOnStart → 1
    expect(level.query(["Spawned"]).length).toBe(1);

    world.step(1.0); // due again → 2
    world.step(1.0); // → 3 (cap)
    world.step(1.0); // at cap, no spawn
    expect(level.query(["Spawned"]).length).toBe(3);
  });

  it("totalLimit stops the point permanently", () => {
    const { world, level } = setup();
    world.scheduler.register(createSpawnSystem());
    const point = level.createEntity("Point");
    point.addComponent("SpawnPoint", { prefab: "bullet", interval: 0.5, maxAlive: 0, totalLimit: 2 });
    for (let i = 0; i < 10; i++) world.step(0.5);
    expect(level.query(["Spawned"]).length).toBe(2);
  });

  it("onSpawn hook receives the spawned entity and its source point", () => {
    const { world, level } = setup();
    const seen: string[] = [];
    world.scheduler.register(
      createSpawnSystem({ onSpawn: (s, p) => seen.push(`${p.name}->${s.name}`) }),
    );
    const point = level.createEntity("Nest");
    point.addComponent("SpawnPoint", { prefab: "bullet", interval: 10, spawnOnStart: true });
    world.step(0.016);
    expect(seen).toEqual(["Nest->Bullet"]);
  });

  it("ObjectPool recycles entities instead of growing the Level", () => {
    const { level, prefab } = setup();
    const pool = new ObjectPool("bullet", level, prefab, 2);
    expect(pool.freeCount).toBe(2);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire(); // grows by 1
    expect(pool.liveCount).toBe(3);
    pool.release(b);
    expect(pool.freeCount).toBe(1);
    const d = pool.acquire(); // reuses b
    expect(d).toBe(b);
    expect(pool.liveCount).toBe(3);
    void a;
    void c;
  });

  it("pooled spawn path reuses via the registry pool", () => {
    const { world, level, registry } = setup();
    world.scheduler.register(createSpawnSystem({ pooled: ["bullet"] }));
    const point = level.createEntity("Point");
    point.addComponent("SpawnPoint", { prefab: "bullet", interval: 1, maxAlive: 1, spawnOnStart: true });
    world.step(0.1);
    const pool = registry.pool("bullet", level)!;
    expect(pool.liveCount).toBe(1);
    // kill the live one, next interval should re-acquire from free list (no new Level entity)
    const before = level.allEntities.length;
    pool.releaseAll();
    world.step(1.0);
    expect(level.allEntities.length).toBe(before);
    expect(pool.liveCount).toBe(1);
  });
});
