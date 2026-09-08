# Causal Authoring

Use when inferring or fitting material/semantic response data onto captured scenes — the offline Causal Compiler half. Expensive intelligence belongs in authoring/build time, never runtime.

## Pipeline

```
photos/video/generated scene
  → Gaussian reconstruction (Brush / approved)
  → semantic grouping (LangSplat / Gaussian Grouping style)
  → material inference (GaussianProperty / VLM style)
  → physical-property inference (VoMP / PhysGS style)
  → response fitting (3JSE ResponseCard palette)
  → uncertainty + provenance
  → coarse WorldField generation
  → collision/nav projections
  → 3JSE project asset
```

## Rules

- Runtime must not depend on large VLMs, video diffusion, scene-specific optimization, CUDA, PyTorch, or training loops.
- Uncertainty is first-class authoring data: record aleatoric vs epistemic separately; attach provenance (source, creator, license, attribution) to every inferred property.
- Response latent target ≤ 32 coefficients unless evidence proves more are necessary. Store an index into a compact basis, never an embedding per Gaussian.
- Prefer a small, debuggable constitutive expert basis (elastic / granular / wet-cohesive / fluid-like) over opaque runtime networks until the explicit basis proves insufficient.
