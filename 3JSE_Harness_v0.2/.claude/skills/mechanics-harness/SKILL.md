# Mechanics Harness

Use for any gameplay system that has real feel or invariants. Pattern proven by the reference games (3JSURF, ZENDRIVE, DAMN BEAVERS, MANDELHOP, BREAKING WAVES).

## The five tools every project should have

1. **Headless mechanics check** — gameplay logic must run with no renderer, no canvas, no DOM (stub scene/particles/character objects). Assert the numbers: ride length, lap time, sim tick counts. These numbers must match the rendered build. (3jsurf: `tools/mechcheck.mjs`; zendrive: `npm test`; dambeavers: `tests/simulation`.)
2. **Feel as numbers** — measure the mechanic, don't screenshot it: crossing time, peak speed, drift duration, jump arc. Store the table; it becomes the FeelSpec anchors later. (3jsurf: `tools/feel.mjs`.)
3. **Invariant soak** — script a pilot with a personality (pump/stall/air on a cycle), run N seconds, sample the invariants EVERY frame: rider-on-surface, camera-out-of-geometry, no console errors. Count violations as percentages; a stale state flag can zero them. (3jsurf: `tools/soak.mjs`.)
4. **Heuristic player agents** — drive the REAL game with a bot that plays like a person, report deaths/completion/time, and classify every death as the player's mistake or an "unfair" system/camera fault. Unfair deaths are bugs. (mendalhop: `qa/bot.mjs` with new/pro skills.)
5. **Single-term debug isolation** — a debug mask (e.g. `WAVEDBG=1..7`) that renders one shading/term layer at a time, answering "what is painting that?" with one screenshot instead of ten guesses. A live 2D plot of the key profile beside the viewport is the same idea for geometry. (3jsurf: `WAVEDBG`; breaking-waves: the parametric profile plot.)

## Rules

- A static scene is not a game; a screenshot is not a measurement. Numbers change rarely; screenshots change constantly.
- Invariants belong to the system, not the level: sample them every frame, not when convenient.
- Gameplay math and render math must be the same numbers — collision on grid math, attachment by construction, no lookups that can disagree with what you see. (mendalhop's unfairness-free core; 3jsurf's `ridePoint`.)
- If the mechanic must change with world scale, its parameters must live in the mechanic's own units (surf: wave stations; driving: track distance/lateral), never absolute metres.
- State bugs are geometry bugs: a flag written in one state and not cleared in another will surface as a physical invariant violation.
- Deterministic seeds for AI and sim; time powers route through one clock (`worldDt = dt * scale`); replay is 12Hz recorded state, which is enough for ghosts and time-travel debugging.
- Every phase ends with a written gate sentence and a composed gate test that proves it (dambeavers pattern).
