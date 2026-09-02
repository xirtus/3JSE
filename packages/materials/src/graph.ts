// Material Graph model (docs/RENDERING.md, docs/EDITOR.md Material/Shader Graph). A node graph
// that compiles to Three.js TSL — the shipped material has zero graph-interpreter tax, exactly
// like 3JSE Graph → 3IR. Headless: the model, validation, TSL codegen (a string), and a CPU
// reference evaluator all run in a vitest with no renderer.

export type MatType = "float" | "vec2" | "vec3" | "color";

export type MatNode =
  | { id: string; kind: "input"; name: "uv" | "position" | "normal" | "time" }
  | { id: string; kind: "const"; type: MatType; value: number | [number, number] | [number, number, number] }
  | { id: string; kind: "uniform"; name: string; type: MatType; value: number | [number, number, number] }
  | { id: string; kind: "texture"; sampler: string }
  | { id: string; kind: "op"; op: MatOp }
  | { id: string; kind: "output" };

export type MatOp =
  | "add" | "sub" | "mul" | "div"
  | "mix" | "dot" | "cross" | "normalize" | "length"
  | "fract" | "floor" | "abs" | "sin" | "cos"
  | "step" | "smoothstep" | "clamp" | "pow";

/** Which output slot of the terminal `output` node an edge feeds. */
export type OutputSlot = "color" | "roughness" | "metalness" | "emissive" | "normal" | "opacity";

export interface MatEdge {
  from: string;
  /** most nodes have a single output pin "out"; `texture` also has "r"/"g"/"b"/"a" */
  fromPin?: string;
  to: string;
  /** op nodes: "a" | "b" | "c" ; output node: an OutputSlot */
  toPin: string;
}

export interface MaterialGraph {
  nodes: Record<string, MatNode>;
  edges: MatEdge[];
  /** id of the single `output` node */
  output: string;
}

export const OP_ARITY: Record<MatOp, number> = {
  add: 2, sub: 2, mul: 2, div: 2, dot: 2, cross: 2, step: 2, pow: 2,
  mix: 3, smoothstep: 3, clamp: 3,
  normalize: 1, length: 1, fract: 1, floor: 1, abs: 1, sin: 1, cos: 1,
};

export interface GraphIssue {
  level: "error" | "warn";
  node?: string;
  message: string;
}

/** Structural + type validation: single output, no cycles, op inputs present, output has a
 *  color slot wired. */
export function validateGraph(g: MaterialGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const out = g.nodes[g.output];
  if (!out || out.kind !== "output") {
    issues.push({ level: "error", message: `output node "${g.output}" missing or not an output` });
    return issues;
  }

  // cycle check (DFS over edges)
  const adj = new Map<string, string[]>();
  for (const e of g.edges) (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
  const state = new Map<string, 0 | 1 | 2>();
  const dfs = (n: string): boolean => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const m of adj.get(n) ?? []) if (dfs(m)) return true;
    state.set(n, 2);
    return false;
  };
  for (const id of Object.keys(g.nodes)) if (dfs(id)) { issues.push({ level: "error", node: id, message: "cycle through this node" }); break; }

  // op inputs present
  for (const n of Object.values(g.nodes)) {
    if (n.kind !== "op") continue;
    const got = g.edges.filter((e) => e.to === n.id).length;
    if (got < OP_ARITY[n.op]) issues.push({ level: "error", node: n.id, message: `op "${n.op}" needs ${OP_ARITY[n.op]} inputs, has ${got}` });
  }

  // output must at least drive color
  if (!g.edges.some((e) => e.to === g.output && e.toPin === "color")) {
    issues.push({ level: "warn", message: "output has no color slot wired — the material will be black" });
  }
  return issues;
}
