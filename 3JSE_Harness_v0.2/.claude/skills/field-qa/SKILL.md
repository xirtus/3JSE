# Field QA

Use to verify that field-driven behavior *emerged* rather than being scripted, and that the causal/visual resolution split holds.

## Gates

- **Cross-projection invariant.** One state update (e.g. moisture ↑) must drive appearance, friction, and dust/splash from the same source. If any subsystem keeps its own hidden wetness variable, fail.
- **No-scripted-outcome.** Search for architecture, not literal strings: no `SetTreeOnFire`, `UseWetMaterial`, `TriggerAvalancheEvent`. Discrete transitions belong in the response/phase model, not gameplay scripts.
- **Dual-resolution.** Field-step complexity scales with field/active-solver cells, not render Gaussian count. Changing visual density must not alter causal results; changing field resolution must not require rebuilding the visible scene.
- **Headless.** Causal tests run without a renderer. The serialized field state is authoritative evidence; a visual heatmap is not.
- **Visual.** Fresh-eyes capture confirms the projection is convincing (headed, never headless).
- **Performance.** Measure — never "should be fast": field step time, projection update time, splat render time, memory per field cell / per response card, active solver element count, streaming behavior.

## Evidence

Record causal replay/debug evidence: state dumps, deterministic/seeded replay, and source-cell lineage for emergent events (e.g. a downwind spot fire's ignition lineage). No claim of emergence without a replayable cause chain.
