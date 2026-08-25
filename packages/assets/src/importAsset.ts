import { parseGltfOrGlb } from "./gltfContainer.js";
import { validateGltf, type ImportWarning } from "./validate.js";
import { computeMetadata, hashBytes, type AssetMetadata } from "./metadata.js";
import { detectCharacter, type CharacterDetectionResult } from "./characterDetection.js";

export interface ImportSuggestion {
  metadata: AssetMetadata;
  warnings: ImportWarning[];
  character: CharacterDetectionResult;
  /** True when any warning is `"error"` severity — a caller (the editor's import dialog, the
   *  CLI, `assets.import` in a future Agent API) should surface this as a risky/failed import
   *  rather than silently staging it, per docs/ASSET_PIPELINE.md's "suggestions, not silent
   *  automatic mutation": a human/agent still decides, but with the pipeline's own confidence
   *  visible, not hidden inside a warnings array they'd have to scan themselves. */
  hasErrors: boolean;
}

/**
 * docs/ASSET_PIPELINE.md's "analyze" pass, orchestrated: parse the container, run the
 * validation checklist, extract metadata (including the content-address hash the Storage model
 * section describes), and run character detection — one call, the same one the editor's
 * drag-and-drop, `3jse assets import --headless`, and a future Agent API's `assets.import` tool
 * would all make, per this doc's "Goal": "one implementation, three callers."
 *
 * Deliberately not implemented in this slice (real future work, each requiring machinery this
 * package doesn't have): thumbnail rendering (needs a GPU context — this package has none, on
 * purpose, so it stays headless-runnable), LOD generation, collider generation, texture/mesh
 * compression transcoding (Draco/KTX2/meshopt encoders), and skeleton/animation-clip
 * retargeting suggestions. `@3jse/assets` v1 matches `ROADMAP.md` Phase 1's own original scope:
 * "glTF/GLB import, thumbnails, basic metadata — no LOD/collider generation yet" — this ships
 * everything except thumbnails, which needs the GPU-context piece above.
 */
export async function importAsset(bytes: ArrayBuffer): Promise<ImportSuggestion> {
  const { json } = parseGltfOrGlb(bytes);
  const warnings = validateGltf(json);
  const sourceHash = await hashBytes(bytes);
  const metadata = computeMetadata(json, sourceHash);
  const character = detectCharacter(json);
  return { metadata, warnings, character, hasErrors: warnings.some((w) => w.severity === "error") };
}
