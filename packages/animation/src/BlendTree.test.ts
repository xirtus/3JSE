import { describe, expect, it } from "vitest";
import { evaluate1DBlendWeights } from "./BlendTree.js";

const LOCOMOTION = [
  { clip: "Idle", threshold: 0 },
  { clip: "Walk", threshold: 1 },
  { clip: "Run", threshold: 2 },
];

describe("evaluate1DBlendWeights", () => {
  it("gives a single clip full weight exactly at its threshold", () => {
    expect(evaluate1DBlendWeights(LOCOMOTION, 0)).toEqual([{ clip: "Idle", weight: 1 }]);
    expect(evaluate1DBlendWeights(LOCOMOTION, 1)).toEqual([
      { clip: "Idle", weight: 0 },
      { clip: "Walk", weight: 1 },
    ]);
  });

  it("clamps to the nearest edge clip outside the authored range, without extrapolating", () => {
    expect(evaluate1DBlendWeights(LOCOMOTION, -5)).toEqual([{ clip: "Idle", weight: 1 }]);
    expect(evaluate1DBlendWeights(LOCOMOTION, 50)).toEqual([{ clip: "Run", weight: 1 }]);
  });

  it("linearly interpolates between the two surrounding clips, weights always summing to 1", () => {
    const result = evaluate1DBlendWeights(LOCOMOTION, 1.5);
    expect(result).toEqual([
      { clip: "Walk", weight: 0.5 },
      { clip: "Run", weight: 0.5 },
    ]);
    expect(result.reduce((sum, w) => sum + w.weight, 0)).toBeCloseTo(1, 10);
  });

  it("is order-independent — unsorted entries produce the same result as sorted ones", () => {
    const shuffled = [LOCOMOTION[2]!, LOCOMOTION[0]!, LOCOMOTION[1]!];
    expect(evaluate1DBlendWeights(shuffled, 0.25)).toEqual(evaluate1DBlendWeights(LOCOMOTION, 0.25));
  });

  it("returns a single full-weight clip for a one-entry tree regardless of parameter", () => {
    expect(evaluate1DBlendWeights([{ clip: "Only", threshold: 5 }], 999)).toEqual([
      { clip: "Only", weight: 1 },
    ]);
  });

  it("returns an empty list for an empty tree", () => {
    expect(evaluate1DBlendWeights([], 0)).toEqual([]);
  });
});
