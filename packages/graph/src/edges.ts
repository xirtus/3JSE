import type { IRGraph, IRRef } from "@3jse/ir";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** "exec" = the black exec wire (docs/GAMEPLAY_IR.md's "next" chain); "value" = a typed data
   *  wire into a pin. Two visually distinct wire kinds, same as every real node-graph tool. */
  kind: "exec" | "value";
}

/** Every wire in an IRGraph, derived — not stored. Keeping IRGraph free of presentation/edge
 *  data is what lets the same graph feed the interpreter, the emitter, and this canvas without
 *  three copies of "what connects to what" drifting apart. */
export function extractEdges(graph: IRGraph): GraphEdge[] {
  const edges: GraphEdge[] = [];
  let i = 0;
  const addExec = (from: string, toRef: IRRef | null | undefined) => {
    if (toRef) edges.push({ id: `e${i++}`, from, to: toRef.node, kind: "exec" });
  };
  const addValue = (to: string, fromRef: IRRef | null | undefined) => {
    if (fromRef) edges.push({ id: `e${i++}`, from: fromRef.node, to, kind: "value" });
  };

  for (const node of Object.values(graph.nodes)) {
    switch (node.kind) {
      case "event":
        addExec(node.id, node.next);
        break;
      case "call":
        node.args.forEach((a) => addValue(node.id, a));
        addExec(node.id, node.next);
        break;
      case "set":
        addValue(node.id, node.entity);
        addValue(node.id, node.value);
        addExec(node.id, node.next);
        break;
      case "branch":
        addValue(node.id, node.cond);
        addExec(node.id, node.then);
        addExec(node.id, node.else);
        break;
      case "query":
        addValue(node.id, node.entity);
        break;
      case "get":
        addValue(node.id, node.entity);
        break;
      case "pure":
        node.inputs.forEach((inp) => addValue(node.id, inp));
        break;
      case "variable":
        break;
    }
  }
  return edges;
}
