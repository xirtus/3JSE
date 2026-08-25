import { describe, expect, it } from "vitest";
import { interpret, type IRHost } from "@3jse/ir";
import { GraphStore, graphRead, graphWrite, graphConnect } from "./graph.js";

const NOOP_HOST: IRHost = {
  hasComponent: () => false,
  getField: () => undefined,
  setField: () => {},
  call: () => undefined,
};

describe("graph tools", () => {
  it("graph.write creates a graph on first use and upserts nodes on later calls", () => {
    const store = new GraphStore();
    graphWrite(store, "onDamage", {
      setNodes: {
        amount: { kind: "variable", id: "amount", scope: "local", name: "amount", type: "number" },
        die: { kind: "call", id: "die", target: "die", args: [], next: null },
        event: { kind: "event", id: "event", name: "onDamage", params: [{ name: "amount", type: "number" }], next: null },
      },
      setEntry: "event",
    });

    const graph = graphRead(store, "onDamage");
    expect(Object.keys(graph.nodes).sort()).toEqual(["amount", "die", "event"]);
    expect(graph.entry).toBe("event");

    graphWrite(store, "onDamage", { setNodes: { die: { kind: "call", id: "die", target: "onDeath", args: [], next: null } } });
    expect(graphRead(store, "onDamage").nodes.die).toMatchObject({ target: "onDeath" });
  });

  it("graph.write removeNodes actually deletes", () => {
    const store = new GraphStore();
    graphWrite(store, "g", { setNodes: { a: { kind: "variable", id: "a", scope: "local", name: "a", type: "number" } } });
    graphWrite(store, "g", { removeNodes: ["a"] });
    expect(graphRead(store, "g").nodes.a).toBeUndefined();
  });

  it("graph.read on an unknown graph throws a clear error", () => {
    expect(() => graphRead(new GraphStore(), "nope")).toThrow(/Unknown graph/);
  });

  it("graph.connect wires a producer into a Branch's cond slot and the graph then interprets correctly", () => {
    const store = new GraphStore();
    graphWrite(store, "g", {
      setNodes: {
        trueLit: { kind: "pure", id: "trueLit", op: "const", inputs: [], value: true, outputType: "boolean" },
        doThing: { kind: "call", id: "doThing", target: "doThing", args: [], next: null },
        branch: { kind: "branch", id: "branch", cond: { node: "" }, then: { node: "doThing" }, else: null },
        event: { kind: "event", id: "event", name: "onTick", params: [], next: { node: "branch" } },
      },
      setEntry: "event",
    });

    graphConnect(store, "g", { from: "trueLit", to: "branch", toSlot: "cond" });

    const graph = graphRead(store, "g");
    expect(graph.nodes.branch).toMatchObject({ cond: { node: "trueLit" } });
    const result = interpret(graph, {}, NOOP_HOST);
    expect(result.calls).toEqual([{ target: "doThing", args: [] }]);
  });

  it("graph.connect wires an indexed args[] slot on a Call node", () => {
    const store = new GraphStore();
    graphWrite(store, "g", {
      setNodes: {
        amount: { kind: "variable", id: "amount", scope: "local", name: "amount", type: "number" },
        applyDamage: { kind: "call", id: "applyDamage", target: "applyDamage", args: [{ node: "" }], next: null },
        event: { kind: "event", id: "event", name: "onHit", params: [{ name: "amount", type: "number" }], next: { node: "applyDamage" } },
      },
      setEntry: "event",
    });

    graphConnect(store, "g", { from: "amount", to: "applyDamage", toSlot: "args[0]" });

    const result = interpret(graphRead(store, "g"), { amount: 7 }, NOOP_HOST);
    expect(result.calls).toEqual([{ target: "applyDamage", args: [7] }]);
  });

  it("graph.connect rejects a type mismatch — 3IR's type system checked at call time", () => {
    const store = new GraphStore();
    graphWrite(store, "g", {
      setNodes: {
        numberLit: { kind: "pure", id: "numberLit", op: "const", inputs: [], value: 5, outputType: "number" },
        doThing: { kind: "call", id: "doThing", target: "doThing", args: [], next: null },
        branch: { kind: "branch", id: "branch", cond: { node: "" }, then: { node: "doThing" }, else: null },
        event: { kind: "event", id: "event", name: "onTick", params: [], next: { node: "branch" } },
      },
      setEntry: "event",
    });

    expect(() => graphConnect(store, "g", { from: "numberLit", to: "branch", toSlot: "cond" })).toThrow(/Type mismatch/);
  });

  it("graph.connect rejects an unknown slot name on the target node", () => {
    const store = new GraphStore();
    graphWrite(store, "g", {
      setNodes: {
        v: { kind: "variable", id: "v", scope: "local", name: "v", type: "number" },
        call: { kind: "call", id: "call", target: "f", args: [], next: null },
      },
    });
    expect(() => graphConnect(store, "g", { from: "v", to: "call", toSlot: "notARealSlot" })).toThrow(/not a valid slot/);
  });
});
