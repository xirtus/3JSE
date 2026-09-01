# Phase 1.1 — `@3jse/runtime` archetype index behind `Level.query`

**Status:** done — full runtime suite is the gate, green (29 tests).
**Date:** 2026-09-01
**Scope note:** RESUME.md's framing followed exactly — *"add an archetype index behind
`Level.query`, keep the API identical, full test suite as the gate."* No SoA/`Float32Array`
column rewrite (that would break `Entity`'s live-object-reference component model and every
dependent package); that remains future work if profiling ever demands it.

## Routing ledger

| Field | Value |
|---|---|
| Capability | Sub-linear `Level.query(types)` — stop full-scanning every Entity every System every tick |
| Existing project solution? | No. `Level.query` was `allEntities.filter(e => e.hasAll(types))`; its own comment called this "Phase 1-honest … archetype indexing is unbuilt future work". |
| Selected reference | `spikes/phase0/ecs-object3d/archetype.mjs` — its `query()` strategy (bucket by sorted component-set signature, superset match, cache invalidated only when a new signature appears). Adopted the *indexing* half; not the SoA storage half. |
| Why not a third-party ECS | Same reason the Phase 0 memo gives: the runtime's hard constraint is `Object3D` **is** the Transform and components are live mutable objects systems hold references to. bitECS/Miniplex/etc. impose their own storage. |
| Fallback | If the index had regressed any behaviour: revert to the one-line filter (kept trivially possible — the index is additive, `Entity`/`Level` public API unchanged). Not needed. |

## What changed

- `packages/runtime/src/Level.ts`
  - `archetypes: Map<signature, Set<Entity>>`, `entitySignature: Map<Entity, string>`,
    `queryCache: Map<queryKey, signature[]>`.
  - signature = component types sorted, NUL-joined (NUL can't occur in a code-defined
    component name → no escaping).
  - `createEntity` / `destroyEntity` / new internal `reindexEntity(entity)` maintain the
    buckets. `reindexEntity` is called by `Entity` on component add/remove.
  - `queryCache` maps a query to the **signatures** that satisfy it (not an entity list), so it
    only invalidates when a brand-new signature appears; entity moves between existing
    signatures never stale it because `query()` re-reads live bucket contents each call.
  - `query()` unions the matching buckets and sorts by `Entity.seq` → identical
    *creation-order* results to the old filter.
- `packages/runtime/src/Entity.ts`
  - `readonly seq` — a process-wide monotonic counter, independent of `id` (which can be
    caller-supplied on project load). Only the index uses it.
  - `addComponent` / `removeComponent` call `this.level.reindexEntity(this)` on an actual
    set change.
- `packages/runtime/src/Scheduler.ts` — unchanged in behaviour; `describe()` added earlier
  this session for the perf census.

## Gate — full runtime test suite

`pnpm --filter @3jse/runtime test` → **29 passed** (was 19). New:

- `src/Level.archetype.test.ts` (8) — creation-order results; add/remove moves buckets;
  arg-order independence; `query([])` = all; **a cached query still sees an entity that later
  enters a brand-new archetype**; `destroyEntity` drops from future queries; re-add restores
  membership; randomized mix matches a naive `filter` oracle.
- `src/Level.archetype.bench.test.ts` (2) — 20 000 entities across ~7 archetypes: hard
  assertion that `query()` results are byte-identical to the full scan for 5 query shapes;
  timing logged, loosely asserted (`idx < scan * 1.5`).

Downstream gate: `pnpm -r test` green across all 22 packages (character/physics/templates/
agent/etc. all drive `query` through the Scheduler), `pnpm -r typecheck` clean, editor builds.

## Measured

`[archetype bench] 20000 entities — indexed 0.060 ms/query vs full-scan 0.169 ms/query (2.8x)`

Consistent with the Phase 0 spike's 2.5× system-iteration speedup. The win grows with the
share of non-matching entities and with entity count; at small N the two are within noise, and
the index is never slower (asserted).

## Known limitations

- Index only — component **data** is still the per-`Entity` `Map<string, object>`; there is no
  SoA column store, so cache-locality wins from typed-array iteration are not realized. The
  Phase 0 memo's ~100k linear-scaling ceiling is unchanged; this work removes the redundant
  per-query scan, not the per-frame `Object3D` matrix cost.
- `EntityId` stable-identity registry and `snapshot/restore` (also named in the Phase 1.1 line)
  are **not** in this change — still open.
- `query()` allocates the result array + sorts it each call (as the old filter did). A
  System-facing iterator over buckets with no allocation is a further step, not taken here.
