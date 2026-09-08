# Field World Experiments — Evidence Report

`docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md` experiments 00–07, executed headless on branch
`gaussian-causal-field`. The field is authoritative; Gaussians/Rapier/VFX/agent
semantics are projections. No renderer is required for field correctness.

## Core loop (what was actually exercised)

Seven headless experiments, each with vitest gates, in
`experiments/field-world/src/experiments/`:

| Exp | Plan § | Gate | Result |
|---|---|---|---|
| 01 schema | §16 | state + response card describe wet trail + cold snow without `WetMudMaterial`/`PowderSnowMaterial`; serialization round-trip; field query | pass |
| 02 dual resolution | §17 | field step iterates cells not visuals; visual density change ≠ causal change; resolution change ≠ scene rebuild | pass |
| 03 projection | §18 | field → projection buffer → Gaussian attrs without replacing the splat asset; no per-splat loop | pass (headless) |
| 04 snow | §19 | one card spans powder→packed→wet→slush→crust, driving visible + mechanical + FX change | pass |
| 05 trail | §20 | same infrastructure handles soil; one rainfall drives darker/glossier + dust↓ + splash↑ + bearing↓ | pass |
| 06 fire | §21 | downwind spot fire emerges from ember deposition + local state + response, with lineage | pass |
| 07 agent ops | §22 | bounded command surface; agent dries west slope, ignites a heat source, runs, reports emergence | pass |

## Build / runtime

- **typecheck:** `pnpm -r typecheck` clean (all 39 workspace projects).
- **tests:** `pnpm -r test` green; `@3jse/field-world-experiment` 27/27.
- **harness:** `pnpm verify:harness` PASS (28 skills, 17 new capability ids, cross-registry integrity, both mirrors in agreement, FILE_INDEX in sync).
- **build:** `pnpm --filter @3jse/editor build` clean (7.02 s).
- **console errors:** none (headless Node; no browser surface touched).

Full gate (`pnpm gate` = verify:harness + typecheck + test + editor build) exits 0.

## Visual evidence

None (by design). Experiments 01–07 are headless; the serialized field state is the
authoritative evidence. The GPU/Three-backed visual gate for Experiment 03 (live
Gaussian appearance change in a real viewport) is the remaining renderer-dependent
step — it needs a Gaussian backend (Three-native GS / Brush), which is not yet
vendored in this repo. Visual verification must be headed when it runs
(`3JSE_Harness_v0.2/AGENTS.md`: no headless frames as visual evidence).

## Performance (measured, not guessed)

- `exp02` field step (1600 cells): iterates exactly 1600 cells — the field step
  never iterates the 200k visual elements. `stepField` duration recorded per run
  (`fieldStepDurationMs`).
- Memory discipline enforced structurally: one `FieldChunk.data` interleaved buffer
  (cells × 16 floats); response coefficients live in shared `ResponseCard`s addressed
  by `responseIndex`; visual elements hold only a cell index + RGBA + opacity.

## Provider / asset ledger

No external code was copied or vendored. All sources are recorded in
`docs/FIELD_SOURCES.md` with disposition (`pattern_port` / `authoring_only` /
`provider_reference`) and unverified commit/license — none entered a provider
registry. The field implementation is original headless TypeScript; its expert-basis
and dual-resolution patterns are ports of the *ideas* from FieryGS / OmniPhysGS /
GASP, not copied code.

## Known limitations

- **No Gaussian renderer yet.** Experiments 01–07 prove the causal architecture
  headlessly; the visual projection (Experiment 03) is proven as projection math +
  buffer discipline, not as a live GPU appearance change. A Gaussian backend
  (Three-native GS / Brush) must be vendored and license-verified first.
- **`@3jse/field` promotion deferred.** Per plan §34, the experiment package is not
  promoted to `@3jse/field` until the interface is evidenced, not guessed. The
  schema is the minimum viable one, not frozen.
- **Fire/trail/snow are homogenized response models**, not micro-physical solvers
  (plan §35.14 — no claim of microscopic snowflake simulation).
- **Game integration (Experiment 08 / commit 12) not started** — no Xirtus Mountain
  game sector exists in this repo yet; the plan sequences it strictly after the
  prior gates.

## Source disposition (Experiment 00)

`docs/FIELD_SOURCES.md` records the required columns (Source · Commit · License ·
Runtime stack · Disposition · Artifact to extract · Why useful · Why not directly
imported) for 20+ candidate sources. Stop condition honored: no source enters a
provider registry until disposition + literal license are human-verified.
