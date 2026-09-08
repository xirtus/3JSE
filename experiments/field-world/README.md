# Field World — headless Gaussian causal-field experiments

Headless implementation of `docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md` experiments.
**Not a shipped engine package.** This is the experiment bench; promotion to
`@3jse/field` happens only after the gates here pass (plan §6.1, §34 commit 12).

The invariant under test (plan §38):

> **The causal field is authoritative; Gaussians, rigid-body contact, VFX, audio,
> navigation, and agent semantics are projections of it at the resolution
> appropriate to each subsystem.**

## Layout

| Path | Experiment (plan §) |
|---|---|
| `src/types.ts` | Design schema — `WorldSampleState`, `ResponseCardRef`, `SemanticRef` (§2.1) |
| `src/field.ts` | `FieldChunk` + `WorldField`: sampling, gradient, query, write (§8) |
| `src/responseCard.ts` | `ResponseCard`, expert basis, `W(state,env)` → weights, projections (§7) |
| `src/synthetic.ts` | Synthetic cold/warm transition field + deterministic serialization (§16, §32) |
| `src/experiments/exp01-schema.ts` | Field schema + headless sampler (§16) |
| `src/experiments/exp02-dual-resolution.ts` | Visible count ≠ causal count (§17) |
| `src/experiments/exp03-projection.ts` | Field → projection buffer (§18) |
| `src/experiments/exp04-snow.ts` | Causal snow response card (§19) |
| `src/experiments/exp05-trail.ts` | Causal trail/mud (§20) |
| `src/experiments/exp06-fire.ts` | Emergent forest fire (§21) |
| `src/experiments/exp07-agent-ops.ts` | Bounded agent field ops (§22) |

## Run

```bash
pnpm --filter @3jse/field-world-experiment typecheck
pnpm --filter @3jse/field-world-experiment test
```

## Rules honored

- **Headless:** every experiment runs without a renderer; the serialized field
  state is the evidence.
- **State ≠ coefficients:** state lives in `FieldChunk.data`; response coefficients
  live in shared `ResponseCard`s addressed by `responseIndex`.
- **Field resolution ≠ render resolution:** a field step iterates cells, never
  visual elements (`exp02`).
- **Systems, not scripted outcomes:** `addHeat`/`addMoisture`/transport/response
  evaluation, never `SetTreeOnFire` (`exp06`).
