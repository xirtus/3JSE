import { describe, expect, it } from "vitest";
import { World } from "./World.js";
import "./components/builtins.js";
import { registerBuiltinSystems } from "./systems/builtins.js";

describe("World / Level / Entity", () => {
  it("lists registered Resource keys for introspection", () => {
    const world = new World();
    expect(world.listResourceKeys()).toEqual([]);
    world.setResource("Input", { fake: true });
    world.setResource("Save", { fake: true });
    expect(world.listResourceKeys()).toEqual(["Input", "Save"]);
  });

  it("creates entities with a Transform backed by Object3D, not a parallel copy", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const player = level.createEntity("Player");

    expect(player.object3D).not.toBeNull();
    player.object3D!.position.set(1, 2, 3);
    expect(level.scene.children).toContain(player.object3D);
    expect(player.object3D!.position.toArray()).toEqual([1, 2, 3]);
  });

  it("registers and reads components generically through the schema registry", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const enemy = level.createEntity("Shark");

    const health = enemy.addComponent<{ current: number; max: number }>("Health", { current: 40 });
    expect(health.current).toBe(40);
    expect(health.max).toBe(100); // filled from the schema default
    expect(enemy.hasComponent("Health")).toBe(true);
    expect(enemy.getComponent("Health")).toBe(health);
  });

  it("query() returns only entities holding every requested component type", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const a = level.createEntity("A");
    const b = level.createEntity("B");
    a.addComponent("Health");
    a.addComponent("Spin");
    b.addComponent("Health");

    expect(level.query(["Health", "Spin"])).toEqual([a]);
    expect(level.query(["Health"])).toEqual([a, b]);
  });

  it("a registered System mutates live Object3D state on each World.step()", () => {
    const world = new World();
    registerBuiltinSystems(world.scheduler);
    const level = world.createLevel("Test");
    const cube = level.createEntity("Cube");
    cube.addComponent("Spin", { degreesPerSecond: 90 });

    const before = cube.object3D!.rotation.y;
    world.step(1); // 1 second at 90 deg/s
    expect(cube.object3D!.rotation.y).toBeCloseTo(before + Math.PI / 2, 5);
  });

  it("reparenting moves the child Object3D under the new parent", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const parent = level.createEntity("Parent");
    const child = level.createEntity("Child");

    child.setParent(parent);
    expect(parent.object3D!.children).toContain(child.object3D);
    expect(level.scene.children).not.toContain(child.object3D);
  });

  it("getChildEntities()/rootEntities() reflect reparenting, not creation order", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const parent = level.createEntity("Parent");
    const child = level.createEntity("Child");
    const loose = level.createEntity("Loose");

    expect(level.rootEntities().map((e) => e.name).sort()).toEqual(["Child", "Loose", "Parent"]);
    expect(parent.getChildEntities()).toEqual([]);

    child.setParent(parent);

    expect(parent.getChildEntities()).toEqual([child]);
    expect(level.rootEntities().map((e) => e.name).sort()).toEqual(["Loose", "Parent"]);
  });

  it("destroying an entity removes it from the level and its Object3D from the scene", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const e = level.createEntity("Temp");
    const obj = e.object3D!;

    level.destroyEntity(e.id);
    expect(level.getEntity(e.id)).toBeUndefined();
    expect(obj.parent).toBeNull();
  });
});
