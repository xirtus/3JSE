import { Quaternion, Vector3 } from "three";

/** docs/ANIMATION.md: "IK nodes: two-bone IK (limbs), look-at (head/torso aim), and
 *  foot-placement/ground-adaption solvers, layered on top of the base pose produced by the
 *  state machine." This is the two-bone solver — the standard three-joint (root/mid/end),
 *  two-bone-length (root-mid, mid-end) chain used for arms and legs.
 *
 *  Operates on plain world-space positions rather than live Object3D bones, so the geometry is
 *  independently testable without a scene graph. A caller applies the result to real bones by
 *  setting mid/end world positions (or deriving local rotations from them) after the base pose
 *  has been evaluated for the frame — "layered on top", per the doc. */

export interface TwoBoneIKInput {
  /** World-space position of the root joint (e.g. shoulder/hip). Does not move. */
  rootPos: Vector3;
  /** World-space position of the mid joint (e.g. elbow/knee) in the current base pose. */
  midPos: Vector3;
  /** World-space position of the end joint (e.g. hand/foot) in the current base pose. */
  endPos: Vector3;
  /** World-space position the end effector should reach. */
  target: Vector3;
  /** World-space position used only to pick which side the mid joint bends toward (e.g. a
   *  point in front of the knee/elbow). Does not need to be reachable or exact. */
  poleTarget: Vector3;
}

export interface TwoBoneIKResult {
  /** Solved world-space position for the mid joint. */
  midPos: Vector3;
  /** Solved world-space position for the end joint. */
  endPos: Vector3;
  /** True if `target` was within [|L1-L2|, L1+L2] of `rootPos` — the chain reached it exactly.
   *  False means the chain fully extended/contracted toward `target` without reaching it. */
  reached: boolean;
}

const EPSILON = 1e-6;

/** Rotate `v` by `angle` radians around unit `axis`, matching the right-hand rule. */
function rotateAroundAxis(v: Vector3, axis: Vector3, angle: number): Vector3 {
  return v.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle));
}

export function solveTwoBoneIK(input: TwoBoneIKInput): TwoBoneIKResult {
  const { rootPos, target, poleTarget } = input;
  const boneLen1 = input.rootPos.distanceTo(input.midPos);
  const boneLen2 = input.midPos.distanceTo(input.endPos);

  const toTarget = target.clone().sub(rootPos);
  const rawDist = toTarget.length();

  const minReach = Math.abs(boneLen1 - boneLen2);
  const maxReach = boneLen1 + boneLen2;
  const reached = rawDist >= minReach - EPSILON && rawDist <= maxReach + EPSILON;
  const dist = Math.min(Math.max(rawDist, minReach + EPSILON), maxReach - EPSILON);

  // Degenerate: root and target coincide (or nearly so) — nothing to aim at. Hold the base pose.
  if (rawDist < EPSILON) {
    return { midPos: input.midPos.clone(), endPos: input.endPos.clone(), reached: false };
  }

  const targetDir = toTarget.clone().normalize();

  // Plane the chain bends in is defined by the root->target axis and the pole hint. If the pole
  // is degenerate (colinear with targetDir), fall back to any axis perpendicular to targetDir so
  // the solve still produces a valid (if arbitrarily oriented) bend rather than NaNs.
  const toPole = poleTarget.clone().sub(rootPos);
  let bendAxis = new Vector3().crossVectors(targetDir, toPole);
  if (bendAxis.lengthSq() < EPSILON) {
    const fallback = Math.abs(targetDir.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    bendAxis = new Vector3().crossVectors(targetDir, fallback);
  }
  bendAxis.normalize();

  // Law of cosines: angle at root between (root->mid) and (root->target), using the clamped
  // chain distance. This angle is specifically the one that makes the triangle (root, mid,
  // clamped-target-point) have its third side equal boneLen2 — so the end joint doesn't need a
  // second rotation at all: it's exactly the point on the root->target ray at `dist`, for both
  // the reached and clamped cases (verified algebraically, not just for the happy path).
  const cosRootAngle = (boneLen1 * boneLen1 + dist * dist - boneLen2 * boneLen2) / (2 * boneLen1 * dist);
  const rootAngle = Math.acos(Math.min(Math.max(cosRootAngle, -1), 1));

  const newMidDir = rotateAroundAxis(targetDir, bendAxis, rootAngle);
  const newMidPos = rootPos.clone().addScaledVector(newMidDir, boneLen1);
  const newEndPos = rootPos.clone().addScaledVector(targetDir, dist);

  return { midPos: newMidPos, endPos: newEndPos, reached };
}
