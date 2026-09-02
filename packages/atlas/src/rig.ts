// Rig Graph (docs/3JSE_ATLAS_FULL_PLAN.md §5.11) — a semantic view of a rig: Skeleton (bone
// hierarchy grouped by limb), Motion (locomotion / foot IK / look-at / …), Animation (clips).

import type { LensGraph } from "./lenses.js";
import type { AtlasNode, AtlasEdge } from "./compile.js";

export interface RigBone {
  name: string;
  parent?: string | null;
}

export interface RigDef {
  bones: RigBone[];
  /** procedural / constraint layers: "Locomotion", "Foot IK", "Look-at", "Aim", "Lean", ... */
  motion?: string[];
  /** clip names */
  clips?: string[];
  /** retarget quality 0..1, missing-mapping list, etc. — surfaced on the Skeleton node */
  retargetQuality?: number;
  missingMappings?: string[];
}

const LIMB = (name: string): string => {
  const n = name.toLowerCase();
  if (/spine|hips|pelvis|chest|neck|head/.test(n)) return "Spine";
  if (/arm|hand|finger|shoulder|clavicle/.test(n)) return "Arms";
  if (/leg|foot|toe|thigh|shin|calf|knee/.test(n)) return "Legs";
  return "Other";
};

export function rigLens(rig: RigDef): LensGraph {
  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];
  let seq = 0;
  const group = (id: string, label: string, domain: AtlasNode["domain"], body?: string): AtlasNode => ({
    id, type: "system", label, domain, status: "unknown", healthReasons: [],
    owns: [], requires: [], dependents: [], emits: [], listens: [], providers: [], assets: [], tests: [], knobs: {},
    purpose: body,
  });

  const skeleton = group("rig:skeleton", "Skeleton", "animation",
    rig.retargetQuality != null ? `retarget quality ${(rig.retargetQuality * 100) | 0}%${rig.missingMappings?.length ? ` · ${rig.missingMappings.length} missing` : ""}` : `${rig.bones.length} bones`);
  const motionRoot = group("rig:motion", "Motion", "animation");
  const animRoot = group("rig:animation", "Animation", "animation");
  nodes.push(skeleton, motionRoot, animRoot);

  // limb groups under Skeleton, with a bone count each
  const limbs = new Map<string, number>();
  for (const b of rig.bones) limbs.set(LIMB(b.name), (limbs.get(LIMB(b.name)) ?? 0) + 1);
  for (const [limb, count] of limbs) {
    const id = `rig:limb:${limb}`;
    nodes.push(group(id, limb, "animation", `${count} bone(s)`));
    edges.push({ id: `r${seq++}`, source: "rig:skeleton", target: id, kind: "ownership" });
  }

  for (const m of rig.motion ?? []) {
    const id = `rig:motion:${m}`;
    nodes.push(group(id, m, "animation"));
    edges.push({ id: `r${seq++}`, source: "rig:motion", target: id, kind: "ownership" });
  }
  for (const c of rig.clips ?? []) {
    const id = `rig:clip:${c}`;
    nodes.push(group(id, c, "animation"));
    edges.push({ id: `r${seq++}`, source: "rig:animation", target: id, kind: "ownership" });
  }
  return { nodes, edges };
}
