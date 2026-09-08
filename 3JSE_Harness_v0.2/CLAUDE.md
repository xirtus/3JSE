# 3JSE — Claude Code Adapter

Use `AGENTS.md` as the canonical instruction set.

For broad game-development requests, **start by reading**:

- `.claude/skills/3jse-director/SKILL.md`
- then the capability/provider skills it directs you to load.

The `.claude/skills/` tree mirrors `.agents/skills/`. `.agents/` remains canonical.

## Claude-specific operating mode

Default behavior is execution-oriented:

**UNDERSTAND → RESOLVE → ASSEMBLE → BUILD → PLAYTEST → REPAIR → VERIFY**

Do not create unnecessary approval loops for ordinary reversible edits. Ask only when a genuinely ambiguous, destructive, credentialed, or externally consequential decision cannot be safely resolved from the project.

Before writing a major subsystem, report a concise routing ledger:

- capability
- existing project solution found? yes/no
- selected provider/reference
- why it was selected
- fallback if integration fails

Never claim a Skill was "invoked" if you only read it. Say it was loaded/read.

## Working memory and lessons

- Verification captures and debug probes go in git-ignored `wip/` — never `docs/`, source dirs, or commits. The script that produced a measurement is a tool: commit it to `scripts/`.
- Product lessons go to the project's own `docs/`; harness lessons (portable, holding in any project with the same technique) go to this harness's `docs/` — labelled as portable when written. Record falsified findings with the number that falsified them.
- Commit early and often, on a branch — never straight to `main`.

## Guards (Claude Code hooks)

Two guards ship opt-in. Copy `.claude/settings.example.json` to the project's `.claude/settings.json` to enable them (adjust the hook path if the harness folder was renamed):

- `block-destructive-git` (PreToolUse) — refuses the git commands that destroy uncommitted work; safe forms pass. Revert by writing the reverse edit.
- `clean-code-guard` (PostToolUse) — measures each written source file against `.claude/clean-code-baseline.json` and reports what got worse. A block is a reason handed back, not an undo. Record your project's starting point with `node <harness>/scripts/clean-code-baseline.mjs`.

## Internal traffic

Reasoning, sub-agent briefs, and agent-to-agent handoffs are compressed internal traffic — drop filler, fragments are fine. Every reply a user reads is normal prose. Never compress paths, exact errors, API names, numbers, units, or negations.
