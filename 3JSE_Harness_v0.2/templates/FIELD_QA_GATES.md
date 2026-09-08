# Field QA Gates — reusable checklist

For any field/splat/causal work (`docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md` §28). Fill one row per gate; a gate is pass/fail with evidence, never prose.

## 1. Cross-projection invariant
One state update drives multiple outputs from the same source. Example: `moisture ↑` → appearance responds + friction responds + dust/splash responds. **Fail if any subsystem keeps its own hidden wetness variable.**

## 2. No scripted outcome
Search for architecture, not literal strings: `SetTreeOnFire` · `UseWetMaterial` · `UseSlushMaterial` · `TriggerAvalancheEvent`. Discrete regime switches belong in the response/phase model.

## 3. Dual resolution
Field-step complexity scales with field/active-solver cells, not render Gaussian count. Changing visual density must not alter causal results; changing field resolution must not rebuild the visible scene.

## 4. Headless
Causal tests run without a renderer. Serialized field state is authoritative evidence; a visual heatmap is not.

## 5. Visual
Fresh-eyes, headed capture confirms the projection is convincing. No headless frames as visual evidence.

## 6. Performance
Measure: field step CPU/GPU time · projection update time · splat render time · memory per field cell · memory per response card · active solver element count · streaming behavior. No "should be fast".

## Record

| Gate | Result | Evidence (path/number) |
|---|---|---|
| cross-projection | | |
| no-scripted-outcome | | |
| dual-resolution | | |
| headless | | |
| visual | | |
| performance | | |
