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
