# Session report — 2026-09-01

**Scope:** `BUILD_PROMPT.md` "First session, concretely" — verify harness, inventory reference games against Phase 0, execute the four Phase 0 spikes in order, report with routing ledgers + go/no-go + `BUILD_TASKS.md`.
**Baseline commit:** `2fc24e8` (nothing committed this session).

## What changed

New files, all uncommitted:

- `BUILD_TASKS.md` — the task ledger (Phase 0 done, Phase 1 stubbed, harness + Atlas tracks noted).
- `evidence/phase0-spike1-3ir-roundtrip.md` — memo over the existing `@3jse/ir`.
- `evidence/phase0-spike2-ecs-object3d.md` — memo + benchmark writeup.
- `evidence/phase0-spike3-verse-level3-memo.md` — Verse research memo.
- `evidence/phase0-spike4-editor-shell.md` — Tauri-vs-Electron decision.
- `evidence/phase0-summary.md` — consolidated routing ledger + go/no-go + exit-criteria check.
- `spikes/phase0/ecs-object3d/{archetype,naive,bench}.mjs` — throwaway ECS benchmark spike.

No engine package, harness file, or doc was modified. The four spikes were mostly *verification and decision* work over code and design that already existed — only Spike 2 required new code, and that code is an isolated throwaway under `spikes/`.

## Evidence produced

| Check | Result |
|---|---|
| `node 3JSE_Harness_v0.1/scripts/verify-harness.mjs` | PASS (before and after) |
| `pnpm --filter @3jse/ir test` | 14/14 pass |
| `pnpm --filter @3jse/runtime test` | 19/19 pass |
| `node spikes/phase0/ecs-object3d/bench.mjs` (10k, 900f) | GATE PASS — 0.60 ms/frame total avg, p95 0.66 ms (3.6% of 60fps budget) |
| Live 3IR parse→emit→re-parse→interpret round trip | behaviourally identical, source map lines verified |

Not run: `pnpm -r test` fails in `@3jse/vendor` (its vitest picks up vendored `upstream/dryad` + `upstream/gaia` `.mjs` files as empty suites). Pre-existing, unrelated to Phase 0, not touched.

## Reference-game inventory vs. Phase 0 spikes

All six sibling repos present (`../3jsurf`, `../zendrive`, `../uburt`, `../dambeavers`, `../breaking-waves-demo-main`, `../mendalhop`). Against the spikes:

- **Spike 1 (3IR):** no reference game builds an IR — the round-trip is 3JSE-specific. `@3jse/ir` already exists (landed `ecf0c89`); nothing to borrow.
- **Spike 2 (ECS):** `dambeavers`' `src/sim/core/` (`ComponentStore`/`SimulationClock`/`EntityId`) is the closest reference — a working typed-token ECS with snapshot/restore. It is *not* Object3D-backed (pure sim, headless), so it validates the component-store half but not the Transform bridge. `REFERENCE_GAMES.md` already records it as the `ENTITY_COMPONENT_MODEL.md` reference. The spike's job — archetype tables + no-copy `Object3D` Transform at 10k — is the part no reference game covers, so it was built.
- **Spike 3 (Verse):** N/A to reference games.
- **Spike 4 (shell):** N/A — all six games are browser SPAs / no-build; none ship a desktop shell.

Confirmed: nothing in the reference games needed rebuilding for Phase 0; the one genuine gap (Object3D-backed archetype perf) is what the new code addresses.

## Decisions (go/no-go)

1. **3IR bidirectional editing** — GO.
2. **Archetype + Object3D Transform storage** — GO.
3. **Verse Level 3** — NO-GO (dormant research item).
4. **Editor shell = Tauri v2** — GO (hands-on confirmation checklist deferred to Phase 1 bring-up).

**Phase 0 closes. Phase 1 (Editor MVP) is authorised.**

## What this unblocks

- Phase 1 task 1.1: promote `spikes/phase0/ecs-object3d`'s archetype layout into `@3jse/runtime` for real (replacing the Phase-1-honest Map + full-scan in `Level.ts`).
- Phase 1 editor packaging: build against Tauri v2 with the `shell/` adapter guardrail.
- Phase 3/4 planning can assume the 3IR architecture holds.

## Flags for the repo owner

- **`3JSE_Harness_v0.1/` is untracked in git** (entire directory `??`). Also untracked: `docs/HARNESS.md`, `docs/REFERENCE_GAMES.md`, `docs/3JSE_ATLAS_FULL_PLAN.md`, `BUILD_PROMPT.md`. Large amounts of concurrent vendor work are staged (`chiro`, `hls-webgpu-terrain`, `three-vfx`, `webgpu-ocean-mpm`). This session committed nothing — recommend the owner sorts the working tree and commits the harness before the next build session.
- `pnpm -r test` is red because of `@3jse/vendor`'s test glob catching vendored upstream `.mjs` files — worth a `vitest` `exclude` for `upstream/**` so the workspace test command is usable as a gate.

## Next session

Start at `BUILD_TASKS.md` Phase 1. First: task 1.0 (close the three non-blocking Phase 0 open items) and task 1.2 (audit what `@3jse/runtime` already implements vs. `RUNTIME.md` before writing anything).
