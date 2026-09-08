// Experiment 01 — Field schema + headless sampler (plan §16).
// Gate: an agent can describe a wet trail and cold snow using state + response
// cards without creating `WetMudMaterial` or `PowderSnowMaterial` as the primary
// causal abstraction. Evidence: schema tests, sample dumps, serialization
// round-trip, field query test.

import {
  buildSyntheticField,
  deserializeChunk,
  serializeChunk,
  sampleField,
  queryField,
  makeCard,
  makePalette,
  evaluate,
  FieldChunk,
} from "../index.js";

function chunksEqual(a: FieldChunk, b: FieldChunk): boolean {
  if (a.id !== b.id || a.version !== b.version) return false;
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (Math.abs(a.data[i]! - b.data[i]!) > 1e-6) return false;
  }
  for (let i = 0; i < a.responseIndex.length; i++) {
    if (a.responseIndex[i] !== b.responseIndex[i]) return false;
  }
  return true;
}

export function runExp01() {
  const field = buildSyntheticField({ size: [64, 8, 64], resolution: [32, 4, 32] });

  const cold = sampleField(field, [-28, 4, 0]);
  const warm = sampleField(field, [28, 4, 0]);
  if (!cold || !warm) throw new Error("sampleField returned null inside synthetic bounds");

  // Two response cards, one causal abstraction each — no material prefab class.
  const snow = makeCard({
    id: 0,
    label: "snow",
    expertBase: [0.13, 0.78, 0.08, 0.01],
    friction: 1,
    cohesion: 1,
    bearingStrength: 1,
    albedoMultiplier: 1.6,
    transmission: 0.1,
    meltPoint: 0,
  });
  const soil = makeCard({
    id: 1,
    label: "soil",
    expertBase: [0.1, 0.7, 0.15, 0.05],
    friction: 1.1,
    cohesion: 1.2,
    bearingStrength: 1.3,
    albedoMultiplier: 0.7,
    meltPoint: -1000,
  });
  const palette = makePalette([snow, soil]);

  // A wet trail and cold snow are described by state + card, not by type names.
  const coldSnow = evaluate(snow, cold.state);
  const wetSoil = evaluate(soil, { ...warm.state, liquidFraction: 0.5 });

  const wetCells = queryField(
    field,
    { min: [-32, 0, -32], max: [32, 8, 32] },
    (s) => s.state.liquidFraction > 0.3,
  ).length;

  const chunk = [...field.chunks.values()][0]!;
  const roundTrip = deserializeChunk(serializeChunk(chunk));

  return {
    coldTemperature: cold.state.temperature,
    warmTemperature: warm.state.temperature,
    coldLiquidFraction: cold.state.liquidFraction,
    warmLiquidFraction: warm.state.liquidFraction,
    wetCellCount: wetCells,
    paletteSize: palette.cards.length,
    coldSnowExpertWeights: coldSnow.mechanical.expertWeights,
    wetSoilExpertWeights: wetSoil.mechanical.expertWeights,
    serializationRoundTripEqual: chunksEqual(chunk, roundTrip),
  };
}
