import { describe, expect, it } from "vitest";
import {
  retargetClip,
  autoMapSkeleton,
  canonicalizeBoneName,
  qMul,
  type RetargetClip,
  type SkeletonMap,
  type BoneRest,
} from "./retarget.js";

describe("canonicalizeBoneName / autoMapSkeleton", () => {
  it("strips vendor prefixes and folds separators/case so common variants match", () => {
    expect(canonicalizeBoneName("mixamorig:LeftUpLeg")).toBe(canonicalizeBoneName("Left_Up_Leg"));
    expect(canonicalizeBoneName("mixamorig:Hips")).toBe(canonicalizeBoneName("Hips"));
    expect(canonicalizeBoneName("Hips")).toBe(canonicalizeBoneName("pelvis"));
    // known limitation: cross-side-convention (Left-prefix vs .L-suffix) is not resolved here
  });

  it("auto-maps a Mixamo source onto a plain target skeleton", () => {
    const src = ["mixamorig:Hips", "mixamorig:LeftUpLeg", "mixamorig:Spine"];
    const tgt = ["Hips", "LeftUpLeg", "Spine"];
    const map = autoMapSkeleton(src, tgt);
    expect(map.bones["mixamorig:Hips"]).toBe("Hips");
    expect(map.bones["mixamorig:LeftUpLeg"]).toBe("LeftUpLeg");
    expect(map.sourceHip).toBe("mixamorig:Hips");
    expect(map.targetHip).toBe("Hips");
  });
});

const clip: RetargetClip = {
  name: "walk",
  duration: 1,
  tracks: [
    { target: "mixamorig:Hips.position", times: [0, 1], values: [0, 100, 0, 0, 100, 5] },
    { target: "mixamorig:Hips.quaternion", times: [0], values: [0, 0, 0, 1] },
    { target: "mixamorig:LeftUpLeg.quaternion", times: [0], values: [0, 0, 0, 1] },
    { target: "mixamorig:UnmappedFinger.quaternion", times: [0], values: [0, 0, 0, 1] },
  ],
};
const map: SkeletonMap = {
  bones: { "mixamorig:Hips": "Hips", "mixamorig:LeftUpLeg": "LeftUpLeg" },
  sourceHip: "mixamorig:Hips",
  targetHip: "Hips",
};

describe("retargetClip", () => {
  it("renames mapped tracks, drops unmapped ones", () => {
    const out = retargetClip(clip, map);
    expect(out.tracks.map((t) => t.target).sort()).toEqual([
      "Hips.position",
      "Hips.quaternion",
      "LeftUpLeg.quaternion",
    ]);
  });

  it("scales the hip position track by the hip-height ratio", () => {
    const sourceRest: Record<string, BoneRest> = { "mixamorig:Hips": { name: "h", position: [0, 100, 0], quaternion: [0, 0, 0, 1] } };
    const targetRest: Record<string, BoneRest> = { Hips: { name: "h", position: [0, 90, 0], quaternion: [0, 0, 0, 1] } };
    const out = retargetClip(clip, map, { sourceRest, targetRest });
    const hip = out.tracks.find((t) => t.target === "Hips.position")!;
    // ratio 90/100 = 0.9 -> [0,100,0,...] becomes [0,90,0,...]
    expect(hip.values[1]).toBeCloseTo(90, 5);
    expect(hip.values[4]).toBeCloseTo(90, 5);
  });

  it("rotation-compensates quaternion tracks by the source→target rest delta", () => {
    // source rest: LeftUpLeg identity; target rest: LeftUpLeg rotated 90° about X
    const s = Math.SQRT1_2;
    const sourceRest: Record<string, BoneRest> = { "mixamorig:LeftUpLeg": { name: "l", position: [0, 0, 0], quaternion: [0, 0, 0, 1] } };
    const targetRest: Record<string, BoneRest> = { LeftUpLeg: { name: "l", position: [0, 0, 0], quaternion: [s, 0, 0, s] } };
    const out = retargetClip(clip, map, { sourceRest, targetRest });
    const leg = out.tracks.find((t) => t.target === "LeftUpLeg.quaternion")!;
    // restDelta = targetRest * sourceRest⁻¹ = [s,0,0,s]; applied to identity keyframe -> [s,0,0,s]
    expect(leg.values[0]).toBeCloseTo(s, 4);
    expect(leg.values[3]).toBeCloseTo(s, 4);
  });

  it("hipHeightRatio override wins over auto", () => {
    const out = retargetClip(clip, map, { hipHeightRatio: 2 });
    expect(out.tracks.find((t) => t.target === "Hips.position")!.values[1]).toBeCloseTo(200, 5);
  });
});

describe("qMul", () => {
  it("identity is the multiplicative identity", () => {
    expect(qMul([0.1, 0.2, 0.3, 0.9], [0, 0, 0, 1])).toEqual([0.1, 0.2, 0.3, 0.9]);
  });
});
