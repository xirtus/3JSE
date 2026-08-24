import { describe, expect, it } from "vitest";
import { World } from "./World.js";
import "./components/builtins.js";
import { createPrefab, diffPrefabOverrides, instantiatePrefab } from "./Prefab.js";

describe("Prefab", () => {
  it("serializes an entity's transform and components, and children recursively", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const parent = level.createEntity("Enemy");
    parent.object3D!.position.set(1, 2, 3);
    parent.addComponent("Health", { current: 60 });
    const child = level.createEntity("Weapon", { parent });
    child.object3D!.position.set(0, 0, 0.5);

    const prefab = createPrefab("Enemy", parent);

    expect(prefab.root.name).toBe("Enemy");
    expect(prefab.root.transform?.position).toEqual([1, 2, 3]);
    expect(prefab.root.components.Health).toEqual({ current: 60, max: 100 });
    expect(prefab.root.children).toHaveLength(1);
    expect(prefab.root.children[0]!.name).toBe("Weapon");
    expect(prefab.root.children[0]!.transform?.position).toEqual([0, 0, 0.5]);
  });

  it("instantiates a fresh, independent Entity tree matching the captured snapshot", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const source = level.createEntity("Enemy");
    source.object3D!.position.set(1, 2, 3);
    source.addComponent("Health", { current: 60 });
    level.createEntity("Weapon", { parent: source }).object3D!.position.set(0, 0, 0.5);
    const prefab = createPrefab("Enemy", source);

    const instance = instantiatePrefab(level, prefab);

    expect(instance).not.toBe(source);
    expect(instance.id).not.toBe(source.id);
    expect(instance.object3D!.position.toArray()).toEqual([1, 2, 3]);
    expect(instance.getComponent<{ current: number }>("Health")?.current).toBe(60);
    expect(instance.prefabInstance).toEqual({ prefabId: prefab.id, prefabName: "Enemy" });

    const instanceChildren = instance.object3D!.children.map((c) => c.name);
    expect(instanceChildren).toEqual(["Weapon"]);

    // Mutating the instance must never affect the prefab's stored snapshot or the original.
    instance.getComponent<{ current: number }>("Health")!.current = 1;
    expect(prefab.root.components.Health!.current).toBe(60);
    expect(source.getComponent<{ current: number }>("Health")?.current).toBe(60);
  });

  it("diffPrefabOverrides reports only fields that diverge from the captured source", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const source = level.createEntity("Enemy");
    source.addComponent("Health", { current: 60 });
    const prefab = createPrefab("Enemy", source);
    const instance = instantiatePrefab(level, prefab);

    expect(diffPrefabOverrides(instance, prefab)).toEqual([]);

    instance.getComponent<{ current: number }>("Health")!.current = 10;
    expect(diffPrefabOverrides(instance, prefab)).toEqual(["Health.current"]);

    instance.addComponent("Spin", { degreesPerSecond: 90 });
    expect(diffPrefabOverrides(instance, prefab)).toEqual(["Health.current", "Spin"]);
  });
});
