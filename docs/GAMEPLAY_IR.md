# 3JSE Gameplay IR (3IR)

This is the most important document in the design package. Every other claim in `VISION.md` — that visual scripting, hand-written TypeScript, and AI generation are "the same program" — is only true because of the architecture described here. Get this wrong and 3JSE Graph becomes exactly the "isolated universe" `VISUAL_SCRIPTING.md` is explicitly told not to become.

## The compiler-architecture framing

Treat gameplay authoring the way a real compiler treats source languages: multiple **frontends**, one **intermediate representation**, multiple **backends**.

```
FRONTENDS                          IR                    BACKENDS
──────────                       ──────                  ────────
TypeScript adapter    ──┐                          ┌──►  JS/TS emitter (ships in game)
3JSE Graph frontend    ──┼──►   3JSE Gameplay IR  ──┼──►  Interpreter (editor live-debug)
AI structured-gen      ──┤        (3IR)              ├──►  WASM emitter (hot-path opt-in)
frontend                │                            │
(future) Verse frontend ─┘                          └──►  Static analyzer (lint/AI context)
```

- **TypeScript adapter**: hand-written code that calls 3JSE's runtime APIs is parsed into 3IR for tooling purposes (cross-referencing, the Agent API's project understanding, and optional bidirectional graph view — `VISUAL_SCRIPTING.md` §Bidirectional editing below). It is *not* forced to round-trip through 3IR to execute — see "What actually executes," below.
- **3JSE Graph frontend**: the node graph compiles to 3IR directly; this is its only execution path (`VISUAL_SCRIPTING.md`).
- **AI structured-generation frontend**: an AI agent emits 3IR nodes directly through the Agent API's `circuits.write`-equivalent tool, constrained by the IR's own type system rather than free-form code generation (`AI_AGENT_API.md`).
- **Verse frontend** (future, optional): evaluated in `VERSE_COMPATIBILITY.md`; not required for 3IR to be useful today.

## What 3IR actually is

3IR is a small, typed, JSON-serializable node-graph format — not the same thing as "abstract JavaScript," and not the same thing as "abstract Blueprint." It's deliberately narrower than a general-purpose AST because gameplay logic is a narrower problem than general-purpose programming: it needs events, typed data flow, ordered side effects, branching, loops, async waits, and calls into the engine's Component/Resource API — and does not need, say, arbitrary closures over the JS module graph or dynamic `eval`.

```ts
// simplified 3IR node shape
type IRNode =
  | { kind: "event"; id: string; name: string; params: IRType[] }
  | { kind: "pure"; id: string; op: string; inputs: IRRef[]; outputType: IRType }
  | { kind: "call"; id: string; target: EngineAPIRef; args: IRRef[]; next: IRRef }
  | { kind: "branch"; id: string; cond: IRRef; then: IRRef; else: IRRef }
  | { kind: "loop"; id: string; over: IRRef; body: IRRef; next: IRRef }
  | { kind: "await"; id: string; signal: IRRef; next: IRRef }
  | { kind: "variable"; id: string; scope: "local" | "component" | "resource"; type: IRType };

type IRRef = { node: string; pin?: string };   // wire = an edge between two node pins
```

Every `IRRef` is typed (`number`, `vector3`, `EntityRef`, `ComponentRef<Health>`, `string`, `boolean`, domain enums, and struct types generated from Component schemas — `ENTITY_COMPONENT_MODEL.md`). Type errors are caught at the IR level, before any backend ever sees the graph — which is what lets both the Graph editor and an AI agent get fast, structural feedback ("this pin wants a `number`, you connected a `string`") instead of a runtime `TypeError` three layers downstream.

Pure nodes (no side effects, no `next`) are evaluated on demand and can fan out to multiple consumers safely — this maps directly to 3JSE Graph's pure/impure pin distinction (`VISUAL_SCRIPTING.md`). Nodes with a `next` pin form the explicit execution order — this is 3IR's "exec wire," and it is what keeps ordering unambiguous, unlike a plain expression tree.

## What actually executes

Two backends consume the same 3IR, deliberately:

1. **Interpreter (editor / live-debug mode).** A tree-walking evaluator over the IR graph, instrumented to report every intermediate value back to the editor — this is what powers active-wire visualization, breakpoints, and watches in `VISUAL_SCRIPTING.md`. Slower, but every frame is fully inspectable, which is the correct tradeoff *while iterating*.
2. **JS/TS emitter (shipping mode).** The same IR compiles ahead-of-time to a plain function — readable, formatted TypeScript, not minified/opaque output — registered into the Runtime scheduler exactly like a hand-written System (`RUNTIME.md`). This is what ships in the built game: no interpreter, no IR walking, no visual-scripting runtime tax at all. A WASM emitter is a defined extension point for the rare hot path (large-scale particle/crowd logic) that profiles as needing it — deliberately **not** the default backend, because most gameplay logic is not the bottleneck a WASM compile target is worth the complexity for.

Hand-written TypeScript never has to round-trip through 3IR to run — it already is valid input to the JS/TS pipeline. It participates in 3IR *voluntarily*, when a developer wants graph-view/AI-legibility for code they wrote by hand (next section).

## Bidirectional graph ↔ code editing

This is the mechanism, not just the feature:

- The **TypeScript adapter frontend** parses a constrained, recognizable subset of TS — calls into the Runtime/Component API, `if`/`for`/`await` in patterns the IR can represent, no arbitrary metaprogramming — into 3IR. Code outside that subset is *not* a bug to fix; it's the intended boundary (next section).
- The **JS/TS backend** emits from 3IR back into that same recognizable subset, with a **source map**: every emitted line carries a reference back to the originating IR node ID, and every IR node carries a reference back to the graph node that produced it (or `null` if it came from hand-written code).
- A graph edit recompiles to new text in the mapped region only; a text edit inside the mapped region re-parses to a new IR subgraph and the Graph editor's view updates live. This is the same category of problem as source maps between TypeScript and emitted JS in every modern web toolchain — 3JSE applies the identical idea one level up, between a graph and its emitted code, instead of inventing a new synchronization mechanism.

**The honest limit:** the moment hand-written code leaves the recognized subset — a closure that captures unrelated module state, a control-flow shape the IR can't represent, a call into something outside the Runtime API — that region stops round-tripping and the corresponding graph view shows it as an opaque **"code" node**: a black box with typed inputs/outputs (inferred from the function's signature) that the graph can still wire into, but not decompose visually. This mirrors Unreal's Blueprint/C++ boundary and Verse's own native-function escape hatch, made *visible* in the graph instead of silently breaking sync. `VISUAL_SCRIPTING.md` covers the editor-facing behavior of this boundary; this document is why it's structurally the only honest option.

## Why one IR instead of "the graph just emits JavaScript"

The tempting shortcut — have the graph editor emit JS text directly, the way most visual-scripting-on-the-web tools do — is rejected deliberately. It would satisfy "compiles to clean JS" (user requirement) but fail everything else 3IR is required to do:

- **AI structured generation** needs a typed target it can validate against *before* anything executes — emitting text directly means an AI's mistakes surface as runtime or syntax errors instead of IR-validation errors, exactly the failure mode `AI_AGENT_API.md`'s verify loop exists to avoid upstream of.
- **Live debugging** (active-wire values, step, breakpoints) needs a structured graph to instrument at runtime — you cannot cleanly breakpoint "a line of generated JS" and highlight the originating node without the IR-to-source map this section describes.
- **Bidirectional editing** needs a common structural form both graph and code can losslessly (within the recognized subset) convert to and from — text-to-text diffing between two independently-generated JS files does not give you that.
- **A future Verse frontend** (`VERSE_COMPATIBILITY.md`) needs a target that isn't JavaScript's syntax specifically — an IR is frontend-agnostic by construction; "compile to JS text" is not.

3IR is more upfront design work than "graph emits JS," and it is the reason 3JSE Graph does not become the isolated universe the brief explicitly warns against.
