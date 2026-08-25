// docs/ASSET_PIPELINE.md's "analyze" step needs a real, spec-shaped glTF 2.0 document to work
// against — this is the minimal subset of the spec's JSON schema this package actually reads,
// not the full spec (no cameras/lights/sparse-accessor/morph-target coverage yet; every field
// here is optional-safe the way the real spec allows). Deliberately not a THREE.js type: parsing
// stays free of any Three.js/DOM dependency (gltfContainer.ts's doc comment) so this analysis
// pass runs identically in the editor, headless CI, and under Agent control, per this doc's own
// "Goal" section.

export interface GltfAccessor {
  bufferView?: number;
  componentType: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4";
  min?: number[];
  max?: number[];
}

export interface GltfBufferView {
  buffer: number;
  byteLength: number;
  byteOffset?: number;
}

export interface GltfTextureRef {
  index: number;
  texCoord?: number;
  scale?: number; // normalTexture
  strength?: number; // occlusionTexture
}

export interface GltfPbrMetallicRoughness {
  baseColorTexture?: GltfTextureRef;
  metallicRoughnessTexture?: GltfTextureRef;
  metallicFactor?: number;
  roughnessFactor?: number;
}

export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: GltfPbrMetallicRoughness;
  normalTexture?: GltfTextureRef;
  occlusionTexture?: GltfTextureRef;
  emissiveTexture?: GltfTextureRef;
  emissiveFactor?: [number, number, number];
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
}

export interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
}

export interface GltfSkin {
  name?: string;
  joints: number[];
}

export interface GltfScene {
  nodes?: number[];
}

export interface GltfDocument {
  asset: { version: string; generator?: string };
  scene?: number;
  scenes?: GltfScene[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  materials?: GltfMaterial[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: { byteLength: number; uri?: string }[];
  skins?: GltfSkin[];
  animations?: unknown[];
  textures?: { source?: number }[];
  images?: { uri?: string; bufferView?: number }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}
