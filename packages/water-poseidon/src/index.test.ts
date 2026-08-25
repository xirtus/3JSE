import { describe, expect, it } from "vitest";
import { fft, spectrum, params } from "./index.js";

describe("@3jse/water-poseidon wrap", () => {
  it("re-exports the ocean math core", () => {
    expect(fft.FFT).toBeTypeOf("function");
    expect(spectrum.buildInitialSpectrum).toBeTypeOf("function");
    expect(params.params).toBeTypeOf("object");
  });
});
