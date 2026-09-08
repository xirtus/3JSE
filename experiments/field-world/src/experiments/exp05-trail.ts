// Experiment 05 — Causal trail / mud (plan §20). Proves snow was not a
// special-case trick: the SAME field + response-card infrastructure handles soil
// moisture. One rainfall operation drives appearance, contact, dust/splash, and
// rut; sun/wind dry exposed zones while shaded zones stay wet longer.

import {
  buildSyntheticField,
  evaluate,
  fxYields,
  makeCard,
  queryField,
  writeField,
  WorldField,
  ResponseCard,
  WorldSampleState,
  AABB,
} from "../index.js";

export function makeSoilCard(): ResponseCard {
  return makeCard({
    id: 1,
    label: "soil",
    expertBase: [0.1, 0.7, 0.15, 0.05],
    friction: 1.1,
    cohesion: 1.2,
    bearingStrength: 1.3,
    albedoMultiplier: 0.7,
    roughness: 1,
    transmission: 0,
    meltPoint: -1000,
  });
}

export interface SoilOutputs {
  albedo: number;
  roughness: number;
  dust: number;
  splash: number;
  bearingStrength: number;
  rut: number;
  friction: number;
}

export function soilOutputs(card: ResponseCard, state: WorldSampleState): SoilOutputs {
  const proj = evaluate(card, state);
  const fx = fxYields(state);
  const compaction = state.compaction;
  return {
    albedo: proj.visual.albedoMultiplier,
    roughness: proj.visual.roughness,
    dust: fx.dust,
    splash: fx.splash,
    bearingStrength: proj.mechanical.bearingStrength,
    rut: (1 - proj.mechanical.bearingStrength) * (1 - compaction * 0.5),
    friction: proj.mechanical.friction,
  };
}

/** Rainfall: add moisture + liquidFraction to every cell in the region. */
export function rainfall(field: WorldField, region: AABB, amount: number): number {
  return writeField(field, region, (s) => ({
    ...s,
    moisture: Math.min(1, s.moisture + amount),
    liquidFraction: Math.min(1, s.liquidFraction + amount * 0.8),
  }));
}

export function runExp05() {
  const field = buildSyntheticField({ size: [64, 8, 64], resolution: [20, 4, 20], id: "trail" });
  const card = makeSoilCard();
  const region: AABB = { min: [-32, 0, -32], max: [32, 8, 32] };

  const dryBefore = queryField(field, region, () => true).map((s) => soilOutputs(card, s.state));

  rainfall(field, region, 0.6);
  const wetAfter = queryField(field, region, () => true).map((s) => soilOutputs(card, s.state));

  // Dry exposed (x>=0) faster than shaded (x<0).
  writeField(field, { min: [0, 0, -32], max: [32, 8, 32] }, (s) => ({
    ...s,
    moisture: Math.max(0, s.moisture - 0.4),
    liquidFraction: Math.max(0, s.liquidFraction - 0.3),
  }));
  writeField(field, { min: [-32, 0, -32], max: [0, 8, 32] }, (s) => ({
    ...s,
    moisture: Math.max(0, s.moisture - 0.05),
    liquidFraction: Math.max(0, s.liquidFraction - 0.02),
  }));

  const shaded = queryField(field, { min: [-32, 0, -32], max: [0, 8, 32] }, () => true);
  const exposed = queryField(field, { min: [0, 0, -32], max: [32, 8, 32] }, () => true);
  const shadedMoisture = avg(shaded.map((s) => s.state.moisture));
  const exposedMoisture = avg(exposed.map((s) => s.state.moisture));

  const dryAvg = avg(dryBefore.map((o) => o.dust));
  const wetAvg = avg(wetAfter.map((o) => o.dust));
  const drySplashAvg = avg(dryBefore.map((o) => o.splash));
  const wetSplashAvg = avg(wetAfter.map((o) => o.splash));
  const dryAlbedoAvg = avg(dryBefore.map((o) => o.albedo));
  const wetAlbedoAvg = avg(wetAfter.map((o) => o.albedo));
  const dryBearingAvg = avg(dryBefore.map((o) => o.bearingStrength));
  const wetBearingAvg = avg(wetAfter.map((o) => o.bearingStrength));

  return {
    // One causal update drives every output from the same source.
    dustReducedByRain: wetAvg < dryAvg,
    splashIncreasedByRain: wetSplashAvg > drySplashAvg,
    darkerWhenWet: wetAlbedoAvg < dryAlbedoAvg,
    lowerBearingWhenWet: wetBearingAvg < dryBearingAvg,
    shadedStaysWetterThanExposed: shadedMoisture > exposedMoisture,
    dryDustAvg: dryAvg,
    wetDustAvg: wetAvg,
    drySplashAvg: drySplashAvg,
    wetSplashAvg: wetSplashAvg,
    shadedMoisture,
    exposedMoisture,
  };
}

function avg(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
}
