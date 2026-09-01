// Atlas lenses — docs/3JSE_ATLAS_FULL_PLAN.md §5. "Multiple visual lenses over the same
// project. Users switch views rather than encoding everything into one graph." Each lens is a
// pure transform of the compiled AtlasModel into a smaller, purpose-shaped graph.

import type { AtlasModel, AtlasNode, AtlasEdge } from "./compile.js";

export interface LensGraph {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

/**
 * Event / Signal view (§5.4): systems and the event names flowing between them. Event names
 * become their own nodes (domain "core"), so `emit` -> event -> `listen` reads as a chain, and
 * an event with no listener (or no emitter) is visibly dangling.
 */
export function eventLens(model: AtlasModel): LensGraph {
  const systems = model.nodes.filter((n) => n.type === "system" && (n.emits.length || n.listens.length));
  const eventNames = new Set<string>();
  for (const s of systems) {
    for (const e of s.emits) eventNames.add(e);
    for (const e of s.listens) eventNames.add(e);
  }

  const eventNodes: AtlasNode[] = [...eventNames].sort().map((name) => ({
    id: `event:${name}`,
    type: "event",
    label: name,
    domain: "core",
    status: "unknown",
    healthReasons: [],
    owns: [],
    requires: [],
    dependents: [],
    emits: [],
    listens: [],
    providers: [],
    assets: [],
    tests: [],
    knobs: {},
  }));

  let seq = 0;
  const edges: AtlasEdge[] = [];
  for (const s of systems) {
    for (const e of s.emits) edges.push({ id: `ev${seq++}`, source: s.id, target: `event:${e}`, kind: "event", label: "emits" });
    for (const e of s.listens) edges.push({ id: `ev${seq++}`, source: `event:${e}`, target: s.id, kind: "event", label: "listens" });
  }
  return { nodes: [...systems.map(stripLinks), ...eventNodes], edges };
}

/**
 * Performance view (§5.9): only systems that have a measured `cpuMs`, ranked, with the
 * dependency edges among them kept so a hotspot's upstream is visible. `weight` on each edge is
 * the target's cost, so a renderer can size arcs by where the time goes.
 */
export function performanceLens(model: AtlasModel): LensGraph {
  const measured = model.nodes
    .filter((n) => n.type === "system" && n.cpuMs != null)
    .sort((a, b) => (b.cpuMs ?? 0) - (a.cpuMs ?? 0));
  const keep = new Set(measured.map((n) => n.id));
  const edges = model.edges
    .filter((e) => e.kind === "dependency" && keep.has(e.source) && keep.has(e.target))
    .map((e) => ({ ...e }));
  return { nodes: measured, edges };
}

/** Provider view (§5.7): provider nodes + the systems built on each, nothing else. */
export function providerLens(model: AtlasModel): LensGraph {
  const providers = model.nodes.filter((n) => n.type === "provider");
  const users = new Set(providers.flatMap((p) => p.dependents));
  const nodes = [...providers, ...model.nodes.filter((n) => users.has(n.id))];
  const keep = new Set(nodes.map((n) => n.id));
  return { nodes, edges: model.edges.filter((e) => e.kind === "provider" && keep.has(e.source) && keep.has(e.target)) };
}

/** Asset view (§5.6): asset nodes + the systems that need each. */
export function assetLens(model: AtlasModel): LensGraph {
  const assets = model.nodes.filter((n) => n.type === "asset");
  const users = new Set(assets.flatMap((a) => a.dependents));
  const nodes = [...assets, ...model.nodes.filter((n) => users.has(n.id))];
  const keep = new Set(nodes.map((n) => n.id));
  return { nodes, edges: model.edges.filter((e) => e.kind === "asset" && keep.has(e.source) && keep.has(e.target)) };
}

function stripLinks(n: AtlasNode): AtlasNode {
  // In the event lens the requires/dependency edges are noise — keep the node, drop its
  // structural link lists so a layout doesn't try to lay them out.
  return { ...n, requires: [], dependents: [] };
}
