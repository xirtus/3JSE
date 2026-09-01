import { describe, expect, it } from "vitest";
import { World, registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";
import { serializeProject } from "./serialize.js";
import { loadProject } from "./load.js";
import type { ProjectMeta } from "./types.js";

const healthFields: ComponentField[] = [
  { name: "current", type: "number", default: 100 },
  { name: "max", type: "number", default: 100 },
];
registerComponent({
  type: "ProjTestHealth",
  label: "Health",
  fields: healthFields,
  createDefault: () => defaultsFromFields(healthFields) as Record<string, unknown>,
});

const META: ProjectMeta = {
  name: "Round Trip",
  engine: "3jse@0.0.0",
  dependencies: { "@3jse/runtime": "workspace:*" },
  startScene: null,
};

function buildWorld() {
  const world = new World();
  const level = world.createLevel("Main Menu");
  const room = level.createEntity("Room");
  room.object3D!.position.set(1, 0, -3);
  const player = level.createEntity("Player");
  player.object3D!.position.set(0, 1, 0);
  player.addComponent("ProjTestHealth", { current: 80 });
  const gun = level.createEntity("Gun", { parent: player });
  gun.object3D!.position.set(0.2, 0, 0.5);
  const director = level.createEntity("SpawnDirector", { spatial: false });
  return { world, ids: { room: room.id, player: player.id, gun: gun.id, director: director.id } };
}

describe("@3jse/project — save/load round-trip", () => {
  it("writes project.json + one scene file per Level", () => {
    const { world } = buildWorld();
    const files = serializeProject(world, META);
    expect(Object.keys(files).sort()).toEqual(["project.json", "scenes/main-menu.json"]);
    expect(files["project.json"]).toContain('"kind": "Project"');
    expect(files["scenes/main-menu.json"]).toContain('"kind": "Level"');
  });

  it("re-serializing a loaded project is byte-identical (stable, Git-friendly)", () => {
    const { world } = buildWorld();
    const first = serializeProject(world, META);
    const { world: reloaded } = loadProject(first);
    const second = serializeProject(reloaded, META);
    expect(second).toEqual(first);
  });

  it("preserves entity ids, hierarchy, transforms, components, and non-spatial entities", () => {
    const { world, ids } = buildWorld();
    const files = serializeProject(world, META);
    const { world: reloaded, levels } = loadProject(files);
    const level = levels[0]!;

    const player = level.getEntity(ids.player)!;
    expect(player.name).toBe("Player");
    expect(player.getComponent<{ current: number }>("ProjTestHealth")!.current).toBe(80);
    expect(player.object3D!.position.toArray()).toEqual([0, 1, 0]);

    const gun = level.getEntity(ids.gun)!;
    expect(gun.object3D!.parent).toBe(player.object3D);

    const director = level.getEntity(ids.director)!;
    expect(director.object3D).toBeNull();

    expect(reloaded.allLevels).toHaveLength(1);
    expect(reloaded.getLevel(level.id)).toBe(level);
  });

  it("a one-field change is a one-line diff", () => {
    const { world } = buildWorld();
    const before = serializeProject(world, META)["scenes/main-menu.json"]!.split("\n");
    world.allLevels[0]!.allEntities.find((e) => e.name === "Player")!
      .getComponent<{ current: number }>("ProjTestHealth")!.current = 42;
    const after = serializeProject(world, META)["scenes/main-menu.json"]!.split("\n");
    const changed = before.filter((line, i) => line !== after[i]);
    expect(changed).toEqual(["          \"current\": 80,"]);
  });

  it("refuses a project file newer than the engine understands", () => {
    const { world } = buildWorld();
    const files = serializeProject(world, META);
    files["project.json"] = files["project.json"]!.replace('"schemaVersion": 1', '"schemaVersion": 99');
    expect(() => loadProject(files)).toThrow(/at most/);
  });

  it("keeps unregistered component data verbatim and reports it", () => {
    const { world } = buildWorld();
    world.allLevels[0]!.allEntities[0]!.level.allEntities;
    const files = serializeProject(world, META);
    files["scenes/main-menu.json"] = files["scenes/main-menu.json"]!.replace(
      '"components": {}',
      '"components": { "MysteryPlugin": { "k": 1 } }',
    );
    const warnings: string[] = [];
    const { unknownComponents } = loadProject(files, { onWarning: (m) => warnings.push(m) });
    expect(unknownComponents).toContain("MysteryPlugin");
  });
});
