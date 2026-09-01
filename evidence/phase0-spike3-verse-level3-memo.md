# Phase 0 · Spike 3 — Verse Level-3 feasibility memo

**Status:** CLOSED — decision recorded (research spike, no implementation)
**Date:** 2026-09-01
**Baseline commit:** `2fc24e8`
**Roadmap deliverable:** "A Verse-spec research spike (`VERSE_COMPATIBILITY.md` Level 3): read Epic's published grammar/license terms and produce a written go/no-go, not an implementation."
**Decision doc affected:** `docs/VERSE_COMPATIBILITY.md`

## Routing ledger

| Field | Value |
|---|---|
| Capability | "Level 3" — parse a genuinely portable subset of *real* Verse source (no UEFN-specific API calls) into 3IR |
| Existing project solution found? | **Yes, as prose.** `docs/VERSE_COMPATIBILITY.md` already evaluates all six levels and lands on "Target Levels 1–3; do not build 4 or 5," with Level 3 explicitly marked "Investigate, don't commit … Treated as a research spike (`ROADMAP.md` Phase 0), not a planned deliverable." This memo is that spike. |
| Selected provider/reference | Public sources only: the Book of Verse (`verselang.github.io/book`, repo `github.com/verselang/book`), Epic's public statements on open-sourcing Verse, Epic Developer Community forums. No Verse code parsed, no parser written. |
| Why | The deliverable is a written go/no-go, not an implementation. Building a Verse parser now would be committing to Level 3 — the exact thing the spike exists to *avoid* doing prematurely. |
| Fallback | N/A |

## What was checked (2026-09-01, public web)

1. **License of the published spec/docs.** The Book of Verse repository (`github.com/verselang/book`) is under **CC0-1.0** — a public-domain dedication. The prose documentation carries no redistribution restriction.
2. **Epic's stated intent.** Epic has publicly committed (Tim Sweeney / Simon Peyton Jones, original Verse announcement, reaffirmed since) to *"publish papers and specifications for anyone to implement,"* and to offer *"a compiler, a verifier, and a runtime under a permissive open-source license with no IP encumbrances."* This is a stated intention, not a shipped, versioned deliverable with a filed license text as of this date.
3. **Formal grammar availability.** As of mid-2026 there is still **no official BNF/EBNF grammar** published by Epic. Developers on the Epic Developer Community forums are actively asking for one ("formal BNF/EBNF grammar specification for Verse?", thread open, unanswered by Epic). Community-maintained references exist (e.g. `UnrealVerseGuru/VerseProgrammingLanguage`) but are reverse-engineered, not authoritative, and not a stable contract.
4. **Runtime posture.** The Book of Verse repo references a "Verse VM" and a "Verse lexer." At State of Unreal 2026 Epic confirmed Verse + Scene Graph will *eventually replace* Blueprints and Actors in Unreal — meaning the language surface is still actively moving, not frozen.

## Feasibility assessment

`VERSE_COMPATIBILITY.md`'s framing holds up exactly: *"Feasibility depends entirely on Verse's actual grammar being separable from its standard library and licensing terms allowing redistribution of a parser — neither is something to assume favorably without checking."* Checking, as of today:

| Precondition for Level 3 | Status | Verdict |
|---|---|---|
| A stable, official, formal grammar to implement against | **Not met** — no official BNF/EBNF; language still changing (UE6 roadmap) | Blocks commitment |
| License permitting redistribution of an independent parser | **Favorable but not final** — CC0 docs, stated "no IP encumbrances" intent, but no shipped license text covering an independent implementation | Not a blocker to *research*; would need legal confirmation before shipping |
| A "portable subset" that is real — i.e. Verse code that means something without UEFN's standard library / devices | **Weak** — Verse's value (failure-as-control-flow `?`, `spawn`/concurrency blocks, effect specifiers) is intertwined with its stdlib and platform. A subset stripped of all UEFN API calls is a small, mostly-syntactic island. | Low payoff |
| A population of users with portable Verse source wanting to run it in 3JSE | **None identified** — UEFN Verse content is written for Fortnite/UEFN devices; there is no corpus of platform-neutral Verse in the wild | Low payoff |

## Cost / value

- **Cost of Level 3 now:** implement and *maintain* a parser for a moving target with no official grammar, tracking Epic's changes indefinitely, for a subset that is mostly syntax.
- **Value of Level 3 now:** near zero — no user has portable Verse to bring.
- **Value of Levels 1–2 (already the plan):** high and nearly free. 3IR is already frontend-agnostic (`GAMEPLAY_IR.md`); the Level-1 concept map in `VERSE_COMPATIBILITY.md` already makes a Verse-literate developer's mental model transfer. A Level-2 *Verse-inspired* textual frontend (our syntax, not Epic's) is a new IR-producer, not a re-architecture, and can be built whenever there's demand — no dependency on Epic.

## Decision — NO-GO on Level 3 (for now)

**Do not build a real-Verse-subset parser. Do not add it to any phase's deliverables.** Confirm `VERSE_COMPATIBILITY.md`'s existing recommendation unchanged: **target Levels 1–2**, keep Level 3 as a dormant research item.

**Re-open the question only if all three of these become true:**
1. Epic publishes an official, versioned formal grammar (BNF/EBNF or equivalent) with a stability commitment;
2. Epic ships the promised parser/compiler under an actual permissive OSI-style license whose text permits independent implementations and redistribution;
3. A real user or partner shows up with platform-neutral Verse source they need to run in 3JSE.

Until then, Level 3 is tracked, not planned. This unblocks Phase 0 closure: `VERSE_COMPATIBILITY.md` has no open question that gates downstream work — Levels 1–2 are unaffected and require nothing from this spike.

## Known limitations of this memo

- Based on public web sources read on 2026-09-01, not on a lawyer's review of Epic's current license text, and not on parsing any Verse source.
- Epic's Verse posture is changing quickly (UE6 direction). This memo should be re-checked at the start of any phase that proposes to touch Verse, per the note already in `VERSE_COMPATIBILITY.md`.

## Sources

- [Book of Verse repo (github.com/verselang/book)](https://github.com/verselang/book) — CC0-1.0
- [Book of Verse (verselang.github.io/book)](https://verselang.github.io/book/)
- [Exploring Verse — Epic's open-source / no-IP-encumbrance statement (moralis.com)](https://moralis.com/exploring-verse-a-new-metaverse-programming-language-from-epic-games/)
- [Epic Developer Community — "formal BNF/EBNF grammar specification for Verse?"](https://forums.unrealengine.com/t/formal-bnf-ebnf-grammar-specification-for-verse/1896217)
- [UnrealVerseGuru/VerseProgrammingLanguage (community reference, not authoritative)](https://github.com/UnrealVerseGuru/VerseProgrammingLanguage/blob/main/README.md)
- [Unreal Engine 6: Mastering Verse (sesamedisk.com) — Verse replacing Blueprints/Actors](https://sesamedisk.com/unreal-engine-6-verse-scripting-language/)
