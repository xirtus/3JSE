import { describe, it, expect } from "vitest";
import { runExp06 } from "./exp06-fire.js";

describe("Experiment 06 — emergent forest fire", () => {
  const r = runExp06();

  it("fire spreads without a SetTreeOnFire(target) call", () => {
    expect(r.totalIgnitions).toBeGreaterThan(1);
    expect(r.fuelConsumed).toBeGreaterThan(0);
  });

  it("a downwind spot fire emerges from ember deposition, not neighbor spread", () => {
    expect(r.emberIgnitions).toBeGreaterThan(0);
    expect(r.spotFireEmergedWithoutScript).toBe(true);
  });

  it("records lineage for the emergent spot fire", () => {
    expect(r.lineage).not.toBeNull();
    expect(r.lineage!.cause).toBe("ember");
    expect(r.lineage!.from).not.toBeNull();
  });

  it("burning produces smoke, char, and consumes fuel", () => {
    expect(r.smokeTotal).toBeGreaterThan(0);
    expect(r.charTotal).toBeGreaterThan(0);
    expect(r.fuelConsumed).toBeGreaterThan(0);
  });
});
