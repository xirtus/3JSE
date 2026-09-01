# Recipe: Arcade Racer (serene velocity / zen drift)

Canonical reference: **ZENDRIVE** (`../zendrive`).

Capabilities:
- track-space vehicle physics -> (distance, lateral) on a self-closing spline, pure-pursuit homing
- demand-vs-capacity corner model -> `demand = curv * v^2 * curvePush` vs steer authority; slide/drift when demand exceeds capacity
- procedural road/terrain -> toon shader, matte mountain rings, shader ocean, wind grass (Gaia technique), trees (Dryad technique), surfaces (Apate technique)
- rival AI -> racing line + rubber band, skill/aggro traits, seeded RNG (mulberry32) for reproducible races
- generative music -> speed opens the filter, drift bends the tape, checkpoints ring bells; optional Web MIDI out
- cameras -> chase / close / HOOD (first-person bodywork hidden; camera-locked dash)
- headless tests -> loop closure + full GP/ZEN races to completion, no renderer

First vertical slice: one self-closing loop, one car, demand-capacity cornering, one checkpoint clock. Do not build four themed roads before the drift feels right.

Feel anchors (from the reference): measure per-road corner entry/exit speeds, drift duration, and lap deltas headlessly; keep them stable across visual changes.
