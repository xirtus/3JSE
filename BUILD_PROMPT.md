# 3JSE — Master Build Prompt (paste into Claude Code)

You are building 3JSE: a tandem project with three tracks — the **3JSE Harness** (agent-native development system, working today), the **3JSE engine** (design package in `docs/`, to be built in dependency order), and **3JSE Atlas** (the semantic visual layer over the harness). You are not writing a demo. You are executing a plan that already exists. Your job is to follow it, not reinvent it.

## Step 0 — Load the constitution, in order

1. `3JSE_Harness_v0.1/CLAUDE.md` — your operating mode: **UNDERSTAND → RESOLVE → ASSEMBLE → BUILD → PLAYTEST → REPAIR → VERIFY**. No unnecessary approval loops for ordinary reversible edits.
2. `3JSE_Harness_v0.1/AGENTS.md` — the canonical instructions: mandatory route, non-negotiable rules, evidence requirements.
3. `docs/ROADMAP.md` — the sequencing contract. Phases are dependency-ordered; you do not start a phase before its prerequisites, and you do not leave a phase before its exit criteria are met.
4. `docs/HARNESS.md` and `docs/3JSE_ATLAS_FULL_PLAN.md` — the two living tracks.
5. `docs/REFERENCE_GAMES.md` — six working games whose systems are reusable reference implementations. **Do not rebuild what they already prove.** Reuse their rigs, animations, physics models, QA tooling, and licenses first.
6. `docs/ARCHITECTURE.md` and `docs/GAMEPLAY_IR.md` — read before writing any engine code. The IR is the spine; nothing ships as a parallel execution engine.

Load other docs **per phase**, not all at once. Keep always-loaded context small — that is a rule, not a suggestion.

## The mandatory route for every non-trivial capability

For every capability you implement: run the **3jse-director** workflow, resolve the capability with **capability-resolver**, route it through **vendor-router** using the reuse ladder (project code → project assets → curated providers → reference implementations → licensed assets → procedural generation → adaptation → custom implementation, justifying every skipped rung). Before writing a major subsystem, report a **routing ledger**: capability · existing project solution? · selected provider/reference · why · fallback. Never substitute generic primitives for an applicable named provider without stating why.

## The three tracks

- **Harness track** — keep `3JSE_Harness_v0.1/` green at all times. Every change: update `docs/FILE_INDEX.txt`, keep canonical skills and the `.claude/` mirror in agreement, run `node scripts/verify-harness.mjs`. Extend the harness only where real work proves a gap (bootstrap discipline: audit → highest-leverage gap → improve → verify).
- **Engine track** — start at Phase 0. Satisfy each phase's exit criteria with evidence before moving on. Phase 0's four de-risking spikes come first: the 3IR round-trip prototype, the ECS-over-Object3D spike (10k entities @ 60fps), the Verse Level-3 research memo, and the Tauri-vs-Electron editor-shell decision. Nothing downstream is authorized until Phase 0 closes.
- **Atlas track** — the first implementation task is specified in `docs/3JSE_ATLAS_FULL_PLAN.md` §63: the **Atlas Semantic Core** (defineSystem, graph compiler, FeelSpec parser, React Flow system map, node inspector, direct knob editing, agent task-context exporter, test/provider/asset metadata, simple runtime health). Apply it to **3jsurf first** — its systems map cleanly and its `tools/` already produce the evidence Atlas displays. Let real pain points decide which 3D visualizations come next; do not build the 3D Atlas layer to prove it uses Three.js.

## Evidence — completion is evidence, not compilation

Adopt the `mechanics-harness` skill as the standard for every gameplay system:

1. **Headless mechanics check** — gameplay logic runs with no renderer/canvas/DOM; assert the numbers and keep them matching the rendered build.
2. **Feel as numbers** — measure the mechanic (crossing time, peak speed, drift duration, jump arc); store the table.
3. **Invariant soak** — scripted pilot, invariants sampled every frame, violation percentages reported.
4. **Heuristic player agents** — drive the real game, classify every death as player error or unfair system fault. **Unfair deaths are bugs.**
5. **Single-term debug isolation** — a debug mask answering "what is painting that?" in one screenshot.

Every milestone ends with a written **gate sentence** and a composed gate test that proves it (the dambeavers pattern). Every broad task ends with an evidence report using `3JSE_Harness_v0.1/templates/EVIDENCE_REPORT.example.md`: playable loop exercised · build/typecheck · console errors · gameplay test · screenshots · frame-rate/draw-calls · asset/provider ledger · known limitations. **No claim of AAA/premium/complete without fresh evidence.**

## Non-negotiables (from the constitution)

- A static scene is not a game. Build the smallest playable vertical slice before breadth.
- Gameplay math and render math must be the same numbers (deterministic, seeded; visuals render-only; collision on the values you see).
- The simulation is authoritative: renderer/UI/audio observe state; everything must make sense headlessly.
- Systems, not scripted outcomes — implement causes, never `DamFloodEvent`-style named events.
- Preserve provenance: source, creator, license, attribution for every adopted asset/technique (`LICENSES.md` precedent in mendalhop; `packages/vendor/licenses.json` per VENDOR_INTEGRATIONS.md).
- Unknown repositories are inspection-only until source/dependency/license/script review passes. Never execute unknown binaries.
- State bugs are geometry bugs; a stale flag will surface as an invariant violation — clear state on every transition.
- If a mechanic must change with world scale, its parameters live in the mechanic's own units (surf stations, track distance/lateral), never absolute metres.
- Say a skill was *loaded/read* — never claim it was "invoked" if you only read it.
- Ask only for genuinely ambiguous, destructive, credentialed, or externally consequential decisions.

## The ledger

Create and maintain `BUILD_TASKS.md` at the project root (the dambeavers TASKS.md discipline): one line per task — phase, task, status, evidence file, commit. Update it at the end of every session along with a short session report: what changed, what evidence was produced, what unblocked next.

## Reference-game reuse checklist (use before building anything similar)

- Surf: 3jsurf — wave/surfer logic, headless tools, rigs + baked Mixamo clip library, sharks/floaties, vendored Poseidon (MIT). First-person: breaking-waves — parametric compositor, Tweakpane knobs, EXR sky.
- Racing: zendrive — track-space vehicle physics, demand-capacity cornering, generative music, headless race tests.
- Hopping: pulsehop — intent-relative input, sequencer/MIDI/OSC; mendalhop — unfairness-free core, time powers, ghost replay, player-agent QA.
- Systemic sim: dambeavers — ECS core (ComponentStore/Clock/EntityId), simulation tests, gate sentences, counterfactual replay.
- Terrain/Forests: **vibe-stack/super-terrain** (MIT, TypeScript, Three.js WebGPURenderer + React Three Fiber) — a UE5.8-inspired partitioned mesh-terrain editor: sparse 4 km × 4 km logical terrain with sculpt layers, weight-painted materials, editable topology, live add/subtract CSG, tunnel interiors, five geometric LODs, worker compilation, bounded residency, and IndexedDB persistence. Forests are drawn as splines and grown on demand — *the field is authoritative and everything inside it is derived* (stems, boulders, ground cover, floor shading), so a forest can exist anywhere without storing painted data. Treat as the primary reference implementation for `@3jse/terrain` and `@3jse/foliage` (per VENDOR_INTEGRATIONS.md: study/port selectively, MIT, pin a commit, record provenance — it intentionally has no WebGL fallback, matching the WebGPU-first posture).

## First session, concretely

1. Run `node 3JSE_Harness_v0.1/scripts/verify-harness.mjs` and confirm green before touching anything.
2. Inventory the reference games against the Phase 0 spikes (the 3jsurf headless tools already satisfy half of the ECS/IR spike's spirit — study them first).
3. Execute Phase 0 spikes in order: 3IR round-trip prototype → ECS-over-Object3D benchmark → Verse memo → editor-shell decision. Each ends with a written memo or benchmark, not vibes.
4. Report: routing ledger for each spike, evidence produced, updated BUILD_TASKS.md, and the go/no-go decisions that unblock Phase 1.
