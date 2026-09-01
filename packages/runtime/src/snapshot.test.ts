import { describe, expect, it } from "vitest";
import { World } from "./World.js";
import "./components/builtins.js";

function buildWorld() {
  const world = new World();
  const level = world.createLevel("Main", "level_main");
  const root = level.createEntity("Root", { id: "e_root" });
  root.object3D!.position.set(1, 2, 3);
  root.addComponent("Health", { current: 40 });
  const child = level.createEntity("Child", { id: "e_child", parent: root });
  child.object3D!.position.set(0, 1, 0);
  child.addComponent("Spin", { degreesPerSecond: 90 });
  const mgr = level.createEntity("Director", { id: "e_mgr", spatial: false });
  mgr.addComponent("Movable", { speed: 7 });
  return { world, level };
}

describe("Level.snapshot / restore", () => {
  it("round-trips byte-identical (snapshot -> restore -> snapshot deep-equal)", () => {
    const { level } = buildWorld();
    const snap1 = level.snapshot();
    level.restore(snap1);
    const snap2 = level.snapshot();
    expect(snap2).toEqual(snap1);
  });

  it("preserves ids, parent links, transforms, components, and non-spatial entities", () => {
    const { level } = buildWorld();
    const snap = level.snapshot();

    // mutate live state, then restore
    level.getEntity("e_root")!.object3D!.position.set(99, 99, 99);
    level.getEntity("e_child")!.getComponent<{ degreesPerSecond: number }>("Spin")!.degreesPerSecond = 5;
    level.destroyEntity("e_mgr");
    expect(level.getEntity("e_mgr")).toBeUndefined();

    level.restore(snap);

    const root = level.getEntity("e_root")!;
    const child = level.getEntity("e_child")!;
    const mgr = level.getEntity("e_mgr")!;
    expect(root.object3D!.position.toArray()).toEqual([1, 2, 3]);
    expect(child.object3D!.parent).toBe(root.object3D); // parent link rebuilt
    expect(child.getComponent<{ degreesPerSecond: number }>("Spin")!.degreesPerSecond).toBe(90);
    expect(mgr.object3D).toBeNull();
    expect(mgr.getComponent<{ speed: number }>("Movable")!.speed).toBe(7);
  });

  it("restore invalidates handles captured before it (they were the destroyed entities)", () => {
    const { world, level } = buildWorld();
    const oldHandle = level.getEntity("e_root")!.handle;
    level.restore(level.snapshot());
    expect(world.resolveEntity(oldHandle)).toBeUndefined();
    expect(world.resolveEntity(level.getEntity("e_root")!.handle)).toBe(level.getEntity("e_root"));
  });

  it("query() still works after restore (archetype index rebuilt through createEntity/addComponent)", () => {
    const { level } = buildWorld();
    level.restore(level.snapshot());
    expect(level.query(["Spin"]).map((e) => e.id)).toEqual(["e_child"]);
    expect(level.query(["Health"]).map((e) => e.id)).toEqual(["e_root"]);
  });
});

describe("World.snapshot / restore", () => {
  it("round-trips every Level and drops levels absent from the snapshot", () => {
    const { world } = buildWorld();
    const snap = world.snapshot();
    const scratch = world.createLevel("Scratch", "level_scratch");
    scratch.createEntity("Temp");

    world.restore(snap);

    expect(world.allLevels.map((l) => l.id)).toEqual(["level_main"]);
    expect(world.getLevel("level_main")!.getEntity("e_child")!.name).toBe("Child");
    expect(world.snapshot()).toEqual(snap);
  });
});
