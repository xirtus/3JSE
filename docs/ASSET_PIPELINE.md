# Asset Pipeline

## Goal

Dragging a file into the Content Browser should produce something closer to "imported and understood" than "copied and referenced." The pipeline runs identically in the editor (drag-and-drop), headless (CLI/CI), and under Agent control (`assets.import` in `AI_AGENT_API.md`) — one implementation, three callers, per `ARCHITECTURE.md` principle 3.

## Supported formats

| Category | Formats |
|---|---|
| Meshes/scenes | glTF, GLB (primary/recommended), FBX, OBJ, USD/USDZ (import-only, best-effort — USD's full spec is not a near-term target; a practical geometry+material subset is) |
| Textures | PNG, JPG, KTX2/Basis, HDR/EXR |
| Environment | HDRI (equirectangular) |
| Audio | WAV, MP3, OGG/Opus |
| Video | MP4/WebM (for in-world screens, cutscene playback) |
| Fonts | TTF/OTF, plus MSDF atlas generation for crisp in-world/UI text |
| Animation | Embedded in glTF/FBX; standalone retargetable clips |

GLB/glTF is the pipeline's native, best-supported path — it's already Three.js's best-supported format and already carries PBR materials, skeletons, and animation in one container. FBX/OBJ/USD support exists for **import convenience** from other DCC tools, converting into 3JSE's own internal representations rather than being treated as first-class native formats the rest of the engine needs to understand.

## What "analyze" means, concretely

On import, the pipeline runs a fixed analysis pass and stages results as **suggestions**, not silent automatic mutation — a human (or an agent) approves what actually lands in the project:

- **Character detection**: a rigged mesh with a recognizable humanoid/creature bone hierarchy is flagged as "likely a character" and offered a starter Entity — `Transform`, `AnimationController`, an empty `CharacterController` slot — instead of landing as an inert mesh. This is the literal "drag a rigged GLB in and 3JSE understands it's probably a character" behavior from `VISION.md`, implemented as bone-naming/hierarchy heuristics (root/hip/spine/limb pattern matching), not a black-box ML classifier.
- **Skeleton/animation detection**: separates static meshes from skinned meshes, groups animation clips by armature, and offers clip renaming/retargeting (`ANIMATION.md`).
- **LOD generation**: mesh simplification at 2–3 automatic tiers (configurable), using a standard edge-collapse simplifier; a human can always author custom LODs instead.
- **Texture compression**: transcodes to KTX2/Basis for GPU-native formats, with per-platform target format selection (BCn desktop, ASTC/ETC2 mobile) baked in at build time (`BUILD_DEPLOYMENT.md`), not import time — so the *source* texture is preserved and re-transcoded whenever the target matrix changes.
- **Mesh compression**: Draco or meshopt encoding for delivery size, chosen per the streaming needs in `PERFORMANCE.md`.
- **Collider generation**: convex-hull or simplified-mesh collider suggestion for `@3jse/physics-rapier`, offered alongside the visual mesh rather than assumed identical to it.
- **Thumbnails**: rendered automatically for the Content Browser at import time and cached.
- **Metadata**: bounding box, triangle/material/bone counts, source file hash — surfaced in the Inspector and to `scene.query` so an agent can reason about asset cost without loading it.
- **Dependency tracking**: every asset records what it references (a Material referencing a Texture, a Prefab referencing a Mesh) and what references it — this is the data the Asset Dependency Viewer panel (`EDITOR.md`) renders directly.

## Storage model

Imported assets are content-addressed internally (a hash of the source file) so re-importing an identical file is a no-op and two projects sharing an asset (via a Grid-style package, future work) don't duplicate storage needlessly. The human-facing project tree (`PROJECT_FORMAT.md`) still shows assets under conventional, readable paths — content-addressing is an implementation detail of the cache, not something that leaks into how a developer browses the project.

## Headless and CI use

`3jse assets import <path> --headless` runs the identical analysis pipeline outside the editor, emitting the same suggestion JSON the editor's import dialog would show, for scripted bulk-import pipelines and for the Agent API's `assets.import` tool. There is exactly one asset-analysis implementation; the editor UI and the CLI are both thin callers of it.
