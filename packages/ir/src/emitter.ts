import type { IRGraph, IRRef } from "./types.js";

/** One emitted line's IR provenance — docs/GAMEPLAY_IR.md: "every emitted line carries a
 *  reference back to the originating IR node ID." 1-indexed to match editor line numbers. */
export interface SourceMapEntry {
  nodeId: string;
  line: number;
}

export interface EmitResult {
  code: string;
  sourceMap: SourceMapEntry[];
}

const COMPARISON_TEXT: Record<string, string> = {
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  eq: "===",
  neq: "!==",
};

/** docs/GAMEPLAY_IR.md's "JS/TS emitter (shipping mode)" backend, prototype slice: emits plain,
 *  readable TypeScript with a line-level source map back to the IR node that produced each line
 *  — the mechanism the round-trip claim in packages/ir/src/roundtrip.test.ts exercises. */
export function emit(graph: IRGraph): EmitResult {
  const lines: string[] = [];
  const sourceMap: SourceMapEntry[] = [];

  function mark(nodeId: string): void {
    sourceMap.push({ nodeId, line: lines.length + 1 });
  }

  function refText(ref: IRRef): string {
    const node = graph.nodes[ref.node];
    if (!node) throw new Error(`Unknown IR node "${ref.node}".`);
    if (node.kind === "variable") return node.name;
    if (node.kind === "pure") {
      if (node.op === "const") return JSON.stringify(node.value);
      const [left, right] = node.inputs;
      if (!left || !right) throw new Error(`Pure node "${node.id}" (${node.op}) needs two inputs.`);
      return `(${refText(left)} ${COMPARISON_TEXT[node.op]} ${refText(right)})`;
    }
    throw new Error(`Node "${node.id}" (${node.kind}) does not produce a value.`);
  }

  function emitStmt(ref: IRRef | null, indent: string): void {
    if (!ref) return;
    const node = graph.nodes[ref.node];
    if (!node) throw new Error(`Unknown IR node "${ref.node}".`);
    if (node.kind === "call") {
      mark(node.id);
      lines.push(`${indent}${node.target}(${node.args.map(refText).join(", ")});`);
      emitStmt(node.next, indent);
      return;
    }
    if (node.kind === "branch") {
      mark(node.id);
      lines.push(`${indent}if (${refText(node.cond)}) {`);
      emitStmt(node.then, `${indent}  `);
      lines.push(`${indent}} else {`);
      emitStmt(node.else, `${indent}  `);
      lines.push(`${indent}}`);
      return;
    }
    throw new Error(`Node "${node.id}" (${node.kind}) cannot appear in exec position.`);
  }

  const entry = graph.nodes[graph.entry];
  if (!entry || entry.kind !== "event") throw new Error("IRGraph.entry must reference an EventNode.");

  mark(entry.id);
  const params = entry.params.map((p) => `${p.name}: ${p.type}`).join(", ");
  lines.push(`function ${entry.name}(${params}): void {`);
  emitStmt(entry.next, "  ");
  lines.push(`}`);
  lines.push("");

  return { code: lines.join("\n"), sourceMap };
}
