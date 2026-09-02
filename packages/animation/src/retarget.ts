// Animation retargeting (docs/ANIMATION.md, docs/ENGINE_GAP_ANALYSIS.md §6.4) — remap a clip
// authored for one skeleton onto another with different bone names and proportions, so a
// project can use marketplace / Mixamo animation at scale. Headless and pure: works on plain
// clip/skeleton data, not THREE.AnimationClip, so it runs in a vitest and the same output
// feeds the runtime and an offline bake step.

export type Quat = [number, number, number, number]; // x, y, z, w
export type Vec3 = [number, number, number];

export interface BoneRest {
  name: string;
  /** local rest translation */
  position: Vec3;
  /** local rest rotation */
  quaternion: Quat;
}

export interface ClipTrack {
  /** "<bone>.quaternion" | "<bone>.position" | "<bone>.scale" */
  target: string;
  times: number[];
  /** flat: 4 per keyframe for quaternion, 3 for position/scale */
  values: number[];
}

export interface RetargetClip {
  name: string;
  duration: number;
  tracks: ClipTrack[];
}

export interface SkeletonMap {
  /** source bone name -> target bone name */
  bones: Record<string, string>;
  /** which source bone is the hips/root (for translation scaling) */
  sourceHip?: string;
  targetHip?: string;
}

export interface RetargetOptions {
  /** source skeleton local rest pose, by bone name */
  sourceRest?: Record<string, BoneRest>;
  /** target skeleton local rest pose, by bone name */
  targetRest?: Record<string, BoneRest>;
  /** override the auto hip-height ratio for root translation scaling */
  hipHeightRatio?: number;
}

// ---- quaternion math (minimal) ----------------------------------------------------------------

export function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
export function qConjugate([x, y, z, w]: Quat): Quat {
  return [-x, -y, -z, w];
}
function qNormalize([x, y, z, w]: Quat): Quat {
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

// ---- naming heuristics ----------------------------------------------------------------------

const SYNONYMS: [RegExp, string][] = [
  [/^mixamorig:?/i, ""],
  [/^(bip01|bip001|b_)/i, ""],
  [/upperarm|upper_arm|arm_upper/i, "UpperArm"],
  [/lowerarm|forearm|arm_lower/i, "ForeArm"],
  [/upleg|upperleg|thigh|leg_upper/i, "UpLeg"],
  [/lowerleg|shin|calf|leg_lower/i, "Leg"],
  [/hips?|pelvis|root/i, "Hips"],
  [/spine ?0?1/i, "Spine"],
  [/^l[_.]|left/i, "Left"],
  [/^r[_.]|right/i, "Right"],
];

/** Normalize a bone name toward a canonical token set for auto-mapping. */
export function canonicalizeBoneName(name: string): string {
  let n = name;
  for (const [re, to] of SYNONYMS) n = n.replace(re, to);
  return n.replace(/[_.\s-]/g, "").toLowerCase();
}

/** Best-effort SkeletonMap by matching canonicalized names. Unmatched source bones are omitted. */
export function autoMapSkeleton(sourceBones: string[], targetBones: string[]): SkeletonMap {
  const targetByCanon = new Map(targetBones.map((b) => [canonicalizeBoneName(b), b]));
  const bones: Record<string, string> = {};
  for (const s of sourceBones) {
    const hit = targetByCanon.get(canonicalizeBoneName(s));
    if (hit) bones[s] = hit;
  }
  const findHip = (list: string[]) => list.find((b) => /hips?|pelvis/i.test(b));
  return { bones, sourceHip: findHip(sourceBones), targetHip: findHip(targetBones) };
}

// ---- retarget -----------------------------------------------------------------------------

/**
 * Rename each track's bone via `map`, drop unmapped tracks, rotation-compensate quaternion
 * tracks by the source→target rest-pose delta (`q' = restDelta * q_source`, restDelta =
 * targetRest * sourceRest⁻¹), and scale the hip/root position track by the hip-height ratio so
 * a taller target doesn't sink into the floor.
 */
export function retargetClip(clip: RetargetClip, map: SkeletonMap, opts: RetargetOptions = {}): RetargetClip {
  const hipRatio =
    opts.hipHeightRatio ??
    (opts.sourceRest && opts.targetRest && map.sourceHip && map.targetHip
      ? (opts.targetRest[map.targetHip]?.position[1] ?? 1) / (opts.sourceRest[map.sourceHip]?.position[1] || 1)
      : 1);

  const tracks: ClipTrack[] = [];
  for (const t of clip.tracks) {
    const dot = t.target.lastIndexOf(".");
    const srcBone = t.target.slice(0, dot);
    const prop = t.target.slice(dot + 1);
    const dstBone = map.bones[srcBone];
    if (!dstBone) continue;

    if (prop === "quaternion") {
      let restDelta: Quat | null = null;
      const sr = opts.sourceRest?.[srcBone];
      const tr = opts.targetRest?.[dstBone];
      if (sr && tr) restDelta = qNormalize(qMul(tr.quaternion, qConjugate(sr.quaternion)));
      const values = new Array(t.values.length);
      for (let i = 0; i < t.values.length; i += 4) {
        const q: Quat = [t.values[i]!, t.values[i + 1]!, t.values[i + 2]!, t.values[i + 3]!];
        const out = restDelta ? qNormalize(qMul(restDelta, q)) : q;
        values[i] = out[0]; values[i + 1] = out[1]; values[i + 2] = out[2]; values[i + 3] = out[3];
      }
      tracks.push({ target: `${dstBone}.quaternion`, times: [...t.times], values });
    } else if (prop === "position") {
      const isHip = srcBone === map.sourceHip;
      const scale = isHip ? hipRatio : 1;
      tracks.push({
        target: `${dstBone}.position`,
        times: [...t.times],
        values: t.values.map((v) => v * scale),
      });
    } else {
      tracks.push({ target: `${dstBone}.${prop}`, times: [...t.times], values: [...t.values] });
    }
  }
  return { name: clip.name, duration: clip.duration, tracks };
}
