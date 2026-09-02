import { describe, expect, it } from "vitest";
import { scatterArea, toInstanceMatrices } from "./index.js";
import type { HeightSampler } from "@3jse/terrain";

const flat: HeightSampler = () => 0;
const steepAtX: HeightSampler = (x) => (x > 5 ? x * 3 : 0); // a cliff past x=5
const area = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };

describe("scatterArea", () => {
  it("is deterministic in the seed — byte-identical instances", () => {
    const a = scatterArea(area, { density: 1, seed: 99, ground: flat });
    const b = scatterArea(area, { density: 1, seed: 99, ground: flat });
    expect(a).toEqual(b);
    expect(scatterArea(area, { density: 1, seed: 1, ground: flat })).not.toEqual(a);
  });

  it("count scales roughly with density * area", () => {
    const lo = scatterArea(area, { density: 0.25, seed: 1, ground: flat }).length;
    const hi = scatterArea(area, { density: 4, seed: 1, ground: flat }).length;
    expect(hi).toBeGreaterThan(lo * 4); // ~25 vs ~400
  });

  it("respects exclusion zones", () => {
    const inst = scatterArea(area, {
      density: 4, seed: 3, ground: flat,
      constraints: { exclusions: [{ x: 5, z: 5, radius: 3 }] },
    });
    expect(inst.every((i) => Math.hypot(i.position[0] - 5, i.position[2] - 5) >= 3)).toBe(true);
    expect(inst.length).toBeGreaterThan(0);
  });

  it("respects the slopeMax constraint (nothing on the cliff)", () => {
    const inst = scatterArea(area, {
      density: 4, seed: 5, ground: steepAtX,
      constraints: { slopeMax: 0.5 },
    });
    expect(inst.every((i) => i.position[0] <= 5.5)).toBe(true);
  });

  it("respects an inField polygon test and the height band", () => {
    const inst = scatterArea(area, {
      density: 4, seed: 7, ground: (x) => x, // y = x, band [2,6]
      constraints: { heightRange: { min: 2, max: 6 }, inField: (x, z) => x + z < 12 },
    });
    expect(inst.every((i) => i.position[1] >= 2 && i.position[1] <= 6)).toBe(true);
    expect(inst.every((i) => i.position[0] + i.position[2] < 12)).toBe(true);
  });

  it("places instances on the ground height and within the area", () => {
    const inst = scatterArea(area, { density: 1, seed: 2, ground: (x, z) => x + z });
    for (const i of inst) {
      expect(i.position[1]).toBeCloseTo(i.position[0] + i.position[2], 5);
      expect(i.position[0]).toBeGreaterThanOrEqual(0);
      expect(i.position[0]).toBeLessThanOrEqual(10);
    }
  });
});

describe("toInstanceMatrices", () => {
  it("packs one column-major 4x4 per instance with translation in the last column", () => {
    const inst = [{ position: [1, 2, 3] as [number, number, number], rotationY: 0, scale: 2 }];
    const m = toInstanceMatrices(inst);
    expect(m.length).toBe(16);
    expect([m[12], m[13], m[14], m[15]]).toEqual([1, 2, 3, 1]);
    expect(m[0]).toBe(2); // scale on the diagonal at rotationY = 0
    expect(m[5]).toBe(2);
  });
});
