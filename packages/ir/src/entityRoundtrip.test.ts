import { describe, expect, it } from "vitest";
import { World, registerComponent, defaultsFromFields, type ComponentField, type Entity } from "@3jse/runtime";
import type { IRGraph } from "./types.js";
import type { IRHost } from "./host.js";
import { interpret } from "./interpreter.js";
import { emit } from "./emitter.js";
import { parseTsSubset } from "./tsFrontend.js";
import { assertValidTs } from "./testUtils.js";

// docs/ROADMAP.md Phase 3 slice 1: reproduce docs/VISUAL_SCRIPTING.md's door/trigger worked
// example — "Player enters Trigger → Check HasKey → Play Door Animation → Play Sound → Disable
// Collision → Save Door State" — with zero hand-written logic files, interpreted against real
// @3jse/runtime Entities (not mocks). No @3jse/graph canvas exists yet, so the graph below is
// hand-built IRGraph data — standing in for what a canvas would produce, the same way this
// package's roundtrip.test.ts stood in for a graph before the TS-subset frontend existed.

const keyFields: ComponentField[] = [];
registerComponent({
  type: "Key",
  label: "Key",
  fields: keyFields,
  createDefault: () => defaultsFromFields(keyFields) as Record<string, never>,
});

const collisionFields: ComponentField[] = [{ name: "enabled", type: "boolean", default: true }];
registerComponent({
  type: "Collision",
  label: "Collision",
  fields: collisionFields,
  createDefault: () => defaultsFromFields(collisionFields) as { enabled: boolean },
});

function buildDoorTriggerGraph(): IRGraph {
  const nodes: IRGraph["nodes"] = {};

  nodes.other = { kind: "variable", id: "other", scope: "local", name: "other", type: "entityRef" };
  nodes.door = { kind: "variable", id: "door", scope: "local", name: "door", type: "entityRef" };
  nodes.doorOpenSfx = { kind: "variable", id: "doorOpenSfx", scope: "local", name: "doorOpenSfx", type: "string" };

  nodes.hasKey = {
    kind: "query",
    id: "hasKey",
    op: "hasComponent",
    entity: { node: "other" },
    component: "Key",
    outputType: "boolean",
  };

  nodes.openLiteral = { kind: "pure", id: "openLiteral", op: "const", inputs: [], value: "open", outputType: "string" };
  nodes.playAnim = {
    kind: "call",
    id: "playAnim",
    target: "playAnimation",
    args: [{ node: "door" }, { node: "openLiteral" }],
    next: { node: "playSound" },
  };
  nodes.playSound = {
    kind: "call",
    id: "playSound",
    target: "playSound",
    args: [{ node: "doorOpenSfx" }],
    next: { node: "disableCollision" },
  };

  nodes.falseLiteral = { kind: "pure", id: "falseLiteral", op: "const", inputs: [], value: false, outputType: "boolean" };
  nodes.disableCollision = {
    kind: "set",
    id: "disableCollision",
    entity: { node: "door" },
    component: "Collision",
    field: "enabled",
    value: { node: "falseLiteral" },
    next: { node: "saveFlag" },
  };

  nodes.flagName = { kind: "pure", id: "flagName", op: "const", inputs: [], value: "door_1_open", outputType: "string" };
  nodes.trueLiteral = { kind: "pure", id: "trueLiteral", op: "const", inputs: [], value: true, outputType: "boolean" };
  nodes.saveFlag = {
    kind: "call",
    id: "saveFlag",
    target: "saveService.setFlag",
    args: [{ node: "flagName" }, { node: "trueLiteral" }],
    next: null,
  };

  nodes.branch = { kind: "branch", id: "branch", cond: { node: "hasKey" }, then: { node: "playAnim" }, else: null };

  nodes.event = {
    kind: "event",
    id: "event",
    name: "onTriggerEnterDoor",
    params: [
      { name: "other", type: "entityRef" },
      { name: "door", type: "entityRef" },
    ],
    next: { node: "branch" },
  };

  return { nodes, entry: "event" };
}

interface EngineSideEffects {
  animationsPlayed: { entity: string; clip: string }[];
  soundsPlayed: string[];
  flags: Record<string, unknown>;
  otherCalls: string[];
}

function emptyEffects(): EngineSideEffects {
  return { animationsPlayed: [], soundsPlayed: [], flags: {}, otherCalls: [] };
}

/** The IRHost adapter binding 3IR's abstract Component/call vocabulary to real @3jse/runtime
 *  Entities — see host.ts's doc comment on why this lives here, in the integrating test, and
 *  not inside @3jse/ir itself. */
function createRuntimeHost(effects: EngineSideEffects): IRHost {
  return {
    hasComponent: (entity, component) => (entity as Entity).hasComponent(component),
    getField: (entity, component, field) => (entity as Entity).getComponent<Record<string, unknown>>(component)?.[field],
    setField: (entity, component, field, value) => {
      const data = (entity as Entity).getComponent<Record<string, unknown>>(component);
      if (!data) throw new Error(`"${(entity as Entity).name}" has no Component "${component}".`);
      data[field] = value;
    },
    call: (name, args) => {
      switch (name) {
        case "playAnimation":
          effects.animationsPlayed.push({ entity: (args[0] as Entity).name, clip: args[1] as string });
          return undefined;
        case "playSound":
          effects.soundsPlayed.push(args[0] as string);
          return undefined;
        case "saveService.setFlag":
          effects.flags[args[0] as string] = args[1];
          return undefined;
        default:
          effects.otherCalls.push(name);
          return undefined;
      }
    },
  };
}

function buildScene() {
  const world = new World();
  const level = world.createLevel("Test");
  const player = level.createEntity("Player");
  const door = level.createEntity("Door");
  door.addComponent("Collision");
  return { player, door };
}

describe("3IR slice 1 — door/trigger worked example against real @3jse/runtime Entities", () => {
  it("player with the Key: animation, sound, collision disabled, flag saved", () => {
    const { player, door } = buildScene();
    player.addComponent("Key");

    const effects: EngineSideEffects = emptyEffects();
    interpret(
      buildDoorTriggerGraph(),
      { other: player, door, doorOpenSfx: "sfx/door_open.wav" },
      createRuntimeHost(effects),
    );

    expect(effects.animationsPlayed).toEqual([{ entity: "Door", clip: "open" }]);
    expect(effects.soundsPlayed).toEqual(["sfx/door_open.wav"]);
    expect(door.getComponent<{ enabled: boolean }>("Collision")!.enabled).toBe(false);
    expect(effects.flags).toEqual({ door_1_open: true });
  });

  it("player without the Key: nothing happens, Collision stays enabled", () => {
    const { player, door } = buildScene();

    const effects: EngineSideEffects = emptyEffects();
    interpret(
      buildDoorTriggerGraph(),
      { other: player, door, doorOpenSfx: "sfx/door_open.wav" },
      createRuntimeHost(effects),
    );

    expect(effects.animationsPlayed).toEqual([]);
    expect(effects.soundsPlayed).toEqual([]);
    expect(door.getComponent<{ enabled: boolean }>("Collision")!.enabled).toBe(true);
    expect(effects.flags).toEqual({});
  });

  it("emits readable TypeScript calling @3jse/runtime's real Entity API — 'a programmer would not be embarrassed to have written' (docs/ROADMAP.md)", () => {
    const { code } = emit(buildDoorTriggerGraph());
    assertValidTs(code);

    expect(code).toContain("function onTriggerEnterDoor(other: Entity, door: Entity): void {");
    expect(code).toContain('if (other.hasComponent("Key")) {');
    expect(code).toContain('playAnimation(door, "open");');
    expect(code).toContain("playSound(doorOpenSfx);");
    expect(code).toContain('door.getComponent<any>("Collision")!.enabled = false;');
    expect(code).toContain('saveService.setFlag("door_1_open", true);');
  });

  it("bidirectional round-trip: a HAND-WRITTEN version of the same logic parses to an IR graph that behaves identically to the hand-built one — docs/ROADMAP.md's \"graph edit and a code edit of the same logic converge to the same IR\"", () => {
    // Not the emitter's own output — an independently hand-written TS function using the same
    // recognized vocabulary, standing in for "a programmer edited the Code Editor panel."
    const HAND_WRITTEN = `
      function onTriggerEnterDoor(other: Entity, door: Entity): void {
        if (other.hasComponent("Key")) {
          playAnimation(door, "open");
          playSound(doorOpenSfx);
          door.getComponent<any>("Collision")!.enabled = false;
          saveService.setFlag("door_1_open", true);
        }
      }
    `;
    const fromCode = parseTsSubset(HAND_WRITTEN);
    const fromGraph = buildDoorTriggerGraph();

    for (const hasKey of [true, false]) {
      const { player, door } = buildScene();
      if (hasKey) player.addComponent("Key");
      const bindings = { other: player, door, doorOpenSfx: "sfx/door_open.wav" };

      const effectsA = emptyEffects();
      interpret(fromCode, bindings, createRuntimeHost(effectsA));
      const doorStateA = door.getComponent<{ enabled: boolean }>("Collision")!.enabled;

      const scene2 = buildScene();
      if (hasKey) scene2.player.addComponent("Key");
      const effectsB = emptyEffects();
      interpret(fromGraph, { other: scene2.player, door: scene2.door, doorOpenSfx: "sfx/door_open.wav" }, createRuntimeHost(effectsB));
      const doorStateB = scene2.door.getComponent<{ enabled: boolean }>("Collision")!.enabled;

      expect(effectsA).toEqual(effectsB);
      expect(doorStateA).toBe(doorStateB);
    }
  });
});

describe("3IR slice 1 — GetNode reads a live Component field", () => {
  it("reads Collision.enabled back through a query→branch, not just writes it", () => {
    const nodes: IRGraph["nodes"] = {
      door: { kind: "variable", id: "door", scope: "local", name: "door", type: "entityRef" },
      enabled: { kind: "get", id: "enabled", entity: { node: "door" }, component: "Collision", field: "enabled", outputType: "boolean" },
      trueLit: { kind: "pure", id: "trueLit", op: "const", inputs: [], value: true, outputType: "boolean" },
      cond: { kind: "pure", id: "cond", op: "eq", inputs: [{ node: "enabled" }, { node: "trueLit" }], outputType: "boolean" },
      stillClosed: { kind: "call", id: "stillClosed", target: "onStillClosed", args: [], next: null },
      branch: { kind: "branch", id: "branch", cond: { node: "cond" }, then: { node: "stillClosed" }, else: null },
      event: { kind: "event", id: "event", name: "checkDoor", params: [{ name: "door", type: "entityRef" }], next: { node: "branch" } },
    };
    const graph: IRGraph = { nodes, entry: "event" };

    const { door } = buildScene();
    const effects: EngineSideEffects = emptyEffects();
    const result = interpret(graph, { door }, createRuntimeHost(effects));
    expect(result.calls).toEqual([{ target: "onStillClosed", args: [] }]);

    door.getComponent<{ enabled: boolean }>("Collision")!.enabled = false;
    const result2 = interpret(graph, { door }, createRuntimeHost(effects));
    expect(result2.calls).toEqual([]);
  });
});
