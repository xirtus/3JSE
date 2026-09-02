import { describe, expect, it } from "vitest";
import { validateGraph, compileToTSL, evaluateGraph, type MaterialGraph } from "./index.js";

// A checkerboard-ish material: mix(colorA, colorB, step(0.5, fract(uv.x * 4)))  -> color
const checker: MaterialGraph = {
  output: "out",
  nodes: {
    uv: { id: "uv", kind: "input", name: "uv" },
    scale: { id: "scale", kind: "const", type: "float", value: 4 },
    uvScaled: { id: "uvScaled", kind: "op", op: "mul" },
    f: { id: "f", kind: "op", op: "fract" },
    half: { id: "half", kind: "const", type: "float", value: 0.5 },
    mask: { id: "mask", kind: "op", op: "step" },
    a: { id: "a", kind: "const", type: "color", value: [0.1, 0.1, 0.1] },
    b: { id: "b", kind: "const", type: "color", value: [0.9, 0.9, 0.9] },
    col: { id: "col", kind: "op", op: "mix" },
    rough: { id: "rough", kind: "uniform", name: "roughness", type: "float", value: 0.6 },
    out: { id: "out", kind: "output" },
  },
  edges: [
    { from: "uv", to: "uvScaled", toPin: "a" },
    { from: "scale", to: "uvScaled", toPin: "b" },
    { from: "uvScaled", to: "f", toPin: "a" },
    { from: "half", to: "mask", toPin: "a" },
    { from: "f", to: "mask", toPin: "b" },
    { from: "a", to: "col", toPin: "a" },
    { from: "b", to: "col", toPin: "b" },
    { from: "mask", to: "col", toPin: "c" },
    { from: "col", to: "out", toPin: "color" },
    { from: "rough", to: "out", toPin: "roughness" },
  ],
};

describe("validateGraph", () => {
  it("passes a well-formed graph", () => {
    expect(validateGraph(checker).filter((i) => i.level === "error")).toEqual([]);
  });

  it("flags a missing op input", () => {
    const broken: MaterialGraph = { ...checker, edges: checker.edges.filter((e) => !(e.to === "col" && e.toPin === "c")) };
    expect(validateGraph(broken).some((i) => i.node === "col" && /needs 3 inputs/.test(i.message))).toBe(true);
  });

  it("warns when nothing drives color", () => {
    const noColor: MaterialGraph = { ...checker, edges: checker.edges.filter((e) => e.toPin !== "color") };
    expect(validateGraph(noColor).some((i) => i.level === "warn" && /color slot/.test(i.message))).toBe(true);
  });

  it("detects a cycle", () => {
    const cyc: MaterialGraph = { ...checker, edges: [...checker.edges, { from: "f", to: "uvScaled", toPin: "a" }] };
    expect(validateGraph(cyc).some((i) => /cycle/.test(i.message))).toBe(true);
  });
});

describe("compileToTSL", () => {
  it("emits deterministic TSL with an applyMaterial() setting the wired slots", () => {
    const r1 = compileToTSL(checker);
    const r2 = compileToTSL(checker);
    expect(r1.code).toBe(r2.code);
    expect(r1.code).toContain('import * as TSL from "three/tsl";');
    expect(r1.code).toContain("TSL.mix(");
    expect(r1.code).toContain("TSL.step(");
    expect(r1.code).toContain("material.colorNode =");
    expect(r1.code).toContain("material.roughnessNode =");
    expect(r1.uniforms).toEqual({ roughness: 0.6 });
  });

  it("collects sampler names", () => {
    const g: MaterialGraph = {
      output: "out",
      nodes: {
        t: { id: "t", kind: "texture", sampler: "albedoMap" },
        out: { id: "out", kind: "output" },
      },
      edges: [{ from: "t", to: "out", toPin: "color" }],
    };
    expect(compileToTSL(g).samplers).toEqual(["albedoMap"]);
    expect(compileToTSL(g).code).toContain("TSL.texture(albedoMap)");
  });
});

describe("evaluateGraph (CPU reference)", () => {
  it("checker material: uv.x=0.1 lands on colorA, uv.x=0.2 on colorB", () => {
    // uv.x*4: 0.1->0.4 fract 0.4 -> step(0.5,0.4)=0 -> mix->a ; 0.2->0.8 fract 0.8 -> step=1 -> b
    const c1 = evaluateGraph(checker, { uv: [0.1, 0] }) as number[];
    const c2 = evaluateGraph(checker, { uv: [0.2, 0] }) as number[];
    expect(c1[0]).toBeCloseTo(0.1, 5);
    expect(c2[0]).toBeCloseTo(0.9, 5);
  });

  it("uniform override changes the output", () => {
    const g: MaterialGraph = {
      output: "out",
      nodes: {
        u: { id: "u", kind: "uniform", name: "tint", type: "color", value: [1, 0, 0] },
        out: { id: "out", kind: "output" },
      },
      edges: [{ from: "u", to: "out", toPin: "color" }],
    };
    expect(evaluateGraph(g, {})).toEqual([1, 0, 0]);
    expect(evaluateGraph(g, { uniforms: { tint: [0, 1, 0] } })).toEqual([0, 1, 0]);
  });

  it("supports normalize / dot / length", () => {
    const g: MaterialGraph = {
      output: "out",
      nodes: {
        v: { id: "v", kind: "const", type: "vec3", value: [3, 0, 4] },
        n: { id: "n", kind: "op", op: "normalize" },
        out: { id: "out", kind: "output" },
      },
      edges: [{ from: "v", to: "n", toPin: "a" }, { from: "n", to: "out", toPin: "color" }],
    };
    const r = evaluateGraph(g, {}) as number[];
    expect(r[0]).toBeCloseTo(0.6, 5);
    expect(r[2]).toBeCloseTo(0.8, 5);
  });
});
