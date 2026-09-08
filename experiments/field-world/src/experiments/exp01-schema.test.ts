import { describe, it, expect } from "vitest";
import { runExp01 } from "./exp01-schema.js";

describe("Experiment 01 — field schema + headless sampler", () => {
  const r = runExp01();

  it("synthetic field separates cold-dry and warm-wet regions", () => {
    expect(r.coldTemperature).toBeLessThan(-5);
    expect(r.warmTemperature).toBeGreaterThan(0);
    expect(r.coldLiquidFraction).toBe(0);
    expect(r.warmLiquidFraction).toBeGreaterThan(0);
  });

  it("a wet trail exists as state, not a WetMudMaterial class", () => {
    expect(r.wetCellCount).toBeGreaterThan(0);
    expect(r.paletteSize).toBe(2);
  });

  it("expert weights respond to state (granular-dominant snow vs wet soil)", () => {
    // Cold snow is granular-dominant; wet soil shifts weight toward cohesive/fluid.
    const snow = r.coldSnowExpertWeights;
    const soil = r.wetSoilExpertWeights;
    expect(snow[1]).toBeGreaterThan(snow[2]);
    expect(soil[2] + soil[3]).toBeGreaterThan(snow[2] + snow[3]);
  });

  it("serialization round-trips deterministically", () => {
    expect(r.serializationRoundTripEqual).toBe(true);
  });
});
