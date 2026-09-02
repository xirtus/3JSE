// Ready-made MaterialGraphs (docs/RENDERING.md). Each compiles to TSL via compileToTSL and
// evaluates on the CPU via evaluateGraph — so a headless test can assert the blend maths.

import type { MaterialGraph, MatEdge } from "./graph.js";

/**
 * A splat-blended terrain material: `layers` texture samplers blended by the channels of a
 * `splatMap` sampler (r→layer0, g→layer1, b→layer2, a→layer3; layer0 is the base). Feeds
 * @3jse/terrain's `splatToTexture` output. Up to 4 layers (one splat texture).
 */
export function splatTerrainGraph(layers: string[], splatSampler = "splatMap"): MaterialGraph {
  const n = Math.min(4, Math.max(1, layers.length));
  const nodes: MaterialGraph["nodes"] = {
    out: { id: "out", kind: "output" },
    splat: { id: "splat", kind: "texture", sampler: splatSampler },
    rough: { id: "rough", kind: "const", type: "float", value: 0.95 },
  };
  const edges: MatEdge[] = [{ from: "rough", to: "out", toPin: "roughness" }];

  for (let i = 0; i < n; i++) {
    nodes[`tex${i}`] = { id: `tex${i}`, kind: "texture", sampler: layers[i]! };
  }

  // fold: acc = mix(acc, tex_i, splat.<channel_i>) for i = 1..n-1, acc starts at tex0
  const channels = ["g", "b", "a"];
  let acc = "tex0";
  for (let i = 1; i < n; i++) {
    const mixId = `mix${i}`;
    nodes[mixId] = { id: mixId, kind: "op", op: "mix" };
    // mix(a, b, c): a = acc, b = tex_i, c = splat.<channel>
    edges.push({ from: acc, to: mixId, toPin: "a" });
    edges.push({ from: `tex${i}`, to: mixId, toPin: "b" });
    edges.push({ from: "splat", fromPin: channels[i - 1], to: mixId, toPin: "c" });
    acc = mixId;
  }
  edges.push({ from: acc, to: "out", toPin: "color" });

  return { nodes, edges, output: "out" };
}

/** A simple animated water surface: base colour tinted by a moving fresnel-ish term. */
export function waterGraph(): MaterialGraph {
  return {
    output: "out",
    nodes: {
      deep: { id: "deep", kind: "const", type: "color", value: [0.02, 0.12, 0.2] },
      shallow: { id: "shallow", kind: "const", type: "color", value: [0.1, 0.4, 0.5] },
      n: { id: "n", kind: "input", name: "normal" },
      up: { id: "up", kind: "const", type: "vec3", value: [0, 1, 0] },
      facing: { id: "facing", kind: "op", op: "dot" },
      fres: { id: "fres", kind: "op", op: "abs" },
      col: { id: "col", kind: "op", op: "mix" },
      rough: { id: "rough", kind: "const", type: "float", value: 0.05 },
      metal: { id: "metal", kind: "const", type: "float", value: 0 },
      out: { id: "out", kind: "output" },
    },
    edges: [
      { from: "n", to: "facing", toPin: "a" },
      { from: "up", to: "facing", toPin: "b" },
      { from: "facing", to: "fres", toPin: "a" },
      { from: "deep", to: "col", toPin: "a" },
      { from: "shallow", to: "col", toPin: "b" },
      { from: "fres", to: "col", toPin: "c" },
      { from: "col", to: "out", toPin: "color" },
      { from: "rough", to: "out", toPin: "roughness" },
      { from: "metal", to: "out", toPin: "metalness" },
    ],
  };
}
