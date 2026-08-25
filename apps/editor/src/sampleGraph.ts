import {
  World,
  registerComponent,
  getComponentSchema,
  defaultsFromFields,
  type ComponentField,
  type Entity,
} from "@3jse/runtime";
import type { IRGraph, IRHost } from "@3jse/ir";

/**
 * docs/ROADMAP.md Phase 3's 3JSE Graph demo content: docs/VISUAL_SCRIPTING.md's door/trigger
 * worked example — "Player enters Trigger → Check HasKey → Play Door Animation → Play Sound →
 * Disable Collision → Save Door State" — as a hand-built IRGraph (no @3jse/graph canvas editing
 * exists yet, so this stands in for what one would produce, the same role sampleScene.ts plays
 * for the Viewport), plus a throwaway demo scene and IRHost the Debugger panel runs it against.
 * Deliberately its own tiny World/Level, not ctx.world/ctx.level — this is a Graph Function-style
 * sandbox for trying the logic, not part of the main Play-mode scene.
 *
 * Component registration is guarded (getComponentSchema check before registerComponent) so this
 * module is safe to hot-reload — see sampleScene.ts's installHotReload doc comment for why an
 * unguarded registerComponent() call breaks HMR the first time this file is edited.
 */
if (!getComponentSchema("Key")) {
  const keyFields: ComponentField[] = [];
  registerComponent({
    type: "Key",
    label: "Key",
    fields: keyFields,
    createDefault: () => defaultsFromFields(keyFields) as Record<string, never>,
  });
}
if (!getComponentSchema("Collision")) {
  const collisionFields: ComponentField[] = [{ name: "enabled", type: "boolean", default: true }];
  registerComponent({
    type: "Collision",
    label: "Collision",
    fields: collisionFields,
    createDefault: () => defaultsFromFields(collisionFields) as { enabled: boolean },
  });
}

export function buildDoorTriggerGraph(): IRGraph {
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

export function buildGraphDemoScene(): { player: Entity; door: Entity } {
  const world = new World();
  const level = world.createLevel("GraphDemo");
  const player = level.createEntity("Player");
  const door = level.createEntity("Door");
  door.addComponent("Collision");
  return { player, door };
}

export interface GraphDemoEffects {
  animationsPlayed: { entity: string; clip: string }[];
  soundsPlayed: string[];
  flags: Record<string, unknown>;
}

export function emptyGraphDemoEffects(): GraphDemoEffects {
  return { animationsPlayed: [], soundsPlayed: [], flags: {} };
}

export function createGraphDemoHost(effects: GraphDemoEffects): IRHost {
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
          return undefined;
      }
    },
  };
}
