# Session report — 2026-09-01 (c): harness track — bootstrap self-improvement pass

**Instruction:** "complete the harness project."
**Method:** the harness's own `bootstrap-claude-prompt.md` discipline — **audit → identify highest-leverage gaps → improve without growing always-loaded context → add deterministic verification → keep `.agents/` canonical and mirror to `.claude/`.**
**Baseline commit:** `2fc24e8` (nothing committed; `3JSE_Harness_v0.1/` is itself still untracked).

## Audit findings (gaps that *real work this session* proved)

1. **No skill for building the engine itself.** Every skill/recipe/provider targets *building a game with Three.js*. The actual work in this repo now is *building the `@3jse/*` engine* (16+ packages). Every convention had to be reverse-engineered from sibling packages: side-effect component registration, `.js` import extensions in TS source, per-package vitest, headless-first, Scheduler stage/registration ordering, `id?` params for stable-id load, virtual-filesystem for testability.
2. **`verify-harness.mjs` had blind spots, and the harness had already drifted through them.** `docs/FILE_INDEX.txt` listed **4 files that don't exist** (`.claude/recipes/*` — recipes are canonical-only, never mirrored) and omitted `mechanics-harness` + 4 recipes from its sorted block. Nothing checked the index against the tree. Nothing checked that provider ids referenced in `capabilities.json` actually exist in `providers.json`. The mirror check was one-directional (a stray Claude-only skill wouldn't fail).
3. **The workspace quality gate was red for an infrastructural reason.** `@3jse/vendor`'s `vitest run` globbed vendored `upstream/**/*.mjs` as empty test suites, so `pnpm -r test` always failed → the single most important regression gate was unusable.

## Changes

### 1. New skill: `engine-package` (loaded on demand — no always-loaded context added)
`.agents/skills/engine-package/SKILL.md` (+ `.claude/` mirror). Contents: a **rung-0 capability→`@3jse/*` package map** (search this before routing a capability anywhere else), the non-negotiable conventions above with the rationale for each, the package scaffold (package.json/tsconfig/index/test shape + the install→typecheck→test loop), and an **engine-work evidence shape** distinct from the game `EVIDENCE_REPORT` (exit criterion quoted · round-trip/invariant proof · benchmark table · routing ledger → `evidence/phase<N>-<slug>.md` + `BUILD_TASKS.md` line).

### 2. `verify-harness.mjs` hardened + `build-file-index.mjs` added
- **FILE_INDEX sync check:** every file under the harness tree must be listed; every listed entry must exist. Drift → exit 1.
- **Cross-registry integrity:** every provider id referenced by `capabilities.json` must be a real id in `providers.json`.
- **Bidirectional mirror check:** a skill present in `.claude/skills` but not `.agents/skills` now fails too.
- **`scripts/build-file-index.mjs`:** regenerates `docs/FILE_INDEX.txt` deterministically (sorted walk of the tree). Run it instead of hand-editing; verify fails if the committed index is behind.
- **Negative-tested:** injected a bogus FILE_INDEX line → `FILE_INDEX STALE ENTRY` exit 1; injected a capability referencing `nonexistent-provider` → `UNKNOWN PROVIDER` exit 1; both pass when reverted.

### 3. `docs/FILE_INDEX.txt` regenerated
79 files, sorted, no phantom entries. The 4 bogus `.claude/recipes/*` lines are gone; `mechanics-harness`, `engine-package`, and all 9 recipes are correctly listed.

### 4. `docs/HARNESS.md` updated
Skill catalog 22 → **24** (adds `mechanics-harness`, which had shipped earlier without a doc update, and `engine-package`); `.agents/skills/` count line 22 → 24; Scripts section documents `build-file-index.mjs` and the new `verify-harness.mjs` checks.

### 5. `packages/vendor/vitest.config.ts` (engine repo, but it's what unblocks the harness's runtime-error gate)
`include: ["src/**/*.test.ts"]`, `exclude: [..., "upstream/**"]`. `pnpm -r test` now exits **0** across all 22 packages.

## Verification (final)

| Check | Result |
|---|---|
| `node 3JSE_Harness_v0.1/scripts/verify-harness.mjs` | **PASS** (with the 3 new checks live) |
| new checks fail on injected drift, pass when clean | confirmed (both) |
| `.agents/skills` ↔ `.claude/skills` | 24 ↔ 24, content-identical |
| `pnpm -r typecheck` | clean |
| `pnpm -r test` | **PASS, exit 0** (22 packages) — was red before |
| `pnpm --filter @3jse/editor build` | ok |

## Not done / notes

- **Nothing committed.** `3JSE_Harness_v0.1/` remains git-untracked; these harness edits are uncommitted with it. The repo owner should commit the harness so `verify-harness.mjs`'s FILE_INDEX check has a tracked baseline.
- `capabilities.json` still maps only to the **external** provider registry (rung 2). Rung-0 (`@3jse/*` package already covers it) is deliberately in the `engine-package` skill's table, not the registry — the registry is for external providers by design.
- No new recipe was added for engine work — `engine-package` is a skill, not an archetype; recipes stay game-shaped.
- Harness `evidence/` dir is still empty; engine-track evidence lives in the repo-root `evidence/` (Phase 0 spikes + these session reports). Left as-is — the harness `evidence/` is for game-task reports.
