import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import { sceneQuery, sceneCreateEntity, sceneDestroyEntity, sceneAddComponent, sceneRemoveComponent, sceneSetProperty } from "./scene.js";

describe("scene tools", () => {
  it("sceneCreateEntity + sceneQuery round-trip through the real ENTITY_COMPONENT_MODEL.md JSON shape", () => {
    const level = new World().createLevel("Test");
    const created = sceneCreateEntity(level, "Shark");

    expect(created.name).toBe("Shark");
    expect(created.components).toEqual({});
    expect(created.transform).not.toBeNull();

    const results = sceneQuery(level);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(created.id);
  });

  it("sceneAddComponent is schema-validated — same throw as Entity.addComponent for an unknown type", () => {
    const level = new World().createLevel("Test");
    const shark = sceneCreateEntity(level, "Shark");
    expect(() => sceneAddComponent(level, shark.id, "NotARealComponent")).toThrow(/registerComponent/);
  });

  it("sceneAddComponent adds a real, schema-defaulted Component; sceneQuery(filter) narrows to it", () => {
    const level = new World().createLevel("Test");
    const shark = sceneCreateEntity(level, "Shark");
    const player = sceneCreateEntity(level, "Player");

    sceneAddComponent(level, shark.id, "Health", { current: 40 });

    expect(sceneQuery(level, { componentTypes: ["Health"] }).map((e) => e.id)).toEqual([shark.id]);
    expect(sceneQuery(level).map((e) => e.id).sort()).toEqual([player.id, shark.id].sort());
  });

  it("sceneSetProperty mutates live Component data through the same object the Inspector edits", () => {
    const level = new World().createLevel("Test");
    const shark = sceneCreateEntity(level, "Shark");
    sceneAddComponent(level, shark.id, "Health", { current: 40 });

    const updated = sceneSetProperty(level, shark.id, "Health", "current", 25);
    expect(updated.components.Health).toEqual({ current: 25, max: 100 });
  });

  it("sceneSetProperty on a missing Component reports a clear error, not a silent no-op", () => {
    const level = new World().createLevel("Test");
    const shark = sceneCreateEntity(level, "Shark");
    expect(() => sceneSetProperty(level, shark.id, "Health", "current", 1)).toThrow(/no Component "Health"/);
  });

  it("sceneRemoveComponent + sceneDestroyEntity actually remove state", () => {
    const level = new World().createLevel("Test");
    const shark = sceneCreateEntity(level, "Shark");
    sceneAddComponent(level, shark.id, "Health");
    sceneRemoveComponent(level, shark.id, "Health");
    expect(sceneQuery(level, { componentTypes: ["Health"] })).toHaveLength(0);

    sceneDestroyEntity(level, shark.id);
    expect(sceneQuery(level)).toHaveLength(0);
  });
});
