import type { GltfDocument } from "./gltfTypes.js";

export type WarningSeverity = "error" | "warning" | "info";

export interface ImportWarning {
  severity: WarningSeverity;
  message: string;
}

// docs/ASSET_PIPELINE.md's "glTF/PBR validation checklist" — extensions this pipeline actually
// understands well enough to not flag as risky. `KHR_materials_*` is a whole family (unlit,
// clearcoat, transmission, ior, …), matched by prefix rather than enumerated one at a time.
const SUPPORTED_EXTENSION_PREFIXES = ["KHR_materials_"];
const SUPPORTED_EXTENSIONS = new Set(["KHR_texture_transform", "KHR_draco_mesh_compression", "EXT_meshopt_compression"]);

function isSupportedExtension(name: string): boolean {
  return SUPPORTED_EXTENSIONS.has(name) || SUPPORTED_EXTENSION_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function detectNodeCycle(nodes: NonNullable<GltfDocument["nodes"]>): number | null {
  const state = new Array<0 | 1 | 2>(nodes.length).fill(0); // 0=unvisited, 1=in-progress, 2=done
  function visit(i: number): number | null {
    if (i < 0 || i >= nodes.length) return null; // out-of-range is reported separately
    if (state[i] === 1) return i;
    if (state[i] === 2) return null;
    state[i] = 1;
    for (const child of nodes[i]!.children ?? []) {
      const cycle = visit(child);
      if (cycle !== null) return cycle;
    }
    state[i] = 2;
    return null;
  }
  for (let i = 0; i < nodes.length; i++) {
    const cycle = visit(i);
    if (cycle !== null) return cycle;
  }
  return null;
}

/**
 * docs/ASSET_PIPELINE.md's structural + PBR sanity checks — everything here is derivable from
 * the glTF JSON document alone, on purpose: the specific check that document calls out but this
 * function does NOT implement is metallic-roughness channel-packing verification (is metalness
 * really in the B channel, roughness in G) — that needs decoding actual texture pixel data, and
 * this package has no image decoder (gltfContainer.ts's doc comment on why: no GPU/DOM
 * dependency). Flagged here rather than silently skipped so it isn't mistaken for "checked and
 * fine": a future pass with real image decoding is where that specific check belongs.
 */
export function validateGltf(doc: GltfDocument): ImportWarning[] {
  const warnings: ImportWarning[] = [];

  for (const ext of doc.extensionsRequired ?? []) {
    if (!isSupportedExtension(ext)) {
      warnings.push({ severity: "error", message: `Required extension "${ext}" is not supported — this asset may not render correctly.` });
    }
  }
  for (const ext of doc.extensionsUsed ?? []) {
    if (!isSupportedExtension(ext) && !(doc.extensionsRequired ?? []).includes(ext)) {
      warnings.push({ severity: "warning", message: `Uses extension "${ext}", which isn't specifically recognized — imported best-effort.` });
    }
  }

  const bufferViewCount = doc.bufferViews?.length ?? 0;
  const referencedBufferViews = new Set<number>();
  for (const [i, accessor] of (doc.accessors ?? []).entries()) {
    if (accessor.bufferView !== undefined) {
      if (accessor.bufferView < 0 || accessor.bufferView >= bufferViewCount) {
        warnings.push({ severity: "error", message: `Accessor ${i} references out-of-range bufferView ${accessor.bufferView}.` });
      } else {
        referencedBufferViews.add(accessor.bufferView);
      }
    }
  }
  for (const image of doc.images ?? []) {
    if (image.bufferView !== undefined) referencedBufferViews.add(image.bufferView);
  }
  for (let i = 0; i < bufferViewCount; i++) {
    if (!referencedBufferViews.has(i)) warnings.push({ severity: "info", message: `bufferView ${i} is never referenced by any accessor or image.` });
  }

  const nodeCount = doc.nodes?.length ?? 0;
  const meshCount = doc.meshes?.length ?? 0;
  const skinCount = doc.skins?.length ?? 0;
  for (const [i, node] of (doc.nodes ?? []).entries()) {
    if (node.mesh !== undefined && (node.mesh < 0 || node.mesh >= meshCount)) {
      warnings.push({ severity: "error", message: `Node ${i} ("${node.name ?? "unnamed"}") references out-of-range mesh ${node.mesh}.` });
    }
    if (node.skin !== undefined && (node.skin < 0 || node.skin >= skinCount)) {
      warnings.push({ severity: "error", message: `Node ${i} ("${node.name ?? "unnamed"}") references out-of-range skin ${node.skin}.` });
    }
    for (const child of node.children ?? []) {
      if (child < 0 || child >= nodeCount) {
        warnings.push({ severity: "error", message: `Node ${i} ("${node.name ?? "unnamed"}") has an out-of-range child index ${child}.` });
      }
    }
  }
  if (doc.nodes) {
    const cycleAt = detectNodeCycle(doc.nodes);
    if (cycleAt !== null) warnings.push({ severity: "error", message: `Node hierarchy has a cycle involving node ${cycleAt} — cannot be instantiated as a tree.` });
  }

  const textureCount = doc.textures?.length ?? 0;
  const checkTextureRef = (materialIndex: number, label: string, ref: { index: number } | undefined) => {
    if (ref && (ref.index < 0 || ref.index >= textureCount)) {
      warnings.push({ severity: "error", message: `Material ${materialIndex} references out-of-range ${label} texture ${ref.index}.` });
    }
  };
  for (const [i, material] of (doc.materials ?? []).entries()) {
    checkTextureRef(i, "baseColor", material.pbrMetallicRoughness?.baseColorTexture);
    checkTextureRef(i, "metallicRoughness", material.pbrMetallicRoughness?.metallicRoughnessTexture);
    checkTextureRef(i, "normal", material.normalTexture);
    checkTextureRef(i, "occlusion", material.occlusionTexture);
    checkTextureRef(i, "emissive", material.emissiveTexture);
    if (!material.occlusionTexture) {
      warnings.push({ severity: "info", message: `Material ${i} ("${material.name ?? "unnamed"}") has no occlusion map — defaulting to fully unoccluded.` });
    }
  }

  for (const [i, mesh] of (doc.meshes ?? []).entries()) {
    for (const [p, prim] of mesh.primitives.entries()) {
      if (!("POSITION" in prim.attributes)) {
        warnings.push({ severity: "error", message: `Mesh ${i} ("${mesh.name ?? "unnamed"}") primitive ${p} has no POSITION attribute.` });
      }
    }
  }

  return warnings;
}
