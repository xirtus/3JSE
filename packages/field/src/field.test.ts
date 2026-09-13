import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import { buildSyntheticField, serializeChunk, deserializeChunk, fieldCellCount } from "./synthetic.js";
import { sampleField, gradientField, type WorldField } from "./field.js";
import { FieldOps } from "./ops.js";
import { evaluate, makeCard } from "./responseCard.js";
import { attachCausalField, getCausalField, CAUSAL_FIELD_RESOURCE } from "./worldResource.js";
import type { AABB, Vec3 } from "./types.js";

const r = (min: Vec3, max: Vec3): AABB => ({ min, max });

function synthetic(): WorldField {
  return buildSyntheticField({ size: [64, 8, 64], resolution: [8, 1, 8] });
}

describe("serialization round-trip", () => {
  it("serialize -> deserialize -> serialize is byte-identical", () => {
    const field = synthetic();
    const chunk = [...field.chunks.values()][0]!;
    const once = serializeChunk(chunk);
    const twice = serializeChunk(deserializeChunk(once));
    expect(twice).toEqual(once);
  });
});

describe("sampling", () => {
  it("returns null outside bounds and a state inside, with a cold->warm gradient", () => {
    const field = synthetic();
    expect(sampleField(field, [1000, 0, 0])).toBeNull();
    const cold = sampleField(field, [-24, 0, 0])!;
    const warm = sampleField(field, [24, 0, 0])!;
    expect(cold.state.temperature).toBeLessThan(warm.state.temperature);
    expect(cold.response.paletteId).toBe(0);
    const g = gradientField(field, [0, 0, 0], "temperature");
    expect(g).not.toBeNull();
    expect(g![0]).toBeGreaterThan(0); // temperature increases along +x
  });
});

describe("response card", () => {
  it("a single card spans frozen powder -> wet slush without a material swap", () => {
    const card = makeCard({ id: 0, label: "snow" });
    const powder = evaluate(card, { ...state(), temperature: -20, liquidFraction: 0, moisture: 0.1 });
    const slush = evaluate(card, { ...state(), temperature: 2, liquidFraction: 0.8, moisture: 0.9 });
    expect(slush.mechanical.friction).toBeLessThan(powder.mechanical.friction);
    expect(slush.visual.roughness).toBeLessThan(powder.visual.roughness);
    // weights stay normalized
    const sum = slush.mechanical.expertWeights.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

function state() {
  return {
    temperature: 0, moisture: 0, liquidFraction: 0, density: 0, pressure: 0, phase: 0,
    velocity: [0, 0, 0] as [number, number, number], fuel: 0, biomass: 0, sediment: 0,
    carbonization: 0, smoke: 0, compaction: 0, compression: 0,
  };
}

describe("FieldOps (bounded agent surface)", () => {
  it("addHeat/addMoisture/query/captureState all operate through the typed surface", () => {
    const field = synthetic();
    const ops = new FieldOps(field);
    const region = r([-32, 0, -32], [0, 8, 32]);
    const before = ops.sample([-16, 0, 0])!.state.temperature;
    const written = ops.addHeat(region, 10).cellsWritten;
    expect(written).toBeGreaterThan(0);
    expect(ops.sample([-16, 0, 0])!.state.temperature).toBeCloseTo(before + 10, 4);
    expect(ops.query(region).length).toBe(written);
    expect(ops.captureState().data.length).toBe(fieldCellCount(field) * 16);
  });

  it("paintResponse changes the response index in a region only", () => {
    const field = synthetic();
    const ops = new FieldOps(field);
    ops.paintResponse(r([-32, 0, -32], [0, 8, 32]), 7);
    expect(ops.sample([-16, 0, 0])!.response.paletteId).toBe(7);
    expect(ops.sample([16, 0, 0])!.response.paletteId).toBe(0);
  });
});

describe("runtime integration", () => {
  it("attaches to and reads from a @3jse/runtime World as the CausalField resource", () => {
    const world = new World();
    const field = synthetic();
    attachCausalField(world, field);
    expect(getCausalField(world)).toBe(field);
    expect(world.listResourceKeys()).toContain(CAUSAL_FIELD_RESOURCE);

    const ops = new FieldOps(getCausalField(world)!);
    ops.addMoisture(r([-8, 0, -8], [0, 8, 8]), 0.5);
    expect(getCausalField(world)!.chunks.get("synthetic")!.version).toBeGreaterThan(1);
  });
});
