// @3jse/terrain — the runtime meshing + streaming layer over a heightfield (BUILD_TASKS.md 5.1;
// docs/VENDOR_INTEGRATIONS.md "build the adapter layer"). Headless: the chunk mesher and the
// bounded-residency streamer return typed arrays / deltas a vitest asserts on; the editor
// viewport turns them into BufferGeometry. A vendored generation core (demiurge etc.) plugs in
// as the HeightSampler.

export {
  valueNoise2D,
  fbm,
  sampleNormal,
  sampleSlope,
  type HeightSampler,
} from "./heightfield.js";
export {
  meshChunk,
  lodResolution,
  type ChunkDesc,
  type ChunkMesh,
} from "./mesher.js";
export {
  TerrainStreamer,
  type StreamerOptions,
  type ResidentChunk,
  type StreamDelta,
} from "./streamer.js";
