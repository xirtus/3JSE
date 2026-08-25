import { describe, expect, it } from "vitest";
import { parseGlb, parseGltfJson, parseGltfOrGlb } from "./gltfContainer.js";
import { buildGlb } from "./testFixtures.js";
import type { GltfDocument } from "./gltfTypes.js";

const MINIMAL_DOC: GltfDocument = { asset: { version: "2.0" } };

describe("parseGltfJson", () => {
  it("parses a plain JSON document with no binary chunk", () => {
    const result = parseGltfJson(JSON.stringify(MINIMAL_DOC));
    expect(result.json).toEqual(MINIMAL_DOC);
    expect(result.binaryChunk).toBeNull();
  });
});

describe("parseGlb", () => {
  it("parses a hand-built GLB with only a JSON chunk", () => {
    const buffer = buildGlb(MINIMAL_DOC);
    const result = parseGlb(buffer);
    expect(result.json).toEqual(MINIMAL_DOC);
    expect(result.binaryChunk).toBeNull();
  });

  it("parses a hand-built GLB with a JSON chunk and a BIN chunk", () => {
    const bin = new Float32Array([1, 2, 3]).buffer;
    const buffer = buildGlb(MINIMAL_DOC, bin);
    const result = parseGlb(buffer);
    expect(result.json).toEqual(MINIMAL_DOC);
    expect(result.binaryChunk).not.toBeNull();
    expect(new Float32Array(result.binaryChunk!.slice(0, 12))).toEqual(new Float32Array([1, 2, 3]));
  });

  it("rejects a buffer too short to contain a header", () => {
    expect(() => parseGlb(new ArrayBuffer(4))).toThrow(/shorter than the 12-byte header/);
  });

  it("rejects a buffer with the wrong magic number", () => {
    const buffer = new ArrayBuffer(12);
    new DataView(buffer).setUint32(0, 0xdeadbeef, true);
    expect(() => parseGlb(buffer)).toThrow(/missing "glTF" magic/);
  });

  it("rejects an unsupported glTF binary version", () => {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 1, true); // version 1, not 2
    view.setUint32(8, 12, true);
    expect(() => parseGlb(buffer)).toThrow(/Unsupported glTF binary version 1/);
  });

  it("rejects a file shorter than its own declared total length", () => {
    const buffer = buildGlb(MINIMAL_DOC);
    const truncated = buffer.slice(0, buffer.byteLength - 5);
    expect(() => parseGlb(truncated)).toThrow(/declares length .* but the file is only/);
  });

  it("rejects a chunk whose declared length runs past an (otherwise honest) total length", () => {
    const buffer = buildGlb(MINIMAL_DOC);
    const view = new DataView(buffer);
    // Inflate the JSON chunk's own declared length (first field after the 12-byte header)
    // without touching the file's total length — this is what actually exercises the
    // per-chunk "runs past the declared file length" check, distinct from the file-level one
    // above.
    view.setUint32(12, view.getUint32(12, true) + 100, true);
    expect(() => parseGlb(buffer)).toThrow(/Truncated GLB/);
  });
});

describe("parseGltfOrGlb", () => {
  it("dispatches to the GLB reader for GLB bytes", () => {
    const buffer = buildGlb(MINIMAL_DOC);
    expect(parseGltfOrGlb(buffer).json).toEqual(MINIMAL_DOC);
  });

  it("dispatches to the plain JSON reader for non-GLB bytes", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(MINIMAL_DOC)).buffer;
    expect(parseGltfOrGlb(bytes as ArrayBuffer).json).toEqual(MINIMAL_DOC);
  });
});
