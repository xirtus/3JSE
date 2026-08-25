/**
 * @3jse/terrain-demiurge — Tier A wrap of github.com/owenyuwono/demiurge (MIT).
 * Vendored at packages/vendor/upstream/demiurge (pin cb3e178, human-verified MIT).
 * Tectonic-plate planet generation: uplift → erosion → climate → biome.
 * The pure generation core is re-exported now; Planet/ChunkMesher become the
 * Phase 5+ @3jse/terrain procedural mode (docs/VENDOR_INTEGRATIONS.md).
 */
export * as noise from "../../vendor/upstream/demiurge/src/planet/noise.js";
export * as worldConstants from "../../vendor/upstream/demiurge/src/planet/worldConstants.js";
export * as tectonics from "../../vendor/upstream/demiurge/src/planet/tectonics.js";
export * as erosion from "../../vendor/upstream/demiurge/src/planet/erosion.js";
export * as climate from "../../vendor/upstream/demiurge/src/planet/climate.js";
export * as terrainSampler from "../../vendor/upstream/demiurge/src/planet/terrainSampler.js";
export * as meshProtocol from "../../vendor/upstream/demiurge/src/planet/meshProtocol.js";
export * as subsurface from "../../vendor/upstream/demiurge/src/planet/subsurface.js";
