/**
 * @3jse/extras — assemble-first imports. Battle-tested, MIT-licensed parts of
 * the Three.js ecosystem, adopted as dependencies instead of rebuilt.
 * Every entry is recorded in packages/vendor/licenses.json (see
 * docs/VENDOR_INTEGRATIONS.md, "Assemble-first posture").
 */

// BVH acceleration for raycasting/intersection on dense meshes (gkjohnson).
// Adopted for: runtime picking, physics queries over static geometry, Asset
// Pipeline collision-mesh generation (docs/PHYSICS.md, docs/ASSET_PIPELINE.md).
export * as meshBVH from "three-mesh-bvh";

// SDF text — crisp glyphs at any scale without texture atlases.
// Adopted for: HUD/UI panel, in-world labels, console overlay (docs/EDITOR.md).
export * as troikaText from "troika-three-text";

// The pmndrs postprocessing library — effects as composable passes.
// Adopted for: Environment Settings panel, Material/Shader Graph previews,
// the RENDERING.md post-processing stack.
export * as postprocessing from "postprocessing";

// Math helpers the r3f ecosystem standardized on (easing, damp, random).
// Adopted for: editor camera rigs, animation graphs, procedural templates.
export * as maath from "maath";

// Modern, tree-shakeable stdlib of three.js addons.
// Adopted for: gizmos, controls, loaders not yet upstreamed into three core.
export * as stdlib from "three-stdlib";

// Namespaced on purpose: these libraries overlap on names (Pass, RenderPass, BVH…)
// — consumers import a namespace, never an ambiguous star.
