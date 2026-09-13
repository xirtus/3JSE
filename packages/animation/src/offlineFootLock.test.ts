import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { offlineFootLock } from "./offlineFootLock.js";

describe("offlineFootLock", () => {
  it("pulls in-contact toes to a shared grounded point and preserves hip-to-toe length", () => {
    const pelvis = [0, 1, 2, 3].map(() => new Vector3(0, 1, 0));
    // Four frames, all in contact, but the toe jitters forward/up (foot slide).
    const leftToe = [
      new Vector3(0, 0.1, 0),
      new Vector3(0.02, 0.13, 0),
      new Vector3(0.04, 0.11, 0),
      new Vector3(0.06, 0.14, 0),
    ];
    const rightToe = leftToe.map((p) => p.clone());
    const contact = [true, true, true, true];

    const out = offlineFootLock(
      { pelvis, leftToe, rightToe, leftContact: contact, rightContact: contact },
      { iterations: 2000, toeMinHeight: 0.1, softFactor: 0.05, hardFactor: 0.9 },
    );

    // Toes cluster (the slide is removed) and sit at the ground height.
    const xs = out.leftToe.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.01);
    for (const p of out.leftToe) expect(p.y).toBeLessThan(0.12);

    // Hip-to-toe length ≈ source (0.9) — the in-frame constraint is honored.
    for (let i = 0; i < 4; i++) {
      const len = out.pelvis[i]!.distanceTo(out.leftToe[i]!);
      expect(Math.abs(len - 0.9)).toBeLessThan(0.1);
      expect(Number.isFinite(out.leftToe[i]!.y)).toBe(true);
    }
  });

  it("does not mutate the input arrays", () => {
    const pelvis = [new Vector3(0, 1, 0), new Vector3(0, 1, 0)];
    const toe = [new Vector3(0, 0.1, 0), new Vector3(0.01, 0.12, 0)];
    const before = toe[1]!.x;
    offlineFootLock(
      { pelvis, leftToe: toe, rightToe: toe, leftContact: [true, true], rightContact: [true, true] },
      { iterations: 50 },
    );
    expect(toe[1]!.x).toBeCloseTo(before, 10);
  });
});
