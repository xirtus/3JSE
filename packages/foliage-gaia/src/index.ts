/**
 * @3jse/foliage-gaia — Tier A wrap of github.com/owenyuwono/gaia (MIT).
 * Vendored at packages/vendor/upstream/gaia (pin f23a32d, human-verified MIT).
 * The pure generation half (genome + seed → skeleton graph, zero authored
 * assets) is re-exported now — Node-testable, no Three.js import. The
 * rendering half becomes an InstancedMesh System in the editor slice.
 */
export * as rng from "../../vendor/upstream/gaia/src/rng.js";
export * as genomeSchema from "../../vendor/upstream/gaia/src/genomeSchema.js";
export * as skeleton from "../../vendor/upstream/gaia/src/skeleton.js";
export * as presets from "../../vendor/upstream/gaia/src/presets.js";
export * as fieldScatter from "../../vendor/upstream/gaia/src/fieldScatter.js";
export * as bladeMesh from "../../vendor/upstream/gaia/src/bladeMesh.js";
