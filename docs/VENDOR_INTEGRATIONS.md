# Vendor Integrations

## Why this document exists

`PLUGIN_ARCHITECTURE.md` names `@3jse/water` and `@3jse/foliage` as official plugins to be built. That was written before checking whether they need to be *built* at all. They mostly don't. The Three.js/WebGPU ecosystem already has individual developers shipping water and vegetation work that is better than what a small core team would produce from scratch in the same timeframe — this document replaces "someday we'll build these" with a concrete policy for wrapping that work instead, plus an in-editor mechanism for pulling in the next one without waiting for a core-team release cycle.

This is `ARCHITECTURE.md` principle 4 ("plugins are first-class") and the build/wrap/adopt framework in `PLUGIN_ARCHITECTURE.md`, made concrete against real repositories instead of a hypothetical table. A third case study extends the same discipline to the adjacent engine itself: Babylon.js — what 3JSE differentiates against, and what its permissively-licensed tooling stack offers as reference.

## Case study: github.com/owenyuwono

Checked directly against the live GitHub API rather than assumed. Findings:

| Repo | Stars | Stack | License (as declared) | What it is |
|---|---|---|---|---|
| **poseidon** | 272 | JS, Three.js + WebGPU/TSL | MIT | GPU-driven real-time FFT (Tessendorf) ocean, three IFFT cascades as WebGPU compute shaders |
| **gaia** (`grassgen`) | 37 | JS, Three.js | MIT | Deterministic procedural grass — genome + seed → geometry, zero authored assets |
| **dryad** | 31 | JS, Three.js | MIT | Deterministic procedural trees — same genome/seed approach as gaia, shared author, compatible design |
| **demiurge** | 33 | TS, Three.js + WebGPU | MIT | Tectonic-plate procedural planet: uplift → erosion → climate → biome, no heightmap |
| **apate** | 17 | GLSL, Three.js | MIT | A comparison of four surface-relief techniques (normal map / POM / SPOM / real displacement) on one shared shader |
| **tiamat** | 33 | TS, Three.js | **MIT — but see below** | 100k-particle SPH fluid simulation, raymarched water |
| **minos** | 5 | Rust + Vulkan (`ash`) | MIT | A *different runtime entirely* — native planet/terrain/ocean/character engine, not a Three.js codebase |

**The `tiamat` case is the reason this document insists on human verification, not automated trust:** GitHub's repository metadata API reports `tiamat`'s license as `NOASSERTION` — its automatic license detector could not confidently classify it. Reading the actual `LICENSE` file directly shows a completely standard MIT license; the detector almost certainly chokes on a leading UTF-8 byte-order-mark character before the text. Trusting the API field alone would have wrongly routed a permissively-licensed, bundle-eligible package into the "contact the author first" tier. **The registry pipeline below always reads and stores the literal license file text, and requires a human (or the Curator agent, `AI_AGENT_API.md`) to confirm it, never the platform's auto-classification alone.**

`minos` is included for completeness and is explicitly *not* an integration candidate at the code level — it's Rust targeting Vulkan directly, a different runtime from the browser/Three.js stack this entire engine is built on (`ARCHITECTURE.md` principle 1). It's valuable as an **algorithm reference**: its tectonic-plate terrain model and its Rust port of `dryad`'s tree generator are worth reading when `@3jse/terrain` and `@3jse/flora-dryad` are implemented, even though zero code crosses over.

## Case study: github.com/galacean/editor-ui

A second, differently-shaped case, worth documenting precisely because it *doesn't* fit the pattern above and clarifies where the line is.

[Galacean](https://github.com/galacean/engine) is a mature, actively-maintained TypeScript 3D engine (5,800+ stars, MIT, Alibaba-backed) with its own professional editor. `@galacean/editor-ui` and `@galacean/gui` are the React component libraries that editor's Inspector/panel UI is built from, published as standalone packages: `ColorPicker`, `BezierCurveEditor`, `GradientSlider`, `ParticleSlider`, `AssetPicker`, and typed property-form components (`FormItemVector3`, `FormItemColor`, …). Checked directly: both packages are MIT, and — confirmed by reading `packages/ui/package.json` and `packages/gui/package.json`, not assumed from the README — their only runtime/peer dependencies are React, React-DOM, Radix UI primitives, and Stitches. Neither package depends on `@galacean/engine` at runtime; that only appears as a *devDependency* of the monorepo's demo app. This is a genuinely engine-agnostic UI library, not a Galacean-coupled one — adopting it does not pull in another engine's rendering or scene-graph assumptions.

**Why this is Tier A but doesn't go through the `@3jse/vendor` registry**: the registry and the `@3jse/<capability>-<upstream>` wrapping convention exist for *project-facing content and gameplay plugins* — things a game built in 3JSE optionally depends on (water, foliage, terrain). An editor UI toolkit is a foundational dependency of `@3jse/editor` itself, the same category as Monaco for the Code Editor panel (`PLUGIN_ARCHITECTURE.md`'s build/wrap/adopt table) — every 3JSE project uses it or none do, there's no per-project opt-in decision, and it never ships inside a game's Publish build at all (`BUILD_DEPLOYMENT.md`'s tree-shaking already excludes the entire editor). Routing it through the same registry/staging/attribution machinery built for game-content plugins would be the wrong mechanism for the right instinct. It's adopted once, directly, as documented in `EDITOR.md`'s "UI implementation" section — full credit given there and in the engine's own `THIRD_PARTY_NOTICES`, same as any other adopted dependency, but without a Tier A/Tier B decision to make per project.

The one real commitment this adoption forces, stated plainly: it pins the editor's UI layer to **React**. `ARCHITECTURE.md` and `EDITOR.md` previously left that framework choice open; this is the concrete reason to close it now rather than defer it further — a library this well-matched to the exact problem (built by a team that has already shipped a professional 3D editor's Inspector) is worth the commitment, and Tauri's webview hosting model (`EDITOR.md`) is indifferent to which framework runs inside it.

## Case study: Babylon.js — the adjacent engine

The two case studies above cover small demo repositories and an editor UI library. This one covers the one project actually *adjacent* to 3JSE itself, and it exists for a different reason than either. Babylon.js (Apache-2.0, Microsoft-backed, first released 2013) is the closest thing to 3JSE in the world — a TypeScript, WebGPU-capable engine with a deep tooling stack. That means two jobs: **(1)** pin the differentiation hard enough that 3JSE never drifts into rebuilding Babylon, and **(2)** inventory what to adopt, because well over a decade of permissively-licensed tooling is the best free reference stack in web 3D — ignoring it would violate the same build/wrap/adopt discipline this document exists for.

### What Babylon actually is

Checked against the public repository and docs, not assumed:

| Piece | What it is | License |
|---|---|---|
| `@babylonjs/core` + ~30 satellite packages | Monolithic engine; satellites are tightly coupled to core internals | Apache-2.0 |
| Own renderer | WebGL2 + WebGPU paths maintained in-house, plus Babylon Native (JSI-based native runtime for iOS/Android/desktop) | Apache-2.0 |
| Playground | Browser REPL with shareable snippet IDs — their community and docs engine | Apache-2.0 |
| Inspector | Runtime debug overlay: picking, property readout, render stats | Apache-2.0 |
| Node Material Editor (NME) | Visual shader authoring with frame nodes and previews — materials only, no gameplay logic | Apache-2.0 |
| glTF sandbox / validator | Asset-checking tooling, environment studio, Draco/KTX2/BasisU handling | Apache-2.0 |
| Physics plugins | Ammo, Cannon, Havok (WASM), Oimo behind one plugin interface | Apache-2.0 |
| Scene serialization | Engine-coupled `.babylon` format with its own versioning history | — |
| Governance | Yearly majors, long deprecation warnings, public breaking-changes policy | — |

### How 3JSE differs — pinned

Babylon is the best renderer the web has. 3JSE is everything a renderer needs around it to become a platform. That is a different layer, not a better renderer — `VISION.md`'s non-goals apply to Babylon exactly as they apply to Unreal:

1. **Platform-first vs engine-first.** Babylon's primary authoring surface is code; its serialization is engine-coupled. 3JSE's primary authoring surface is the editor (`EDITOR.md`), and the runtime is one standalone layer of ten (`ARCHITECTURE.md`).
2. **One IR, four frontends vs code-only plus materials-only graphs.** NME is excellent at shaders and says nothing about gameplay. 3JSE Graph compiles to the same IR as hand-written TypeScript (`GAMEPLAY_IR.md`, `VISUAL_SCRIPTING.md`), bidirectionally — there is no Babylon equivalent to editing logic in a graph and reading it back as code.
3. **AI-native vs library.** An agent operating Babylon writes JavaScript against a library, the same posture as raw Three.js. An agent operating 3JSE uses the editor's own command surface and verifies by running the game (`AI_AGENT_API.md`). Nothing about Babylon's architecture prevents this — it simply was not designed in, and retrofitting it onto a monolith is a different project from designing it in from layer 0.
4. **Project format.** `.babylon` is an engine artifact; 3JSE projects are readable, deterministic, git-diffable text (`PROJECT_FORMAT.md`).
5. **Renderer posture.** Babylon's financing went into owning the renderer — that is its bet and its moat. 3JSE's bet is the opposite: Three.js as an upgradable dependency, never a fork (`ARCHITECTURE.md` principle 1), fighting everywhere the renderer *isn't*.
6. **Governance and coupling.** Microsoft-backed MIT vs independent GPL-3.0; a monolith with coupled satellites vs a small core with first-class plugins (`PLUGIN_ARCHITECTURE.md`). Both are coherent; they produce different guarantees.

### What to adopt — the inventory

- **The Playground mechanism (adopt the mechanism, Phase 2).** Snippet IDs in URLs, save-to-gist, docs/forum integration. 3JSE's editor-in-a-tab is already half a playground; shareable project-link mechanics turn "share a project by URL" (`EDITOR.md`) from a convenience into a community engine. No Babylon code is needed — the *mechanism* is the asset.
- **Inspector → reference for a Viewport debug overlay (reference).** Picking, property readout, and draw-call stats as a dev-time overlay fit the Profiler/Console panel family (`EDITOR.md`) directly; port the pattern, never the code (engine-coupled to `@babylonjs/core`).
- **NME → the Material/Shader Graph's UX reference (reference).** Frame nodes, preview thumbnails, subgraphs — `RENDERING.md`'s TSL-compiling graph gets its interaction model from NME the way `apate` contributed techniques below: as documented pattern ports, never imported code.
- **glTF sandbox/validator → the Asset Pipeline's analyze checklist.** Their validation list, environment-studio conventions, and Draco/KTX2/BasisU matrix are a ready-made spec for `ASSET_PIPELINE.md`'s analyze-and-suggest step.
- **Multi-backend physics plugin API → validation for `@3jse/physics-rapier`.** Ammo/Cannon/Havok/Oimo behind one interface (`PHYSICS.md`) proves the abstraction; when a second backend arrives it slots in the same way — the registry's physics capability notes should flag this for the day that happens.
- **GPU particle architecture → Phase 5 VFX graph reference.** Compute-based, per-particle data textures — the architecture `ROADMAP.md` Phase 5's VFX graph should adopt rather than CPU-reinvent.
- **Babylon Native → input for `BUILD_DEPLOYMENT.md`'s mobile/desktop story.** Their JSI shell is the alternative to the Tauri-plus-wrapper route; studying it either validates the current bet or changes it cheaply, before `BUILD_DEPLOYMENT.md`'s wrapper phase locks in.
- **Serialization and versioning history → free hardening for `PROJECT_FORMAT.md`.** A decade-plus of "what breaks between versions," plus a public yearly-major deprecation policy, are the two inputs `PROJECT_FORMAT.md`'s migration design and `PLUGIN_ARCHITECTURE.md`'s stability guarantees should be checked against.
- **Docs discipline.** Every Babylon feature page carries a live Playground snippet. Once the Playground mechanism lands, 3JSE docs should require the same — the manual is design-strong and example-thin today.

### Registry entries — a third disposition: reference

The two adoptable codebases (Inspector, NME) are Apache-2.0 and pass the license gate, but Tier A's criterion — "adaptable without forking the upstream project wholesale" — they fail: both are wired into `@babylonjs/core` internals, and extracting them is a rewrite, not a wrap. Tier B's project-level staging is the wrong mechanism for the same reason the Galacean adoption above is: engine-team reference material is not a per-project opt-in decision. The registry therefore gains a third disposition, **`reference`**, formalizing the precedent `minos` and `apate` already set informally:

```json
{
  "id": "babylon-nme",
  "source": "github.com/BabylonJS/Babylon.js",
  "pinnedCommit": "<reviewed-commit>",
  "license": { "spdx": "Apache-2.0", "verifiedBy": "human", "verifiedAt": "2026-08-24" },
  "stack": { "renderer": "webgl2+webgpu", "framework": "babylon.js" },
  "tier": "reference",
  "package": null,
  "capability": "material-graph-ux",
  "notes": "Reference only. The frame-node/preview/subgraph interaction model is the adoptable core; port patterns into RENDERING.md's Material Graph, never import. Engine-coupled to @babylonjs/core."
}
```

Reference entries appear in the Open Source panel with a "Reference" badge and attribution, have no import button, and cannot be staged into a project. They exist so that a human or an agent porting patterns has the pinned, license-verified source attached to the task — the same plan → act → verify loop as a Tier B adaptation, minus the project-local staging. `babylon-inspector` is the second entry; the Playground, glTF-sandbox, physics-API, and serialization rows above are adoption notes, not entries — there is no code to stage.

### What deliberately is not adopted

- **The community Babylon.js Editor.** An editor bolted onto a code-first engine, operating outside the engine's own command surface — precisely the "parallel, drifting authority" failure mode `ARCHITECTURE.md` principle 3 exists to prevent. It is the clearest available evidence that 3JSE's editor-as-GUI-for-the-command-API design is the correct bet, not a stylistic choice.
- **The monolith's coupling model.** Satellite packages reaching into core internals is how one well-funded team ships fast; it is also the opposite of the plugin boundary `PLUGIN_ARCHITECTURE.md` needs. Adopt their output, not their structure.
- **The renderer war.** Babylon maintains WebGL2, WebGPU, and a native runtime in-house. 3JSE rides Three.js and its WebGPU migration (`PERFORMANCE.md`'s dual-path posture) — matching Babylon's renderer investment is a non-goal (`VISION.md`), not a gap.

## Assemble-first posture

Scaffold, then assemble. It is 2026 — the Three.js ecosystem ships better parts, faster, than any small team builds from scratch, and cutting-edge AI projects appear weekly. The default for every new capability is therefore the build/wrap/adopt ladder, in this order: **adopt** (import a battle-tested dependency), **wrap** (extract a demo's core into an `@3jse/*` package — the Tier A job), and only **build** when nothing good exists. "The AI will build it" is the last resort, not the first step; the Agent API exists to *assemble* these parts correctly, fast.

The first wave is `@3jse/extras`: `three-mesh-bvh` (picking/raycast acceleration), `troika-three-text` (SDF text), `postprocessing` (composable effects), `maath` (standardized math helpers), and `three-stdlib` (modern addons) — all MIT, all adopted as dependencies, each with a doc comment naming what 3JSE uses it for.

### The license notebook — bookkeeping, not archaeology

Licensing headaches disappear by *recording* licenses, not by avoiding third-party code. `packages/vendor/licenses.json` is the machine-readable notebook for everything the workspace depends on, generated by `tools/license-scan.mjs` — run it after any dependency change:

- **Workspace dependencies** — every installed package's license + repo, read from the *actually installed* `package.json` (the pnpm store, not the declared range). `verifiedBy: "installed-package-json"`.
- **Vendor registry entries** — merged with their human-verified status, so the notebook shows the full picture in one place.
- **Human overrides** — packages whose npm metadata lacks a license field but whose repo LICENSE was read by a human (the Galacean case is the first entry).

License posture, stated plainly: **MIT / Apache-2.0 / BSD / Zlib — adopt freely. GPL — adopt freely; 3JSE is GPL-3.0 and the copyleft flowing onward is a feature, not a bug. AGPL — adopt with eyes open: network-use obligations travel. Unlicensed or NOASSERTION — the BOM rule applies** (`tiamat`'s case above): read the LICENSE file; if none exists, treat the work as all-rights-reserved regardless of what the platform's API field says. Cutting-edge AI projects enter through the same door as everything else — Shop entry or Tier B staging, license recorded, nothing executed at import.

## Two integration tiers

### Tier A — Bundled official plugin

**Criteria**: permissively licensed (MIT/BSD/Apache-2.0/CC0, human-verified per above), technically adaptable into the Component/System/Graph-node shape (`PLUGIN_ARCHITECTURE.md`'s extension points) without forking the upstream project wholesale, and not dependent on a runtime 3JSE doesn't already target.

**What "adapted" means here matters.** None of poseidon, gaia, dryad, demiurge, or apate are npm libraries — they are, in the authors' own words, "browser prototypes": a Vite app with its own `main.ts`, its own camera rig, its own scene bootstrap, built to be run and looked at, not imported. Tier A is not `npm install poseidon-ocean` — it's extracting the reusable core (the compute pass, the material, the generation algorithm) out of the demo shell and re-homing it as a `@3jse/*` package that registers a Component, a System, and Graph/Material-Graph nodes the way `PLUGIN_ARCHITECTURE.md` specifies, crediting the upstream source in the package itself. That extraction is real, non-trivial engineering per package — this document is not claiming otherwise.

Naming convention: `@3jse/<capability>-<upstream-name>`, so the origin stays visible in every `package.json` and every dependency graph, permanently — e.g. `@3jse/water-poseidon`, `@3jse/foliage-gaia`, `@3jse/flora-dryad`.

### Tier B — Fetch-on-demand community import

**Criteria**: everything else — license unclear or not yet human-verified, not yet adapted, or simply not curated into Tier A yet. This is the default landing tier for anything new; graduating to Tier A is a deliberate, reviewed step, never automatic.

Tier B packages are **never bundled into the default install or a shipped Publish build**. They are pulled into a specific project on explicit user action inside the editor, staged as visible, attributed reference source, and left for a human or an AI agent to adapt — the Agent API's plan → act → verify loop (`AI_AGENT_API.md`) applies directly here: "adapt the staged `tiamat` fluid sim into a `FluidVolume` component" is a legitimate agent task once a human has confirmed the license is acceptable for the project.

A third disposition, **`reference`**, covers engine-team reference material that is neither a per-project import nor a wrap — defined in the Babylon.js case study above, formalizing the `minos`/`apate` precedent. Reference entries are listed for attribution and attachable to agent tasks, but have no import button and never stage into a project.

## The in-app fetcher: `@3jse/vendor`

A new package and a new Content Browser sub-panel ("Open Source," alongside the project's own assets — `EDITOR.md`), doing three things:

### 1. Registry

A versioned JSON manifest — itself just a file under version control, editable by PR the same way any other part of 3JSE is — listing known repos with the fields the tier decision and the fetcher UI both need:

```json
{
  "id": "poseidon",
  "source": "github.com/owenyuwono/poseidon",
  "pinnedCommit": "a3f9e21",
  "license": { "spdx": "MIT", "verifiedBy": "human", "verifiedAt": "2026-08-24" },
  "stack": { "renderer": "webgpu-only", "framework": "three.js" },
  "tier": "A",
  "package": "@3jse/water-poseidon",
  "capability": "water",
  "notes": "No WebGL2 path upstream — 3JSE plugin must supply a WebGL2 fallback shader (see RENDERING.md)."
}
```

Entries start life added by anyone (a developer, a curator, a future Curator-agent scanning GitHub the way an earlier draft of this project's marketplace concept proposed) but a Tier-A entry's `license.verifiedBy: "human"` field is a hard gate the fetcher UI enforces — an unverified or auto-detected-only entry cannot be marked Tier A, full stop, regardless of what the upstream API field says.

### 2. Browse → Import flow

- **Browse**: the panel lists registry entries with license, stars, a screenshot/preview where the upstream repo has one, tier, and — for Tier A — the wrapping package's install button.
- **Import (Tier A)**: installs the `@3jse/*` wrapper package normally (`PLUGIN_ARCHITECTURE.md`'s manifest/extension-point mechanism); nothing new architecturally, this *is* an ordinary plugin install, just discovered through this panel instead of a bare package name.
- **Import (Tier B)**: fetches a pinned-commit tarball (not a live git clone, not a floating branch — reproducibility and supply-chain hygiene both depend on a fixed commit) via the GitHub API, and stages it under `/plugins/_vendor/<id>/` in the project (`PROJECT_FORMAT.md`'s `/plugins` directory, exactly as specified there). A `THIRD_PARTY_NOTICES` entry is generated automatically: source URL, pinned commit, license text, author.

### 3. Sandboxing on import

Fetched Tier B source is **never executed in the editor process at import time**. It's treated exactly like an Asset Pipeline import (`ASSET_PIPELINE.md`'s analyze-and-suggest pattern) — static inspection (what does it import, what does it touch) surfaces as information in the panel, not as running code. It only becomes live, executing code once a human or an agent explicitly wires it into a registered plugin extension point, at which point it inherits the same capability-scoped sandbox every plugin runs under (`PLUGIN_ARCHITECTURE.md`'s "Sandboxing and trust" section) — a staged vendor import gets no more ambient access than a hand-written plugin would.

## Worked examples, against the real registry entries

- **`poseidon` → `@3jse/water-poseidon` (Tier A).** The FFT ocean compute pass and its TSL material become a `WaterVolume` Component + System, matching `RENDERING.md`'s "compile into Three's own TSL" posture almost for free, since poseidon is already TSL-native. The one adaptation `RENDERING.md`'s dual-backend requirement forces: poseidon is WebGPU-only with no WebGL2 path, so the plugin must ship a simpler built-in fallback shader for the WebGL2 case (`PERFORMANCE.md`'s permanent-second-render-path posture) — the registry's `notes` field flags this explicitly so it isn't discovered late.
- **`gaia`/`dryad` → `@3jse/foliage-gaia`, `@3jse/flora-dryad` (Tier A).** Both authors' own READMEs already separate "generation" (pure ESM, Node-testable, no Three.js import) from "rendering" (Three.js-specific) — which happens to mirror 3JSE's own frontend/backend split in `GAMEPLAY_IR.md` almost exactly. The generation half becomes a deterministic Component/Resource (genome + seed in, skeleton graph out); the rendering half becomes a System building an `InstancedMesh`. Because both are procedural with zero authored mesh/texture assets, they sidestep the Asset Pipeline's import step (`ASSET_PIPELINE.md`) entirely — a designer paints a `FoliageField` and the geometry is generated at edit time and again at runtime from the same seed, never shipped as binary mesh data. This is the vegetation half of `TEMPLATES.md`'s Open World template's real content source, not a placeholder.
- **`demiurge` → `@3jse/terrain-demiurge` (Tier A, Phase 5+).** A procedural mode for `@3jse/terrain` alongside hand-authored heightfields — relevant once `WORLD_SYSTEM.md`'s World Partition large-world story is in active use. Also WebGPU-only upstream; same fallback-shader obligation as poseidon.
- **`tiamat` (Tier B, pending re-verification).** Its actual license is MIT (confirmed above), so once a human marks `verifiedBy: "human"` in the registry it's eligible to graduate to Tier A as a future `@3jse/fluid-tiamat` — SPH particle fluid feeding `@3jse/physics-rapier` interactions and a raymarched surface. Until that verification step happens, it sits in Tier B exactly as the policy requires, which is the entire point of not trusting the platform's own `NOASSERTION` field as a final answer in either direction.
- **`apate` — not a plugin.** A shader-technique comparison, not a reusable system. Its four relief techniques (with credit) become reference implementations feeding the Material Graph's node library (`RENDERING.md`) — a `Parallax Occlusion` and a `Silhouette POM` node, contributed as documented technique ports rather than an installable package.
- **`minos` — reference only, not an integration.** Different runtime (Rust/Vulkan); see above.

## Licensing and attribution posture

- A Publish build (`BUILD_DEPLOYMENT.md`) auto-generates a `THIRD_PARTY_NOTICES` file from every installed Tier A package's and every staged Tier B import's registry entry, and the editor offers a Credits UI block (`GAMEPLAY_FRAMEWORK.md`'s UI system) a project can drop straight into a menu.
- No Tier B import is ever silently included in a Publish build — the build step fails loudly (not just a warning) if unresolved Tier B source is referenced by anything that would actually ship, forcing the explicit "yes, adapt this into a proper plugin, with attribution" step first.
- Registry entries are re-checked periodically (a Curator-agent task, in the spirit of the community-scanning idea explored for the plugin ecosystem — `ROADMAP.md` Phase 6) because upstream license terms, default branches, and repository visibility can all change after an entry is added; a stale, unverified entry is treated as no better than a brand-new unverified one.

## Roadmap placement

`@3jse/vendor` (the fetcher and registry panel) belongs in **Phase 3**, alongside 3JSE Graph's plugin extension points (`ROADMAP.md`) — deliberately earlier than the Tier A plugins it enables. A developer should be able to browse and stage the best available open-source work long before an official core-team adapter exists for it; Tier B staging plus the Agent API's assist loop is what makes that useful even before Phase 5, when `@3jse/water-poseidon`, `@3jse/foliage-gaia`, and `@3jse/flora-dryad` are the actual planned graduations into `@3jse/terrain`/`@3jse/water`/`@3jse/foliage`'s Phase 5 delivery (`ROADMAP.md`).

The Babylon.js reference entries land with the same Phase 3 delivery (the Open Source panel's "Reference" badge exists from day one), and the Playground-mechanism adoption is a Phase 2-adjacent `EDITOR.md` item rather than a registry concern — no code crosses over. The GPU-particle architecture is read when Phase 5's VFX graph starts, not before.
