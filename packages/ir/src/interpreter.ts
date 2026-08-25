import type { IRGraph, IRRef } from "./types.js";
import type { IRHost } from "./host.js";

export interface RecordedCall {
  target: string;
  args: unknown[];
}

export interface InterpretResult {
  calls: RecordedCall[];
  /** Every node id visited, in evaluation order (value nodes re-visited on each reference are
   *  recorded each time — a shared Variable read twice appears twice). This is the data behind
   *  docs/VISUAL_SCRIPTING.md's "Active-wire visualization" / "Execution history": a graph
   *  canvas can highlight `visited` to show what actually ran, without the interpreter needing
   *  to know anything about a canvas. */
  visited: string[];
}

function getNode(graph: IRGraph, ref: IRRef) {
  const node = graph.nodes[ref.node];
  if (!node) throw new Error(`Unknown IR node "${ref.node}".`);
  return node;
}

/** docs/GAMEPLAY_IR.md's "Interpreter (editor / live-debug mode)" backend: a tree-walking
 *  evaluator over the IR graph. `bindings` binds the entry EventNode's params (and any other
 *  named external reference the graph uses, e.g. an asset ref — VariableNode's doc comment)
 *  by name. `host` is where Component reads/writes and named calls actually happen — passing a
 *  real `@3jse/runtime`-backed IRHost is what proves this interpreter can drive real gameplay
 *  state, not just record calls against a mock (packages/ir/src/entityRoundtrip.test.ts). */
export function interpret(graph: IRGraph, bindings: Record<string, unknown>, host: IRHost): InterpretResult {
  const calls: RecordedCall[] = [];
  const visited: string[] = [];

  function evalValue(ref: IRRef): unknown {
    const node = getNode(graph, ref);
    visited.push(node.id);
    if (node.kind === "variable") {
      if (!(node.name in bindings)) throw new Error(`No value bound for variable "${node.name}".`);
      return bindings[node.name];
    }
    if (node.kind === "pure") {
      if (node.op === "const") return node.value;
      const [left, right] = node.inputs;
      if (!left || !right) throw new Error(`Pure node "${node.id}" (${node.op}) needs two inputs.`);
      const l = evalValue(left) as number;
      const r = evalValue(right) as number;
      switch (node.op) {
        case "gt":
          return l > r;
        case "lt":
          return l < r;
        case "gte":
          return l >= r;
        case "lte":
          return l <= r;
        case "eq":
          return l === r;
        case "neq":
          return l !== r;
      }
    }
    if (node.kind === "query") {
      return host.hasComponent(evalValue(node.entity), node.component);
    }
    if (node.kind === "get") {
      return host.getField(evalValue(node.entity), node.component, node.field);
    }
    throw new Error(`Node "${node.id}" (${node.kind}) does not produce a value.`);
  }

  function execFrom(ref: IRRef | null): void {
    if (!ref) return;
    const node = getNode(graph, ref);
    visited.push(node.id);
    if (node.kind === "call") {
      const args = node.args.map(evalValue);
      calls.push({ target: node.target, args });
      host.call(node.target, args);
      execFrom(node.next);
      return;
    }
    if (node.kind === "set") {
      host.setField(evalValue(node.entity), node.component, node.field, evalValue(node.value));
      execFrom(node.next);
      return;
    }
    if (node.kind === "branch") {
      const cond = evalValue(node.cond) as boolean;
      execFrom(cond ? node.then : node.else);
      return;
    }
    throw new Error(`Node "${node.id}" (${node.kind}) cannot appear in exec position.`);
  }

  const entry = graph.nodes[graph.entry];
  if (!entry || entry.kind !== "event") throw new Error("IRGraph.entry must reference an EventNode.");
  visited.push(entry.id);
  execFrom(entry.next);
  return { calls, visited };
}
