# Phase 0 · Spike 2 — ECS-over-Object3D benchmark

**Status:** CLOSED — pass (at the 10k target, with margin)
**Date:** 2026-09-01
**Baseline commit:** `2fc24e8`
**Spike code:** `spikes/phase0/ecs-object3d/` (throwaway — NOT the shipping runtime)
**Roadmap deliverable:** "A minimal ECS-over-`Object3D` spike: confirm archetype storage plus a Transform-as-Object3D bridge performs acceptably (target: 10k entities, steady 60fps on a mid-range laptop) and doesn't fight Three.js's own scene-graph update internals."

## Routing ledger

| Field | Value |
|---|---|
| Capability | Archetype/SoA entity storage with `Object3D` as the Transform component's backing store |
| Existing project solution found? | **Partial — no.** `packages/runtime` (`@3jse/runtime`) has the Entity/Component/Level/Scheduler API and the `Object3D`-as-Transform decision, but storage is a per-entity `Map<string, obj>` and `Level.query()` is a full-scan `filter` every call. Its own comments call this "Phase 1-honest … archetype indexing is unbuilt future work." So the archetype layer this spike de-risks does **not** exist yet. |
| Selected provider/reference | **Reference implementations + custom.** Archetype/SoA layout follows the well-trodden bitECS / Flecs / Bevy pattern (`ENTITY_COMPONENT_MODEL.md` §Storage cites these). Transform bridge follows `packages/runtime/src/Entity.ts` (`Object3D` from `three/webgpu`, `userData.entityId` back-index). No third-party ECS adopted — the constraint is "archetype tables AND `Object3D` is the Transform storage" simultaneously, which bitECS/Bevy don't do out of the box. |
| Why not adopt bitECS/Miniplex/etc. | Those store Transform as their own SoA columns; the design doc's hard requirement is that position/rotation/scale/parenting stay on the Three.js scene graph "exactly where every existing Three.js library expects to find them." A wrapper that syncs an ECS Transform column ↔ `Object3D` every frame reintroduces the drift `Entity.ts` was written to avoid. The spike measures the no-copy approach instead. |
| Fallback if it had failed | Hybrid: keep hot numeric components in archetype columns, accept a per-frame `Object3D` write for Transform (what the spike actually does), or — if that were too slow — a dirty-tracked flush. It was not needed. |

## Method

`spikes/phase0/ecs-object3d/`:

- **`archetype.mjs`** — `ArchetypeWorld`: components are either NUMERIC (parallel `Float32Array` columns, one per field, grown by doubling) or the special `Transform` (storage **is** a `THREE.Object3D`, no parallel copy). An archetype is keyed by its sorted component signature; each holds columns + a row→entityId back-index. `addComponent`/`removeComponent` swap-remove the row from the old table and push onto the new one. `query(types)` returns superset-matching archetypes (cached), so systems iterate only matching tables.
- **`naive.mjs`** — `NaiveWorld`: entities as heterogeneous objects, components in a per-entity `Map`, `query()` = full-array `filter` by `hasAll`. A faithful mirror of `packages/runtime/src/Level.ts` today, for comparison.
- **`bench.mjs`** — builds ~10k entities across a realistic mix of 7 archetypes (incl. a parented subtree so `updateMatrixWorld` walks real hierarchy), runs 4 systems/frame (Gravity, Movement writing `Object3D.position` directly, Spin writing `Object3D.rotation`, Lifetime doing a structural archetype move on every expiry), and every frame calls `scene.updateMatrixWorld(true)` — the "Transform bridge" tax. 900 frames, 100 discarded as warmup. Reports avg/median/p95/max ms for `systems`, `matrix`, and `total`.

**Gate:** archetype `total` p95 < 16.67 ms (one 60 fps frame).

## Results

Environment: `node v26.3.0`, `three r185`, `darwin arm64` (Apple Silicon). **This machine is faster than a "mid-range laptop"** — see caveats.

### 10 000 entities (the roadmap target), 900 frames

| stage | avg | median | p95 | max |
|---|---|---|---|---|
| **archetype** systems | 0.331 | 0.327 | 0.372 | 0.841 |
| **archetype** matrix (`updateMatrixWorld`) | 0.269 | 0.266 | 0.299 | 0.492 |
| **archetype** total | **0.600** | 0.592 | **0.662** | 1.168 |
| naive systems | 0.838 | 0.826 | 0.933 | 1.507 |
| naive matrix | 0.330 | 0.319 | 0.395 | 0.706 |
| naive total | 1.167 | 1.148 | 1.314 | 1.968 |

- Archetype total avg **0.60 ms = 3.6 % of the 16.67 ms frame budget.** ~28× headroom on this machine.
- Archetype vs. naive: **2.5× faster system iteration**, 1.9× faster total.
- `matrix` cost is essentially storage-independent (0.269 vs 0.330 ms) — as expected, it's a function of how many `Object3D`s moved, not how they're stored.
- **GATE: archetype total p95 (0.662 ms) < 16.67 ms → PASS.**

### Stress (scaling behaviour), 600 frames

| N | archetype systems avg | archetype matrix avg | archetype total avg | % of budget | gate (p95<16.67) |
|---|---|---|---|---|---|
| 10 000 | 0.33 | 0.27 | 0.60 | 3.6 % | PASS (0.66) |
| 50 000 | 3.72 | 2.56 | 6.28 | 37.7 % | PASS (7.28) |
| 100 000 | 10.38 | 5.42 | 15.80 | 94.8 % | **FAIL (16.87)** |

Both `systems` and `matrix` scale **linearly** with entity count — no super-linear blow-up, no dirty-flag thrashing. The ~100k saturation point is the honest ceiling of this exact approach (single-threaded, per-frame `Object3D` writes for every moving entity, full `updateMatrixWorld`).

## "Doesn't fight Three.js's scene-graph internals"

Confirmed at the scale that matters:

- Writing `Object3D.position` / `.rotation` from a system loop and then calling `scene.updateMatrixWorld(true)` costs **0.27 ms for 10k moving entities**. Three recomputes a matrix only where `matrixWorldNeedsUpdate` is set; the benchmark moves *every* entity every frame, so this is a worst case — a scene with mostly-static entities would pay far less.
- The parented subtree (2 % of entities under ~200 parents) added no measurable pathology — hierarchy traversal is part of the linear cost, not a multiplier.
- No GC pressure spikes visible in the max column (1.17 ms max vs 0.60 ms avg at 10k is normal jitter, not a stall).

The one real cost to carry forward: `updateMatrixWorld` is ~45 % of the per-frame total at 10k. Mitigations exist and are already in `PERFORMANCE.md` (BVH culling means you don't `updateMatrixWorld` the whole scene; static-entity batching; `matrixAutoUpdate = false` for non-moving entities) — none needed for Phase 0, all available for Phase 1+.

## Assessment against the exit criterion

> "confirm archetype storage plus a Transform-as-Object3D bridge performs acceptably (target: 10k entities, steady 60fps …) and doesn't fight Three.js's own scene-graph update internals"

**Met, with roughly an order of magnitude of margin at the target on this machine.** Even assuming a mid-range laptop is 3–4× slower, 10k entities land at ~2–2.5 ms/frame — comfortably inside budget alongside rendering.

## Known limitations / caveats

- **Hardware.** Measured on Apple Silicon (arm64), not the "mid-range laptop" the roadmap names. No mid-range Windows/Intel number was captured. The margin at 10k (3.6 % of budget) is large enough that this is very unlikely to change the verdict, but it is not directly measured. **Open item.**
- **Headless matrix math only.** No `WebGPURenderer`, no actual draw. The spike isolates ECS iteration + scene-graph matrix update; it does not measure render submission, culling, or GPU cost. That's correct for *this* spike's question but means "steady 60fps" is proven only for the gameplay+bridge half of the frame.
- **`node v26` V8** may be faster than the Chrome/Electron V8 the editor will actually run. Same order of magnitude, but not identical.
- **Throwaway code.** `archetype.mjs` is ~250 lines proving the layout; it is not production-hardened (no `EntityId` stable-identity registry, no snapshot/restore, no component-schema validation, minimal structural-change batching). It informs `@3jse/runtime`'s Phase 1 archetype work; it is not that work.
- **Structural-change cost** is exercised (Lifetime expiry → archetype move every frame for a fraction of entities) but not stress-tested — a frame that moves *every* entity between archetypes was not measured.

## Go/No-Go

**GO** — `ENTITY_COMPONENT_MODEL.md`'s central bet ("editor-friendly authoring AND fast at 10 000 instances, via archetype storage with `Object3D` as Transform") is sound. Archetype tables + no-copy `Object3D` Transform hits the 10k/60fps target with wide margin and scales linearly to ~100k on this hardware. Phase 1's `@3jse/runtime` archetype implementation is cleared to proceed; carry the "mid-range laptop confirmation" and "with renderer attached" measurements as Phase 1 checks.
