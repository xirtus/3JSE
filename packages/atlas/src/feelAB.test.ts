import { describe, expect, it } from "vitest";
import { feelABTable, mergeFeel, feelABSummary } from "./feelAB.js";

const A = { steering: 0.8, suspension: 0.5, collisionDrama: 0.7 };
const B = { steering: 0.65, suspension: 0.5, collisionDrama: 0.9, boost: 0.3 };

describe("A/B FeelSpec (§16)", () => {
  it("feelABTable lists every dimension with both values, sorted by |delta|", () => {
    const rows = feelABTable(A, B);
    expect(rows[0]!.dimension).toBe("boost"); // |0.3| is the largest delta
    expect(rows.find((r) => r.dimension === "suspension")!.delta).toBe(0);
    expect(rows.find((r) => r.dimension === "boost")).toEqual({ dimension: "boost", a: 0, b: 0.3, delta: 0.3 });
  });

  it("mergeFeel takes B where picked, A everywhere else", () => {
    const merged = mergeFeel(A, B, { steering: "b" }); // 'keep B steering, A suspension'
    expect(merged.steering).toBe(0.65);
    expect(merged.suspension).toBe(0.5);
    expect(merged.collisionDrama).toBe(0.7); // A (not picked)
    expect(merged.boost).toBe(0.3); // only in B, falls back to B when A missing
  });

  it("feelABSummary counts changed dimensions and the spread", () => {
    const s = feelABSummary(A, B);
    expect(s.total).toBe(4);
    expect(s.changed).toBe(3); // steering, collisionDrama, boost
    expect(s.maxDelta).toBe(0.3);
  });
});
