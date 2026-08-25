import { describe, expect, it } from "vitest";
import { computeMetadata, hashBytes } from "./metadata.js";
import type { GltfDocument } from "./gltfTypes.js";

describe("computeMetadata", () => {
  it("counts triangles from an indexed TRIANGLES primitive (indices count / 3)", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      accessors: [{ componentType: 5123, count: 6, type: "SCALAR" }], // 6 indices → 2 triangles
      meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0 }] }],
    };
    expect(computeMetadata(doc, "hash").triangleCount).toBe(2);
  });

  it("falls back to POSITION accessor count / 3 for a non-indexed primitive", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      accessors: [{ componentType: 5126, count: 9, type: "VEC3" }], // 9 vertices → 3 triangles
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    };
    expect(computeMetadata(doc, "hash").triangleCount).toBe(3);
  });

  it("combines POSITION accessor min/max across primitives into one local bounding box", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      accessors: [
        { componentType: 5126, count: 3, type: "VEC3", min: [-1, 0, -1], max: [0, 1, 0] },
        { componentType: 5126, count: 3, type: "VEC3", min: [0, -1, 0], max: [1, 2, 1] },
      ],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 } }] },
        { primitives: [{ attributes: { POSITION: 1 } }] },
      ],
    };
    expect(computeMetadata(doc, "hash").localBounds).toEqual({ min: [-1, -1, -1], max: [1, 2, 1] });
  });

  it("localBounds is null when no primitive has accessor bounds", () => {
    const doc: GltfDocument = {
      asset: { version: "2.0" },
      accessors: [{ componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    };
    expect(computeMetadata(doc, "hash").localBounds).toBeNull();
  });

  it("counts bones as the total joints across all skins", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, skins: [{ joints: [0, 1, 2] }, { joints: [3, 4] }] };
    expect(computeMetadata(doc, "hash").boneCount).toBe(5);
  });

  it("materialCount and nodeCount reflect the document's own arrays", () => {
    const doc: GltfDocument = { asset: { version: "2.0" }, materials: [{}, {}], nodes: [{}, {}, {}] };
    const meta = computeMetadata(doc, "hash");
    expect(meta.materialCount).toBe(2);
    expect(meta.nodeCount).toBe(3);
  });

  it("skips TRIANGLE_STRIP/FAN primitives rather than miscounting them as TRIANGLES", () => {
    // `mode` isn't in the GltfPrimitive type (types.ts's minimal-subset doc comment) — a real
    // spec field, cast at the call site the same way computeMetadata itself reads it via
    // `(prim as { mode?: number }).mode`. The point of this test: it must NOT be counted as if
    // every vertex were part of a TRIANGLES list.
    const stripDoc = {
      asset: { version: "2.0" },
      accessors: [{ componentType: 5126, count: 9, type: "VEC3" as const }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 5 }] }],
    } as unknown as GltfDocument;
    expect(computeMetadata(stripDoc, "hash").triangleCount).toBe(0);
  });
});

describe("hashBytes", () => {
  it("is deterministic for identical bytes", async () => {
    const bytes = new TextEncoder().encode("hello world").buffer;
    const a = await hashBytes(bytes as ArrayBuffer);
    const b = await hashBytes(bytes as ArrayBuffer);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different bytes", async () => {
    const a = await hashBytes(new TextEncoder().encode("hello").buffer as ArrayBuffer);
    const b = await hashBytes(new TextEncoder().encode("world").buffer as ArrayBuffer);
    expect(a).not.toBe(b);
  });
});
