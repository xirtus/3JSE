import { describe, expect, it } from "vitest";
import { compileAtlas } from "./compile.js";
import { layoutAtlas } from "./layout.js";
import type { AtlasSystemSpec } from "./defineSystem.js";

const chain: AtlasSystemSpec[] = [
  { id: "a", label: "A", domain: "core" },
  { id: "b", label: "B", domain: "gameplay", requires: ["a"] },
  { id: "c", label: "C", domain: "gameplay", requires: ["b"] },
  { id: "d", label: "D", domain: "physics", requires: ["a"] },
];

describe("layoutAtlas", () => {
  it("places each node one layer right of its deepest dependency", () => {
    const m = compileAtlas({ systems: chain, includeProviders: false });
    const L = layoutAtlas(m);
    expect(L.nodes.a!.layer).toBe(0);
    expect(L.nodes.b!.layer).toBe(1);
    expect(L.nodes.c!.layer).toBe(2);
    expect(L.nodes.d!.layer).toBe(1); // depends only on a
    expect(L.nodes.a!.x).toBeLessThan(L.nodes.b!.x);
    expect(L.nodes.b!.x).toBeLessThan(L.nodes.c!.x);
    expect(L.layers).toBe(3);
  });

  it("is deterministic and order-stable within a layer", () => {
    const m = compileAtlas({ systems: [...chain].reverse(), includeProviders: false });
    const a = layoutAtlas(m);
    const b = layoutAtlas(compileAtlas({ systems: chain, includeProviders: false }));
    expect(a.nodes).toEqual(b.nodes);
  });

  it("does not loop on an event cycle (events are lateral, not layering)", () => {
    const cyc: AtlasSystemSpec[] = [
      { id: "x", label: "X", domain: "core", emits: ["e1"], listens: ["e2"] },
      { id: "y", label: "Y", domain: "core", emits: ["e2"], listens: ["e1"] },
    ];
    const L = layoutAtlas(compileAtlas({ systems: cyc, includeProviders: false }));
    expect(L.nodes.x!.layer).toBe(0);
    expect(L.nodes.y!.layer).toBe(0);
  });

  it("breaks a dependency cycle at layer 0 instead of infinite-recursing", () => {
    const cyc: AtlasSystemSpec[] = [
      { id: "p", label: "P", domain: "core", requires: ["q"] },
      { id: "q", label: "Q", domain: "core", requires: ["p"] },
    ];
    expect(() => layoutAtlas(compileAtlas({ systems: cyc, includeProviders: false }))).not.toThrow();
  });
});
