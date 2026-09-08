import { describe, it, expect } from "vitest";
import { runExp05 } from "./exp05-trail.js";

describe("Experiment 05 — causal trail / mud", () => {
  const r = runExp05();

  it("one rainfall op reduces dust and increases splash", () => {
    expect(r.dustReducedByRain).toBe(true);
    expect(r.splashIncreasedByRain).toBe(true);
  });

  it("one rainfall op darkens soil and lowers bearing strength", () => {
    expect(r.darkerWhenWet).toBe(true);
    expect(r.lowerBearingWhenWet).toBe(true);
  });

  it("shaded zones stay wet longer than exposed zones after drying", () => {
    expect(r.shadedStaysWetterThanExposed).toBe(true);
    expect(r.shadedMoisture).toBeGreaterThan(r.exposedMoisture);
  });
});
