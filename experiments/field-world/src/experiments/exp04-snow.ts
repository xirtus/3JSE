// Experiment 04 — Causal snow (plan §19). One continuous response model
// transitions cold-dry powder -> packed powder -> warm wet snow -> slush ->
// refrozen crust with no material prefab swap. The same ResponseCard drives
// visible, mechanical, and displaced-snow FX outputs from one state source.

import { evaluate, expertWeights, fxYields, makeCard, ResponseCard, WorldSampleState } from "../index.js";

export type SnowStageName = "coldPowder" | "packedPowder" | "warmWetSnow" | "slush" | "refrozenCrust";

export interface SnowStage {
  name: SnowStageName;
  state: WorldSampleState;
}

export interface SnowOutputs {
  stage: SnowStageName;
  cardId: number;
  friction: number;
  penetration: number;
  cohesion: number;
  bearingStrength: number;
  brightness: number;
  transmission: number;
  sparkle: number;
  clumping: number;
  plumeYield: number;
  chunkTendency: number;
  trackDepth: number;
  expertWeights: [number, number, number, number];
}

export function makeSnowCard(): ResponseCard {
  return makeCard({
    id: 0,
    label: "snow",
    expertBase: [0.13, 0.78, 0.08, 0.01],
    friction: 1,
    cohesion: 1,
    bearingStrength: 1,
    compressibility: 1,
    albedoMultiplier: 1.6,
    roughness: 1,
    transmission: 0.1,
    meltPoint: 0,
  });
}

export function snowStages(): SnowStage[] {
  const mk = (name: SnowStageName, temperature: number, liquidFraction: number, density: number, compression: number, compaction: number): SnowStage => ({
    name,
    state: {
      temperature,
      moisture: liquidFraction * 0.8,
      liquidFraction,
      density,
      pressure: 0,
      phase: 0,
      velocity: [0, 0, 0],
      fuel: 0,
      biomass: 0,
      sediment: 0,
      carbonization: 0,
      smoke: 0,
      compaction,
      compression,
    },
  });
  return [
    mk("coldPowder", -15, 0, 0.08, 0, 0),
    mk("packedPowder", -10, 0.02, 0.3, 0.4, 0.4),
    mk("warmWetSnow", 0, 0.2, 0.4, 0.5, 0.5),
    mk("slush", 2, 0.6, 0.7, 0.6, 0.5),
    mk("refrozenCrust", -5, 0.15, 0.8, 0.9, 0.9),
  ];
}

export function snowOutputs(card: ResponseCard, stage: SnowStage): SnowOutputs {
  const proj = evaluate(card, stage.state);
  const fx = fxYields(stage.state);
  const penetration = 1 - proj.mechanical.bearingStrength;
  return {
    stage: stage.name,
    cardId: card.id,
    friction: proj.mechanical.friction,
    penetration,
    cohesion: proj.mechanical.cohesion,
    bearingStrength: proj.mechanical.bearingStrength,
    brightness: proj.visual.albedoMultiplier,
    transmission: proj.visual.transmission,
    sparkle: 1 - proj.visual.roughness,
    clumping: 1 - proj.visual.transmission * 0.5,
    plumeYield: fx.dust * (1 - stage.state.compression),
    chunkTendency: stage.state.compression * (1 - proj.mechanical.compressibility),
    trackDepth: penetration * (1 - proj.mechanical.cohesion),
    expertWeights: proj.mechanical.expertWeights,
  };
}

function range(vals: number[]): [number, number] {
  return [Math.min(...vals), Math.max(...vals)];
}

export function runExp04() {
  const card = makeSnowCard();
  const stages = snowStages();
  const outputs = stages.map((s) => snowOutputs(card, s));

  const byName = Object.fromEntries(outputs.map((o) => [o.stage, o])) as Record<SnowStageName, SnowOutputs>;
  const powder = byName.coldPowder;
  const slush = byName.slush;
  const crust = byName.refrozenCrust;

  return {
    // No material swap: every stage evaluates the same card id.
    sameCardThroughout: outputs.every((o) => o.cardId === card.id),
    // Mechanical: friction + penetration + cohesion all move across the sweep.
    frictionRange: range(outputs.map((o) => o.friction)),
    penetrationRange: range(outputs.map((o) => o.penetration)),
    cohesionRange: range(outputs.map((o) => o.cohesion)),
    // Visual: brightness/transmission/sparkle change.
    brightnessRange: range(outputs.map((o) => o.brightness)),
    transmissionRange: range(outputs.map((o) => o.transmission)),
    // FX: plume (powder) and chunk (crust) and track depth.
    plumeRange: range(outputs.map((o) => o.plumeYield)),
    chunkRange: range(outputs.map((o) => o.chunkTendency)),
    trackDepthRange: range(outputs.map((o) => o.trackDepth)),
    // Qualitative direction checks.
    powderMorePlumeThanSlush: powder.plumeYield > slush.plumeYield,
    slushLowerFrictionThanPowder: slush.friction < powder.friction,
    slushLowerBearingThanCrust: slush.bearingStrength < crust.bearingStrength,
    crustMoreChunkThanPowder: crust.chunkTendency > powder.chunkTendency,
    // Expert-weights walk (plan §2.2 example): powder granular-dominant, slush cohesive/fluid.
    powderWeights: powder.expertWeights,
    slushWeights: slush.expertWeights,
  };
}

export { evaluate, expertWeights };
