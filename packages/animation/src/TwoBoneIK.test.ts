import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { solveTwoBoneIK } from "./TwoBoneIK.js";

// A straight-armed rest pose along +X: shoulder at origin, elbow at x=1, hand at x=2.
// Both bone lengths are 1. Pole target is offset in +Y so the elbow should bend "up".
function restPose() {
  return {
    rootPos: new Vector3(0, 0, 0),
    midPos: new Vector3(1, 0, 0),
    endPos: new Vector3(2, 0, 0),
    poleTarget: new Vector3(1, 1, 0),
  };
}

describe("solveTwoBoneIK", () => {
  it("preserves both bone lengths regardless of target", () => {
    const pose = restPose();
    const targets = [
      new Vector3(1.5, 0.5, 0),
      new Vector3(0.2, 1.9, 0),
      new Vector3(-1, 0.3, 0.4),
      new Vector3(0, 0, 2), // fully unreachable-ish direction, still within max reach
    ];
    for (const target of targets) {
      const result = solveTwoBoneIK({ ...pose, target });
      expect(result.midPos.distanceTo(pose.rootPos)).toBeCloseTo(1, 5);
      expect(result.endPos.distanceTo(result.midPos)).toBeCloseTo(1, 5);
    }
  });

  it("reaches the target exactly when it's within [minReach, maxReach]", () => {
    const pose = restPose();
    const target = new Vector3(1.5, 0.5, 0); // distance from origin ≈ 1.58, within [0,2]
    const result = solveTwoBoneIK({ ...pose, target });
    expect(result.reached).toBe(true);
    expect(result.endPos.distanceTo(target)).toBeCloseTo(0, 5);
  });

  it("fully extends toward the target when it's beyond maxReach", () => {
    const pose = restPose();
    const target = new Vector3(10, 0, 0); // way past maxReach of 2
    const result = solveTwoBoneIK({ ...pose, target });
    expect(result.reached).toBe(false);
    // Fully extended: end effector sits at distance ≈ maxReach (boneLen1+boneLen2) from root,
    // and mid/end/target are colinear with root along the target direction.
    expect(result.endPos.distanceTo(pose.rootPos)).toBeCloseTo(2, 3);
    const dirToEnd = result.endPos.clone().sub(pose.rootPos).normalize();
    const dirToTarget = target.clone().sub(pose.rootPos).normalize();
    expect(dirToEnd.dot(dirToTarget)).toBeCloseTo(1, 3);
  });

  it("holds position (not reached) when the target is inside minReach (chain can't contract further)", () => {
    // Equal bone lengths → minReach is 0, so this case only bites with unequal lengths.
    const pose = {
      rootPos: new Vector3(0, 0, 0),
      midPos: new Vector3(2, 0, 0), // boneLen1 = 2
      endPos: new Vector3(2.5, 0, 0), // boneLen2 = 0.5, minReach = 1.5
      poleTarget: new Vector3(2, 1, 0),
    };
    const target = new Vector3(0.1, 0, 0); // distance 0.1, below minReach of 1.5
    const result = solveTwoBoneIK({ ...pose, target });
    expect(result.reached).toBe(false);
    expect(result.midPos.distanceTo(pose.rootPos)).toBeCloseTo(2, 5);
    expect(result.endPos.distanceTo(result.midPos)).toBeCloseTo(0.5, 5);
  });

  it("bends the mid joint toward the pole side, not away from it", () => {
    const pose = restPose(); // pole is offset in +Y
    // Target straight ahead along the original bone axis but pulled slightly short, forcing a
    // bend (a fully straight chain can't reach a point closer than maxReach along its own axis).
    const target = new Vector3(1.9, 0, 0);
    const result = solveTwoBoneIK({ ...pose, target });
    // The elbow's displacement from the straight root->end line should point toward +Y (the
    // pole side), not -Y.
    const rootToEnd = result.endPos.clone().sub(pose.rootPos).normalize();
    const rootToMid = result.midPos.clone().sub(pose.rootPos);
    const alongAxis = rootToEnd.clone().multiplyScalar(rootToMid.dot(rootToEnd));
    const perpendicular = rootToMid.clone().sub(alongAxis);
    expect(perpendicular.y).toBeGreaterThan(0);
  });

  it("holds the base pose (does not throw or NaN) when root and target coincide", () => {
    const pose = restPose();
    const result = solveTwoBoneIK({ ...pose, target: pose.rootPos.clone() });
    expect(result.reached).toBe(false);
    expect(Number.isFinite(result.midPos.x)).toBe(true);
    expect(Number.isFinite(result.endPos.x)).toBe(true);
  });

  it("produces a valid solve when the pole is colinear with the root-target axis (degenerate pole)", () => {
    const pose = restPose();
    const target = new Vector3(1.9, 0, 0);
    const result = solveTwoBoneIK({ ...pose, poleTarget: new Vector3(5, 0, 0), target });
    expect(Number.isFinite(result.midPos.x)).toBe(true);
    expect(Number.isFinite(result.midPos.y)).toBe(true);
    expect(result.midPos.distanceTo(pose.rootPos)).toBeCloseTo(1, 5);
    expect(result.endPos.distanceTo(result.midPos)).toBeCloseTo(1, 5);
  });

  it("works identically when the chain isn't axis-aligned (arbitrary orientation)", () => {
    const pose = {
      rootPos: new Vector3(3, 4, -2),
      midPos: new Vector3(3.8, 4.6, -2), // boneLen1 = 1
      endPos: new Vector3(3.8, 4.6, -0.9), // boneLen2 = 1.1
      poleTarget: new Vector3(4, 5.5, -2),
    };
    const target = new Vector3(4.2, 4.1, -1.5);
    const result = solveTwoBoneIK({ ...pose, target });
    expect(result.midPos.distanceTo(pose.rootPos)).toBeCloseTo(1, 5);
    expect(result.endPos.distanceTo(result.midPos)).toBeCloseTo(1.1, 5);
  });
});
