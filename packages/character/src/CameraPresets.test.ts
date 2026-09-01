import { describe, expect, it } from "vitest";
import {
  computeTopDownCameraPose,
  computeFirstPersonCameraPose,
  computeOrbitCameraPose,
  computeCameraPose,
  type CameraRigParams,
} from "./CameraRig.js";

const base: CameraRigParams = {
  mode: "thirdPerson",
  distance: 8,
  height: 3,
  pitchDegrees: 0,
  eyeHeight: 1.6,
  forwardOffset: 0.2,
  orbitYawDegrees: 0,
};

describe("computeTopDownCameraPose", () => {
  it("pitch 0 puts the camera straight above, looking at the target", () => {
    const p = computeTopDownCameraPose({ x: 2, y: 0, z: -3 }, 1.1, 10, 0);
    expect(p.position.x).toBeCloseTo(2, 5);
    expect(p.position.z).toBeCloseTo(-3, 5);
    expect(p.position.y).toBeCloseTo(10, 5);
    expect(p.lookAt).toEqual({ x: 2, y: 0, z: -3 });
  });

  it("stays `distance` from the target as pitch tilts", () => {
    for (const pitch of [0, 20, 45, 70]) {
      const p = computeTopDownCameraPose({ x: 0, y: 0, z: 0 }, 0, 12, pitch);
      expect(Math.hypot(p.position.x, p.position.y, p.position.z)).toBeCloseTo(12, 4);
    }
  });
});

describe("computeFirstPersonCameraPose", () => {
  it("sits at eye height, slightly ahead, looking along facing (-Z at yaw 0)", () => {
    const p = computeFirstPersonCameraPose({ x: 0, y: 0, z: 0 }, 0, 1.6, 0.3);
    expect(p.position.y).toBeCloseTo(1.6, 5);
    expect(p.position.z).toBeCloseTo(-0.3, 5);
    expect(p.lookAt.z).toBeLessThan(p.position.z); // looking further -Z
  });

  it("look direction rotates with yaw", () => {
    const p = computeFirstPersonCameraPose({ x: 0, y: 0, z: 0 }, -Math.PI / 2, 1.6, 0);
    // facing +X
    expect(p.lookAt.x - p.position.x).toBeCloseTo(1, 5);
    expect(p.lookAt.z - p.position.z).toBeCloseTo(0, 5);
  });
});

describe("computeOrbitCameraPose", () => {
  it("ignores target facing; compass angle + pitch set the position", () => {
    const a = computeOrbitCameraPose({ x: 0, y: 0, z: 0 }, 10, 90, 30);
    const horizontal = Math.cos((30 * Math.PI) / 180) * 10;
    expect(a.position.x).toBeCloseTo(horizontal, 4); // sin(90°) * horizontal
    expect(a.position.z).toBeCloseTo(0, 4);
    expect(a.position.y).toBeCloseTo(Math.sin((30 * Math.PI) / 180) * 10, 4);
    expect(a.lookAt).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("computeCameraPose dispatch", () => {
  it("routes each mode to its preset", () => {
    const target = { x: 0, y: 0, z: 0 };
    expect(computeCameraPose(target, 0, { ...base, mode: "topDown", pitchDegrees: 0, distance: 5 }).position.y).toBeCloseTo(5, 4);
    expect(computeCameraPose(target, 0, { ...base, mode: "firstPerson", eyeHeight: 1.7, forwardOffset: 0 }).position.y).toBeCloseTo(1.7, 4);
    expect(computeCameraPose(target, 0, { ...base, mode: "orbit", distance: 4, orbitYawDegrees: 0, pitchDegrees: 0 }).position.z).toBeCloseTo(4, 4);
    // default / thirdPerson still behind on +Z at yaw 0
    expect(computeCameraPose(target, 0, { ...base, mode: "thirdPerson", distance: 6 }).position.z).toBeCloseTo(6, 4);
  });
});
