import { describe, expect, it } from "vitest";
import type { IRGraph } from "@3jse/ir";
import { layoutGraph, type NodeLayout } from "./layout.js";
import { extractEdges } from "./edges.js";

/** The full docs/VISUAL_SCRIPTING.md door/trigger example (4 chained calls in the "then" branch,
 *  a 2-deep value tree for the condition) — deliberately not a simplified stand-in: a smaller
 *  graph didn't have enough calls/value-columns in play to expose the two real overlap bugs this
 *  file's "no two nodes overlap" test now guards against (see layout.ts's doc comment). */
function doorTriggerGraph(): IRGraph {
  const nodes: IRGraph["nodes"] = {
    other: { kind: "variable", id: "other", scope: "local", name: "other", type: "entityRef" },
    door: { kind: "variable", id: "door", scope: "local", name: "door", type: "entityRef" },
    doorOpenSfx: { kind: "variable", id: "doorOpenSfx", scope: "local", name: "doorOpenSfx", type: "string" },
    hasKey: { kind: "query", id: "hasKey", op: "hasComponent", entity: { node: "other" }, component: "Key", outputType: "boolean" },
    openLiteral: { kind: "pure", id: "openLiteral", op: "const", inputs: [], value: "open", outputType: "string" },
    playAnim: {
      kind: "call",
      id: "playAnim",
      target: "playAnimation",
      args: [{ node: "door" }, { node: "openLiteral" }],
      next: { node: "playSound" },
    },
    playSound: { kind: "call", id: "playSound", target: "playSound", args: [{ node: "doorOpenSfx" }], next: { node: "disableCollision" } },
    falseLiteral: { kind: "pure", id: "falseLiteral", op: "const", inputs: [], value: false, outputType: "boolean" },
    disableCollision: {
      kind: "set",
      id: "disableCollision",
      entity: { node: "door" },
      component: "Collision",
      field: "enabled",
      value: { node: "falseLiteral" },
      next: { node: "saveFlag" },
    },
    flagName: { kind: "pure", id: "flagName", op: "const", inputs: [], value: "door_1_open", outputType: "string" },
    trueLiteral: { kind: "pure", id: "trueLiteral", op: "const", inputs: [], value: true, outputType: "boolean" },
    saveFlag: {
      kind: "call",
      id: "saveFlag",
      target: "saveService.setFlag",
      args: [{ node: "flagName" }, { node: "trueLiteral" }],
      next: null,
    },
    branch: { kind: "branch", id: "branch", cond: { node: "hasKey" }, then: { node: "playAnim" }, else: null },
    event: {
      kind: "event",
      id: "event",
      name: "onTriggerEnterDoor",
      params: [
        { name: "other", type: "entityRef" },
        { name: "door", type: "entityRef" },
      ],
      next: { node: "branch" },
    },
  };
  return { nodes, entry: "event" };
}

function overlaps(a: NodeLayout, b: NodeLayout): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("layoutGraph", () => {
  it("positions every node in the graph, with no negative coordinates", () => {
    const graph = doorTriggerGraph();
    const layout = layoutGraph(graph);

    expect(Object.keys(layout.nodes).sort()).toEqual(Object.keys(graph.nodes).sort());
    for (const n of Object.values(layout.nodes)) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("canvas bounds contain every positioned node", () => {
    const layout = layoutGraph(doorTriggerGraph());
    for (const n of Object.values(layout.nodes)) {
      expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("no two distinct nodes' boxes overlap", () => {
    const layout = layoutGraph(doorTriggerGraph());
    const boxes = Object.values(layout.nodes);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i]!, boxes[j]!), `${boxes[i]!.id} vs ${boxes[j]!.id}`).toBe(false);
      }
    }
  });

  it("places the entry event left of the branch it leads to", () => {
    const layout = layoutGraph(doorTriggerGraph());
    expect(layout.nodes.event!.x).toBeLessThan(layout.nodes.branch!.x);
  });

  it("a variable referenced twice (door, in both playAnim's args and disableCollision's entity) gets exactly one position", () => {
    const layout = layoutGraph(doorTriggerGraph());
    expect(layout.nodes.door).toBeDefined();
    expect(Object.keys(layout.nodes).filter((id) => id === "door")).toHaveLength(1);
  });
});

describe("extractEdges", () => {
  it("extracts both exec and value edges from the door/trigger graph", () => {
    const edges = extractEdges(doorTriggerGraph());
    const exec = edges.filter((e) => e.kind === "exec");
    const value = edges.filter((e) => e.kind === "value");

    expect(exec).toContainEqual(expect.objectContaining({ from: "event", to: "branch" }));
    expect(exec).toContainEqual(expect.objectContaining({ from: "branch", to: "playAnim" }));
    expect(value).toContainEqual(expect.objectContaining({ from: "hasKey", to: "branch" }));
    expect(value).toContainEqual(expect.objectContaining({ from: "door", to: "playAnim" }));
    expect(value).toContainEqual(expect.objectContaining({ from: "other", to: "hasKey" }));
  });
});
