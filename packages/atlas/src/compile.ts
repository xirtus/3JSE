// Atlas graph compiler — docs/3JSE_ATLAS_FULL_PLAN.md §40 (data model), §41 (pipeline).
//
// Turns declared semantic systems + FeelSpec + provider/asset/test/runtime evidence into the
// AtlasModel: typed nodes and typed edges. Deterministic and pure — same inputs, same model,
// no fs, no clock. The editor renders this; the agent-context exporter reads it.

import type { AtlasSystemSpec, AtlasDomain } from "./defineSystem.js";
import { knobValue } from "./defineSystem.js";
import { deriveHealth, type SystemEvidence, type HealthStatus } from "./health.js";

export type AtlasNodeType = "system" | "provider" | "asset" | "event";

export type AtlasEdgeKind = "dependency" | "event" | "provider" | "asset" | "ownership";

export interface AtlasNode {
  id: string;
  type: AtlasNodeType;
  label: string;
  domain: AtlasDomain;
  purpose?: string;
  status: HealthStatus;
  healthReasons: string[];
  owns: string[];
  requires: string[];
  dependents: string[];
  emits: string[];
  listens: string[];
  providers: string[];
  assets: string[];
  tests: string[];
  feelSpec?: string;
  mechanic?: string;
  parent?: string;
  /** flattened knob snapshot: name -> current value (§21 node interior, §3.1 direct tuning) */
  knobs: Record<string, number | boolean | string>;
  /** measured cost, ms/frame, when evidence supplied it (§5.9 performance lens) */
  cpuMs?: number;
}

export interface AtlasEdge {
  id: string;
  source: string;
  target: string;
  kind: AtlasEdgeKind;
  /** event name for `kind: "event"`; undefined otherwise */
  label?: string;
}

export interface AtlasModel {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  /** ids that a system referenced but which don't resolve to a node — surfaced, not swallowed */
  dangling: { from: string; ref: string; kind: AtlasEdgeKind }[];
}

export interface ProviderMeta {
  id: string;
  label?: string;
  source?: string;
  license?: string;
  tier?: string;
  capabilities?: string[];
}

export interface AssetMeta {
  id: string;
  label?: string;
  source?: string;
  license?: string;
  triangles?: number;
  textureRes?: number;
}

export interface CompileInput {
  systems: AtlasSystemSpec[];
  /** system id -> harness evidence for health + perf */
  evidence?: Record<string, SystemEvidence>;
  /** provider id -> metadata; unknown provider ids still get a bare node */
  providers?: Record<string, ProviderMeta>;
  /** asset id -> metadata; unknown asset ids still get a bare node */
  assets?: Record<string, AssetMeta>;
  /** include provider/asset nodes + edges (default true). Off = pure system map (§5.1). */
  includeProviders?: boolean;
  includeAssets?: boolean;
}

export function compileAtlas(input: CompileInput): AtlasModel {
  const { systems, evidence = {}, includeProviders = true, includeAssets = true } = input;
  const byId = new Map(systems.map((s) => [s.id, s]));

  // reverse dependency index (§40 `dependents`)
  const dependents = new Map<string, string[]>();
  for (const s of systems) {
    for (const dep of s.requires ?? []) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(s.id);
    }
  }

  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];
  const dangling: AtlasModel["dangling"] = [];
  let edgeSeq = 0;
  const providerIds = new Set<string>();
  const assetIds = new Set<string>();

  for (const s of systems) {
    const ev = evidence[s.id];
    const health = deriveHealth(ev);
    const knobs: Record<string, number | boolean | string> = {};
    for (const [name, k] of Object.entries(s.knobs ?? {})) knobs[name] = knobValue(k);

    nodes.push({
      id: s.id,
      type: "system",
      label: s.label,
      domain: s.domain,
      purpose: s.purpose,
      status: health.status,
      healthReasons: health.reasons,
      owns: s.owns ?? [],
      requires: s.requires ?? [],
      dependents: (dependents.get(s.id) ?? []).slice().sort(),
      emits: s.emits ?? [],
      listens: s.listens ?? [],
      providers: s.providers ?? [],
      assets: s.assets ?? [],
      tests: s.tests ?? [],
      feelSpec: s.feelSpec,
      mechanic: s.mechanic,
      parent: s.parent,
      knobs,
      cpuMs: ev?.cpuMs,
    });

    // dependency edges
    for (const dep of s.requires ?? []) {
      if (byId.has(dep)) {
        edges.push({ id: `e${edgeSeq++}`, source: dep, target: s.id, kind: "dependency" });
      } else {
        dangling.push({ from: s.id, ref: dep, kind: "dependency" });
      }
    }
    for (const p of s.providers ?? []) providerIds.add(p);
    for (const a of s.assets ?? []) assetIds.add(a);
  }

  // event edges: an emitter -> every listener of the same event name (§5.4)
  const listenersByEvent = new Map<string, string[]>();
  for (const s of systems) {
    for (const evName of s.listens ?? []) {
      if (!listenersByEvent.has(evName)) listenersByEvent.set(evName, []);
      listenersByEvent.get(evName)!.push(s.id);
    }
  }
  for (const s of systems) {
    for (const evName of s.emits ?? []) {
      const listeners = listenersByEvent.get(evName) ?? [];
      for (const l of listeners) {
        if (l === s.id) continue;
        edges.push({ id: `e${edgeSeq++}`, source: s.id, target: l, kind: "event", label: evName });
      }
      if (listeners.filter((l) => l !== s.id).length === 0) {
        dangling.push({ from: s.id, ref: evName, kind: "event" });
      }
    }
  }

  // provider nodes + edges
  if (includeProviders) {
    for (const pid of [...providerIds].sort()) {
      const meta = input.providers?.[pid];
      nodes.push({
        id: `provider:${pid}`,
        type: "provider",
        label: meta?.label ?? pid,
        domain: "providers",
        purpose: meta?.capabilities?.length ? `Provides: ${meta.capabilities.join(", ")}` : undefined,
        status: "unknown",
        healthReasons: meta ? [] : ["provider not in registry"],
        owns: [],
        requires: [],
        dependents: systems.filter((s) => (s.providers ?? []).includes(pid)).map((s) => s.id).sort(),
        emits: [],
        listens: [],
        providers: [],
        assets: [],
        tests: [],
        knobs: {},
      });
      for (const s of systems) {
        if ((s.providers ?? []).includes(pid)) {
          edges.push({ id: `e${edgeSeq++}`, source: `provider:${pid}`, target: s.id, kind: "provider" });
        }
      }
    }
  }

  // asset nodes + edges
  if (includeAssets) {
    for (const aid of [...assetIds].sort()) {
      const meta = input.assets?.[aid];
      nodes.push({
        id: `asset:${aid}`,
        type: "asset",
        label: meta?.label ?? aid,
        domain: "assets",
        purpose: meta?.source ? `Source: ${meta.source}${meta.license ? ` (${meta.license})` : ""}` : undefined,
        status: "unknown",
        healthReasons: meta ? [] : ["asset not in registry"],
        owns: [],
        requires: [],
        dependents: systems.filter((s) => (s.assets ?? []).includes(aid)).map((s) => s.id).sort(),
        emits: [],
        listens: [],
        providers: [],
        assets: [],
        tests: [],
        knobs: {},
      });
      for (const s of systems) {
        if ((s.assets ?? []).includes(aid)) {
          edges.push({ id: `e${edgeSeq++}`, source: `asset:${aid}`, target: s.id, kind: "asset" });
        }
      }
    }
  }

  return { nodes, edges, dangling };
}

/** Nodes whose `parent` is `parentId` (or roots when `parentId` is undefined) — progressive
 *  disclosure (§2.2, §23). */
export function childrenOf(model: AtlasModel, parentId: string | undefined): AtlasNode[] {
  return model.nodes.filter((n) => n.parent === parentId);
}

/** Roll a model up to just one domain's systems and the edges between them (§5.1 focus, §24). */
export function focusDomain(model: AtlasModel, domain: AtlasDomain): AtlasModel {
  const keep = new Set(model.nodes.filter((n) => n.domain === domain).map((n) => n.id));
  return {
    nodes: model.nodes.filter((n) => keep.has(n.id)),
    edges: model.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    dangling: model.dangling,
  };
}
