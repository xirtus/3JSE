import { describe, it, expect } from "vitest";
import { runExp02 } from "./exp02-dual-resolution.js";

describe("Experiment 02 — dual resolution", () => {
  const r = runExp02();

  it("field step iterates cells only, never visual elements", () => {
    expect(r.stepIterationsEqualCells).toBe(true);
    expect(r.fieldStepIterations).toBe(r.fieldCells);
    expect(r.visualElementsHigh).toBeGreaterThan(r.fieldCells);
  });

  it("changing visual density does not alter the causal result", () => {
    expect(r.sameResultAtDifferentVisualDensity).toBe(true);
  });

  it("changing field resolution does not rebuild the visible scene", () => {
    expect(r.positionsUnchangedAcrossResolutionChange).toBe(true);
  });
});
