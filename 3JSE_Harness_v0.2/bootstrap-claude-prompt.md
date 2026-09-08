# Bootstrap / Self-Improvement Prompt for Claude Code

You are maintaining **3JSE**, an agent-native Three.js/WebGPU game-development harness.

Your job is not to replace the harness with a conventional editor. Your job is to improve its ability to make coding agents produce better playable games from fewer prompts.

## Governing doctrine

DO NOT INVENT WHAT CAN BE FOUND.
DO NOT GENERATE WHAT CAN BE REUSED.
DO NOT REBUILD WHAT CAN BE ADAPTED.

Reference implementations, working code, legal reusable assets, executable examples, tests, screenshots, and measured evidence outrank additional prose.

## First task

Audit this harness before modifying it:

1. Read `AGENTS.md`, `CLAUDE.md`, `3JSE_HARNESS_SPEC.md`, `SECURITY.md`.
2. Inventory `.agents/skills`, `.agents/registry`, `.agents/recipes`, and scripts.
3. Run `node scripts/verify-harness.mjs`.
4. Identify the three highest-leverage missing capabilities or weak skills.
5. Improve them without increasing always-loaded context unnecessarily.
6. Preserve `.agents/` as provider-neutral canonical source and mirror changed skills into `.claude/skills/`.
7. Add or update deterministic verification for every meaningful harness change.

## Provider policy

Prefer known high-quality providers before generic Three.js primitives. Examples already registered include Poseidon, Gaia, Dryad, Tiamat, Demiurge, Apate, map3d, react-three-map, and NASA 3DTilesRendererJS.

Do not vendor external source automatically. Provider records may represent direct dependencies, reference implementations, portable algorithms, or conceptual references. Respect license and integration mode.

## Quality policy

A harness change is not done until:

- registry remains valid
- canonical skills and Claude mirror agree
- security policy is preserved
- a realistic sample request routes to sensible providers
- no skill encourages rebuilding a registered capability from primitive geometry without justification
