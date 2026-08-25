import { describe, expect, it } from "vitest";
import { skeleton, allometry, poisson, dendrogram, presets } from "./index.js";

describe("@3jse/flora-dryad wrap", () => {
  it("re-exports the pure generation half", () => {
    expect(skeleton).toBeTypeOf("object");
    expect(allometry).toBeTypeOf("object");
    expect(poisson).toBeTypeOf("object");
    expect(dendrogram).toBeTypeOf("object");
    expect(presets).toBeTypeOf("object");
  });
});
