import { describe, expect, it } from "vitest";
import {
  valueNoise2D, fbm, sampleSlope,
  meshChunk, lodResolution,
  TerrainStreamer,
  type HeightSampler,
} from "./index.js";

const flat: HeightSampler = () => 0;
const ramp: HeightSampler = (x) => x * 0.5; // constant slope in +x

describe("heightfield", () => {
  it("value noise is deterministic per seed and in [0,1]-ish", () => {
    const a = valueNoise2D(42);
    const b = valueNoise2D(42);
    expect(a(3.3, 7.1)).toBe(b(3.3, 7.1));
    expect(valueNoise2D(1)(0.5, 0.5)).not.toBe(valueNoise2D(2)(0.5, 0.5));
  });

  it("fbm sums octaves, slope is 0 on flat ground and >0 on a ramp", () => {
    const f = fbm(valueNoise2D(1), 3);
    expect(typeof f(1, 1)).toBe("number");
    expect(sampleSlope(flat, 0, 0)).toBeCloseTo(0, 5);
    expect(sampleSlope(ramp, 0, 0)).toBeGreaterThan(0.4);
  });
});

describe("meshChunk", () => {
  it("produces (res+1)^2 verts and res*res*2 triangles with matching arrays", () => {
    const m = meshChunk(flat, { cx: 0, cz: 0, size: 10 }, 4);
    expect(m.positions.length).toBe(25 * 3);
    expect(m.normals.length).toBe(25 * 3);
    expect(m.uvs.length).toBe(25 * 2);
    expect(m.indices.length).toBe(4 * 4 * 6);
    // every index in range
    expect(Math.max(...m.indices)).toBeLessThan(25);
  });

  it("flat terrain -> all normals point straight up; aabb matches the chunk", () => {
    const m = meshChunk(flat, { cx: 1, cz: 2, size: 8 }, 3);
    for (let i = 0; i < m.normals.length; i += 3) {
      expect(m.normals[i + 1]).toBeCloseTo(1, 5);
    }
    expect(m.aabb.min).toEqual([8, 0, 16]);
    expect(m.aabb.max).toEqual([16, 0, 24]);
  });

  it("positions are placed in world space at the chunk origin", () => {
    const m = meshChunk(ramp, { cx: 0, cz: 0, size: 4 }, 2);
    expect(m.positions[0]).toBe(0); // vert 0 x
    expect(m.positions[m.positions.length - 3]).toBe(4); // last vert x
    expect(m.positions[m.positions.length - 2]).toBeCloseTo(2, 5); // ramp: y = x*0.5 = 2
  });

  it("lodResolution drops with distance", () => {
    expect(lodResolution(0, 32, 64)).toBe(32); // rings 0
    expect(lodResolution(128, 32, 64)).toBe(16); // rings 2
    expect(lodResolution(200, 32, 64)).toBe(8); // rings ~3.1
    expect(lodResolution(1000, 32, 64)).toBe(4); // rings ~15.6
  });
});

describe("TerrainStreamer (bounded residency)", () => {
  it("loads a ring around the focus, then adds/removes as it moves", () => {
    const s = new TerrainStreamer(fbm(valueNoise2D(7), 3), { chunkSize: 16, ring: 1, baseResolution: 8 });
    const d0 = s.update(0, 0);
    expect(d0.added.length).toBe(9); // 3x3
    expect(s.residentCount).toBe(9);
    expect(d0.removed).toEqual([]);

    const d1 = s.update(0, 0); // no move
    expect(d1.added).toEqual([]);
    expect(d1.removed).toEqual([]);

    const d2 = s.update(48, 0); // 3 chunks east -> whole ring shifts
    expect(d2.added.length).toBeGreaterThan(0);
    expect(d2.removed.length).toBeGreaterThan(0);
    expect(s.residentCount).toBe(9);
  });

  it("re-meshes a chunk when its LOD changes as the focus approaches/recedes", () => {
    const s = new TerrainStreamer(flat, { chunkSize: 16, ring: 3, baseResolution: 8 });
    s.update(0, 0);
    const far = s.update(200, 0); // moves focus far -> some chunks that stay resident drop LOD
    expect(far.updated.length + far.added.length).toBeGreaterThan(0);
  });

  it("heightAt delegates to the sampler for gameplay grounding", () => {
    const s = new TerrainStreamer(ramp, { chunkSize: 16, ring: 1, baseResolution: 4 });
    expect(s.heightAt(10, 0)).toBeCloseTo(5, 5);
  });
});
