# Recipe: Endless Hopper (frogger descent)

Canonical reference: **MANDELHOP** (`../mendalhop`).

Capabilities:
- deterministic unfairness-free core -> constant-velocity lanes, seeded generation per run, collision = grid math on the same numbers you see; render-only visuals (waves, bobbing, pulses)
- progressive complication unlocks -> new mechanics at depth thresholds, each announced by a banner the first time it can appear (dragonflies, sinking lilies, portal rows, sheared space, mirror zones, chompers)
- infinite track -> rows generated 45 ahead / pooled 25 behind; biome genomes in 24-row chunks; single water plane with a sliding DataTexture mask
- time powers -> SLOW/FREEZE/PHASE/REVERSE/ACCELERATE through one clock (worldDt = dt * scale)
- ghost replay -> record runs at 12Hz, replay the best as a translucent ghost
- player-agent QA -> heuristic bots drive the real game and classify "unfair" deaths as system faults
- generative audio -> hops climb a pentatonic ladder, biome crossings swell, checkpoints resolve the phrase

First vertical slice: one row of lanes, one hop, one hazard, seeded and replays identically. Do not build the biomes before the hop is unfairness-free.

Accessibility: FLASH/MOTION toggle ships in the reference — treat as a requirement, not an afterthought.
