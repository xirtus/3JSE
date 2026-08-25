# Project modules

Unreal asks which plugins a project loads. Godot asks which addons a project enables. 3JSE does the same thing at New Project time: a checklist of **capabilities**, each backed by one or more `@3jse/vendor` registry entries. Checking a box writes ordinary package dependencies into `project.json` (`TEMPLATES.md`, `PROJECT_FORMAT.md`) — never a second, hidden project format.

The live catalog is [`packages/vendor/registry.json`](../packages/vendor/registry.json). This page is the policy for how those rows become checkboxes, and the case notes for the wave added 2026-08-24.

## How a checkbox behaves

| User action | What actually happens |
|---|---|
| Check a **Tier A** module | Install the `@3jse/<capability>-<upstream>` wrapper. The game depends on the wrapper, not the upstream Vite app. |
| Check a **Tier B** module | Fetch the pinned-commit tarball into `/plugins/_vendor/<id>/`, write `THIRD_PARTY_NOTICES`, do **not** execute the source. A human or agent still has to adapt it onto an extension point before Play or Publish. |
| A **reference** row | Visible in the Open Source panel with a Reference badge. No checkbox. No staging. |
| Uncheck before first Play | Drop the dependency / delete the staged folder. |
| Leave a Tier B staged and referenced at Publish | Build fails loud (`VENDOR_INTEGRATIONS.md`). |

Editor-only modules (`editorOnly: true` in the registry) never appear in a Publish graph. Text-to-motion is the first of those.

## Module ↔ template defaults

These are defaults, not locks — a Third Person project can still enable water later.

| Template | Pre-checked modules |
|---|---|
| Third Person / First Person / Platformer | motion-gen (editor tool, off unless the machine can run it) |
| Surfing | water (poseidon) |
| Open World | water, foliage, flora, terrain |
| FPS / RPG | vfx |
| Physics Sandbox | fluid |
| Walking Simulator | foliage |

## Wave added 2026-08-24

### Kimodo — text-to-motion as an editor tool, not a runtime

Sources:

- NVIDIA upstream: [github.com/nv-tlabs/kimodo](https://github.com/nv-tlabs/kimodo) — Apache-2.0 **code**. Checkpoints are a different license: SOMA/G1 = NVIDIA Open Model (commercial-friendly); `Kimodo-SMPLX-RP-v1` = NVIDIA R&D Model. Llama-family text encoder has its own Hugging Face terms.
- LocalAI port: [github.com/localai-org/kimodo.cpp](https://github.com/localai-org/kimodo.cpp) — C++/GGML, CPU or Vulkan, C API emits SMPL-X22 local rotations + root translation. Write-up: [3dxdev.com … kimodo-cpp](https://3dxdev.com/assets/kimodo-cpp-text-to-motion-animation-running-locally-in-c/). **No LICENSE file in the tree** as of pin `e55a42a`. That is why it is Tier B with `verifiedBy` empty, even though the NVIDIA repo is Apache-2.0. Do not inherit a license across repositories.

3JSE shape: an Animation panel action, "Generate clip from prompt." Inference runs in a Tauri sidecar (or a user-provided LocalAI endpoint), the clip is retargeted onto `@3jse/character`, and the weights stay on disk. Nothing about Kimodo is a game-side System. A WASM/GGML in-page path is a later experiment, gated on the cpp license read.

Prefer SOMA-RP-v1.1 over the SMPL-X R&D checkpoint for anything that might ship near a commercial project.

### Chiro Elemental Sandbox — Niagara-class ability VFX, still a demo shell

Sources:

- Canonical: [github.com/achrefelouafi/LinearAbiltyCastingThreeJS](https://github.com/achrefelouafi/LinearAbiltyCastingThreeJS) — MIT, LICENSE read 2026-08-24, pin `ba61847`.
- Expansion fork: [github.com/majidmanzarpour/threejs-vfx](https://github.com/majidmanzarpour/threejs-vfx) — same MIT text.
- Live: [linearabilityextthreejs.pages.dev](https://linearabilityextthreejs.pages.dev/)
- Signal: [x.com/TokenGremlin/status/2091967294582727005](https://x.com/TokenGremlin/status/2091967294582727005), author [x.com/chirovisuals](https://x.com/chirovisuals)

What it actually is: hand-written GLSL, GPU instanced particles, procedural geometry, ten abilities (radials, boosts, portals, one linear cast), and a pause-and-sculpt slider bank. No textures, no sprite sheets, no baked effect meshes.

Same extraction job as poseidon. The reusable core is the emitter + shader graph for each ability, not the character controller and not the 938-slider debug chrome. Planned wrap: `@3jse/vfx-chiro`. Stays Tier B until that extraction exists and a WebGPU/TSL path is sketched — upstream is WebGL/GLSL.

The interaction model (freeze a spell mid-frame, reshape timing and silhouette) is what Phase 5's VFX graph should feel like. That part is a pattern port even if the GLSL is later rewritten.

Complement, not duplicate: [mustache-dev/Three-VFX](https://github.com/mustache-dev/Three-VFX) is the closer-to-a-library GPU particle engine (MIT file present, `verifiedBy` still pending). Chiro is the ability pack; Three-VFX is the particle backend candidate.

### Quantum Core — look-dev only

Source: [CodePen / sabosugi](https://codepen.io/editor/sabosugi/pen/01a02fca-0d14-7e50-a9b8-283d419ccaea?file=%2Findex.html), signal [x.com/sabosugi/status/2091589195626328506](https://x.com/sabosugi/status/2091589195626328506).

No GitHub mirror, no LICENSE. Registry tier is `reference`. The Open Source panel may link the pen for art-direction reference. It must not stage, import, or paste CodePen source. If the author publishes a repo under MIT/Apache/BSD/CC0, reopen as Tier B.

### Already on the books (Owen pantheon)

Unchanged policy, now also addressable as project-module checkboxes:

| Checkbox | Upstream | Wrap |
|---|---|---|
| Water / Ocean | [owenyuwono/poseidon](https://github.com/owenyuwono/poseidon) | `@3jse/water-poseidon` |
| Foliage / Grass | [owenyuwono/gaia](https://github.com/owenyuwono/gaia) | `@3jse/foliage-gaia` |
| Trees / Flora | [owenyuwono/dryad](https://github.com/owenyuwono/dryad) | `@3jse/flora-dryad` |
| Terrain / Planet | [owenyuwono/demiurge](https://github.com/owenyuwono/demiurge) | `@3jse/terrain-demiurge` |
| Particle fluids | [owenyuwono/tiamat](https://github.com/owenyuwono/tiamat) | staged until LICENSE BOM verification is marked human |

`apate` and `minos` stay reference.

### Deliberately not a module

**Three.js Water Pro** (paid store asset) — same capability as poseidon, proprietary license. 3JSE does not vendor store assets.

## Curator queue

Before any of the new B rows can move:

1. Read `localai-org/kimodo.cpp` NOTICE + source headers; write an SPDX or keep it B forever.
2. Flip `tiamat.license.verifiedBy` to `human` (LICENSE is MIT; detector is wrong).
3. Read `mustache-dev/Three-VFX/LICENSE.md` and `matsuoka-601/WebGPU-Ocean` LICENSE.
4. Pin `dryad` / `demiurge` / `tiamat` to full SHAs the way poseidon already is.
5. Watch for a licensed GitHub mirror of Quantum Core — do not chase the pen.
