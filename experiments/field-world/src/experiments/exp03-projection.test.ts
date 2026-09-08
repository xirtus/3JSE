import { describe, it, expect } from "vitest";
import { runExp03 } from "./exp03-projection.js";

describe("Experiment 03 — live splat projection (headless)", () => {
  const r = runExp03();

  it("projects clusters, not per-splat (no per-splat loop)", () => {
    expect(r.totalSplats).toBeGreaterThan(r.clusterCount);
    expect(r.projectionIteratesClustersNotSplats).toBe(true);
  });

  it("a state change alters appearance without rebuilding the splat asset", () => {
    expect(r.splatAssetUnchanged).toBe(true);
    expect(r.appearanceChangedWithoutRebuild).toBe(true);
    expect(r.changedClusterCount).toBeGreaterThan(0);
  });
});
