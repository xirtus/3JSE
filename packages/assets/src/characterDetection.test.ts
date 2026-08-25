import { describe, expect, it } from "vitest";
import { detectCharacter } from "./characterDetection.js";
import type { GltfDocument } from "./gltfTypes.js";

function docWithJointNames(names: string[]): GltfDocument {
  return {
    asset: { version: "2.0" },
    nodes: names.map((name) => ({ name })),
    skins: [{ joints: names.map((_, i) => i) }],
  };
}

describe("detectCharacter", () => {
  it("flags a Mixamo-style humanoid rig as a likely character", () => {
    const doc = docWithJointNames(["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Head", "mixamorig:LeftArm", "mixamorig:LeftFoot"]);
    const result = detectCharacter(doc);
    expect(result.likelyCharacter).toBe(true);
    expect(result.matchedCategories.sort()).toEqual(["arm", "foot", "head", "hip", "spine"]);
    expect(result.skinIndex).toBe(0);
  });

  it("does not flag a prop mesh with one or two incidentally bone-ish names", () => {
    const doc = docWithJointNames(["Head_Socket", "Root"]);
    expect(detectCharacter(doc).likelyCharacter).toBe(false);
  });

  it("returns likelyCharacter:false and skinIndex:null when there are no skins at all", () => {
    const result = detectCharacter({ asset: { version: "2.0" } });
    expect(result).toEqual({ likelyCharacter: false, matchedCategories: [], skinIndex: null });
  });

  it("picks the skin with the most matched categories when a document has more than one", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      nodes: [{ name: "Prop" }, { name: "Hips" }, { name: "Spine" }, { name: "Head" }, { name: "LeftArm" }, { name: "LeftFoot" }],
      skins: [{ joints: [0] }, { joints: [1, 2, 3, 4, 5] }],
    };
    expect(detectCharacter(doc).skinIndex).toBe(1);
  });

  it("matches generic (non-Mixamo) naming conventions too", () => {
    const doc = docWithJointNames(["Pelvis", "Chest", "Neck", "Shoulder_L", "Ankle_L"]);
    expect(detectCharacter(doc).likelyCharacter).toBe(true);
  });
});
