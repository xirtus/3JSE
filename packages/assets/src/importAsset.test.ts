import { describe, expect, it } from "vitest";
import { importAsset } from "./importAsset.js";
import { buildGlb } from "./testFixtures.js";
import type { GltfDocument } from "./gltfTypes.js";

const SIMPLE_TRIANGLE: GltfDocument = {
  asset: { version: "2.0", generator: "3jse test fixture" },
  scenes: [{ nodes: [0] }],
  scene: 0,
  nodes: [{ name: "Triangle", mesh: 0 }],
  meshes: [{ name: "TriangleMesh", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [{ name: "Red", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }],
  accessors: [
    { componentType: 5126, count: 3, type: "VEC3", min: [-1, 0, 0], max: [1, 1, 0] },
    { componentType: 5123, count: 3, type: "SCALAR" },
  ],
};

const HUMANOID_RIG: GltfDocument = {
  asset: { version: "2.0" },
  nodes: [
    { name: "Hero", mesh: 0, skin: 0 },
    { name: "Hips" },
    { name: "Spine" },
    { name: "Head" },
    { name: "LeftArm" },
    { name: "LeftFoot" },
  ],
  meshes: [{ name: "HeroMesh", primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ componentType: 5126, count: 9, type: "VEC3", min: [-1, 0, -1], max: [1, 2, 1] }],
  skins: [{ joints: [1, 2, 3, 4, 5] }],
};

describe("importAsset — full pipeline against real GLB bytes", () => {
  it("a clean, valid glTF produces zero errors and correct metadata", async () => {
    const suggestion = await importAsset(buildGlb(SIMPLE_TRIANGLE));

    expect(suggestion.hasErrors).toBe(false);
    expect(suggestion.metadata.triangleCount).toBe(1);
    expect(suggestion.metadata.materialCount).toBe(1);
    expect(suggestion.metadata.localBounds).toEqual({ min: [-1, 0, 0], max: [1, 1, 0] });
    expect(suggestion.metadata.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(suggestion.character.likelyCharacter).toBe(false);
  });

  it("a humanoid-rigged glTF is flagged as a likely character, with its bone count", async () => {
    const suggestion = await importAsset(buildGlb(HUMANOID_RIG));

    expect(suggestion.character.likelyCharacter).toBe(true);
    expect(suggestion.metadata.boneCount).toBe(5);
    expect(suggestion.hasErrors).toBe(false);
  });

  it("a structurally broken glTF (out-of-range reference) surfaces as an error, but still returns metadata", async () => {
    const broken: GltfDocument = { asset: { version: "2.0" }, nodes: [{ mesh: 99 }] };
    const suggestion = await importAsset(buildGlb(broken));

    expect(suggestion.hasErrors).toBe(true);
    expect(suggestion.warnings).toContainEqual({ severity: "error", message: expect.stringContaining("out-of-range mesh 99") });
    expect(suggestion.metadata.nodeCount).toBe(1);
  });

  it("re-importing byte-identical content produces the same sourceHash — docs/ASSET_PIPELINE.md's content-addressed re-import no-op", async () => {
    const bytes1 = buildGlb(SIMPLE_TRIANGLE);
    const bytes2 = buildGlb(SIMPLE_TRIANGLE);
    const [a, b] = await Promise.all([importAsset(bytes1), importAsset(bytes2)]);
    expect(a.metadata.sourceHash).toBe(b.metadata.sourceHash);
  });

  it("accepts a plain JSON .gltf buffer, not just GLB", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(SIMPLE_TRIANGLE)).buffer as ArrayBuffer;
    const suggestion = await importAsset(bytes);
    expect(suggestion.metadata.triangleCount).toBe(1);
  });
});
