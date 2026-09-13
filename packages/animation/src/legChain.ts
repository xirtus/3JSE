import { Quaternion, Vector3 } from "three";

// Leg-chain IK — a port of Daniel Holden's "Inverse Kinematics and Foot Locking"
// (theorangeduck.com/page/inverse-kinematics-foot-locking, MIT, 2024). The solver
// positions the toe at a target while preserving the input pose as much as possible:
// 1) find a heel target from the toe target + the pose's toe->heel offset, 2) solve
// two-bone IK (hip/knee) with a soft max-extension clamp and a knee side-vector
// (no pole vector), 3) re-orient the heel toward the toe, 4) re-orient the toe-end,
// optionally clamping heights to the ground plane. Pure math on plain transforms —
// the same "layered on top of the base pose, no scene graph" posture as TwoBoneIK.

export interface BoneTransform {
  /** local/world translation */
  translation: Vector3;
  /** local/world rotation */
  rotation: Quaternion;
}

export interface Skeleton {
  /** parent index per bone; -1 for roots */
  parents: Int32Array;
  /** local transforms, one per bone (mutable) */
  local: BoneTransform[];
  /** global transforms, one per bone (recomputed by forwardKinematics) */
  global: BoneTransform[];
}

/** Standard forward kinematics over a parent-indexed skeleton. Local translation is rotated by
 *  the parent's global rotation then added to the parent's global translation; global rotation is
 *  parent.global * local. Matches THREE.Object3D's updateMatrixWorld composition order. */
export function forwardKinematics(skel: Skeleton): void {
  for (let i = 0; i < skel.parents.length; i++) {
    const p = skel.parents[i]!;
    const local = skel.local[i]!;
    const g = skel.global[i]!;
    if (p < 0) {
      g.translation.copy(local.translation);
      g.rotation.copy(local.rotation);
    } else {
      const pg = skel.global[p]!;
      g.translation.copy(local.translation).applyQuaternion(pg.rotation).add(pg.translation);
      g.rotation.copy(pg.rotation).multiply(local.rotation);
    }
  }
}

export interface LegBoneIndices {
  pelvis: number;
  hip: number;
  knee: number;
  heel: number;
  toe: number;
  toeEnd: number;
}

export interface LegChainOptions {
  /** clamp targets to bind-pose ground heights (y) */
  enableHeightClamp?: boolean;
  /** re-orient the heel joint toward the toe target */
  enableHeelLookAt?: boolean;
  /** re-orient the toe-end toward a height-clamped target */
  enableToeLookAt?: boolean;
  heelMinHeight?: number;
  toeMinHeight?: number;
  toeEndMinHeight?: number;
  /** distance within which the target is softly clamped toward maxExtension (meters) */
  softening?: number;
  /** local-space knee side vector (world-space side = rotate by knee global rotation) */
  kneeSideVector?: Vector3;
}

export interface LegChainResult {
  targetToe: Vector3;
  targetHeel: Vector3;
  targetToeEnd: Vector3;
}

const EPS = 1e-6;

function qMul(a: Quaternion, b: Quaternion): Quaternion {
  return a.clone().multiply(b);
}

function qInv(a: Quaternion): Quaternion {
  return a.clone().invert();
}

/** Quaternion for a rotation of angle `v.length()` around axis `v/|v|` (the exp-map form). */
function quaternionFromScaledAngleAxis(v: Vector3): Quaternion {
  const angle = v.length();
  if (angle < 1e-8) return new Quaternion();
  return new Quaternion().setFromAxisAngle(v.clone().normalize(), angle);
}

/** Shortest-arc quaternion rotating `p` onto `q`. */
function quaternionBetween(p: Vector3, q: Vector3): Quaternion {
  if (p.lengthSq() < 1e-12 || q.lengthSq() < 1e-12) return new Quaternion();
  return new Quaternion().setFromUnitVectors(p.clone().normalize(), q.clone().normalize());
}

/** Rotation that orients `bone` so its child joint aims at `target`, expressed in the parent's
 *  local frame. Preserves the bone's current rotation otherwise. */
function boneOrientTowards(
  skel: Skeleton,
  parentIdx: number,
  boneIdx: number,
  childIdx: number,
  target: Vector3,
): Quaternion {
  const parent = skel.global[parentIdx]!;
  const bone = skel.global[boneIdx]!;
  const child = skel.global[childIdx]!;
  const between = quaternionBetween(
    child.translation.clone().sub(bone.translation),
    target.clone().sub(bone.translation),
  );
  const desired = qMul(between, bone.rotation);
  return qMul(qInv(parent.rotation), desired);
}

/**
 * Two-bone IK that writes local hip/knee rotations (softly extension-clamped, side-vector
 * axis — no pole vector), reading the skeleton's *current* global transforms.
 */
function twoBoneInverseKinematics(
  skel: Skeleton,
  pelvisIdx: number,
  hipIdx: number,
  kneeIdx: number,
  heelIdx: number,
  targetHeel: Vector3,
  sideVector: Vector3,
  maxExtension: number,
  softening: number,
): void {
  const pelvis = skel.global[pelvisIdx]!;
  const hip = skel.global[hipIdx]!;
  const knee = skel.global[kneeIdx]!;
  const heel = skel.global[heelIdx]!;

  // Softly clamp the target to never exceed maxExtension (prevents hyper-extension).
  let targetClamp = targetHeel.clone();
  const targetLength = targetHeel.distanceTo(hip.translation);
  if (targetLength > maxExtension - softening) {
    const saturation = 1 - Math.exp(-Math.max(targetLength - maxExtension + softening, 0) / softening);
    const scale = (maxExtension - softening + softening * saturation) / targetLength;
    targetClamp = hip.translation.clone().addScaledVector(targetHeel.clone().sub(hip.translation), scale);
  }

  const axisDwn = heel.translation.clone().sub(hip.translation).normalize();
  const axisFwd = new Vector3().crossVectors(axisDwn, sideVector).normalize();
  const axisRot = new Vector3().crossVectors(axisDwn, axisFwd).normalize();

  const a = hip.translation;
  const b = knee.translation;
  const c = heel.translation;
  const t = targetClamp;

  const lab = b.distanceTo(a);
  const lcb = b.distanceTo(c);
  const lat = t.distanceTo(a);
  const lca = a.distanceTo(c);

  const clampDot = (v: number) => Math.min(Math.max(v, -1), 1);
  const acab0 = Math.acos(clampDot(c.clone().sub(a).multiplyScalar(1 / lca).dot(b.clone().sub(a).multiplyScalar(1 / lab))));
  const babc0 = Math.acos(clampDot(a.clone().sub(b).multiplyScalar(1 / lab).dot(c.clone().sub(b).multiplyScalar(1 / lcb))));
  const acab1 = Math.acos(clampDot((lab * lab + lat * lat - lcb * lcb) / (2 * lab * lat)));
  const babc1 = Math.acos(clampDot((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb)));

  const r0 = quaternionFromScaledAngleAxis(axisRot.clone().multiplyScalar(acab1 - acab0));
  const r1 = quaternionFromScaledAngleAxis(axisRot.clone().multiplyScalar(babc1 - babc0));
  const r2 = quaternionBetween(
    heel.translation.clone().sub(hip.translation),
    targetClamp.clone().sub(hip.translation),
  ).normalize();

  // local = (parentGlobal⁻¹ · r2 · r0) · hipGlobal, reading the original globals.
  skel.local[hipIdx]!.rotation.copy(qMul(qMul(qMul(qInv(pelvis.rotation), r2), r0), hip.rotation));
  skel.local[kneeIdx]!.rotation.copy(qMul(qMul(qInv(hip.rotation), r1), knee.rotation));
}

/**
 * Solve a whole leg chain so the toe reaches `target`. Mutates local hip/knee/heel/toe rotations
 * and recomputes global transforms. Returns the (possibly height-clamped) toe/heel/toe-end
 * targets so a caller can feed them back into foot locking or record them.
 */
export function solveLegChain(
  skel: Skeleton,
  idx: LegBoneIndices,
  target: Vector3,
  opts: LegChainOptions = {},
): LegChainResult {
  const softening = opts.softening ?? 0.005;
  const kneeSideVector = opts.kneeSideVector ?? new Vector3(1, 0, 0);
  const enableHeightClamp = opts.enableHeightClamp ?? true;
  const enableHeelLookAt = opts.enableHeelLookAt ?? true;
  const enableToeLookAt = opts.enableToeLookAt ?? true;
  const heelMinHeight = opts.heelMinHeight ?? 0;
  const toeMinHeight = opts.toeMinHeight ?? 0;
  const toeEndMinHeight = opts.toeEndMinHeight ?? 0;

  forwardKinematics(skel);

  const targetToe = target.clone();
  if (enableHeightClamp) targetToe.y = Math.max(targetToe.y, toeMinHeight);

  // Heel target = toe target + the pose's (heel - toe) offset.
  const targetHeel = targetToe
    .clone()
    .add(skel.global[idx.heel]!.translation.clone().sub(skel.global[idx.toe]!.translation));
  if (enableHeightClamp) targetHeel.y = Math.max(targetHeel.y, heelMinHeight);

  const sideVector = kneeSideVector.clone().applyQuaternion(skel.global[idx.knee]!.rotation);
  const maxExtension = skel.global[idx.hip]!.translation.distanceTo(skel.global[idx.heel]!.translation);

  twoBoneInverseKinematics(
    skel,
    idx.pelvis,
    idx.hip,
    idx.knee,
    idx.heel,
    targetHeel,
    sideVector,
    maxExtension,
    softening,
  );

  if (enableHeelLookAt) {
    forwardKinematics(skel);
    skel.local[idx.heel]!.rotation.copy(boneOrientTowards(skel, idx.knee, idx.heel, idx.toe, targetToe));
  }

  let targetToeEnd: Vector3 | undefined;
  if (enableToeLookAt) {
    forwardKinematics(skel);
    targetToeEnd = skel.global[idx.toeEnd]!.translation.clone();
    if (enableHeightClamp) targetToeEnd.y = Math.max(targetToeEnd.y, toeEndMinHeight);
    skel.local[idx.toe]!.rotation.copy(boneOrientTowards(skel, idx.heel, idx.toe, idx.toeEnd, targetToeEnd));
  }

  forwardKinematics(skel);
  targetToeEnd = targetToeEnd ?? skel.global[idx.toeEnd]!.translation.clone();
  return { targetToe, targetHeel, targetToeEnd };
}

/** Build a helper Skeleton from a flat list of (local translation, local rotation, parentIndex).
 *  Global transforms are initialized to identity; call forwardKinematics first. */
export function makeSkeleton(bones: { translation: Vector3; rotation: Quaternion; parent: number }[]): Skeleton {
  return {
    parents: Int32Array.from(bones.map((b) => b.parent)),
    local: bones.map((b) => ({ translation: b.translation.clone(), rotation: b.rotation.clone() })),
    global: bones.map(() => ({ translation: new Vector3(), rotation: new Quaternion() })),
  };
}
