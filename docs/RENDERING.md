# Rendering

## Posture toward Three.js

3JSE does not build a renderer. It builds an authoring and orchestration layer on top of Three.js's `WebGPURenderer` (with WebGL2 as its existing automatic fallback), consistent with `ARCHITECTURE.md` principle 1. Nothing in this document proposes reimplementing what Three.js already does well; it proposes exposing it through the editor and a graph-based material authoring tool, and adding the render-graph/quality-tier orchestration Three.js intentionally leaves to the application.

## Material Graph

A visual node editor, analogous in day-to-day usability to Unreal's Material Editor, that compiles **into Three.js's own TSL (Three Shading Language) node system** rather than emitting WGSL/GLSL text from a competing shader-graph implementation. This is the same architectural principle as `GAMEPLAY_IR.md` applied to shading: one canonical representation (here, TSL's own node graph, which Three.js already backs with both a WebGPU/WGSL and a WebGL/GLSL code path) instead of a second parallel compiler 3JSE would have to maintain.

Supported node categories:

- **PBR building blocks**: albedo, metalness/roughness, normal, AO, emissive — the standard TSL `MeshStandardNodeMaterial`/`MeshPhysicalNodeMaterial` inputs, exposed as graph pins.
- **Textures**: sampling, UV transforms, triplanar projection.
- **Procedural**: noise (Perlin/Simplex/Worley), gradients, patterns.
- **Math**: the standard node-graph arithmetic/vector/trig library.
- **Normals/displacement**: normal blending, parallax, vertex displacement (including for terrain — `PLUGIN_ARCHITECTURE.md`'s `@3jse/terrain`).
- **Vertex animation**: wind sway, wave displacement — driven by TSL's vertex-stage node graph, usable by `@3jse/water` and `@3jse/foliage` directly.
- **Transparency/blending**: alpha modes, refraction approximations.
- **Post-processing**: the same node graph authors screen-space effects against Three.js's WebGPU-native pass system, exposed in the editor as an ordered, reorderable effect stack (Environment Settings panel, `EDITOR.md`).
- **Compute**: TSL's compute-shader nodes are exposed for advanced users/plugins (GPU particle simulation, GPU-driven foliage placement) — a deliberately advanced, opt-in node category rather than part of the default palette.
- **Custom nodes**: a plugin can register a new Material Graph node the same way it registers a 3JSE Graph node (`PLUGIN_ARCHITECTURE.md`) — both are instances of the same "register a typed node into a graph editor" extension point.

### Why TSL specifically, and what the WebGL2 fallback means

TSL's node graph already compiles to both WGSL (WebGPU) and GLSL (WebGL2) from one authored graph — Three.js did the hard cross-backend compiler work already. 3JSE's Material Graph editor is therefore a **visual authoring surface over an existing, maintained compiler**, not a rendering-backend project of its own. A material authored once in the Material Graph works on both backends automatically, and the WebGL2 fallback (`RUNTIME.md`, `PERFORMANCE.md`) never requires a parallel authoring path.

## Render graph and quality tiers

Three.js's renderer gives an application control over what to draw and how; 3JSE's runtime adds the orchestration layer an application-level project needs and shouldn't have to hand-roll each time: an ordered render-pass graph (opaque → transparent → post-process, with plugin-registerable custom passes — `@3jse/water`'s refraction pass, for instance), and a small set of **quality tiers** (see `PERFORMANCE.md` for the full budget table) that scale shadow resolution, post-processing complexity, particle density, and LOD bias together as one selectable unit rather than dozens of independent settings a developer has to reason about combinatorially.

## Environment and lighting

The Environment Settings panel (`EDITOR.md`) exposes sky/HDRI, fog, and a lighting-preset system on top of Three.js's existing light types and image-based lighting support — again orchestration and presets, not new lighting math. Global illumination beyond what Three.js's roadmap provides (baked or real-time) is explicitly out of scope for 3JSE's early phases (`VISION.md`'s non-goals, `ROADMAP.md`) — 3JSE tracks and adopts Three.js's own GI capabilities as they mature rather than building a competing solution.
