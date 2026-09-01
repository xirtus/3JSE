# 3JSE — repository agent instructions

This repo is **two tracks, one bet** (`docs/HARNESS.md`):

| Track | Where | What |
|---|---|---|
| **3JSE Harness** | `3JSE_Harness_v0.1/` | Agent-native development system — reuse doctrine, provider/capability registries, quality gates, evidence rules. Working today. |
| **3JSE Engine** | `packages/*`, `apps/editor`, `docs/` | The `@3jse/*` runtime + editor the harness's games converge on. Built in dependency order (`docs/ROADMAP.md`). |

The harness governs how work is done in this repo. It is not scoped to
`3JSE_Harness_v0.1/` — it applies to every `packages/*` and `apps/*` change too.

## Load the constitution first

For any non-trivial task, read in order:

1. `3JSE_Harness_v0.1/AGENTS.md` — canonical instructions: mandatory route, non-negotiables, evidence requirements.
2. `3JSE_Harness_v0.1/CLAUDE.md` — operating mode: **UNDERSTAND → RESOLVE → ASSEMBLE → BUILD → PLAYTEST → REPAIR → VERIFY**.
3. `docs/ROADMAP.md` — the phase sequencing contract. Do not start a phase before its prerequisites; do not leave one before its exit criteria are met with evidence.
4. `BUILD_TASKS.md` — the live task ledger. Update it at the end of every session.

Load other `docs/*.md` **per phase**, not all at once. Keep always-loaded context small — a rule, not a suggestion.

## The reuse ladder (do not reinvent the wheel)

Before implementing any non-trivial system or asset, route through, in order, and
**justify skipping any applicable earlier rung**:

0. Current project implementation — existing working code in the repo always wins.
1. Current project asset.
2. Curated provider / shared asset (`3JSE_Harness_v0.1/.agents/registry/providers.json`).
3. Proven reference implementation (`docs/REFERENCE_GAMES.md`; code > test > demo > video > screenshot > docs > prose).
4. Licensed external asset — with recorded provenance and license.
5. Procedural generation provider.
6. Adjacent implementation, adapted.
7. Custom implementation — last resort, with written justification.

Named providers outrank generic primitives when they satisfy the capability.
Before writing a major subsystem, emit a **routing ledger**: capability ·
existing project solution found? · selected provider/reference · why · fallback.

Skill entry points (loaded on demand, not all at once): `3jse-director`,
`capability-resolver`, `vendor-router`, then the provider/technical skills those
direct you to. Say a skill was *loaded/read* — never that it was "invoked".

## Non-negotiables

- A static scene is not a game. Build the smallest playable vertical slice before breadth.
- Gameplay math and render math are the same numbers — deterministic, seeded; visuals render-only; collision on the values you see.
- The simulation is authoritative: renderer/UI/audio observe state; everything must make sense headlessly.
- Systems, not scripted outcomes — implement causes, never `DamFloodEvent`-style named events.
- Preserve provenance: source, creator, license, attribution for every adopted asset/technique (`packages/vendor/licenses.json`).
- Unknown repositories are inspection-only until source/dependency/license/script review passes. Never execute unknown binaries.
- Clear state on every transition — a stale flag surfaces later as an invariant violation.
- No claim of AAA/premium/complete without fresh evidence.

## Gates — completion is evidence, not compilation

```
pnpm gate          # verify:harness + typecheck + test + editor build (CI runs this)
pnpm verify:harness # deterministic harness self-check only
```

Every broad task ends with an evidence report
(`3JSE_Harness_v0.1/templates/EVIDENCE_REPORT.example.md` → `evidence/`):
playable loop exercised · build/typecheck · console errors · gameplay test ·
screenshots · frame-rate/draw-calls · asset/provider ledger · known limitations.

## Harness track — keep green at all times

Every change under `3JSE_Harness_v0.1/`:
- regenerate `docs/FILE_INDEX.txt` via `node 3JSE_Harness_v0.1/scripts/build-file-index.mjs`,
- keep `.agents/skills/` canonical and the two mirrors (`3JSE_Harness_v0.1/.claude/skills/`
  and repo-root `.claude/skills/`) in agreement — regenerate with
  `node 3JSE_Harness_v0.1/scripts/sync-claude-skills.mjs`,
- run `pnpm verify:harness`.

The repo-root `.claude/skills/` tree is a generated mirror — **do not hand-edit it**.
Edit `3JSE_Harness_v0.1/.agents/skills/`, then re-run the sync script.
