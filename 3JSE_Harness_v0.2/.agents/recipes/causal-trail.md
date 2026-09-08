# Recipe: Causal Trail / Mud

One moisture update changes appearance, tire response, bearing strength, dust, splash, and rut behavior — proving snow was not a special-case trick (`docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md` Experiment 05). Same `world_field` + response-card infrastructure as causal-snow; no `WetDirtMaterial` authority.

Capabilities:
- `world_field` · `causal_field` · `material_response` · `field_to_collision` · `granular_response`

State:
- `moisture`, `temperature`, `compaction`, `soilDensity`

Design recipe:
- Cause: rainfall writes moisture; sun/wind dry exposed zones; traffic compacts the surface.
- Transport: moisture/temperature advection + shade-driven drying asymmetry (shaded areas stay wet longer).
- Response: soil `ResponseCard` maps moisture/compaction → friction, bearing strength, dust/splash yield, rut depth.
- Projection: darker/glossier soil (appearance), lower bearing strength + tire sink/rut + friction change (contact), dust↓ splash↑ (VFX).
- Feedback: rutting compacts the trail, changing future contact; drying resets the surface.
- Evidence: one rainfall op drives darker/glossier projection + dust-yield reduction + splash-yield increase + lower bearing strength + tire sink/rut increase + friction change.

Gate: the exact same `@3jse/field` + response-card infrastructure handles both snow and soil. No `WetDirtMaterial`/`DryDirtMaterial` as the primary causal abstraction.
