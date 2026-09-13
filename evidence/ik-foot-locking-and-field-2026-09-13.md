# IK Foot Locking + Causal Field Promotion — Evidence

Engine-package work (engine-package skill evidence shape), 2026-09-13.

## Scope

Two integrations, one branch (`gaussian-causal-field`):

1. **IK foot locking** — port Daniel Holden's "Inverse Kinematics and Foot Locking"
   (theorangeduck.com, MIT) into `@3jse/animation` as headless modules.
2. **Gaussian causal field** — promote the evidenced `experiments/field-world` core to the
   `@3jse/field` engine package and wire it into the runtime as a World resource.

## Routing ledger

| Capability | Rung-0 found? | Selected | Why | Fallback |
|---|---|---|---|---|
| IK foot locking / leg chain | `@3jse/animation` had positional `solveTwoBoneIK` + `retargetClip`; no foot locking / leg-chain orientation / contact labels | theorangeduck article (MIT, pinned `3b9920c`) ported as `legChain` / `footLocking` / `contactLabels` / `offlineFootLock` | Exact requested feature; pure math, headless-testable, matches existing TwoBoneIK "no scene graph" posture | Layer foot-locking + contact labels over the existing positional `solveTwoBoneIK` |
| Causal field | `experiments/field-world` (7 exps, 27 tests) had the core, not promoted | Promote to `@3jse/field` (plan §6.1's sanctioned early package) + World resource wiring + catalog | 27 tests evidence the interface ("promote when evidenced, not guessed", plan §34) | Keep experiment-only |

## Exit criteria

- **IK:** quoted `docs/ANIMATION.md` "foot-placement/ground-adaption solvers, layered on top of
  the base pose" — **met** headlessly; no scene graph needed.
- **Field:** plan §6.1 `@3jse/field` responsibilities (schema, chunks, sampling, serialization,
  deterministic state update utilities, bounded agent command surface) — **met**; §6.1 "must NOT
  own renderer/physics/fire/snow/vegetation" — **honored** (fire/snow/trail stay in the experiment).

## Proofs (headless, deterministic)

- **IK tests:** `@3jse/animation` 41 tests (was 23 before this session: +4 legChain, +5
  footLocking, +5 contactLabels, +2 offlineFootLock, +2 field-package; net package total 41).
  Invariants proven: leg chain reaches a reachable toe target while preserving thigh/shin length;
  soft-clamps to `maxExtension` instead of hyper-extending; height-clamps targets to bind heights;
  foot locking holds a locked contact against input slide and unlocks on contact-drop or
  `unlockDistance`; cubic inertialization stays finite over a 400-frame alternating sequence.
- **Field tests:** `@3jse/field` 6 tests. Invariants: serialize→deserialize→serialize byte-identical;
  sampling returns null out-of-bounds and a cold→warm gradient in-bounds; one response card spans
  frozen powder→wet slush with no material swap; `FieldOps` mutations are region-bounded and
  bump chunk `version`; a `@3jse/runtime` `World` holds the field as the `CausalField` resource.
- **Consolidation:** `experiments/field-world` now imports the core from `@3jse/field` (single
  source of truth); its 27 tests still pass. The 4 superseded core files were removed — content is
  verbatim in `@3jse/field` and the experiment is in git history.

## Provenance

- `packages/vendor/licenses.json`: `genoview-inverse-kinematics` → MIT (human-verified at pinned
  commit `3b9920c7dd5436c5bc05f045002a64f085c69a9d`), `vendor-registry` / `reference`, ported (not
  vendored) into `@3jse/animation`.
- Field sources remain in `docs/FIELD_SOURCES.md` (all `pattern_port` / `authoring_only` /
  `provider_reference`, none imported as code).

## Known limitations / remaining work

- **Gaussian renderer is deliberately not built** (plan §35.1, §6.2): the tracked
  "renderer-dependent work" in `BUILD_TASKS.md` — a Three-native GS / Brush backend behind the
  `GaussianBackend` seam to make Experiment 03 a headed visual gate. The field core is complete;
  the visual projection is the open half.
- **IK is a headless utility**, exported and tested but not yet wired into
  `createAnimationSystem` (which drives a THREE.AnimationMixer). The integration seam is: after
  `mixer.update`, read bone world transforms from the skinned mesh and call `solveLegChain` with a
  `updateFootLockingState`-produced toe target. TwoBoneIK/retarget follow the same "layered-on-top
  utility" convention, so this matches the package's existing posture.
- **No headed visual verification** was run for the IK solve (headless tests only) — per the
  "visual verification is headed, or it did not happen" rule, a headed frame is the follow-up.

## Files

- `packages/animation/src/{legChain,footLocking,contactLabels,offlineFootLock}.ts` + tests + `index.ts`
- `packages/field/{package.json,tsconfig.json,src/*}`
- `experiments/field-world/{src/index.ts,src/experiments/exp07-agent-ops.ts,README.md,package.json}` (consolidated)
- `packages/plugins/src/catalog.ts`, `3JSE_Harness_v0.2/.agents/skills/engine-package/SKILL.md`
- `packages/vendor/licenses.json`
