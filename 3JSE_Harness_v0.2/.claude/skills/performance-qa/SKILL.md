# Performance QA Gate

Measure rather than guess. Record FPS/frame time, draw calls, triangles/instances where meaningful, memory observations, and hotspots. Use budgets appropriate to the target device and recipe. Performance fixes must preserve gameplay and visual contracts.

## Measure in a lab, never in a playable scene

A playable scene measures integration only — it has a live player, a spawner that drip-feeds, overlapping waves, physics corpses, and a moving camera, each a variable the measurement did not declare. Any claim about how a system behaves is measured on an isolated bench: chosen geometry, a fixed cast, the same numbers on every run, and the result reproduces exactly. A statistic gathered in a playable scene proves nothing.

- "Does this system work?" → build the lab.
- "Do these systems fit together in the real product?" → the playable scene is right, and the answer is a frame, not a statistic.

## The bench is not evidence

Captures and probe artifacts live in git-ignored `wip/<task>/`. The script that produced a measurement is a tool — commit it to `scripts/`. If losing the artifact would make a recorded number unrepeatable, it is a tool.
