// A CPU reference evaluator for the graph subset (const / uniform / input / math ops). It is
// NOT the shipping path (that's compileToTSL running on the GPU) — it exists so a headless test
// can assert "this graph produces this color at this sample point", a visual-regression-lite
// check with no renderer.

import { OP_ARITY, type MaterialGraph, type MatOp } from "./graph.js";

export type Value = number | number[];

export interface EvalInputs {
  uv?: [number, number];
  position?: [number, number, number];
  normal?: [number, number, number];
  time?: number;
  /** sampler name -> a function returning rgba at a uv */
  textures?: Record<string, (uv: [number, number]) => [number, number, number, number]>;
  /** uniform overrides */
  uniforms?: Record<string, Value>;
}

function toVec(v: Value): number[] {
  return typeof v === "number" ? [v] : v;
}
function broadcast(a: number[], b: number[]): [number[], number[]] {
  if (a.length === b.length) return [a, b];
  if (a.length === 1) return [Array(b.length).fill(a[0]), b];
  if (b.length === 1) return [a, Array(a.length).fill(b[0])];
  const n = Math.max(a.length, b.length);
  return [pad(a, n), pad(b, n)];
}
function pad(a: number[], n: number): number[] {
  return a.length >= n ? a.slice(0, n) : [...a, ...Array(n - a.length).fill(a[a.length - 1] ?? 0)];
}

const BINOP: Partial<Record<MatOp, (x: number, y: number) => number>> = {
  add: (x, y) => x + y, sub: (x, y) => x - y, mul: (x, y) => x * y, div: (x, y) => x / y,
  step: (edge, x) => (x < edge ? 0 : 1), pow: (x, y) => x ** y,
};
const UNOP: Partial<Record<MatOp, (x: number) => number>> = {
  fract: (x) => x - Math.floor(x), floor: Math.floor, abs: Math.abs, sin: Math.sin, cos: Math.cos,
};

export function evaluateGraph(g: MaterialGraph, inputs: EvalInputs = {}, slot = "color"): Value {
  const cache = new Map<string, Value>();
  const inputEdge = (id: string, pin: string) => g.edges.find((e) => e.to === id && e.toPin === pin);

  const evalNode = (id: string): Value => {
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const n = g.nodes[id];
    if (!n) throw new Error(`evaluateGraph: no node "${id}"`);
    let out: Value;
    switch (n.kind) {
      case "input":
        out = n.name === "uv" ? (inputs.uv ?? [0, 0])
          : n.name === "position" ? (inputs.position ?? [0, 0, 0])
          : n.name === "normal" ? (inputs.normal ?? [0, 0, 1])
          : (inputs.time ?? 0);
        break;
      case "const":
        out = n.value as Value;
        break;
      case "uniform":
        out = inputs.uniforms?.[n.name] ?? (n.value as Value);
        break;
      case "texture": {
        const tex = inputs.textures?.[n.sampler];
        out = tex ? tex(inputs.uv ?? [0, 0]).slice(0, 4) : [0, 0, 0, 1];
        break;
      }
      case "op":
        out = evalOp(n.op, id);
        break;
      case "output":
        out = 0;
        break;
    }
    cache.set(id, out);
    return out;
  };

  const CH: Record<string, number> = { r: 0, g: 1, b: 2, a: 3, x: 0, y: 1, z: 2, w: 3 };
  const resolveInput = (id: string, pin: string): number[] => {
    const e = inputEdge(id, pin);
    if (!e) return [0];
    const v = toVec(evalNode(e.from));
    if (e.fromPin && e.fromPin in CH) return [v[CH[e.fromPin]!] ?? 0];
    return v;
  };

  const evalOp = (op: MatOp, id: string): Value => {
    const args = ["a", "b", "c"].slice(0, OP_ARITY[op]).map((pin) => resolveInput(id, pin));
    if (op === "mix") {
      const [a, b] = broadcast(args[0]!, args[1]!);
      const t = args[2]![0]!;
      return a.map((v, i) => v * (1 - t) + b[i]! * t);
    }
    if (op === "smoothstep") {
      const e0 = args[0]![0]!, e1 = args[1]![0]!, x = args[2]![0]!;
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    }
    if (op === "clamp") {
      const [x, lo, hi] = [args[0]![0]!, args[1]![0]!, args[2]![0]!];
      return Math.max(lo, Math.min(hi, x));
    }
    if (op === "dot") {
      const [a, b] = broadcast(args[0]!, args[1]!);
      return a.reduce((s, v, i) => s + v * b[i]!, 0);
    }
    if (op === "length") return Math.hypot(...args[0]!);
    if (op === "normalize") {
      const l = Math.hypot(...args[0]!) || 1;
      return args[0]!.map((v) => v / l);
    }
    const bin = BINOP[op];
    if (bin && args.length === 2) {
      const [a, b] = broadcast(args[0]!, args[1]!);
      return a.map((v, i) => bin(v, b[i]!));
    }
    const un = UNOP[op];
    if (un) return args[0]!.map(un);
    throw new Error(`evaluateGraph: op "${op}" not supported by the CPU evaluator`);
  };

  const e = inputEdge(g.output, slot);
  if (!e) return slot === "color" ? [0, 0, 0] : 0;
  const raw = resolveInput(g.output, slot);
  // colour-ish slots want a vec3; scalar slots want a number
  if (slot === "roughness" || slot === "metalness" || slot === "opacity") return raw[0]!;
  return raw.length >= 3 ? raw.slice(0, 3) : raw;
}
