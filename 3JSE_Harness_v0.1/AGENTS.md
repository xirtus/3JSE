# 3JSE Canonical Agent Instructions

This repository is an agent-native Three.js/WebGPU game-development harness.

## Mandatory route for broad game tasks

For any request to create, upgrade, finish, polish, debug, or extend a game:

1. Read `.agents/skills/3jse-director/SKILL.md`.
2. Resolve requested capabilities with `.agents/skills/capability-resolver/SKILL.md`.
3. Route each capability through `.agents/skills/vendor-router/SKILL.md`.
4. Search existing project code/assets before introducing a new dependency or primitive.
5. Use the appropriate provider skill(s).
6. Build a playable vertical slice before broad content production.
7. Run gameplay, visual, runtime-error, and performance verification before claiming completion.

## Non-negotiable rules

- Static scene != game.
- Existing working systems outrank prose descriptions.
- Existing licensed assets outrank generated placeholder models.
- Named providers outrank generic primitives when they satisfy the capability.
- Never silently replace a proven provider with a simpler reimplementation.
- Do not execute unknown downloaded binaries.
- Unknown repositories are inspection-only until they pass source, dependency, license, and script review.
- Do not run package lifecycle scripts from untrusted repositories during intake.
- Preserve attribution/provenance for external assets and code.
- Keep gameplay state outside the scene graph when practical.
- Prefer deterministic simulations and deterministic tests.
- Do not claim AAA/premium/complete without fresh evidence.

## Canonical directories

- `.agents/skills/` — canonical skill source
- `.agents/registry/` — provider/capability/mechanic/security registries
- `.agents/recipes/` — reusable game archetypes
- `.agents/hooks/` — deterministic quality gates
- `.claude/skills/` — Claude Code mirror/adapter
- `evidence/` — reports, screenshots, metrics, playtest notes

## Completion evidence

A broad game task is not complete until the evidence report records:

- playable loop exercised
- build/typecheck status
- console/runtime errors
- gameplay test result
- screenshots or visual inspection result
- frame-rate / draw-call / memory observations where relevant
- external asset/provider ledger
- known limitations
