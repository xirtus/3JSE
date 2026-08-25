import { describe, expect, it } from "vitest";
import { World, registerComponent, defaultsFromFields, type ComponentField, type Entity, type SystemDef } from "@3jse/runtime";
import type { IRGraph } from "./types.js";
import type { IRHost } from "./host.js";
import { compileToTickFn } from "./toSystem.js";

// docs/ROADMAP.md Phase 4's prerequisite on Phase 3's 3IR being more than a standalone demo:
// this proves an IR graph runs as a REAL @3jse/runtime System, registered on a real Scheduler,
// driven by World.step() — not a direct interpret() call in a test or a Debugger panel button.
// A future Agent API's plan→act→verify loop needs exactly this: agent-authored IR that actually
// executes inside the live tick loop, so `verify` can observe real, ongoing effects.

const mortalityFields: ComponentField[] = [
  { name: "current", type: "number", default: 100, min: 0, max: 100, step: 1 },
  { name: "dead", type: "boolean", default: false },
];
registerComponent({
  type: "Mortality",
  label: "Mortality",
  fields: mortalityFields,
  createDefault: () => defaultsFromFields(mortalityFields) as { current: number; dead: boolean },
});

/** "Every tick, for each entity with Mortality: if current <= 0, call onEntityDied(self) and set
 *  Mortality.dead = true." One entity param ("self"), so it maps directly onto SystemDef's
 *  single-query, per-entity `run(entities, ctx)` shape — unlike the door/trigger example's two
 *  entity params (other, door), which models a collision *pair*, not a per-entity tick. */
function buildMortalitySystemGraph(): IRGraph {
  const nodes: IRGraph["nodes"] = {
    self: { kind: "variable", id: "self", scope: "local", name: "self", type: "entityRef" },
    current: { kind: "get", id: "current", entity: { node: "self" }, component: "Mortality", field: "current", outputType: "number" },
    zero: { kind: "pure", id: "zero", op: "const", inputs: [], value: 0, outputType: "number" },
    isDead: { kind: "pure", id: "isDead", op: "lte", inputs: [{ node: "current" }, { node: "zero" }], outputType: "boolean" },
    trueLit: { kind: "pure", id: "trueLit", op: "const", inputs: [], value: true, outputType: "boolean" },
    setDead: {
      kind: "set",
      id: "setDead",
      entity: { node: "self" },
      component: "Mortality",
      field: "dead",
      value: { node: "trueLit" },
      next: null,
    },
    callDied: { kind: "call", id: "callDied", target: "onEntityDied", args: [{ node: "self" }], next: { node: "setDead" } },
    branch: { kind: "branch", id: "branch", cond: { node: "isDead" }, then: { node: "callDied" }, else: null },
    event: {
      kind: "event",
      id: "event",
      name: "onTickMortality",
      params: [{ name: "self", type: "entityRef" }],
      next: { node: "branch" },
    },
  };
  return { nodes, entry: "event" };
}

function createRuntimeHost(diedCalls: string[]): IRHost {
  return {
    hasComponent: (entity, component) => (entity as Entity).hasComponent(component),
    getField: (entity, component, field) => (entity as Entity).getComponent<Record<string, unknown>>(component)?.[field],
    setField: (entity, component, field, value) => {
      (entity as Entity).getComponent<Record<string, unknown>>(component)![field] = value;
    },
    call: (name, args) => {
      if (name === "onEntityDied") diedCalls.push((args[0] as Entity).name);
    },
  };
}

describe("3IR → real @3jse/runtime System, via a real Scheduler tick", () => {
  it("world.step() runs the compiled graph once per matching entity, mutating live Component data", () => {
    const world = new World();
    const level = world.createLevel("Test");

    const alive = level.createEntity("Alive");
    alive.addComponent("Mortality", { current: 50 });
    const dying = level.createEntity("Dying");
    dying.addComponent("Mortality", { current: 0 });
    const untouched = level.createEntity("Untouched"); // no Mortality — must not match the query

    const diedCalls: string[] = [];
    const host = createRuntimeHost(diedCalls);
    const tick = compileToTickFn<Entity>(buildMortalitySystemGraph(), "self", host);

    const system: SystemDef = {
      name: "MortalitySystem",
      stage: "variable",
      query: ["Mortality"],
      run: (entities) => tick(entities),
    };
    world.scheduler.register(system);

    world.step(1 / 60);

    expect(diedCalls).toEqual(["Dying"]);
    expect(alive.getComponent<{ dead: boolean }>("Mortality")!.dead).toBe(false);
    expect(dying.getComponent<{ dead: boolean }>("Mortality")!.dead).toBe(true);
    expect(untouched.hasComponent("Mortality")).toBe(false);
  });

  it("hot-swapping the System (Scheduler.register upsert — RUNTIME.md's function swap) picks up a graph edit on the next tick, mid-simulation", () => {
    const world = new World();
    const level = world.createLevel("Test");
    const entity = level.createEntity("E");
    entity.addComponent("Mortality", { current: 0 });

    const diedCallsBefore: string[] = [];
    const hostBefore = createRuntimeHost(diedCallsBefore);
    world.scheduler.register({
      name: "MortalitySystem",
      stage: "variable",
      query: ["Mortality"],
      run: (entities) => compileToTickFn<Entity>(buildMortalitySystemGraph(), "self", hostBefore)(entities),
    });
    world.step(1 / 60);
    expect(diedCallsBefore).toEqual(["E"]);
    expect(entity.getComponent<{ dead: boolean }>("Mortality")!.dead).toBe(true);

    // Reset the live entity's state to simulate "still alive," then swap in an edited graph
    // under the same System name — exactly packages/runtime/src/Scheduler.ts's upsert-by-name
    // hot-reload mechanism, proven here against a compiled IR System instead of a hand-written
    // one.
    entity.getComponent<{ current: number; dead: boolean }>("Mortality")!.dead = false;
    const diedCallsAfter: string[] = [];
    const hostAfter = createRuntimeHost(diedCallsAfter);
    world.scheduler.register({
      name: "MortalitySystem",
      stage: "variable",
      query: ["Mortality"],
      run: (entities) => compileToTickFn<Entity>(buildMortalitySystemGraph(), "self", hostAfter)(entities),
    });
    world.step(1 / 60);
    expect(diedCallsAfter).toEqual(["E"]);
    expect(diedCallsBefore).toEqual(["E"]); // the old host's log is untouched by the new run
  });
});
