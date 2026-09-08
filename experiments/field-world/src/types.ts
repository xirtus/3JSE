// Design-level schema for the causal-field primitive (plan §2.1, §8).
// Names/fields are the minimum viable schema; freeze only after the experiments
// establish what is actually required. All numbers are plain serializable values
// so field state can be captured and replayed without a renderer.

export type Vec3 = [number, number, number];

// Interleaved SoA-style channel layout. One cell = FIELD_STRIDE floats, laid out
// in this exact order. Kept as a single typed array so chunks serialize/upload as
// one buffer and a field step never iterates per-Gaussian.
export const FIELD_CHANNELS = [
  "temperature",
  "moisture",
  "liquidFraction",
  "density",
  "pressure",
  "phase",
  "velocityX",
  "velocityY",
  "velocityZ",
  "fuel",
  "biomass",
  "sediment",
  "carbonization",
  "smoke",
  "compaction",
  "compression",
] as const;

export type FieldChannel = (typeof FIELD_CHANNELS)[number];
export const FIELD_STRIDE = FIELD_CHANNELS.length;

export const CHANNEL_OFFSET: Record<FieldChannel, number> = Object.fromEntries(
  FIELD_CHANNELS.map((c, i) => [c, i]),
) as Record<FieldChannel, number>;

export interface AABB {
  min: Vec3;
  max: Vec3;
}

// State changes every tick or frequently (plan §1.4). A sampler always returns a
// full snapshot; absent channels read 0.
export interface WorldSampleState {
  temperature: number;
  moisture: number;
  liquidFraction: number;
  density: number;
  pressure: number;
  phase: number;
  velocity: Vec3;
  fuel: number;
  biomass: number;
  sediment: number;
  carbonization: number;
  smoke: number;
  compaction: number;
  compression: number;
}

// Response coefficients/cards are baked/inferred/slowly-changing (plan §1.4).
export interface ResponseUncertainty {
  confidence: number;
  aleatoric?: number[];
  epistemic?: number[];
}

export interface ResponseCardRef {
  paletteId: number;
  latent?: Float32Array;
  uncertainty?: ResponseUncertainty;
}

export interface SemanticRef {
  dictionaryId: number;
  classId?: number;
  clusterId?: number;
  confidence?: number;
}

export interface WorldSample {
  position: Vec3;
  state: WorldSampleState;
  response: ResponseCardRef;
  semantic?: SemanticRef;
}

export const ZERO_STATE = (): WorldSampleState => ({
  temperature: 0,
  moisture: 0,
  liquidFraction: 0,
  density: 0,
  pressure: 0,
  phase: 0,
  velocity: [0, 0, 0],
  fuel: 0,
  biomass: 0,
  sediment: 0,
  carbonization: 0,
  smoke: 0,
  compaction: 0,
  compression: 0,
});

export function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function aabbContains(b: AABB, p: Vec3): boolean {
  return (
    p[0] >= b.min[0] && p[0] <= b.max[0] &&
    p[1] >= b.min[1] && p[1] <= b.max[1] &&
    p[2] >= b.min[2] && p[2] <= b.max[2]
  );
}

export function aabbIntersects(a: AABB, b: AABB): boolean {
  return (
    a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2]
  );
}
