import { describe, expect, it } from "vitest";
import { validateGltf } from "./validate.js";
import type { GltfDocument } from "./gltfTypes.js";

function warningMessages(doc: GltfDocument) {
  return validateGltf(doc).map((w) => w.message);
}

describe("validateGltf — structural checks", () => {
  it("a minimal, empty document produces no warnings", () => {
    expect(validateGltf({ asset: { version: "2.0" } })).toEqual([]);
  });

  it("flags an unsupported required extension as an error", () => {
    const warnings = validateGltf({ asset: { version: "2.0" }, extensionsRequired: ["EXT_totally_made_up"] });
    expect(warnings).toContainEqual({ severity: "error", message: expect.stringContaining('Required extension "EXT_totally_made_up"') });
  });

  it("recognizes KHR_materials_* extensions by prefix and EXT_meshopt_compression by name — no warning", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_materials_clearcoat", "EXT_meshopt_compression"],
    };
    expect(validateGltf(doc)).toEqual([]);
  });

  it("flags an unrecognized (but not required) extension as a warning, not an error", () => {
    const warnings = validateGltf({ asset: { version: "2.0" }, extensionsUsed: ["EXT_mystery_vendor_thing"] });
    expect(warnings).toEqual([{ severity: "warning", message: expect.stringContaining('"EXT_mystery_vendor_thing"') }]);
  });

  it("flags an out-of-range accessor.bufferView", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, accessors: [{ componentType: 5126, count: 3, type: "VEC3", bufferView: 0 }] };
    expect(warningMessages(doc)).toContainEqual(expect.stringContaining("out-of-range bufferView 0"));
  });

  it("flags a bufferView that's never referenced by any accessor or image", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, bufferViews: [{ buffer: 0, byteLength: 12 }] };
    expect(warningMessages(doc)).toContainEqual(expect.stringContaining("bufferView 0 is never referenced"));
  });

  it("does NOT flag a bufferView referenced by an accessor", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      bufferViews: [{ buffer: 0, byteLength: 12 }],
      accessors: [{ componentType: 5126, count: 3, type: "VEC3", bufferView: 0 }],
    };
    expect(warningMessages(doc).some((m) => m.includes("never referenced"))).toBe(false);
  });

  it("flags a node with an out-of-range mesh/skin/child reference", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, nodes: [{ mesh: 5, skin: 5, children: [5] }] };
    const messages = warningMessages(doc);
    expect(messages).toContainEqual(expect.stringContaining("out-of-range mesh 5"));
    expect(messages).toContainEqual(expect.stringContaining("out-of-range skin 5"));
    expect(messages).toContainEqual(expect.stringContaining("out-of-range child index 5"));
  });

  it("detects a node hierarchy cycle", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, nodes: [{ children: [1] }, { children: [0] }] };
    expect(warningMessages(doc)).toContainEqual(expect.stringContaining("cycle"));
  });

  it("does not false-positive a cycle on a plain tree", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, nodes: [{ children: [1, 2] }, {}, {}] };
    expect(warningMessages(doc).some((m) => m.includes("cycle"))).toBe(false);
  });

  it("flags a material's out-of-range texture reference", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 3 } } }],
    };
    expect(warningMessages(doc)).toContainEqual(expect.stringContaining("out-of-range baseColor texture 3"));
  });

  it("flags a mesh primitive missing POSITION", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, meshes: [{ primitives: [{ attributes: { NORMAL: 0 } }] }] };
    expect(warningMessages(doc)).toContainEqual(expect.stringContaining("no POSITION attribute"));
  });
});
