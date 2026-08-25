import { describe, expect, it } from "vitest";
import { genomeSchema, skeleton, presets, rng } from "./index.js";

describe("@3jse/foliage-gaia wrap", () => {
  it("re-exports the pure generation half", () => {
    expect(genomeSchema.GRASS_SCHEMA).toBeTypeOf("object");
    expect(skeleton.buildSkeleton).toBeTypeOf("function");
    expect(skeleton.MAX_BONES).toBe(200);
    expect(presets).toBeTypeOf("object");
    expect(rng).toBeTypeOf("object");
  });
});
