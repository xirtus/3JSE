import type { IRGraph, IRRef } from "./types.js";

export interface RecordedCall {
  target: string;
  args: unknown[];
}

export interface InterpretResult {
  calls: RecordedCall[];
}

function getNode(graph: IRGraph, ref: IRRef) {
  const node = graph.nodes[ref.node];
  if (!node) throw new Error(`Unknown IR node "${ref.node}".`);
  return node;
}

/** docs/GAMEPLAY_IR.md's "Interpreter (editor / live-debug mode)" backend, prototype slice: a
 *  tree-walking evaluator over the IR graph. `args` binds the entry EventNode's params by name —
 *  this stands in for the Component/Resource state a production interpreter would read live
 *  (docs/GAMEPLAY_IR.md's instrumentation-for-active-wires role is real future work, not here). */
export function interpret(graph: IRGraph, args: Record<string, unknown>): InterpretResult {
  const calls: RecordedCall[] = [];

  function evalValue(ref: IRRef): unknown {
    const node = getNode(graph, ref);
    if (node.kind === "variable") {
      if (!(node.name in args)) throw new Error(`No value bound for variable "${node.name}".`);
      return args[node.name];
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
    throw new Error(`Node "${node.id}" (${node.kind}) does not produce a value.`);
  }

  function execFrom(ref: IRRef | null): void {
    if (!ref) return;
    const node = getNode(graph, ref);
    if (node.kind === "call") {
      calls.push({ target: node.target, args: node.args.map(evalValue) });
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
  execFrom(entry.next);
  return { calls };
}
