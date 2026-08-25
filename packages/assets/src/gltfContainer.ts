import type { GltfDocument } from "./gltfTypes.js";

export interface ParsedGltf {
  json: GltfDocument;
  /** The binary buffer chunk, if present (GLB's embedded BIN chunk, or a plain `.gltf`'s
   *  separately-loaded `.bin` — this package doesn't fetch external `.bin` files itself, a
   *  caller passing a plain `.gltf` supplies the bytes it already has). */
  binaryChunk: ArrayBuffer | null;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

/**
 * A from-spec GLB container reader — no THREE.js `GLTFLoader` dependency, on purpose: that
 * loader's texture-loading path reaches for browser-only APIs (`Image`/`document`), which would
 * make this package's "analyze" pass only runnable in a browser. glTF 2.0's container format is
 * a small, fully-specified binary layout (a 12-byte header, then length-prefixed chunks) —
 * parsing it directly keeps this pure-JS, so it runs identically in the editor, headless CI, and
 * under Agent control, exactly docs/ASSET_PIPELINE.md's "Goal" section requires. Texture pixel
 * data itself is never decoded here — only the JSON document and (for GLB) the binary chunk
 * `metadata.ts`/`characterDetection.ts` compute against.
 */
export function parseGlb(bytes: ArrayBuffer): ParsedGltf {
  const view = new DataView(bytes);
  if (bytes.byteLength < 12) throw new Error("Not a valid GLB: file is shorter than the 12-byte header.");
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) throw new Error('Not a valid GLB: missing "glTF" magic number.');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported glTF binary version ${version} — only glTF 2.0 is supported.`);
  const totalLength = view.getUint32(8, true);
  if (totalLength > bytes.byteLength) {
    throw new Error(`GLB header declares length ${totalLength} but the file is only ${bytes.byteLength} bytes.`);
  }

  let offset = 12;
  let json: GltfDocument | null = null;
  let binaryChunk: ArrayBuffer | null = null;

  while (offset < totalLength) {
    if (offset + 8 > totalLength) throw new Error("Truncated GLB: chunk header runs past the declared file length.");
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (chunkStart + chunkLength > totalLength) throw new Error("Truncated GLB: chunk data runs past the declared file length.");

    if (chunkType === CHUNK_TYPE_JSON) {
      const text = new TextDecoder("utf-8").decode(new Uint8Array(bytes, chunkStart, chunkLength));
      json = JSON.parse(text) as GltfDocument;
    } else if (chunkType === CHUNK_TYPE_BIN) {
      binaryChunk = bytes.slice(chunkStart, chunkStart + chunkLength);
    }
    // Unknown chunk types are skipped, per spec — "Clients MUST ignore chunks with unknown types."

    offset = chunkStart + chunkLength;
  }

  if (!json) throw new Error("Invalid GLB: no JSON chunk found.");
  return { json, binaryChunk };
}

/** A plain-text `.gltf` file (JSON only) — `binaryChunk` is always null here since `.bin` data,
 *  when present, lives in a separate file this function doesn't know how to fetch (parseGlb's
 *  own doc comment). */
export function parseGltfJson(text: string): ParsedGltf {
  return { json: JSON.parse(text) as GltfDocument, binaryChunk: null };
}

/** Picks the right parser from the file's own bytes rather than trusting a `.gltf`/`.glb`
 *  extension, which a caller may not even have (a drag-and-drop `File` with a renamed
 *  extension, an in-memory buffer from `assets.import`). */
export function parseGltfOrGlb(bytes: ArrayBuffer): ParsedGltf {
  if (bytes.byteLength >= 4 && new DataView(bytes).getUint32(0, true) === GLB_MAGIC) {
    return parseGlb(bytes);
  }
  return parseGltfJson(new TextDecoder("utf-8").decode(bytes));
}
