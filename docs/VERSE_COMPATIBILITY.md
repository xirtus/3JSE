# Verse Compatibility

## Framing

Verse is Epic's programming language for UEFN, designed around determinism, concurrency primitives suited to gameplay, and a strong type system. It is not open, not portable outside Epic's ecosystem today, and its runtime is not something 3JSE can or should depend on. The question this document answers is narrower than "should 3JSE support Verse": it's *which parts of Verse's design are worth 3JSE deliberately resembling*, independent of Epic's implementation.

## The six levels, evaluated

| Level | Description | Verdict for 3JSE |
|---|---|---|
| **0 — No compatibility** | 3JSE's scripting concepts owe nothing to Verse | Rejected — not because Verse compatibility is a goal in itself, but because Level 1 costs nothing and has real upside (below) |
| **1 — Conceptual mapping** | 3JSE's concepts (events, typed data flow, entities/components) map cleanly onto Verse's mental model, even though nothing compiles between them | **Adopt.** This is close to free: 3IR already has typed events, effect-ordered execution, and entity references (`GAMEPLAY_IR.md`) — the same shape Verse gameplay code uses. A developer who knows Verse should recognize 3JSE Graph and the Component model within minutes, the same way `VISION.md` asks for Blueprint/Unity/Godot developers |
| **2 — Verse-inspired syntax → 3IR** | A textual frontend using Verse-like syntax (not Verse itself) compiles into 3JSE Gameplay IR, the same way the TypeScript adapter does | **Adopt as a future frontend, not required for MVP.** 3IR's frontend-agnostic design (`GAMEPLAY_IR.md`) already anticipates exactly this; it's a new IR-producer, not a re-architecture. Real usefulness: developers who like Verse's failure-as-control-flow and concurrency-block idioms get a home for that style without 3JSE forking Verse's spec |
| **3 — Import a portable Verse subset** | Parse a genuinely portable subset of real Verse source (no UEFN-specific API calls) into 3IR | **Investigate, don't commit.** Feasibility depends entirely on Verse's actual grammar being separable from its standard library and licensing terms allowing redistribution of a parser — neither is something to assume favorably without checking Epic's published spec and license at implementation time. Treated as a research spike (`ROADMAP.md` Phase 0), not a planned deliverable |
| **4 — Emulate selected Verse APIs** | Ship `@3jse/verse-compat`-style shims for specific well-known Verse standard-library functions/effects | **Reject as a priority.** This is the highest-cost, lowest-value level: it requires tracking Epic's evolving standard library indefinitely for a compatibility promise that only pays off for code that also depends on UEFN-specific systems 3JSE doesn't have (Fortnite-specific devices, etc.) — the emulation would be compatible with syntax but not with the surrounding platform, which is most of what makes a Verse script actually run |
| **5 — Full Verse runtime compatibility** | Run actual Verse programs, unmodified, against 3JSE | **Reject.** Requires depending on Epic's runtime semantics and likely licensing terms 3JSE cannot control, for a payoff (running existing UEFN Verse content) that is a different product from what `VISION.md` defines. This would also quietly re-introduce the exact problem `ARCHITECTURE.md` principle 2 exists to prevent — a second, competing execution engine alongside 3IR |

## The recommendation

**Target Levels 1–3; do not build 4 or 5.** This matches the instinct stated in the brief, and the reasoning holds up under scrutiny: Levels 1–2 are essentially free extensions of decisions 3IR already made for unrelated reasons (a typed, frontend-agnostic IR was going to exist regardless of Verse), Level 3 is worth a scoped research spike but not a commitment, and Levels 4–5 would make 3JSE strategically dependent on Epic's roadmap and licensing to deliver a compatibility promise that can't actually be kept in full (a Verse script's behavior depends on UEFN's surrounding platform, not just its syntax).

## Concept mapping (Level 1, concrete)

| Verse concept | 3JSE equivalent |
|---|---|
| `class` with `var`/`const` fields | Component schema (`ENTITY_COMPONENT_MODEL.md`) |
| Effects (`<transacts>`, `<varies>`, etc.) | 3IR's pure vs. impure node distinction (`GAMEPLAY_IR.md`) |
| `spawn` / concurrency blocks | 3JSE Graph async nodes (`Timer`, `Await Signal`) / coroutine-style yields |
| Failure as control flow (`?` operator) | `Branch` nodes plus a defined "optional" pin type in 3IR |
| Verse Devices | 3JSE Behaviors attached to Entities (`ENTITY_COMPONENT_MODEL.md`) |
| UEFN's persistent/weak-persistent storage | `@3jse/save`'s tagged-Component persistence (`GAMEPLAY_FRAMEWORK.md`) |

This table is documentation, not a compatibility shim — its value is entirely in making a Verse-literate developer's existing mental model transfer to 3JSE quickly, which is the actual goal `VISION.md` sets, not source-level interoperability with Epic's ecosystem.
