import { describe, expect, it } from "vitest";
import { computeThirdPersonCameraPose } from "./CameraRig.js";

describe("computeThirdPersonCameraPose", () => {
  it("sits directly behind the target on +Z when yaw is 0 (facing -Z, the Object3D default forward)", () => {
    const pose = computeThirdPersonCameraPose({ x: 0, y: 0, z: 0 }, 0, 6, 2);
    expect(pose.position.x).toBeCloseTo(0, 5);
    expect(pose.position.z).toBeCloseTo(6, 5);
    expect(pose.position.y).toBeCloseTo(2, 5);
    expect(pose.lookAt).toEqual({ x: 0, y: 1.2, z: 0 });
  });

  it("swings to the correct side as the target turns, staying `distance` away on the XZ plane", () => {
    const target = { x: 1, y: 0, z: 1 };
    for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      const pose = computeThirdPersonCameraPose(target, yaw, 5, 0);
      const dx = pose.position.x - target.x;
      const dz = pose.position.z - target.z;
      expect(Math.hypot(dx, dz)).toBeCloseTo(5, 5);
    }
  });

  it("facing +X (yaw = -90°) puts the camera behind on -X", () => {
    const pose = computeThirdPersonCameraPose({ x: 0, y: 0, z: 0 }, -Math.PI / 2, 4, 0);
    expect(pose.position.x).toBeCloseTo(-4, 5);
    expect(pose.position.z).toBeCloseTo(0, 5);
  });

  it("translates rigidly with the target position", () => {
    const a = computeThirdPersonCameraPose({ x: 0, y: 0, z: 0 }, 0.7, 5, 1.5);
    const b = computeThirdPersonCameraPose({ x: 10, y: 3, z: -4 }, 0.7, 5, 1.5);
    expect(b.position.x - a.position.x).toBeCloseTo(10, 5);
    expect(b.position.y - a.position.y).toBeCloseTo(3, 5);
    expect(b.position.z - a.position.z).toBeCloseTo(-4, 5);
  });
});
