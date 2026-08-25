import { describe, expect, it } from "vitest";
import { World, type Entity, type SystemDef } from "@3jse/runtime";
import { compileToTickFn, interpret, type IRGraph, type IRHost } from "@3jse/ir";
import { sceneCreateEntity, sceneAddComponent, sceneQuery } from "./scene.js";
import { GraphStore, graphWrite, graphConnect, graphRead } from "./graph.js";
import { ConsoleSink, runtimeRun, runtimeGetConsole } from "./runtime.js";

// A scaled-down version of docs/AI_AGENT_API.md's worked example, exercising every tool this
// slice implements together against one scenario: author a Component + a Behavior graph for an
// entity, run it headless, and inspect the real result — the OBSERVE → ACT → VERIFY loop's
// non-trivia-free shape, not the full shark (which needs @3jse/nav/@3jse/ai-behavior, neither
// built yet).
//
// One honest gap this test is explicit about: compiling a written graph into a live System
// (`compileToTickFn` + `world.scheduler.register()`) is NOT an agent-callable tool in this slice
// — no `@3jse/agent` tool exposes it. In a full implementation that step is implicit engine
// machinery (a Behavior Component naming a graph gets compiled and registered automatically);
// here it's done directly, standing in for that missing wiring, exactly as this file's own
// comments say rather than pretending an agent could have triggered it through MCP today.

const HOST: IRHost = {
  hasComponent: (e, c) => (e as Entity).hasComponent(c),
  getField: (e, c, f) => (e as Entity).getComponent<Record<string, unknown>>(c)?.[f],
  setField: (e, c, f, v) => {
    (e as Entity).getComponent<Record<string, unknown>>(c)![f] = v;
  },
  call: () => undefined,
};

function buildMortalityGraph(store: GraphStore): IRGraph {
  graphWrite(store, "onTickMortality", {
    setNodes: {
      self: { kind: "variable", id: "self", scope: "local", name: "self", type: "entityRef" },
      current: { kind: "get", id: "current", entity: { node: "self" }, component: "Health", field: "current", outputType: "number" },
      zero: { kind: "pure", id: "zero", op: "const", inputs: [], value: 0, outputType: "number" },
      isDead: { kind: "pure", id: "isDead", op: "lte", inputs: [{ node: "current" }, { node: "zero" }], outputType: "boolean" },
      trueLit: { kind: "pure", id: "trueLit", op: "const", inputs: [], value: true, outputType: "boolean" },
      setDefeated: { kind: "set", id: "setDefeated", entity: { node: "self" }, component: "Health", field: "defeated", value: { node: "trueLit" }, next: null },
      branch: { kind: "branch", id: "branch", cond: { node: "" }, then: { node: "setDefeated" }, else: null },
      event: { kind: "event", id: "event", name: "onTickMortality", params: [{ name: "self", type: "entityRef" }], next: { node: "branch" } },
    },
    setEntry: "event",
  });
  graphConnect(store, "onTickMortality", { from: "isDead", to: "branch", toSlot: "cond" });
  return graphRead(store, "onTickMortality");
}

describe("agent workflow: author a Component + a Behavior graph, run headless, verify the result", () => {
  it("OBSERVE (empty scene) → ACT (create entity, add Health, author graph) → VERIFY (headless run shows the entity defeated)", () => {
    const world = new World();
    const level = world.createLevel("Level");
    const graphs = new GraphStore();
    const console_ = new ConsoleSink();

    // OBSERVE
    expect(sceneQuery(level)).toEqual([]);

    // ACT — scene.createEntity + scene.addComponent, the real agent tools
    const shark = sceneCreateEntity(level, "Shark");
    sceneAddComponent(level, shark.id, "Health", { current: 0, max: 100 });

    // ACT — graph.write + graph.connect, the real agent tools, building the Behavior
    const graph = buildMortalityGraph(graphs);
    expect(interpret(graph, { self: level.getEntity(shark.id)! }, HOST).calls).toEqual([]); // no `call` in this graph — pure state check

    // Engine wiring this test stands in for (see file doc comment): compile + register as a
    // System, the same "registered into the Runtime scheduler exactly like a hand-written
    // System" claim proven in isolation by packages/ir/src/systemIntegration.test.ts.
    const tick = compileToTickFn<Entity>(graph, "self", HOST);
    const system: SystemDef = { name: "MortalitySystem", stage: "variable", query: ["Health"], run: (entities) => tick(entities) };
    world.scheduler.register(system);

    // VERIFY — runtime.run + runtime.getConsole + scene.query, the real agent tools
    runtimeRun(world, console_, 3);
    expect(runtimeGetConsole(console_).filter((e) => e.level === "error")).toEqual([]);

    const [result] = sceneQuery(level, { componentTypes: ["Health"] });
    expect(result!.components.Health).toMatchObject({ current: 0, defeated: true });
  });
});
