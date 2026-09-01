# 3JSE Evidence Report — Phase 1 & Phase 2 exit gates

_2026-09-01. Editor run in Chrome (WebGPU) against `pnpm --filter @3jse/editor dev`._

## Core loop
- **What was played/tested:** opened the 3JSE editor; its starting scene is now the shipped
  `@3jse/templates` Third Person template (`buildThirdPersonTemplate`), decorated with meshes —
  not a parallel demo scene. Selected entities in the Hierarchy, read/edited components in the
  Inspector, entered Play, and edited a runtime System while Play was live.
- **Pass/fail:** PASS for the gate's verifiable claims (one code path · Inspector-tunes-live ·
  Play runs the template loop · logic hot-reloads without restarting Play). One item
  (WASD-drive isolated *in the editor*) left to headless coverage — see Known limitations.

## Build/runtime
- typecheck: pass — `pnpm -r typecheck`, 24 projects incl. `apps/editor`.
- tests: pass — `pnpm -r test`, all packages; `@3jse/templates` 4/4 (`thirdPerson.test.ts`
  asserts the player falls and settles on the ground collider and forward input drives movement).
- build: pass — `pnpm --filter @3jse/editor build` (vite, 6830 modules).
- console errors: none (Chrome console, whole session).
- HMR: `[vite] hot updated: .../systems/builtins.ts via /src/sampleScene.ts` — the accept
  boundary in `sampleScene.ts` survived the refactor to delegate to the template.

## Visual evidence (fresh-eyes screenshots)
1. **Editor boot** — Hierarchy = Ground / Player / Sun / Ambient / Cube / Sphere / Crate
   (exactly the template's entities + `decorate` additions). Player rig, blue Cube, orange
   Sphere render on the ground plane. Title bar "3JSE — Sandbox".
2. **Inspector reads template entity** — selecting *Cube* shows Transform (pos 0,1,3 — matches
   `decorate`), a **Spin** component (DegreesPerSecond 60), and a **Health** component
   (Current 75 / Max 100). Selecting *Ground* shows RigidBody `"fixed"` + Collider box
   `40 × 0.2 × 40` — exactly the template's ground.
3. **Inspector edit takes effect live** — changed Spin.DegreesPerSecond 60 → 240; pressed
   Play; Console logs "Play started"; Cube's Transform.Rotation Y ticks up (32.14 → …) at the
   new rate. The running simulation reads the Inspector-edited value.
4. **Play = template loop** — on Play the view reframes from the edit camera to the
   third-person follow camera (CameraRigSystem); physics/animation/spin systems all advance
   via the editor's `World.step`. Button toggles Play ⇄ Pause; no modify-while-playing needed
   for the tune above because it was applied then Play was pressed.
5. **Hot-reload during Play** — edited `packages/runtime/src/systems/builtins.ts` (added an X
   tumble to SpinSystem) with Play active. Vite function-swapped the module; the Play button
   stayed "Pause", the Console kept its single "Play started" line (no full reload), World
   state persisted. Reverted the probe; second clean HMR update, no errors.

## Performance
- target: Chrome + WebGPU on the dev machine. No dropped-frame or stutter observed across the
  session; scene is ~7 spatial entities + 4 systems. Draw-call/GPU numbers not captured — the
  Profiler panel still owes that (docs/PERFORMANCE.md); headless `runtime.getPerf` covers the
  CPU/sim side.

## Provider / asset ledger
- character controller / camera / animation / physics / save → existing `@3jse/*` packages
  (rung 0, project code) via `buildThirdPersonTemplate`.
- procedural character rig + locomotion clips → `apps/editor/src/proceduralCharacter.ts`
  (existing project code) — no external assets introduced.

## Known limitations
- WASD player drive was exercised via synthetic key events in the editor but not isolated as a
  measured displacement this pass; the behaviour is asserted headlessly in
  `@3jse/templates/src/thirdPerson.test.ts` ("forward input drives movement").
- Not run in the Tauri shell (Phase 0 open item 2) — browser build only.
- Editor click-to-select on the ground worked; deep Hierarchy-row clicks needed
  accessibility-ref targeting due to a device-pixel-ratio offset in the automation layer (test
  harness quirk, not an editor bug).
