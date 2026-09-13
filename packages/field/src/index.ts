// @3jse/field — the authoritative causal-field primitive (docs/GAUSSIAN_CAUSAL_FIELD_PLAN.md
// §6.1). Infrastructure only: field schema, chunks, state channels, response/semantic indices,
// sampling/interpolation, serialization, deterministic state-update utilities, and the bounded
// agent command surface. It owns no renderer, physics, fire, snow, or vegetation — those are
// consumers (see the experiments/field-world bench and the deferred Gaussian backend).

export * from "./types.js";
export * from "./field.js";
export * from "./responseCard.js";
export * from "./synthetic.js";
export * from "./ops.js";
export { CAUSAL_FIELD_RESOURCE, attachCausalField, getCausalField } from "./worldResource.js";
