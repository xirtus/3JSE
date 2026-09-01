# 3JSE Harness v0.1

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

## Philosophy

3JSE is not an editor. The coding agent is the editor. Visual tools are added only when repeated work proves they are necessary.
