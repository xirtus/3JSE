import type { GltfDocument } from "./gltfTypes.js";

/** Builds a real, spec-shaped GLB binary buffer by hand — 12-byte header + a JSON chunk (+ an
 *  optional BIN chunk), each chunk padded to a 4-byte boundary per spec. Shared by
 *  gltfContainer.test.ts (proving the reader is correct against the real binary layout) and
 *  importAsset.test.ts (a full-pipeline fixture) — not a `.test.ts` file itself, so vitest
 *  doesn't try to run it as a suite. */
export function buildGlb(json: GltfDocument, bin?: ArrayBuffer): ArrayBuffer {
  const jsonText = JSON.stringify(json);
  const jsonBytesRaw = new TextEncoder().encode(jsonText);
  const jsonPadding = (4 - (jsonBytesRaw.length % 4)) % 4;
  const jsonBytes = new Uint8Array(jsonBytesRaw.length + jsonPadding);
  jsonBytes.set(jsonBytesRaw);
  jsonBytes.fill(0x20, jsonBytesRaw.length); // glTF spec: pad JSON chunk with spaces

  const binBytesRaw = bin ? new Uint8Array(bin) : new Uint8Array(0);
  const binPadding = bin ? (4 - (binBytesRaw.length % 4)) % 4 : 0;
  const binBytes = new Uint8Array(binBytesRaw.length + binPadding); // pad BIN chunk with zeros
  binBytes.set(binBytesRaw);

  const totalLength = 12 + 8 + jsonBytes.length + (bin ? 8 + binBytes.length : 0);
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, 0x46546c67, true); // magic "glTF"
  view.setUint32(offset + 4, 2, true); // version
  view.setUint32(offset + 8, totalLength, true);
  offset += 12;

  view.setUint32(offset, jsonBytes.length, true);
  view.setUint32(offset + 4, 0x4e4f534a, true); // "JSON"
  new Uint8Array(buffer, offset + 8, jsonBytes.length).set(jsonBytes);
  offset += 8 + jsonBytes.length;

  if (bin) {
    view.setUint32(offset, binBytes.length, true);
    view.setUint32(offset + 4, 0x004e4942, true); // "BIN\0"
    new Uint8Array(buffer, offset + 8, binBytes.length).set(binBytes);
  }

  return buffer;
}
