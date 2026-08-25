import { describe, expect, it } from "vitest";
import { noise, worldConstants, climate } from "./index.js";

describe("@3jse/terrain-demiurge wrap", () => {
  it("re-exports the planet generation core", () => {
    expect(noise.createNoise3D).toBeTypeOf("function");
    expect(noise.fbm).toBeTypeOf("function");
    expect(worldConstants.RADIUS).toBeGreaterThan(0);
    expect(climate).toBeTypeOf("object");
  });
});
