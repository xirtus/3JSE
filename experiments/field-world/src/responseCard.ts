// ResponseCard: a compact local behavior manifold (plan §2.2, §7). The response
// card is evaluated on a coarse causal field, then projected into Gaussians,
// Rapier contact, VFX, and agent-visible semantics. Expert weights are a function
// of live state (W(state, environment)), not frozen per-scene constants.

import { WorldSampleState, clamp } from "./types.js";

export const EXPERT_BASIS = ["elastic", "granular", "wetCohesive", "fluidLike"] as const;
export type ConstitutiveExpert = (typeof EXPERT_BASIS)[number];
export type ExpertWeights = [number, number, number, number];

export interface Environment {
  /** scalar sun/radiative input, 0..1 */
  sun?: number;
  /** scalar wind speed, 0..1 */
  wind?: number;
}

export interface MechanicalResponse {
  friction: number;
  cohesion: number;
  compressibility: number;
  bearingStrength: number;
  drag: number;
  expertWeights: ExpertWeights;
}

export interface ThermalResponse {
  heatCapacity: number;
  conductivity: number;
  /** temperature above which the material leaves its solid regime */
  meltPoint: number;
}

export interface MoistureResponse {
  waterCapacity: number;
  absorption: number;
  evaporation: number;
}

export interface VisualResponse {
  albedoMultiplier: number;
  roughness: number;
  transmission: number;
  emission: number;
  opacity: number;
}

export interface CombustionResponse {
  /** temperature at which the card ignites given moisture 0 */
  ignitionThreshold: number;
  burnRate: number;
  fuelValue: number;
  smokeYield: number;
  charYield: number;
}

export interface ResponseProjection {
  mechanical: MechanicalResponse;
  thermal: ThermalResponse;
  moisture: MoistureResponse;
  visual: VisualResponse;
  combustion: CombustionResponse;
}

export interface ResponseCard {
  id: number;
  label: string;
  /** frozen baseline of each expert at cold/dry state (plan §7.2) */
  expertBase: ExpertWeights;
  friction: number;
  cohesion: number;
  compressibility: number;
  bearingStrength: number;
  drag: number;
  heatCapacity: number;
  conductivity: number;
  meltPoint: number;
  waterCapacity: number;
  absorption: number;
  evaporation: number;
  albedoMultiplier: number;
  roughness: number;
  transmission: number;
  emission: number;
  opacity: number;
  ignitionThreshold: number;
  burnRate: number;
  fuelValue: number;
  smokeYield: number;
  charYield: number;
}

export interface ResponsePalette {
  cards: ResponseCard[];
}

// Per-expert mechanical shape. A material's behavior is the weighted blend of
// these; the weights are a walk through coefficient space driven by live state.
const EXPERT_MECHANICS: Record<ConstitutiveExpert, Omit<MechanicalResponse, "expertWeights">> = {
  elastic: { friction: 0.9, cohesion: 0.8, compressibility: 0.2, bearingStrength: 1.0, drag: 0.1 },
  granular: { friction: 0.7, cohesion: 0.1, compressibility: 0.5, bearingStrength: 0.4, drag: 0.6 },
  wetCohesive: { friction: 0.5, cohesion: 0.7, compressibility: 0.3, bearingStrength: 0.5, drag: 0.4 },
  fluidLike: { friction: 0.1, cohesion: 0.0, compressibility: 0.05, bearingStrength: 0.05, drag: 0.9 },
};

export function makeCard(overrides: Partial<ResponseCard> & { id: number; label: string }): ResponseCard {
  return {
    expertBase: [0.3, 0.4, 0.2, 0.1],
    friction: 1,
    cohesion: 1,
    compressibility: 1,
    bearingStrength: 1,
    drag: 1,
    heatCapacity: 1,
    conductivity: 1,
    meltPoint: 0,
    waterCapacity: 1,
    absorption: 1,
    evaporation: 1,
    albedoMultiplier: 1,
    roughness: 1,
    transmission: 0,
    emission: 0,
    opacity: 1,
    ignitionThreshold: 300,
    burnRate: 1,
    fuelValue: 1,
    smokeYield: 1,
    charYield: 1,
    ...overrides,
  };
}

export function makePalette(cards: ResponseCard[]): ResponsePalette {
  return { cards };
}

/**
 * W(state, environment) -> expert weights. The one concrete form of "material is
 * a walk through coefficient space": liquidFraction and warmth move mass from the
 * granular/elastic experts into wet-cohesive/fluid-like, so a single card spans
 * powder -> packed -> wet -> slush without a material swap.
 */
export function expertWeights(card: ResponseCard, state: WorldSampleState, env: Environment = {}): ExpertWeights {
  const t = clamp((state.temperature - card.meltPoint) / 40 + 0.5); // 0 frozen .. 1 warm
  const lf = clamp(state.liquidFraction);
  // warmth + liquid fraction both drive the solid -> wet -> fluid transition.
  const melt = clamp(lf + Math.max(0, t - 0.5) * 0.6);

  const [e0, g0, c0, f0] = card.expertBase;
  let elastic = e0 * (1 - melt * 0.5);
  let granular = g0 * (1 - melt * 0.8);
  let wetCohesive = c0 + melt * 0.45;
  let fluidLike = f0 + melt * 0.6;

  // Compaction pushes granular -> elastic (packed snow firming under load).
  const pack = clamp(state.compaction);
  const shift = granular * pack * 0.5;
  granular -= shift;
  elastic += shift;

  const w: ExpertWeights = [elastic, granular, wetCohesive, fluidLike];
  const sum = w[0] + w[1] + w[2] + w[3] || 1;
  return [w[0] / sum, w[1] / sum, w[2] / sum, w[3] / sum];
}

export function evaluate(card: ResponseCard, state: WorldSampleState, env: Environment = {}): ResponseProjection {
  const w = expertWeights(card, state, env);
  const lf = clamp(state.liquidFraction);
  const wet = clamp(state.moisture);

  let friction = 0;
  let cohesion = 0;
  let compressibility = 0;
  let bearingStrength = 0;
  let drag = 0;
  for (let i = 0; i < EXPERT_BASIS.length; i++) {
    const m = EXPERT_MECHANICS[EXPERT_BASIS[i]!];
    friction += w[i]! * m.friction;
    cohesion += w[i]! * m.cohesion;
    compressibility += w[i]! * m.compressibility;
    bearingStrength += w[i]! * m.bearingStrength;
    drag += w[i]! * m.drag;
  }

  return {
    mechanical: {
      friction: friction * card.friction,
      cohesion: cohesion * card.cohesion,
      compressibility: compressibility * card.compressibility,
      bearingStrength: bearingStrength * card.bearingStrength,
      drag: drag * card.drag,
      expertWeights: w,
    },
    thermal: {
      heatCapacity: card.heatCapacity,
      conductivity: card.conductivity,
      meltPoint: card.meltPoint,
    },
    moisture: {
      waterCapacity: card.waterCapacity,
      absorption: card.absorption * (1 + lf * 0.5),
      evaporation: card.evaporation * (1 - wet * 0.3),
    },
    visual: {
      // Wet = darker, glossier (lower roughness), more transmission.
      albedoMultiplier: card.albedoMultiplier * (1 - 0.5 * lf),
      roughness: card.roughness * (1 - 0.7 * lf),
      transmission: card.transmission + lf * 0.4,
      emission: card.emission,
      opacity: card.opacity,
    },
    combustion: {
      ignitionThreshold: card.ignitionThreshold,
      burnRate: card.burnRate,
      fuelValue: card.fuelValue,
      smokeYield: card.smokeYield,
      charYield: card.charYield,
    },
  };
}

/** Dust vs splash yields: dry -> high dust/low splash; wet -> low dust/high splash. */
export function fxYields(state: WorldSampleState): { dust: number; splash: number } {
  const lf = clamp(state.liquidFraction);
  return { dust: 1 - lf, splash: lf };
}
