# Phase 0 · Spike 1 — 3IR round-trip prototype

**Status:** CLOSED — pass
**Date:** 2026-09-01
**Baseline commit:** `2fc24e8`
**Roadmap deliverable:** "A throwaway 3IR prototype: hand-write ~5 IR node kinds, a JS emitter, and an interpreter; confirm the source-map round-trip (`GAMEPLAY_IR.md`'s bidirectional-editing claim) actually works on a small recognized TS subset before it's load-bearing for the whole engine."

## Routing ledger

| Field | Value |
|---|---|
| Capability | Gameplay IR: typed node-graph + TS-subset frontend + interpreter + JS/TS emitter with source map |
| Existing project solution found? | **Yes** — `packages/ir/` (`@3jse/ir`) already implements it; landed via the `ecf0c89` checkpoint session and grown since |
| Selected provider/reference | Project code (`@3jse/ir`). No external provider: an IR is 3JSE-specific by definition (`GAMEPLAY_IR.md` §"Why one IR"). TypeScript compiler API (`typescript` npm) is the only dependency, used as the frontend parser. |
| Why | The spike's own criterion is "does the round-trip work" — that is a test question against existing code, not a build task. The code predates this build session; this spike verifies it against the Phase 0 exit bar and records the evidence that was never written. |
| Fallback if integration fails | N/A — already integrated and green |

## What exists

`packages/ir/src/`:

- **`types.ts`** — 8 node kinds (`event`, `pure`, `call`, `branch`, `variable`, `query`, `get`, `set`). Roadmap asked for ~5; the extra three (`query`/`get`/`set`) are the Component read/write vocabulary that grew in for Phase 3 slice 1. Every node is JSON-serializable; `IRRef` is a typed wire.
- **`tsFrontend.ts`** — `parseTsSubset()`: parses a deliberately narrow recognized TS subset (one named function, `number`/`boolean`/`string`/`Entity` params, `if`/`else` with comparison or `hasComponent` conditions, calls, and `entity.getComponent<T>("C")!.field` assignments). Anything outside the subset **throws on purpose** — this is `GAMEPLAY_IR.md`'s "honest limit" boundary, surfaced rather than silently mishandled.
- **`interpreter.ts`** — tree-walking evaluator over the IR (the editor/live-debug backend), records calls and field writes.
- **`emitter.ts`** — `emit()`: IR → formatted TypeScript **plus a source map** (`SourceMapEntry[]`, each `{ nodeId, line }`).
- **`toSystem.ts`** — `compileToTickFn()`: wraps an IR graph as a per-entity tick function registerable as a real `@3jse/runtime` `SystemDef`.
- **`host.ts`** — `IRHost` adapter: the seam between IR execution and real `@3jse/runtime` Entities.

## Evidence

### Test suites — 14/14 pass

```
$ pnpm --filter @3jse/ir test
 ✓ src/systemIntegration.test.ts (2 tests)
 ✓ src/roundtrip.test.ts (7 tests)
 ✓ src/entityRoundtrip.test.ts (5 tests)
 Test Files  3 passed (3)
      Tests  14 passed (14)
```

- **`roundtrip.test.ts`** directly encodes the Phase 0 exit criterion. It asserts: the subset parses into all recognized node kinds; out-of-subset input throws; the interpreter takes the correct branch; the emitter produces syntactically valid TS (`assertValidTs` runs it through the real TS compiler); **every source-map entry's line actually contains that node's emitted text**; and `parse → emit → re-parse → interpret` produces identical behaviour to the original graph.
- **`entityRoundtrip.test.ts`** exercises the `get`/`set`/`query` vocabulary end-to-end through the real `IRHost` against live `@3jse/runtime` Entities (`VISUAL_SCRIPTING.md`'s door/trigger example).
- **`systemIntegration.test.ts`** proves an IR graph runs as a real `SystemDef` on a real `Scheduler`, driven by `World.step()`, and that `Scheduler.register` upsert-by-name hot-swaps a compiled-IR system mid-simulation (`RUNTIME.md`'s function-swap).

### Live round-trip demonstration

Input TS → `parseTsSubset` → `emit` → re-`parseTsSubset` → `interpret` on both graphs:

```
--- emitted from IR ---
function onDamage(amount: number, current: number): void {
  if ((amount > current)) {
    applyDeath();
  } else {
    applyDamage(amount);
  }
}
--- source map (node -> line) ---
event_2 @ L1
branch_3 @ L2
call_5 @ L3
call_6 @ L5
amount=10 current=5: original [{"target":"applyDeath","args":[]}]  reparsed [{"target":"applyDeath","args":[]}]  match=true
amount=3  current=5: original [{"target":"applyDamage","args":[3]}] reparsed [{"target":"applyDamage","args":[3]}] match=true
```

The emitted text is idiomatic TypeScript (redundant parens aside), each IR node maps to the emitted line that contains its text, and the re-parsed graph is behaviourally identical.

## Assessment against the exit criterion

> "no open question from `GAMEPLAY_IR.md` … remains unvalidated by a working prototype"

**The source-map round-trip claim is validated for the recognized subset.** The mechanism (`GAMEPLAY_IR.md` §"Bidirectional graph ↔ code editing") — one IR, a frontend that parses a recognized subset, a backend that emits that same subset with per-node source-map references, and lossless behaviour across the trip — works in code today.

## Known limitations / what this spike does NOT prove

- **No `loop` / `await` nodes.** The IR shape in `GAMEPLAY_IR.md` lists both; the prototype has neither. Async/coroutine round-tripping is unproven.
- **No ComponentSchema-driven struct types.** `get`/`set` take bare `(component, field)` string pairs; `outputType` on `get` is documentation-only, not checked against a generated struct type from `ENTITY_COMPONENT_MODEL.md`.
- **No `@3jse/graph` node canvas.** The "Graph frontend" arm of the compiler diagram is absent; graphs in the `get`/`set` vocabulary are hand-built `IRGraph` literals standing in for canvas output. The graph↔code convergence claim ("a graph edit and a code edit converge to the same IR") is only shown code↔code.
- **No join-node semantics.** `branch` is exec-terminal — post-if flow must be duplicated into both arms. Production IR needs real join nodes.
- **No opaque "code node" fallback.** Out-of-subset input throws instead of degrading to a black-box node with an inferred signature.
- **Frontend has no type checker.** Free identifiers default to `"string"`; comparison operand types aren't verified.

None of these block Phase 0 closure — the exit criterion is the round-trip mechanism, and it holds. They are Phase 3 production-compiler work, already flagged as such in `packages/ir/src/index.ts`'s header comment.

## Go/No-Go

**GO** — `GAMEPLAY_IR.md`'s bidirectional-editing architecture is not a risk. The one-IR / multi-frontend / multi-backend / source-mapped design compiles and round-trips. Downstream phases that depend on it (Phase 3 Graph, Phase 4 Agent API) are cleared on this axis.
