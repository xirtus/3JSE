import { describe, expect, it } from "vitest";
import { createSplatMap, paintSplat, sampleSplat, splatToTexture } from "./splat.js";

describe("splat maps", () => {
  it("starts fully on the base layer, weights sum to 1", () => {
    const m = createSplatMap({ resolution: 8, layers: 3, worldSize: 32, baseLayer: 0 });
    for (let i = 0; i < 64; i++) {
      const s = m.weights.slice(i * 3, i * 3 + 3);
      expect(s[0]).toBe(1);
      expect(s[0]! + s[1]! + s[2]!).toBeCloseTo(1, 6);
    }
  });

  it("paintSplat pushes weight toward the target layer near the brush centre, renormalised", () => {
    const m = createSplatMap({ resolution: 16, layers: 3, worldSize: 32 });
    const touched = paintSplat(m, { x: 16, z: 16, radius: 6, layer: 1, strength: 1, falloff: 0 });
    expect(touched).toBeGreaterThan(0);
    const centre = sampleSplat(m, 16, 16);
    expect(centre[1]).toBeGreaterThan(0.8); // mostly layer 1 now
    expect(centre[0]! + centre[1]! + centre[2]!).toBeCloseTo(1, 5);
    // outside the brush: untouched
    const far = sampleSplat(m, 1, 1);
    expect(far[0]).toBeCloseTo(1, 5);
  });

  it("soft falloff blends: centre stronger than edge", () => {
    const m = createSplatMap({ resolution: 32, layers: 2, worldSize: 64 });
    paintSplat(m, { x: 32, z: 32, radius: 16, layer: 1, strength: 0.9, falloff: 0.8 });
    const centre = sampleSplat(m, 32, 32)[1]!;
    const edge = sampleSplat(m, 32 + 14, 32)[1]!;
    expect(centre).toBeGreaterThan(edge);
    expect(edge).toBeGreaterThan(0); // still some paint at the edge
  });

  it("repeated strokes accumulate toward full coverage", () => {
    const m = createSplatMap({ resolution: 16, layers: 2, worldSize: 32 });
    for (let i = 0; i < 5; i++) paintSplat(m, { x: 16, z: 16, radius: 4, layer: 1, strength: 0.5, falloff: 0 });
    expect(sampleSplat(m, 16, 16)[1]).toBeGreaterThan(0.95);
  });

  it("is deterministic — same strokes, byte-identical weights", () => {
    const stroke = (m: ReturnType<typeof createSplatMap>) =>
      paintSplat(m, { x: 10, z: 20, radius: 5, layer: 1, strength: 0.7, falloff: 0.5 });
    const a = createSplatMap({ resolution: 20, layers: 3, worldSize: 40 });
    const b = createSplatMap({ resolution: 20, layers: 3, worldSize: 40 });
    stroke(a); stroke(b);
    expect(a.weights).toEqual(b.weights);
  });

  it("splatToTexture packs up to 4 layers per texel", () => {
    const m = createSplatMap({ resolution: 4, layers: 5, worldSize: 16 });
    const t = splatToTexture(m);
    expect(t.width).toBe(4);
    expect(t.channels).toBe(4);
    expect(t.data.length).toBe(4 * 4 * 4);
    expect(t.data[0]).toBe(1); // base layer weight
  });
});
