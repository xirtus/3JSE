// compileToTSL — deterministic codegen from a MaterialGraph to Three.js TSL node source.
// The output is a string the editor/bundler wraps in a module; nothing here imports three.

import { OP_ARITY, type MaterialGraph, type MatNode, type MatOp } from "./graph.js";

const TSL_OP: Record<MatOp, string> = {
  add: "add", sub: "sub", mul: "mul", div: "div",
  mix: "mix", dot: "dot", cross: "cross", normalize: "normalize", length: "length",
  fract: "fract", floor: "floor", abs: "abs", sin: "sin", cos: "cos",
  step: "step", smoothstep: "smoothstep", clamp: "clamp", pow: "pow",
};

const INPUT_TSL: Record<string, string> = {
  uv: "uv()",
  position: "positionLocal",
  normal: "normalLocal",
  time: "time",
};

/** Append a swizzle when an edge draws from a specific channel pin (texture .r/.g/.b/.a). */
function withPin(expr: string, pin: string | undefined): string {
  return pin && /^[rgbaxyzw]$/.test(pin) ? `${expr}.${pin}` : expr;
}

function litExpr(n: Extract<MatNode, { kind: "const" | "uniform" }>): string {
  const v = n.value;
  if (n.kind === "uniform") return `uniform(${JSON.stringify(v)}) /* ${n.name} */`;
  if (typeof v === "number") return `float(${v})`;
  if (v.length === 2) return `vec2(${v.join(", ")})`;
  return n.type === "color" ? `color(${v.join(", ")})` : `vec3(${v.join(", ")})`;
}

export interface CompileResult {
  /** the generated TSL module body */
  code: string;
  /** uniform name -> initial value, for the material's uniform table */
  uniforms: Record<string, unknown>;
  /** sampler names referenced */
  samplers: string[];
}

export function compileToTSL(g: MaterialGraph): CompileResult {
  const lines: string[] = ['import * as TSL from "three/tsl";', ""];
  const varOf = new Map<string, string>();
  const uniforms: Record<string, unknown> = {};
  const samplers = new Set<string>();
  let seq = 0;

  const inputEdge = (nodeId: string, pin: string) => g.edges.find((e) => e.to === nodeId && e.toPin === pin);

  const emit = (id: string): string => {
    const cached = varOf.get(id);
    if (cached) return cached;
    const node = g.nodes[id];
    if (!node) throw new Error(`compileToTSL: no node "${id}"`);
    const name = `n${seq++}`;
    varOf.set(id, name);

    let expr: string;
    switch (node.kind) {
      case "input":
        expr = `TSL.${INPUT_TSL[node.name] ?? "uv()"}`;
        break;
      case "const":
        expr = `TSL.${litExpr(node)}`;
        break;
      case "uniform":
        uniforms[node.name] = node.value;
        expr = `TSL.uniform(${JSON.stringify(node.value)})`;
        break;
      case "texture":
        samplers.add(node.sampler);
        expr = `TSL.texture(${node.sampler})`;
        break;
      case "op": {
        const arity = OP_ARITY[node.op];
        const args = ["a", "b", "c"].slice(0, arity).map((pin) => {
          const e = inputEdge(id, pin);
          return e ? withPin(emit(e.from), e.fromPin) : "TSL.float(0)";
        });
        expr = `TSL.${TSL_OP[node.op]}(${args.join(", ")})`;
        break;
      }
      case "output":
        expr = "null /* terminal */";
        break;
    }
    lines.push(`const ${name} = ${expr};`);
    return name;
  };

  // walk from the output node's wired slots
  const slots: Record<string, string> = {};
  for (const slot of ["color", "roughness", "metalness", "emissive", "normal", "opacity"]) {
    const e = inputEdge(g.output, slot);
    if (e) slots[slot] = withPin(emit(e.from), e.fromPin);
  }

  lines.push("", "export function applyMaterial(material) {");
  for (const [slot, v] of Object.entries(slots)) {
    lines.push(`  material.${slot}Node = ${v};`);
  }
  lines.push("}", "");

  return { code: lines.join("\n"), uniforms, samplers: [...samplers] };
}
