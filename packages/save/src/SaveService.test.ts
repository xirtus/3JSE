import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import { SaveService } from "./SaveService.js";
import { MemorySaveStorage } from "./SaveStorage.js";
import "./components.js";

describe("SaveService", () => {
  it("captures only Entities tagged Saveable, with their Transform and Components", () => {
    const service = new SaveService(new MemorySaveStorage());
    const world = new World();
    const level = world.createLevel("Test");

    const player = level.createEntity("Player");
    player.object3D!.position.set(1, 2, 3);
    player.addComponent("Health", { current: 42 });
    player.addComponent("Saveable");

    const untagged = level.createEntity("Decoration");
    untagged.addComponent("Health", { current: 100 });
    // No Saveable component — must not appear in the snapshot.

    const snapshot = service.captureSnapshot(level);

    expect(Object.keys(snapshot.entities)).toEqual(["Player"]);
    expect(snapshot.entities.Player!.transform?.position).toEqual([1, 2, 3]);
    expect(snapshot.entities.Player!.components.Health).toEqual({ current: 42, max: 100 });
  });

  it("save() then load() restores Transform and Component values onto a fresh World's matching-named Entities", () => {
    const storage = new MemorySaveStorage();
    const saveService = new SaveService(storage);

    // Session 1: build a world, move the player, save.
    const world1 = new World();
    const level1 = world1.createLevel("Test");
    const player1 = level1.createEntity("Player");
    player1.object3D!.position.set(5, 1, -2);
    player1.addComponent("Health", { current: 30 });
    player1.addComponent("Saveable");
    saveService.save(level1, "default");

    // Session 2: a brand-new World/Level/Entity graph (fresh runtime ids — docs/ENTITY_
    // COMPONENT_MODEL.md), same shape, matching by name only, as a real reload would produce.
    const world2 = new World();
    const level2 = world2.createLevel("Test");
    const player2 = level2.createEntity("Player");
    player2.addComponent("Health", { current: 100 });
    player2.addComponent("Saveable");
    expect(player2.id).not.toBe(player1.id);

    const applied = saveService.load(level2, "default");

    expect(applied).toBe(1);
    expect(player2.object3D!.position.toArray()).toEqual([5, 1, -2]);
    expect(player2.getComponent<{ current: number }>("Health")?.current).toBe(30);
  });

  it("load() returns null for a slot that was never saved, and a count for one that exists", () => {
    const service = new SaveService(new MemorySaveStorage());
    const world = new World();
    const level = world.createLevel("Test");
    level.createEntity("Player").addComponent("Saveable");

    expect(service.load(level, "missing")).toBeNull();
    expect(service.hasSlot("missing")).toBe(false);

    service.save(level, "default");
    expect(service.hasSlot("default")).toBe(true);
    expect(service.load(level, "default")).toBe(1);
  });

  it("applying a snapshot whose Entity names don't exist in the Level updates nothing and returns 0", () => {
    const service = new SaveService(new MemorySaveStorage());
    const world = new World();
    const level = world.createLevel("Test");
    const ghost = level.createEntity("Ghost");
    ghost.addComponent("Saveable");
    service.save(level, "slot");

    const otherWorld = new World();
    const otherLevel = otherWorld.createLevel("Different");
    otherLevel.createEntity("SomeoneElse").addComponent("Saveable");

    expect(service.load(otherLevel, "slot")).toBe(0);
  });

  it("listSlots() and deleteSlot() manage multiple save slots independently", () => {
    const service = new SaveService(new MemorySaveStorage());
    const world = new World();
    const level = world.createLevel("Test");
    level.createEntity("Player").addComponent("Saveable");

    service.save(level, "slot-a");
    service.save(level, "slot-b");
    expect(service.listSlots().sort()).toEqual(["slot-a", "slot-b"]);

    service.deleteSlot("slot-a");
    expect(service.listSlots()).toEqual(["slot-b"]);
    expect(service.hasSlot("slot-a")).toBe(false);
  });
});
