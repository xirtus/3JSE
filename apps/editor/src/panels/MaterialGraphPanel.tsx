import { useMemo, useState } from "react";
import { validateGraph, compileToTSL, evaluateGraph, type MaterialGraph } from "@3jse/materials";
import type { EditorContext } from "./types.js";

// A worked sample: mix(dark, light, step(0.5, fract(uv.x * scale))) -> a checkerboard stripe.
const sample: MaterialGraph = {
  output: "out",
  nodes: {
    uv: { id: "uv", kind: "input", name: "uv" },
    scale: { id: "scale", kind: "uniform", name: "scale", type: "float", value: 8 },
    uvScaled: { id: "uvScaled", kind: "op", op: "mul" },
    f: { id: "f", kind: "op", op: "fract" },
    half: { id: "half", kind: "const", type: "float", value: 0.5 },
    mask: { id: "mask", kind: "op", op: "step" },
    dark: { id: "dark", kind: "const", type: "color", value: [0.05, 0.06, 0.09] },
    light: { id: "light", kind: "uniform", name: "tint", type: "color", value: [0.9, 0.7, 0.3] },
    col: { id: "col", kind: "op", op: "mix" },
    rough: { id: "rough", kind: "const", type: "float", value: 0.55 },
    out: { id: "out", kind: "output" },
  },
  edges: [
    { from: "uv", to: "uvScaled", toPin: "a" },
    { from: "scale", to: "uvScaled", toPin: "b" },
    { from: "uvScaled", to: "f", toPin: "a" },
    { from: "half", to: "mask", toPin: "a" },
    { from: "f", to: "mask", toPin: "b" },
    { from: "dark", to: "col", toPin: "a" },
    { from: "light", to: "col", toPin: "b" },
    { from: "mask", to: "col", toPin: "c" },
    { from: "col", to: "out", toPin: "color" },
    { from: "rough", to: "out", toPin: "roughness" },
  ],
};

/**
 * docs/RENDERING.md / docs/EDITOR.md Material Graph — over the real `@3jse/materials` package.
 * Left: the node list + validation. Right: the compiled TSL (what actually ships), and a live
 * CPU-evaluated 16-wide preview strip using the same `evaluateGraph` a headless visual test
 * uses. Editing the uniforms re-evaluates immediately.
 */
export function MaterialGraphPanel(_: { ctx: EditorContext }) {
  const [scale, setScale] = useState(8);
  const [tint, setTint] = useState<[number, number, number]>([0.9, 0.7, 0.3]);

  const graph = useMemo(() => {
    const g = structuredClone(sample) as MaterialGraph;
    (g.nodes.scale as { value: number }).value = scale;
    (g.nodes.light as { value: [number, number, number] }).value = tint;
    return g;
  }, [scale, tint]);

  const issues = useMemo(() => validateGraph(graph), [graph]);
  const tsl = useMemo(() => compileToTSL(graph), [graph]);
  const strip = useMemo(
    () => Array.from({ length: 24 }, (_, i) => evaluateGraph(graph, { uv: [i / 24, 0.5], uniforms: { scale, tint } }) as number[]),
    [graph, scale, tint],
  );

  return (
    <div style={{ display: "flex", height: "100%", fontSize: 12, overflow: "auto" }}>
      <div style={{ flex: "0 0 260px", padding: 10, borderRight: "1px solid #333" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Nodes ({Object.keys(graph.nodes).length})</div>
        {Object.values(graph.nodes).map((n) => (
          <div key={n.id} style={{ color: "#a8a8ac", padding: "1px 0" }}>
            <code>{n.id}</code> · {n.kind}{"op" in n ? ` (${n.op})` : ""}
          </div>
        ))}
        <div style={{ fontWeight: 700, color: "#f5f5f7", margin: "10px 0 4px" }}>Validation</div>
        {issues.length === 0 ? (
          <span style={{ color: "#22c55e" }}>● no issues</span>
        ) : (
          issues.map((i, k) => (
            <div key={k} style={{ color: i.level === "error" ? "#ef4444" : "#f59e0b" }}>{i.level}: {i.message}</div>
          ))
        )}
        <div style={{ fontWeight: 700, color: "#f5f5f7", margin: "10px 0 4px" }}>Uniforms</div>
        <label style={{ color: "#8a8a8e" }}>scale</label>
        <input type="range" min={1} max={32} step={1} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ width: "100%" }} />
        <label style={{ color: "#8a8a8e" }}>tint R/G/B</label>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((c) => (
            <input key={c} type="range" min={0} max={1} step={0.05} value={tint[c]}
              onChange={(e) => setTint((t) => t.map((v, i) => (i === c ? Number(e.target.value) : v)) as [number, number, number])}
              style={{ flex: 1 }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: 10, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 4 }}>CPU preview (evaluateGraph at uv.x = 0…1)</div>
        <div style={{ display: "flex", height: 40, border: "1px solid #333", marginBottom: 10 }}>
          {strip.map((c, i) => (
            <div key={i} style={{ flex: 1, background: `rgb(${c.map((v) => Math.round(v * 255)).join(",")})` }} />
          ))}
        </div>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 4 }}>Compiled TSL (this ships — zero interpreter)</div>
        <pre style={{ background: "#111", color: "#cfcfd2", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 300, fontSize: 11 }}>
          {tsl.code}
        </pre>
        <p style={{ color: "#8a8a8e" }}>uniforms: {JSON.stringify(tsl.uniforms)} · samplers: {tsl.samplers.join(", ") || "none"}</p>
      </div>
    </div>
  );
}
