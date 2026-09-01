// System Map layout — docs/3JSE_ATLAS_FULL_PLAN.md §22 (layout rules), §5.1 (System Map).
//
// Deterministic layered DAG placement: dependency edges flow left→right, a node sits one layer
// right of its deepest dependency, and within a layer nodes are ordered stably (by domain, then
// id) so the graph never reshuffles between renders (§22 "automatic layout is default",
// "labels stay horizontal", "dependency direction is consistent"). Not a force graph (§19.1,
// §48.5 forbid that as default).

import type { AtlasNode, AtlasEdge } from "./compile.js";

/** layoutAtlas only needs nodes + edges — an AtlasModel or any lens graph (lenses.ts). */
export interface LayoutInput {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

export interface NodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

export interface AtlasLayout {
  nodes: Record<string, NodeBox>;
  width: number;
  height: number;
  layers: number;
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  layerGap?: number;
  rowGap?: number;
  margin?: number;
}

const DOMAIN_ORDER = [
  "core",
  "world",
  "gameplay",
  "physics",
  "animation",
  "ai",
  "ui",
  "audio",
  "style",
  "providers",
  "assets",
];

export function layoutAtlas(model: LayoutInput, opts: LayoutOptions = {}): AtlasLayout {
  const NODE_W = opts.nodeWidth ?? 200;
  const NODE_H = opts.nodeHeight ?? 84;
  const LAYER_GAP = opts.layerGap ?? 120;
  const ROW_GAP = opts.rowGap ?? 28;
  const MARGIN = opts.margin ?? 40;

  const nodesById = new Map(model.nodes.map((n) => [n.id, n]));
  // Only "dependency" and "provider"/"asset" edges impose left→right flow; event edges are
  // lateral and must not create layers (they're often cyclic).
  const flowEdges = model.edges.filter(
    (e) => e.kind === "dependency" || e.kind === "provider" || e.kind === "asset",
  );
  const incoming = new Map<string, string[]>();
  for (const n of model.nodes) incoming.set(n.id, []);
  for (const e of flowEdges) {
    if (incoming.has(e.target) && nodesById.has(e.source)) incoming.get(e.target)!.push(e.source);
  }

  // Longest-path layering with cycle guard.
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const computeLayer = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle: break at layer 0, don't loop
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const l = parents.length === 0 ? 0 : Math.max(...parents.map((p) => computeLayer(p) + 1));
    visiting.delete(id);
    layer.set(id, l);
    return l;
  };
  for (const n of model.nodes) computeLayer(n.id);

  // Bucket by layer, order within a layer deterministically.
  const buckets = new Map<number, AtlasNode[]>();
  for (const n of model.nodes) {
    const l = layer.get(n.id)!;
    if (!buckets.has(l)) buckets.set(l, []);
    buckets.get(l)!.push(n);
  }
  const domainRank = (d: string) => {
    const i = DOMAIN_ORDER.indexOf(d);
    return i === -1 ? DOMAIN_ORDER.length : i;
  };
  for (const arr of buckets.values()) {
    arr.sort((a, b) => domainRank(a.domain) - domainRank(b.domain) || a.id.localeCompare(b.id));
  }

  const layerCount = buckets.size === 0 ? 0 : Math.max(...buckets.keys()) + 1;
  const maxRows = buckets.size === 0 ? 0 : Math.max(...[...buckets.values()].map((a) => a.length));
  const columnHeight = maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;

  const nodes: Record<string, NodeBox> = {};
  for (let l = 0; l < layerCount; l++) {
    const arr = buckets.get(l) ?? [];
    const colHeight = arr.length * NODE_H + Math.max(0, arr.length - 1) * ROW_GAP;
    const offset = (columnHeight - colHeight) / 2; // vertically center each column
    arr.forEach((n, row) => {
      nodes[n.id] = {
        id: n.id,
        x: MARGIN + l * (NODE_W + LAYER_GAP),
        y: MARGIN + offset + row * (NODE_H + ROW_GAP),
        width: NODE_W,
        height: NODE_H,
        layer: l,
      };
    });
  }

  return {
    nodes,
    width: MARGIN * 2 + Math.max(1, layerCount) * NODE_W + Math.max(0, layerCount - 1) * LAYER_GAP,
    height: MARGIN * 2 + columnHeight,
    layers: layerCount,
  };
}
