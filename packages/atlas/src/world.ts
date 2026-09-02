// World Graph (docs/3JSE_ATLAS_FULL_PLAN.md §5.10) — region / sub-region hierarchy. A region
// node can expose scenes, quests, music, NPCs, environmental providers, assets, mechanics.

import type { LensGraph } from "./lenses.js";
import type { AtlasNode, AtlasEdge } from "./compile.js";

export interface RegionSpec {
  id: string;
  label: string;
  /** parent region id, or null/undefined for a root */
  parent?: string | null;
  scenes?: string[];
  quests?: string[];
  music?: string[];
  npcs?: string[];
  providers?: string[];
  assets?: string[];
  mechanics?: string[];
}

export class RegionRegistry {
  private readonly regions = new Map<string, RegionSpec>();
  define(spec: RegionSpec): RegionSpec {
    if (this.regions.has(spec.id)) throw new Error(`defineRegion: "${spec.id}" already registered`);
    this.regions.set(spec.id, { ...spec });
    return spec;
  }
  list(): RegionSpec[] {
    return [...this.regions.values()];
  }
  get(id: string): RegionSpec | undefined {
    return this.regions.get(id);
  }
  clear(): void {
    this.regions.clear();
  }
}

export const regionRegistry = new RegionRegistry();
export function defineRegion(spec: RegionSpec): RegionSpec {
  return regionRegistry.define(spec);
}

/** Region nodes + containment edges (parent → child). Node body lists scene/quest counts. */
export function worldLens(regions: RegionSpec[]): LensGraph {
  const ids = new Set(regions.map((r) => r.id));
  const nodes: AtlasNode[] = regions.map((r) => ({
    id: `region:${r.id}`,
    type: "system",
    label: r.label,
    domain: "world",
    purpose: [
      r.scenes?.length ? `${r.scenes.length} scene(s)` : null,
      r.quests?.length ? `${r.quests.length} quest(s)` : null,
      r.npcs?.length ? `${r.npcs.length} NPC(s)` : null,
    ].filter(Boolean).join(" · ") || undefined,
    status: "unknown",
    healthReasons: [],
    owns: r.scenes ?? [],
    requires: r.parent && ids.has(r.parent) ? [`region:${r.parent}`] : [],
    dependents: regions.filter((c) => c.parent === r.id).map((c) => `region:${c.id}`),
    emits: [], listens: [],
    providers: r.providers ?? [],
    assets: r.assets ?? [],
    tests: [],
    mechanic: r.mechanics?.[0],
    knobs: {},
  }));

  let seq = 0;
  const edges: AtlasEdge[] = [];
  for (const r of regions) {
    if (r.parent && ids.has(r.parent)) {
      edges.push({ id: `w${seq++}`, source: `region:${r.parent}`, target: `region:${r.id}`, kind: "ownership" });
    }
  }
  return { nodes, edges };
}
