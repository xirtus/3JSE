import { describe, expect, it } from "vitest";
import { validateGraph, compileToTSL, evaluateGraph } from "./index.js";
import { splatTerrainGraph, waterGraph } from "./presets.js";

describe("splatTerrainGraph", () => {
  it("builds a valid graph blending N texture layers by splat channels", () => {
    const g = splatTerrainGraph(["grass", "rock", "sand", "snow"]);
    expect(validateGraph(g).filter((i) => i.level === "error")).toEqual([]);
    const c = compileToTSL(g);
    expect(c.samplers.sort()).toEqual(["grass", "rock", "sand", "snow", "splatMap"]);
    expect(c.code).toContain("TSL.mix(");
    expect(c.code).toContain("material.colorNode =");
  });

  it("CPU eval: a cell fully on layer 0 shows grass; fully on the 'a' channel shows snow", () => {
    const g = splatTerrainGraph(["grass", "rock", "sand", "snow"]);
    const textures = {
      grass: () => [0.2, 0.6, 0.1, 1] as [number, number, number, number],
      rock: () => [0.4, 0.4, 0.4, 1] as [number, number, number, number],
      sand: () => [0.8, 0.7, 0.4, 1] as [number, number, number, number],
      snow: () => [0.95, 0.96, 1, 1] as [number, number, number, number],
      splatMap: (uv: [number, number]) =>
        (uv[0] < 0.5 ? [1, 0, 0, 0] : [0, 0, 0, 1]) as [number, number, number, number],
    };
    const onGrass = evaluateGraph(g, { uv: [0.1, 0], textures }) as number[];
    const onSnow = evaluateGraph(g, { uv: [0.9, 0], textures }) as number[];
    expect(onGrass[1]).toBeCloseTo(0.6, 5); // grass green
    expect(onSnow[0]).toBeCloseTo(0.95, 5); // snow
  });

  it("caps at 4 layers, tolerates 1", () => {
    expect(compileToTSL(splatTerrainGraph(["a", "b", "c", "d", "e", "f"])).samplers).toHaveLength(5); // 4 + splat
    expect(validateGraph(splatTerrainGraph(["only"])).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("waterGraph", () => {
  it("is valid and blends deep→shallow by the facing term", () => {
    const g = waterGraph();
    expect(validateGraph(g).filter((i) => i.level === "error")).toEqual([]);
    // normal straight up -> dot(n,up)=1 -> abs=1 -> mix picks shallow
    const facingUp = evaluateGraph(g, { normal: [0, 1, 0] }) as number[];
    expect(facingUp[1]).toBeCloseTo(0.4, 2); // shallow green
    // grazing -> dot ~ 0 -> deep
    const grazing = evaluateGraph(g, { normal: [1, 0, 0] }) as number[];
    expect(grazing[2]).toBeCloseTo(0.2, 2); // deep blue
  });
});
