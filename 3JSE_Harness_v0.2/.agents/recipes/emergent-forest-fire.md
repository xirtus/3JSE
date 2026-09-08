# Recipe: Emergent Forest Fire

Fire propagation emerges from field state and neighbor transport with no scripted `SetTreeOnFire` (`docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md` Experiment 06). FieryGS is the architecture checklist, not the renderer; fire is one `field-chemistry` parameterization.

Capabilities:
- `causal_field` · `combustion` · `material_response` · `field_physics` · `field_agent_ops`

Field channels:
- `temperature`, `moisture`, `fuel`, `smoke`, `carbonization`, wind input

Local rules (no Fire AI):
- heatGain = radiation + convection + solar; heatLoss = evaporation + air cooling + conduction.
- if physical ignition conditions are met: fuel↓, temperature↑, smoke↑, carbonization↑.
- wind transports heat, smoke, embers.

Projection:
- emission + opacity + smoke vendor/VFX input + surface darkening/carbonization.

Design recipe:
- Cause: a physically defined heat source (ignition stimulus, not forced burning state).
- Transport: radiation + convection + ember deposition along wind.
- Response: moisture loss + ignition curve + burn response (fuel value, burn rate, smoke/char yield).
- Projection: flame emission, smoke, char.
- Feedback: fuel loss + heat generation sustain or choke the fire.

Critical acceptance criterion: a spot fire can begin downwind from **ember deposition + local state + response evaluation** — never a call equivalent to `SetTreeOnFire(target)`. Evidence: timelapse, field-state dump, deterministic/seeded replay, and source-cell lineage for the ignition.
