# 3JSE Harness Specification v0.2

## Product definition

3JSE is a lightweight agent harness that turns a general coding agent into a reference-first Three.js/WebGPU game-development agent.

The harness supplies:

1. capability decomposition
2. provider selection
3. reference/source routing
4. asset sourcing and provenance rules
5. reusable recipes
6. project-aware context loading
7. quality gates and evidence requirements
8. durable project learnings

## Architectural rule

The harness owns **coordination and institutional knowledge**. External providers own specialized rendering/simulation capabilities whenever they already solve the problem well.

## Reuse ladder

0. current project implementation
1. current project asset
2. 3JSE curated provider/shared asset
3. proven reference implementation
4. licensed external asset
5. procedural generation provider
6. adjacent implementation adapted to the problem
7. custom implementation

The agent must justify skipping an earlier applicable rung.

## Worker model

Keep worker count low:

- Director
- Gameplay
- Graphics
- Assets/References
- QA/Performance

Most specialization should be loaded as Skills, not represented by dozens of persistent personas.

## Context routing

Only load skills relevant to current capabilities. Do not inject the entire library into context.

## Evidence-first completion

No broad task is complete because code compiled. The harness requires behavioral and visual evidence.

## Guard rails

The harness regulates not only *what* agents build but *how* they operate in the tree. Adopted from the vibe game engine web-starter-kit (MIT), whose agent rules carry the incident that produced them:

- **Destructive-git guard** (`.claude/hooks/block-destructive-git.mjs`, PreToolUse, opt-in) — refuses the git commands that destroy uncommitted work, lets safe forms through. Reverting is done by writing the reverse change.
- **Clean-code ratchet** (`.claude/hooks/clean-code-guard.mjs`, PostToolUse, opt-in) — reports files that got *worse* than `.claude/clean-code-baseline.json` records; never the debt already there.
- **WIP workspace** (`wip/`, git-ignored) — the bench is not evidence: captures stay local, the scripts that produce measurements are committed.
- **Operating rules** (`AGENTS.md`) — commit early on a branch; never delete work wholesale; do not ask what you can answer; write down lessons and falsified findings; comments record measurements, sources and dead ends only; no Markdown via shell; compress the machine channel, never the user's; read the code before reaching for a frame; measure systems in a lab, never a playable scene; visual verification is headed.

The guards are policy about agent conduct, not capabilities to route — the provider-neutral reuse doctrine is untouched. They remain opt-in so a game project can adopt them without adopting the harness's whole workflow.
