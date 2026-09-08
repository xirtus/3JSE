import { describe, it, expect } from "vitest";
import { runExp07, FieldOps, buildForestField } from "./exp07-agent-ops.js";

describe("Experiment 07 — bounded agent field ops", () => {
  const r = runExp07();

  it("agent queries regions and alters causes through the ops surface", () => {
    expect(r.westCellCount).toBeGreaterThan(0);
    expect(r.avgTemperature).toBeGreaterThan(20);
    expect(r.avgFuel).toBeLessThan(1);
  });

  it("agent does not script outcomes — a downwind spot fire emerges", () => {
    expect(r.emberIgnitions).toBeGreaterThan(0);
    expect(r.emergentWithoutScript).toBe(true);
  });

  it("captures deterministic field state for evidence", () => {
    expect(r.capturedCells).toBe(600); // 60 * 1 * 10
  });

  it("lineage is recorded for the emergent fire", () => {
    expect(r.firstDownwindLineage).not.toBeNull();
    expect(r.firstDownwindLineage!.cause).toBe("ember");
  });

  it("exposes no raw buffer on the ops surface", () => {
    const ops = new FieldOps(buildForestField());
    // The bounded surface has no `cells`/`chunks`/`data` property.
    expect("cells" in ops).toBe(false);
    expect("chunks" in ops).toBe(false);
    expect("data" in ops).toBe(false);
  });
});
