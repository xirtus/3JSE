import { describe, expect, it } from "vitest";
import { World } from "./World.js";
import { EntityRegistry, NULL_HANDLE } from "./EntityRegistry.js";
import "./components/builtins.js";

describe("EntityRegistry (generational handles)", () => {
  it("hands out non-zero handles that resolve back to the entity", () => {
    const world = new World();
    const level = world.createLevel("T");
    const a = level.createEntity("A");
    expect(a.handle).not.toBe(NULL_HANDLE);
    expect(world.resolveEntity(a.handle)).toBe(a);
  });

  it("a handle to a destroyed entity resolves to undefined (no use-after-free)", () => {
    const world = new World();
    const level = world.createLevel("T");
    const a = level.createEntity("A");
    const handle = a.handle;
    level.destroyEntity(a.id);
    expect(world.resolveEntity(handle)).toBeUndefined();
    expect(world.entities.isLive(handle)).toBe(false);
  });

  it("reuses a freed slot but with a bumped generation, so the old handle stays stale", () => {
    const world = new World();
    const level = world.createLevel("T");
    const a = level.createEntity("A");
    const oldHandle = a.handle;
    level.destroyEntity(a.id);
    const b = level.createEntity("B"); // should take A's slot
    expect(b.handle).not.toBe(oldHandle);
    expect(world.resolveEntity(oldHandle)).toBeUndefined();
    expect(world.resolveEntity(b.handle)).toBe(b);
  });

  it("liveCount tracks allocate/free", () => {
    const r = new EntityRegistry();
    const fake = {} as never;
    const h1 = r.allocate(fake);
    const h2 = r.allocate(fake);
    expect(r.liveCount).toBe(2);
    r.free(h1);
    expect(r.liveCount).toBe(1);
    r.free(h1); // double free is a no-op
    expect(r.liveCount).toBe(1);
    void h2;
  });

  it("NULL_HANDLE never resolves", () => {
    expect(new World().resolveEntity(NULL_HANDLE)).toBeUndefined();
  });
});
