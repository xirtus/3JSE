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

/**
 * State Machine view (§5.3): one system's declared `stateMachine` as a graph of state nodes and
 * transition edges (labelled with the trigger event / condition). Returns an empty graph if the
 * system has no state machine — "used only where state machines actually are meaningful".
 */
export function stateMachineLens(model: AtlasModel, systemId: string): LensGraph {
  const sys = model.nodes.find((n) => n.id === systemId);
  const sm = sys?.stateMachine;
  if (!sm) return { nodes: [], edges: [] };

  const nodes: AtlasNode[] = sm.states.map((state) => ({
    id: `state:${state}`,
    type: "event",
    label: state,
    domain: sys!.domain,
    status: state === sm.initial ? "healthy" : "unknown",
    healthReasons: state === sm.initial ? ["initial state"] : [],
    owns: [], requires: [], dependents: [], emits: [], listens: [],
    providers: [], assets: [], tests: [], knobs: {},
  }));

  let seq = 0;
  const edges: AtlasEdge[] = sm.transitions.map((t) => ({
    id: `t${seq++}`,
    source: `state:${t.from}`,
    target: `state:${t.to}`,
    kind: "event",
    label: t.on ?? t.when ?? "",
  }));
  return { nodes, edges };
}

/**
 * Gameplay Flow view (§5.2): the ordered player-facing beats each system declares (`flow`),
 * stitched into one left-to-right sequence — design flow, not control flow. A beat shared by
 * several systems is one node; consecutive beats in any system's list become an edge.
 */
export function gameplayFlowLens(model: AtlasModel): LensGraph {
  const beatOrder: string[] = [];
  const contributors = new Map<string, Set<string>>();
  const pairs: [string, string][] = [];

  for (const s of model.nodes) {
    const flow = s.flow ?? [];
    flow.forEach((beat, i) => {
      if (!beatOrder.includes(beat)) beatOrder.push(beat);
      if (!contributors.has(beat)) contributors.set(beat, new Set());
      contributors.get(beat)!.add(s.id);
      if (i > 0) pairs.push([flow[i - 1]!, beat]);
    });
  }

  const seenPair = new Set<string>();
  const uniquePairs = pairs.filter(([a, b]) => {
    const k = `${a}->${b}`;
    if (seenPair.has(k)) return false;
    seenPair.add(k);
    return true;
  });

  const nodes: AtlasNode[] = beatOrder.map((beat) => ({
    id: `beat:${beat}`,
    type: "event",
    label: beat,
    domain: "gameplay",
    status: "unknown",
    healthReasons: [[...(contributors.get(beat) ?? [])].join(", ")],
    owns: [], requires: [], dependents: [], emits: [], listens: [],
    providers: [], assets: [], tests: [], knobs: {},
  }));
  const edges: AtlasEdge[] = uniquePairs.map(([a, b], i) => ({
    id: `f${i}`,
    source: `beat:${a}`,
    target: `beat:${b}`,
    kind: "dependency",
  }));
  return { nodes, edges };
}
