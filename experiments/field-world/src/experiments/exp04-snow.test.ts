import { describe, it, expect } from "vitest";
import { runExp04 } from "./exp04-snow.js";

describe("Experiment 04 — causal snow", () => {
  const r = runExp04();

  it("one card spans the whole sequence (no material swap)", () => {
    expect(r.sameCardThroughout).toBe(true);
  });

  it("one state sweep drives mechanical change (friction + penetration + cohesion)", () => {
    expect(r.frictionRange[1]).toBeGreaterThan(r.frictionRange[0]);
    expect(r.penetrationRange[1]).toBeGreaterThan(r.penetrationRange[0]);
    expect(r.cohesionRange[1]).toBeGreaterThan(r.cohesionRange[0]);
  });

  it("one state sweep drives visual change", () => {
    expect(r.brightnessRange[1]).toBeGreaterThan(r.brightnessRange[0]);
    expect(r.transmissionRange[1]).toBeGreaterThan(r.transmissionRange[0]);
  });

  it("one state sweep drives displaced-snow FX change", () => {
    expect(r.plumeRange[1]).toBeGreaterThan(r.plumeRange[0]);
    expect(r.trackDepthRange[1]).toBeGreaterThan(r.trackDepthRange[0]);
  });

  it("moves in the physically-correct direction", () => {
    expect(r.powderMorePlumeThanSlush).toBe(true);
    expect(r.slushLowerFrictionThanPowder).toBe(true);
    expect(r.slushLowerBearingThanCrust).toBe(true);
    expect(r.crustMoreChunkThanPowder).toBe(true);
  });

  it("expert weights walk from granular (powder) toward cohesive/fluid (slush)", () => {
    expect(r.powderWeights[1]).toBeGreaterThan(r.powderWeights[2]);
    expect(r.slushWeights[2] + r.slushWeights[3]).toBeGreaterThan(r.powderWeights[2] + r.powderWeights[3]);
  });
});
