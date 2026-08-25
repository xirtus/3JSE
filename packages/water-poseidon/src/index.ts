/**
 * @3jse/water-poseidon — Tier A wrap of github.com/owenyuwono/poseidon (MIT).
 * Vendored at packages/vendor/upstream/poseidon (pin 671053b, human-verified MIT).
 * The pure ocean math core is re-exported now; the WebGPU/TSL material half
 * becomes a WaterVolume Component + System in the editor slice
 * (docs/VENDOR_INTEGRATIONS.md, worked examples).
 */
export * as fft from "../../vendor/upstream/poseidon/src/ocean/fft.js";
export * as spectrum from "../../vendor/upstream/poseidon/src/ocean/spectrum.js";
export * as gaussianNoise from "../../vendor/upstream/poseidon/src/ocean/gaussianNoise.js";
export * as params from "../../vendor/upstream/poseidon/src/ocean/params.js";
export * as maps from "../../vendor/upstream/poseidon/src/ocean/maps.js";
