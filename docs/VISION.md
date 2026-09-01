# 3JSE — Vision

## What 3JSE is

3JSE is an open-source game engine and editor built **around** Three.js and WebGPU, not on top of a fork of them. It exists to answer one question honestly: *if Unreal Engine were invented today, for WebGPU, TypeScript, and AI-assisted development, what would it look like?*

The answer is not "Unreal's UI redrawn in a browser tab." Unreal's strengths — a real editor, a visual scripting system expressive enough for shipped games, a deep library of reusable gameplay systems, and (increasingly) AI-assisted iteration — are not tied to C++ or a desktop process model. They are tied to having **all of those layers exist and agree on the same underlying representation of a game.** Three.js has never had that. It has a renderer. 3JSE is everything a renderer needs around it to become a platform: an editor, an object model, a scripting system, an asset pipeline, an AI-native command surface, and a deployment story that a desktop engine cannot match.

## Tandem with the Harness

This design package is one half of a tandem project. The other half — **3JSE Harness v0.1** — already exists and works today: an agent-native development system that turns a general coding agent into a reference-first Three.js/WebGPU game-development agent (`HARNESS.md`, source in `3JSE_Harness_v0.1/`). The harness is where the AI-native bet on this page is tested against reality first; the engine this document describes is where those practices become first-class machinery. The harness's governing idea — *the coding agent is the editor; visual tools are added only when repeated work proves them necessary* — is the through-line for every "AI-native" claim made here.

## The core bet

Three.js already won the "does the web have a real renderer" argument. Nobody chooses Unity or Unreal over Three.js because Three.js renders badly — they choose it because Three.js stops being productive the moment you need a scene hierarchy you can *see*, gameplay logic you don't have to hand-wire, an asset pipeline that isn't a shell script, or a way for a non-programmer (or an AI agent) to safely change how the game plays. That gap — not rendering quality — is what 3JSE closes.

The second bet is about *when* this is being built. 3JSE is designed in the era where a meaningful fraction of a game's code will be written by an AI agent operating the engine, not typed by a human into a text editor. That is not a feature bolted onto a traditional engine design — it changes the engine's architecture at the root. Every layer of 3JSE is built to be machine-readable and machine-editable first, human-friendly second — which, done correctly, produces an engine that is *also* unusually friendly to humans, because "structured, inspectable, and consistent" is what both audiences actually want.

## Guiding philosophy

3JSE is designed so that four different ways of working edit the **same underlying game**, never four parallel ones:

- **Humans edit visually** — dragging assets, placing entities, adjusting values in an inspector, wiring nodes in a graph.
- **Programmers write TypeScript** — the same components, the same systems, the same APIs the editor and the graph compiler use, with no separate "scripting language."
- **Designers navigate meaning and tune feel** — 3JSE Atlas (`3JSE_ATLAS_FULL_PLAN.md`), the semantic navigation and FeelSpec tuning layer over the same intermediate representation: eleven lenses over the project, direct tuning knobs, and agent-scoped structural changes. The human edits intent and feel; the agent edits implementation; the viewport is a witness. Graphs remain one lens among many, not the primary authoring surface.
- **AI agents manipulate structured primitives** — entities, components, graphs, and assets through the same programmatic command surface the editor calls internally, never through opaque code generation or simulated mouse clicks.

This only works if there is one canonical, typed, serializable representation of "what the game does" underneath all four — the **3JSE Gameplay IR** (see `GAMEPLAY_IR.md`). That single decision is the architectural spine the rest of this design hangs from.

## Assemble first

3JSE does not reinvent wheels. The Three.js ecosystem is full of brilliant wheel engineers — dreaming, building, and maintaining wheels for generations — and every wheel we bolt on instead of re-forging is one less thing *we* update forever. The operating rule: **adopt → wrap → build**, in that order, and build only when nothing good exists. Three.js itself is the renderer wheel. The Owen pantheon is the water/foliage/flora/terrain wheels, vendored at pinned commits and wrapped as `@3jse/*` packages. The license notebook (`packages/vendor/licenses.json`) records every adopted part, and the update tracker (`tools/vendor-update.mjs`) tells us which wheels have rolled forward — bumping a pin is a deliberate adoption decision, never an accident. What 3JSE builds itself is the part nobody else is building: the editor, the Gameplay IR, the AI command surface, and the glue that makes all those wheels one machine. This is the strategy, not a phase — see `VENDOR_INTEGRATIONS.md`.

## Non-goals

- **3JSE is not a Three.js fork.** Three.js stays a normal, upgradable dependency. 3JSE does not vendor it, patch it, or assume private internals. If a project outgrows 3JSE's abstractions, it can drop to raw Three.js at any layer without losing the ability to update Three.js itself.
- **3JSE is not an Unreal clone.** Where Unreal's design is excellent (Blueprints' expressiveness, a real content browser, a construction/runtime script duality), 3JSE preserves the *capability*, not the implementation. Where Unreal is carrying twenty years of C++ legacy (a hard visual/code boundary, an opaque binary project format, an editor that assumes a beefy local workstation), 3JSE deliberately does better.
- **3JSE is not chasing Unreal's rendering ceiling.** Nanite-class virtualized geometry and Lumen-class global illumination are not the fight this engine picks in its first several years. WebGPU compute and Three.js's rendering roadmap set the ceiling; 3JSE's job is everything Unreal has *besides* the renderer.
- **3JSE does not assume every game is a giant open world**, and does not assume every game is a tiny arcade demo either. The world/level system (`WORLD_SYSTEM.md`) is built to be equally unopinionated about both.

## Who this is for

- A Three.js developer today who is manually building a scene hierarchy UI, an undo stack, and a component system for the third time across three projects.
- A designer or artist who can think in Blueprint/node-graph terms and wants that expressiveness without needing Unreal installed, a C++ toolchain, or a five-minute editor boot time.
- A studio that wants instant web distribution — a shareable URL instead of a multi-gigabyte installer — without giving up a professional editor workflow.
- An AI agent (and the human directing it) that needs a game engine whose state can be inspected, queried, and safely mutated through a stable API, not one that has to be operated by simulating a mouse.

## What success looks like

A developer with Blueprint, Verse, Unity-component, or Godot-node experience can open 3JSE and be productive within a day, because the underlying concepts — entities, components, typed graphs, prefabs — map cleanly onto what they already know. A game built in 3JSE is, at every layer, a normal, readable, Git-diffable software project — never a proprietary binary blob that only the editor can open. And an AI agent, given a one-sentence request, can operate 3JSE through the exact same primitives a human uses, produce a working change, verify it by actually running the game, and hand back something the human can keep editing normally — because "AI-native" in 3JSE means *legible to both the AI and the human*, not opaque to one of them.
