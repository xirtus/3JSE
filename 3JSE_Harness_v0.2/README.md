# 3JSE Harness v0.2

Agent-native Three.js/WebGPU game-development harness for Claude Code and other coding agents.

## Core doctrine

**Do not invent what can be found. Do not generate what can be reused. Do not rebuild what can be adapted.**

Before implementing any non-trivial system or asset, route through:

1. current project assets/code
2. 3JSE shared registry
3. proven provider/reference implementation
4. licensed external asset/model source
5. procedural provider
6. custom generation
7. from-scratch implementation only as the final option

## Claude Code quick start

1. Unzip this folder into or beside your game repo.
2. Start Claude Code from the harness root or copy `CLAUDE.md`, `.agents/`, and `.claude/` into the game repo.
3. Give Claude your game request.
4. Claude must begin with `3jse-director`, resolve capabilities, and report the selected providers before writing large systems.

Recommended first instruction:

> Read `CLAUDE.md`, then use the 3JSE Director workflow. Build the smallest playable vertical slice first. Prefer registered providers and existing assets over new primitives. Do not claim completion without gameplay, visual, runtime-error, and performance evidence.

## What v0.1 contains

- provider-neutral canonical brain under `.agents/`
- Claude Code skill mirror under `.claude/skills/`
- one Director rather than dozens of personas
- capability resolver and vendor router
- asset and reference brokers
- safe repository intake rules
- curated provider manifests for Owen Yuwono systems and geospatial tooling
- hard gameplay/visual/performance gates
- five starter recipes
- evidence-report template
- bootstrap prompt for Claude to audit and extend 3JSE itself

## What the guard-rails update adds

Adopted from the [vibe game engine web-starter-kit](https://github.com/vibegameengine/web-starter-kit) (MIT), the ideas that transfer to any agent-driven tree:

- **Agent operating rules with the incident that produced them** (`AGENTS.md`) — commit early on a branch · never delete work wholesale · the bench is not evidence · do not ask what you can answer yourself · write down lessons and falsified findings · comments record measurements/sources/dead-ends only · no Markdown via shell · compress the machine channel, never the user's · read the code before reaching for a frame · measure in a lab, never a playable scene · visual verification is headed · never remove a provider to hide a bug.
- **Destructive-git guard** (`.claude/hooks/block-destructive-git.mjs`, PreToolUse, opt-in via `.claude/settings.example.json`) — tokenizes the command and judges subcommand + flags together, so `git checkout -b` passes while `git checkout -- file` is refused.
- **Clean-code ratchet** (`.claude/hooks/clean-code-guard.mjs` + `scripts/lib/cleanCode.mjs` + `scripts/clean-code-baseline.mjs`, PostToolUse, opt-in) — reports files that got *worse* than the baseline records; never the debt already there. Run the baseline script after a real cleanup, never to silence a complaint.
- **WIP workspace** (`wip/`, git-ignored, self-contained `.gitignore`) — verification captures stay local; the scripts that produce measurements are committed as tools.
- **Hardened QA gates** — `visual-qa` now requires headed frames; `performance-qa` now requires lab measurements over playable-scene statistics.

## Attribution

The guard hooks, the WIP-workspace rule, and several operating rules are adopted from the [vibe game engine web-starter-kit](https://github.com/vibegameengine/web-starter-kit) (MIT License), whose agent rules carry the measured incident that produced each of them. Mechanisms kept intact; project-specific names and numbers not imported. See `AGENTS.md` for the rule list.

## Philosophy

3JSE is not an editor. The coding agent is the editor. Visual tools are added only when repeated work proves they are necessary.
