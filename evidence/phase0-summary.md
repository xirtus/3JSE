# Phase 0 — Technical experiments: summary, routing ledgers, go/no-go

**Date:** 2026-09-01
**Baseline commit:** `2fc24e8`
**Harness:** `node 3JSE_Harness_v0.1/scripts/verify-harness.mjs` → **PASS** (green before and after this session)

Per `docs/ROADMAP.md` Phase 0 and `BUILD_PROMPT.md` "First session, concretely." Four de-risking spikes, executed in order. Detail memos: `evidence/phase0-spike{1,2,3,4}-*.md`.

---

## Consolidated routing ledger

| Spike | Capability | Existing project solution? | Selected provider / reference | Why | Fallback |
|---|---|---|---|---|---|
| 1 · 3IR round-trip | Typed gameplay IR + TS-subset frontend + interpreter + JS/TS emitter w/ source map | **Yes** — `packages/ir` (`@3jse/ir`), pre-existing | Project code. Dep: `typescript` (frontend parser) only | An IR is 3JSE-specific by definition (`GAMEPLAY_IR.md`); spike verifies existing code against the exit bar | N/A — already integrated, 14/14 tests green |
| 2 · ECS-over-Object3D | Archetype/SoA storage + `Object3D`-backed Transform, 10k @ 60fps | **No** — `packages/runtime` is Phase-1-honest Map + full-scan; archetype layer absent | Reference impls (bitECS/Flecs/Bevy pattern, cited in `ENTITY_COMPONENT_MODEL.md`) + custom throwaway spike (`spikes/phase0/ecs-object3d/`) | No off-the-shelf ECS does "archetype tables AND `Object3D` *is* the Transform store" together; wrapper-sync reintroduces the drift `Entity.ts` avoids | Hybrid: hot numerics in columns, per-frame `Object3D` write for Transform (what the spike does) — not needed, it passed |
| 3 · Verse Level-3 | Parse a portable subset of real Verse into 3IR | **Yes, as prose** — `docs/VERSE_COMPATIBILITY.md` already says "investigate, don't commit" | Public sources only (Book of Verse `verselang/book` = CC0; Epic statements; UE forums). No code parsed, no parser written | Deliverable is a written go/no-go, not an implementation; building a parser now = committing to Level 3, the thing the spike exists to avoid | N/A |
| 4 · Editor shell | Desktop shell: WebGPU viewport, native FS, multi-window | **Yes, as a preference** — `docs/EDITOR.md` names Tauri primary; no shell wired up in `apps/editor` | Tauri v2 (WRY); Electron held as documented fallback | Footprint / memory / cold-start / security all favour Tauri; multi-window + Win/macOS WebGPU adequate in v2; SPA is shell-agnostic so reversal is cheap | Electron, per-platform or whole-shell, if the Phase 1 confirmation checklist fails |

---

## Go / No-Go decisions

| # | Decision | Verdict | Unblocks |
|---|---|---|---|
| 1 | **3IR bidirectional-editing architecture** (`GAMEPLAY_IR.md`) | **GO** | Phase 3 (3JSE Graph), Phase 4 (Agent API structured-gen) cleared on the IR axis |
| 2 | **Archetype storage + `Object3D` Transform bridge** (`ENTITY_COMPONENT_MODEL.md`) | **GO** | Phase 1 `@3jse/runtime` archetype implementation authorised |
| 3 | **Verse Level 3** (`VERSE_COMPATIBILITY.md`) | **NO-GO** (dormant research item; not in any phase) | Nothing gated — Levels 1–2 unaffected, require nothing from this spike |
| 4 | **Editor shell = Tauri v2** (`EDITOR.md`) | **GO** (decision made; hands-on confirmation deferred to Phase 1 bring-up) | Phase 1 editor packaging direction fixed |

### Key numbers (Spike 2)

10 000 entities, 900 frames, `node v26` / `three r185` / Apple Silicon arm64:

| stage | archetype avg | archetype p95 | naive avg |
|---|---|---|---|
| systems | 0.331 ms | 0.372 ms | 0.838 ms |
| `updateMatrixWorld(true)` | 0.269 ms | 0.299 ms | 0.330 ms |
| **total** | **0.600 ms** (3.6 % of 16.67 ms budget) | **0.662 ms** | 1.167 ms |

Linear scaling to ~100k (saturates at ~15.8 ms/frame). Archetype iteration 2.5× faster than the naive full-scan mirror of today's `Level.query()`.

---

## Phase 0 exit criteria — status

> "no open question from `GAMEPLAY_IR.md` or `ENTITY_COMPONENT_MODEL.md` remains unvalidated by a working prototype; Verse Level-3 go/no-go is decided; editor shell technology is chosen."

| Criterion | Status |
|---|---|
| `GAMEPLAY_IR.md` open questions validated by a working prototype | **Met** for the source-map round-trip on the recognized subset (Spike 1). Not validated: `loop`/`await` nodes, schema-driven struct types, graph↔code convergence via a real canvas — all explicitly Phase 3 production-compiler scope, not Phase 0 questions. |
| `ENTITY_COMPONENT_MODEL.md` storage bet validated | **Met** — archetype + `Object3D` Transform hits 10k/60fps with wide margin (Spike 2). |
| Verse Level-3 go/no-go decided | **Met** — NO-GO, documented (Spike 3). |
| Editor shell chosen | **Met** — Tauri v2 (Spike 4), with a Phase 1 confirmation checklist for the parts that need a running shell. |

**Phase 0 closes.** Downstream work (Phase 1 Editor MVP) is authorised.

## Open items carried into Phase 1 (none blocking)

1. **Spike 2:** re-measure 10k ECS on an actual mid-range (Intel/AMD) laptop, and again with `WebGPURenderer` attached (render cost was out of scope here).
2. **Spike 4:** run the Tauri confirmation checklist during shell bring-up — WebGPU on all three system webviews (WebKitGTK is the real risk), `plugin-fs` scoped to a user-picked project dir, float/restore a panel window, shared WebGPU context across Play mode, signed CI builds. Fix the editor's supported-OS matrix first.
3. **Spike 4 guardrail:** land the single `shell/` native-call adapter in `apps/editor` and keep the browser target in CI, so shell lock-in can't creep in.
4. **Spike 3:** re-check Epic's Verse license/grammar status at the start of any future phase that proposes touching Verse.
