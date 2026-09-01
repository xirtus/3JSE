// Agent task-context exporter — docs/3JSE_ATLAS_FULL_PLAN.md §28, §29.
//
// "Atlas should never dump the entire project into the agent context." Selecting a node +
// stating an intent produces a narrowly-scoped context package: the target system, its
// immediate neighbours, the files/tests it owns, its FeelSpec, and a pointer to runtime
// evidence. The agent gets only this, plus harness access if it needs more (§28).

import type { AtlasModel } from "./compile.js";

export type AgentAction =
  | "explain"
  | "modify"
  | "tune"
  | "optimize"
  | "repair"
  | "replace"
  | "compare"
  | "document";

export interface AgentContextPackage {
  system: string;
  action: AgentAction;
  intent: string;
  /** immediate graph neighbours (depends-on + depended-by + linked providers/assets), ids only */
  neighbors: string[];
  /** files the target system and its neighbours own — the agent's edit scope */
  files: string[];
  /** tests that gate the change */
  tests: string[];
  /** provider ids in scope (for `replace`) */
  providers: string[];
  /** asset ids in scope */
  assets: string[];
  /** FeelSpec profile id, when the system has one */
  feelSpec?: string;
  /** knob snapshot the agent must not silently break (protected-intent hint, §13) */
  knobs: Record<string, number | boolean | string>;
  /** opaque pointer to a recorded trace / perf report the caller attaches (§28 runtimeEvidence) */
  runtimeEvidence?: string;
  /** health at export time, so the agent knows if it's walking into a failing system */
  status: string;
  healthReasons: string[];
}

export interface ExportOptions {
  action?: AgentAction;
  /** how many hops of neighbours to include (default 1 — §28 shows exactly the 1-ring) */
  depth?: number;
  runtimeEvidence?: string;
  /** also pull in neighbours' files (default true) — the agent usually needs to read them */
  includeNeighborFiles?: boolean;
}

export function exportAgentContext(
  model: AtlasModel,
  nodeId: string,
  intent: string,
  opts: ExportOptions = {},
): AgentContextPackage {
  const node = model.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`exportAgentContext: no node "${nodeId}"`);

  const depth = opts.depth ?? 1;
  const includeNeighborFiles = opts.includeNeighborFiles ?? true;

  // BFS over undirected edges out to `depth`.
  const adj = new Map<string, Set<string>>();
  for (const n of model.nodes) adj.set(n.id, new Set());
  for (const e of model.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const ring = new Set<string>();
  let frontier = new Set<string>([nodeId]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (nb !== nodeId && !ring.has(nb)) { ring.add(nb); next.add(nb); }
      }
    }
    frontier = next;
  }

  const neighbors = [...ring].sort();
  const nodesById = new Map(model.nodes.map((n) => [n.id, n]));
  const scopeNodes = [node, ...(includeNeighborFiles ? neighbors.map((id) => nodesById.get(id)!).filter(Boolean) : [])];

  const files = uniqSorted(scopeNodes.flatMap((n) => n.owns));
  const tests = uniqSorted([node, ...neighbors.map((id) => nodesById.get(id)!).filter(Boolean)].flatMap((n) => n.tests));
  const providers = uniqSorted([node.providers, ...neighbors.map((id) => nodesById.get(id)?.providers ?? [])].flat());
  const assets = uniqSorted([node.assets, ...neighbors.map((id) => nodesById.get(id)?.assets ?? [])].flat());

  return {
    system: nodeId,
    action: opts.action ?? "modify",
    intent,
    neighbors,
    files,
    tests,
    providers,
    assets,
    feelSpec: node.feelSpec,
    knobs: node.knobs,
    runtimeEvidence: opts.runtimeEvidence,
    status: node.status,
    healthReasons: node.healthReasons,
  };
}

/** The §30 "proposed change" preview — what a task against `nodeId` would touch, before running. */
export function previewChange(model: AtlasModel, nodeId: string): {
  modify: string;
  affected: string[];
  fileCount: number;
  testCount: number;
  risk: "low" | "medium" | "high";
} {
  const ctx = exportAgentContext(model, nodeId, "", { depth: 1 });
  const affected = ctx.neighbors;
  // Risk tracks how far a change ripples (neighbours) with a secondary nudge from edit surface
  // (files). A tight 1-ring with a handful of files is low; a wide ring or a large surface is not.
  const risk: "low" | "medium" | "high" =
    affected.length <= 2 && ctx.files.length <= 4
      ? "low"
      : affected.length <= 5 && ctx.files.length <= 10
        ? "medium"
        : "high";
  return { modify: nodeId, affected, fileCount: ctx.files.length, testCount: ctx.tests.length, risk };
}

function uniqSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
