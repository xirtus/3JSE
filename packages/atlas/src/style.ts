// Style Graph (docs/3JSE_ATLAS_FULL_PLAN.md §5.8) — the game's visual identity as a structured
// system, heavily linked to FeelSpec. `defineStyle` declares it; `styleLens` renders it.

import type { LensGraph } from "./lenses.js";
import type { AtlasNode, AtlasEdge } from "./compile.js";

export interface StyleProfile {
  geometry?: string; // "ps1_n64_modern" | "stylised_lowpoly" | "photoreal" | ...
  shading?: string; // "cel_pbr_hybrid" | "toon" | "pbr"
  water?: { provider?: string; style?: string };
  vegetation?: string;
  lighting?: { profile?: string; saturation?: number; contrast?: number };
  post?: {
    bloom?: number;
    colorGrade?: string;
    chromaticAberration?: number;
    pixelTreatment?: number;
    vignette?: number;
  };
}

const line = (label: string, v: unknown): string | undefined =>
  v === undefined || v === null || v === "" ? undefined : `${label}: ${typeof v === "object" ? JSON.stringify(v) : v}`;

/**
 * A "VISUAL PROFILE" root with a child per declared aspect (Geometry / Shading / Water /
 * Vegetation / Lighting / Post), each carrying its settings in the node body.
 */
export function styleLens(style: StyleProfile): LensGraph {
  const root: AtlasNode = {
    id: "style:root",
    type: "system",
    label: "Visual Profile",
    domain: "style",
    status: "unknown",
    healthReasons: [],
    owns: [], requires: [], dependents: [], emits: [], listens: [],
    providers: [], assets: [], tests: [], knobs: {},
  };

  const aspects: [string, string, string[]][] = [
    ["geometry", "Geometry", [line("profile", style.geometry) ?? "—"]],
    ["shading", "Shading", [line("profile", style.shading) ?? "—"]],
    ["water", "Water", [line("provider", style.water?.provider), line("style", style.water?.style)].filter(Boolean) as string[]],
    ["vegetation", "Vegetation", [line("profile", style.vegetation) ?? "—"]],
    ["lighting", "Lighting", [line("profile", style.lighting?.profile), line("saturation", style.lighting?.saturation), line("contrast", style.lighting?.contrast)].filter(Boolean) as string[]],
    ["post", "Post", Object.entries(style.post ?? {}).map(([k, v]) => `${k}: ${v}`)],
  ];

  const nodes: AtlasNode[] = [root];
  const edges: AtlasEdge[] = [];
  let seq = 0;
  for (const [id, label, body] of aspects) {
    nodes.push({
      id: `style:${id}`,
      type: "system",
      label,
      domain: "style",
      status: "unknown",
      healthReasons: [],
      owns: [], requires: ["style:root"], dependents: [], emits: [], listens: [],
      providers: id === "water" && style.water?.provider ? [style.water.provider] : [],
      assets: [], tests: [],
      knobs: {},
      // reuse purpose to carry the body summary for renderers that only show purpose
      purpose: body.join(" · ") || undefined,
    });
    edges.push({ id: `st${seq++}`, source: "style:root", target: `style:${id}`, kind: "ownership" });
    root.dependents.push(`style:${id}`);
  }
  return { nodes, edges };
}
