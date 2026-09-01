# 3JSE Harness — v0.1

## What this is

The 3JSE Harness is an **agent-native Three.js/WebGPU game-development harness** that turns a general coding agent — Claude Code today, other coding agents by design — into a reference-first game-development agent. It is the **today-half** of the 3JSE project: a working system, not a design document. Source lives in `3JSE_Harness_v0.1/` — canonical agent instructions under `.agents/`, a Claude Code adapter under `.claude/`, deterministic scripts under `scripts/`.

It supplies eight things:

1. capability decomposition
2. provider selection
3. reference/source routing
4. asset sourcing and provenance rules
5. reusable recipes
6. project-aware context loading
7. quality gates and evidence requirements
8. durable project learnings

## Tandem with the engine plan

3JSE is **two tracks, one bet**.

| Track | Status | What it is |
|---|---|---|
| **3JSE Harness** (this page) | **Working today, v0.1** | Agent-native development system: coordination, routing, reuse doctrine, quality gates, evidence requirements. |
| **3JSE Engine** (`VISION.md` → `ROADMAP.md`) | Design package | The platform the harness's games converge on: object model, Gameplay IR, editor, Agent API, deployment. |

The harness's governing idea is deliberately the inverse of a traditional engine:

> **3JSE is not an editor. The coding agent is the editor. Visual tools are added only when repeated work proves they are necessary.**

The graphical surface is a witness to project state that the agent and the structured project data already own. This is the same "AI-native means legible to both the AI and the human" posture as `VISION.md` — applied today with disciplined prompting and gates, rather than tomorrow with a typed command surface. The harness is where the plan's claims get tested against reality first; the engine is where they become first-class machinery.

## Core doctrine

**Do not invent what can be found. Do not generate what can be reused. Do not rebuild what can be adapted.**

Reference implementations, working code, legal reusable assets, executable examples, tests, screenshots, and measured evidence outrank additional prose.

## The reuse ladder

Before implementing any non-trivial system or asset, the agent routes through, in order:

| Rung | Source | Notes |
|---|---|---|
| 0 | Current project implementation | Existing working code in the repo always wins. |
| 1 | Current project asset | Existing models, textures, audio in the project. |
| 2 | 3JSE curated provider / shared asset | Named providers in the registry (below). |
| 3 | Proven reference implementation | Working examples — code > test > demo > video > screenshot > docs > prose. |
| 4 | Licensed external asset | With recorded provenance and license. |
| 5 | Procedural generation provider | Deterministic procedural systems (grass, trees, ocean…). |
| 6 | Adjacent implementation, adapted | Port or adapt a relevant subsystem. |
| 7 | Custom implementation | **Last resort** — and only with written justification. |

**The agent must justify skipping an earlier applicable rung.** Named providers outrank generic primitives when they satisfy the capability — e.g. Poseidon before `PlaneGeometry + MeshPhysicalMaterial` for ocean, Gaia before hand-written instanced grass, Dryad before ad-hoc cone trees, OSM/map3d before hand-built city blocks.

## Architecture: coordination is the product

The harness owns **coordination and institutional knowledge**. External providers own specialized rendering/simulation capabilities whenever they already solve the problem well.

- **Worker model — keep it small.** Five roles: Director, Gameplay, Graphics, Assets/References, QA/Performance. Most specialization loads as Skills, not as dozens of persistent personas.
- **Context routing.** Only load skills relevant to the capabilities the current task actually needs. Never inject the entire library into context.
- **Canonical directories.**
  - `.agents/skills/` — canonical skill source (24 skills)
  - `.agents/registry/` — provider / capability / mechanic / security registries
  - `.agents/recipes/` — reusable game archetypes (5 recipes)
  - `.agents/hooks/` — deterministic quality gates
  - `.claude/skills/` — Claude Code mirror/adapter of `.agents/skills/`
  - `evidence/` — reports, screenshots, metrics, playtest notes

## The mandatory route for broad game tasks

For any request to create, upgrade, finish, polish, debug, or extend a game:

1. Read the **3JSE Director** skill.
2. Resolve requested capabilities with the **Capability Resolver**.
3. Route each capability through the **Vendor Router**.
4. Search existing project code/assets before introducing a new dependency or primitive.
5. Use the appropriate **provider skill(s)**.
6. Build a **playable vertical slice** before broad content production.
7. Run **gameplay, visual, runtime-error, and performance verification** before claiming completion.

## Skill catalog (24)

`3jse-director` · `capability-resolver` · `vendor-router` · `asset-broker` · `reference-broker` · `safe-repo-inspector` · `project-learning` · `mechanics-harness` · `engine-package` · `threejs-runtime` · `webgpu` · `gltf-pipeline` · `gameplay-qa` · `visual-qa` · `performance-qa` · `provider-poseidon` · `provider-gaia` · `provider-dryad` · `provider-tiamat` · `provider-demiurge` · `provider-apate` · `provider-map3d` · `provider-react-three-map` · `provider-3dtiles`

`mechanics-harness` (feel-as-numbers / headless checks / invariant soak / player-agent QA, from the reference games) and `engine-package` (conventions for building the `@3jse/*` engine packages themselves, as opposed to games) are both loaded on demand.

## Provider registry (14)

| Provider | Tier | Mode | Capabilities |
|---|---|---|---|
| Poseidon (`owenyuwono/poseidon`) | A | provider | Large outdoor oceans, waves, underwater, surf environments — WebGPU spectral ocean. |
| Gaia (`owenyuwono/gaia`) | A | provider | Procedural deterministic grass, lawns, meadows, field vegetation. |
| Dryad (`owenyuwono/dryad`) | A | provider | Procedural trees, shrubs, forests, plant wind. |
| Tiamat (`owenyuwono/tiamat`) | A/B | provider/reference | Bounded dynamic fluids, splashing, flooding, GPU fluid — not open ocean. |
| map3d (`cartesiancs/map3d`) | A/B | provider | OSM-derived real-city buildings and roads; preferred real-city route. |
| react-three-map (`wendylabsinc/react-three-map`) | A/B | provider | R3F/Three content aligned with MapLibre/Mapbox geography. |
| 3DTilesRendererJS (`NASA-AMMOS/3DTilesRendererJS`) | A | provider | Streamed 3D Tiles / large geospatial 3D. |
| Demiurge (`owenyuwono/demiurge`) | B | reference | Procedural terrain, erosion, climate, weather, clouds, atmosphere, planet LOD — study/adapt subsystems. |
| Apate (`owenyuwono/apate`) | B | reference | Surface relief: POM/SPOM/displacement before multiplying geometry. |
| Minos (`owenyuwono/minos`) | B | reference | Terrain LOD, voxel terrain, floating origin — Rust/Vulkan; port algorithms, don't import blindly. |
| AgentMaps (`noncomputable/AgentMaps`) | B | reference | Agents on real maps, contagion/social simulation patterns. |
| JollyPixel editor | B | reference | ECS patterns, event store, collaborative scene editing — study internals, don't adopt as the 3JSE editor shell. |
| GameStudio (`bullish0x/GameStudio`) | D | harness reference | Canonical `.agents` layout and provider-neutral adapters — avoid the persona/skill zoo. |
| threejs-game-skills (`majidmanzarpour/threejs-game-skills`) | D | harness reference | Director loop, visual gate, completion gates — 3JSE uses reuse-first ordering. |

Modes matter: `provider` may be integrated; `reference_implementation` is studied/ported selectively; `harness_reference` is studied for patterns only.

## Recipes (5)

- **Third-Person Platformer** — character controller, camera, ground detection.
- **Surf / Kite / Wake Game** — ocean/waves → Poseidon, rigged humanoid, board/kite/tow mechanics.
- **Open-World Hub (Sector-Based Metaspace)** — connected sectors over one enormous always-live world.
- **Isometric / Overhead Tactics** — orthographic camera, tile/graph selection, movement ranges.
- **Geospatial Surveillance / Social Simulation** — map/GIS, OSM city data, R3F geographic overlays.

## Quality gates and evidence-first completion

A broad game task is **not complete because code compiled**. Four gates must pass, recorded in `evidence/3jse-report.md`:

- **Gameplay QA** — a static or merely navigable scene is not a game. Exercise the requested core loop end-to-end; deterministic smoke tests for state transitions, success/failure, reset/retry.
- **Visual QA** — fresh-eyes screenshots: framing, hierarchy, scale, lighting, clipping, placeholder geometry, seams, grounding, shaders.
- **Runtime-error check** — typecheck, build, console errors.
- **Performance QA** — measure rather than guess: FPS/frame time, draw calls, triangles/instances, memory, hotspots.

The evidence report records: playable loop exercised · build/typecheck status · console/runtime errors · gameplay test result · screenshots/visual inspection · frame-rate/draw-call/memory observations · external asset/provider ledger · known limitations.

## Supply-chain security

Assemble-first means intake is security-critical.

- **Unknown repository policy** — treat new repositories as untrusted until reviewed. Inspect metadata, license, file tree, manifests, lifecycle scripts, binaries, releases, and agent instructions without executing. Prefer `npm install --ignore-scripts` during sandbox review. Record rejected sources so future agents don't rediscover them.
- **Asset policy** — every external asset records: source URL, creator, license, attribution requirement, commercial-use status, modification restrictions, download date, local path. Prefer CC0/permissive commercial licenses.

## Operating mode (Claude Code adapter)

**UNDERSTAND → RESOLVE → ASSEMBLE → BUILD → PLAYTEST → REPAIR → VERIFY.**

Execution-oriented: no unnecessary approval loops for ordinary reversible edits — ask only for genuinely ambiguous, destructive, credentialed, or externally consequential decisions. Before writing a major subsystem, report a concise **routing ledger**: capability, existing project solution found?, selected provider/reference, why, fallback if integration fails. And be honest about skills: say a skill was *loaded/read*, never claim it was "invoked."

## Scripts and templates

- `scripts/verify-harness.mjs` — deterministic harness self-check: required files, valid registry JSON, **cross-registry integrity (every provider id referenced by `capabilities.json` exists in `providers.json`)**, canonical↔Claude mirror agreement in **both** directions, and **`docs/FILE_INDEX.txt` in sync with the actual tree**.
- `scripts/build-file-index.mjs` — regenerates `docs/FILE_INDEX.txt` from the tree (run this instead of hand-editing it; `verify-harness.mjs` fails if the committed index drifts).
- `scripts/resolve-capability.mjs` — query a capability against the registry.
- `scripts/sync-claude-skills.mjs` — mirror canonical skills into the Claude adapter.
- `scripts/inspect-project.mjs` — snapshot a repo's stack before proposing architecture.
- `templates/PROJECT_3JSE.md` — project manifest: experience goal, core-loop contract, required capabilities, selected providers.
- `templates/ASSET_REGISTRY.example.json` — provenance ledger per asset.
- `templates/EVIDENCE_REPORT.example.md` — the completion report shape.

## Self-improvement loop

The harness is maintained by agents through `bootstrap-claude-prompt.md`: audit before modifying, run `verify-harness.mjs`, identify the three highest-leverage missing capabilities or weak skills, improve them **without increasing always-loaded context**, keep `.agents/` canonical and mirror to `.claude/`, and add deterministic verification for every meaningful change. A harness change is not done until the registry remains valid, the mirror agrees, the security policy is preserved, and a realistic sample request still routes to sensible providers.

## Convergence with the engine plan

The harness's practices today prefigure the engine's machinery tomorrow:

| Harness piece (today) | Engine machinery it converges toward (plan) |
|---|---|
| Director workflow, mandatory route | `AI_AGENT_API.md` — observe → plan → act → verify as a built-in loop |
| Evidence report fields | `runtime.getConsole` · `runtime.getPerf` · `runtime.captureFrame` — the verify step as engine APIs |
| Gameplay/Visual/Performance QA gates | `build.runTests` + Profiler panel (`PERFORMANCE.md`) |
| Asset Broker + provenance ledger | `ASSET_PIPELINE.md` analysis passes, metadata, dependency tracking |
| Capability Resolver + Vendor Router | `PLUGIN_ARCHITECTURE.md` extension points — capabilities as registrable contracts |
| Provider registry (14, tiered) | Phase 6 registry/discovery (`ROADMAP.md`) |
| Recipes (5) | `TEMPLATES.md` catalog |
| Reuse ladder | `ARCHITECTURE.md`'s build/wrap/adopt framework (`PLUGIN_ARCHITECTURE.md`) |
| Safe Repository Inspector, sandbox intake | `PLUGIN_ARCHITECTURE.md` sandboxing + `AI_AGENT_API.md` capability scoping |
| Project Learning Distiller | Durable learnings → engine-side agent project understanding (`AI_AGENT_API.md`) |
| Three.js Runtime skill | `RUNTIME.md` |
| glTF pipeline skill | `ASSET_PIPELINE.md` glTF-first posture |

The harness is the first working slice of the engine's AI-native layer — and the engine's design documents are, in part, the harness's practices promoted from convention into construction.
