import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { forwardKinematics, makeSkeleton, solveLegChain, type LegBoneIndices, type Skeleton } from "./legChain.js";

// A straight leg hanging along -Y: pelvis (0,1,0) → hip (0,0.9,0) → knee (0,0.5,0) →
// heel (0,0.1,0) → toe (0.1,0.1,0) → toeEnd (0.2,0.1,0). Thigh/shin are 0.4, foot segments 0.1.
function legSkeleton(): Skeleton {
  return makeSkeleton([
    { translation: new Vector3(0, 1, 0), rotation: new Quaternion(), parent: -1 },
    { translation: new Vector3(0, -0.1, 0), rotation: new Quaternion(), parent: 0 },
    { translation: new Vector3(0, -0.4, 0), rotation: new Quaternion(), parent: 1 },
    { translation: new Vector3(0, -0.4, 0), rotation: new Quaternion(), parent: 2 },
    { translation: new Vector3(0.1, 0, 0), rotation: new Quaternion(), parent: 3 },
    { translation: new Vector3(0.1, 0, 0), rotation: new Quaternion(), parent: 4 },
  ]);
}
const IDX: LegBoneIndices = { pelvis: 0, hip: 1, knee: 2, heel: 3, toe: 4, toeEnd: 5 };

describe("forwardKinematics", () => {
  it("composes parent.global * local over the parent-indexed hierarchy", () => {
    const skel = legSkeleton();
    forwardKinematics(skel);
    const pos = (i: number) => skel.global[i]!.translation;
    expect(pos(0).y).toBeCloseTo(1, 5);
    expect(pos(1).y).toBeCloseTo(0.9, 5);
    expect(pos(2).y).toBeCloseTo(0.5, 5);
    expect(pos(3).y).toBeCloseTo(0.1, 5);
    expect(pos(4).x).toBeCloseTo(0.1, 5);
    expect(pos(4).y).toBeCloseTo(0.1, 5);
    expect(pos(5).x).toBeCloseTo(0.2, 5);
  });
});

describe("solveLegChain", () => {
  it("places the toe at a reachable target while preserving thigh/shin lengths", () => {
    const skel = legSkeleton();
    const target = new Vector3(0, 0.12, 0);
    solveLegChain(skel, IDX, target, { enableHeightClamp: false, enableToeLookAt: false });

    const hip = skel.global[IDX.hip]!.translation;
    const knee = skel.global[IDX.knee]!.translation;
    const heel = skel.global[IDX.heel]!.translation;
    const toe = skel.global[IDX.toe]!.translation;

    expect(hip.distanceTo(knee)).toBeCloseTo(0.4, 4);
    expect(knee.distanceTo(heel)).toBeCloseTo(0.4, 4);
    // Heel lands at toe-target minus the pose's toe->heel offset; the toe points at the target.
    expect(toe.distanceTo(target)).toBeLessThan(0.01);
  });

  it("height-clamps the toe/heel targets to the bind-pose ground heights", () => {
    const skel = legSkeleton();
    const res = solveLegChain(skel, IDX, new Vector3(0, -1, 0), {
      enableHeightClamp: true,
      toeMinHeight: 0.1,
      heelMinHeight: 0.1,
      toeEndMinHeight: 0.1,
      enableToeLookAt: false,
    });
    expect(res.targetToe.y).toBeCloseTo(0.1, 5);
    expect(res.targetHeel.y).toBeCloseTo(0.1, 5);
    expect(skel.global[IDX.toe]!.translation.y).toBeGreaterThanOrEqual(0.09);
  });

  it("softly clamps to maxExtension instead of hyper-extending an unreachable target", () => {
    const skel = legSkeleton();
    forwardKinematics(skel);
    const hip = skel.global[IDX.hip]!.translation.clone();
    const heel = skel.global[IDX.heel]!.translation.clone();
    const maxExtension = hip.distanceTo(heel); // 0.8

    solveLegChain(skel, IDX, new Vector3(0, -5, 0), {
      enableHeightClamp: false,
      enableToeLookAt: false,
      softening: 0.005,
    });
    const solvedHeel = skel.global[IDX.heel]!.translation;
    // The heel sits at ≈ maxExtension from the hip, not at the far-away target.
    expect(hip.distanceTo(solvedHeel)).toBeCloseTo(maxExtension, 2);
  });
});
