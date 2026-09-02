// @3jse/render — the THREE-side bridge that materialises the headless cores' output into a live
// scene (docs/ENGINE_GAP_ANALYSIS.md §6 "the GPU/viewport half"). Imports three/webgpu; the
// simulation/generation logic stays in @3jse/{terrain,foliage,vfx} where it's unit-tested.
// Used by the editor Viewport and by @3jse/packaging's shipped-game bootstrap.

export { TerrainRenderer } from "./TerrainRenderer.js";
export { FoliageRenderer, type FoliageSpecies } from "./FoliageRenderer.js";
export { ParticleRenderer } from "./ParticleRenderer.js";
export { GpuParticleRenderer } from "./GpuParticleRenderer.js";
export { terrainSplatMaterial, type TerrainSplatOptions, type TerrainSplatMaterial } from "./materials.js";
export { type TerrainData, type FoliageFieldData } from "./components.js";

// Registers Terrain / FoliageField as an import side effect.
import "./components.js";
