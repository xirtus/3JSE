# 3JSE Harness Specification v0.1

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
