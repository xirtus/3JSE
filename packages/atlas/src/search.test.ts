import { describe, expect, it } from "vitest";
import { compileAtlas } from "./compile.js";
import { searchAtlas } from "./search.js";
import type { AtlasSystemSpec } from "./defineSystem.js";

const systems: AtlasSystemSpec[] = [
  {
    id: "grappling",
    label: "Grappling",
    domain: "gameplay",
    mechanic: "shark_tow",
    owns: ["src/gameplay/grapple.ts"],
    tests: ["tests/shark-tow/**"],
    knobs: { towForce: { type: "number", default: 12 } },
    emits: ["tow.attached"],
  },
  { id: "surf.physics", label: "Surf Physics", domain: "physics", listens: ["tow.attached"], mechanic: "surfing" },
  { id: "scoring", label: "Scoring", domain: "gameplay", listens: ["tow.attached"] },
];

describe("searchAtlas (§38, §39)", () => {
  const model = compileAtlas({ systems, includeProviders: false });

  it("'shark tow' finds the mechanic, its system, and its tests without a filename", () => {
    const hits = searchAtlas(model, "shark tow");
    expect(hits.some((h) => h.kind === "mechanic" && h.nodeId === "grappling")).toBe(true);
    expect(hits.some((h) => h.kind === "test" && h.label === "tests/shark-tow/**")).toBe(true);
  });

  it("ranks an exact label/knob hit above a loose one", () => {
    const hits = searchAtlas(model, "towForce");
    expect(hits[0]!.kind).toBe("knob");
    expect(hits[0]!.nodeId).toBe("grappling");
  });

  it("every term must appear; unrelated query returns nothing", () => {
    expect(searchAtlas(model, "inventory crafting")).toEqual([]);
  });

  it("event search finds both the emitter and the listeners", () => {
    const hits = searchAtlas(model, "tow.attached").filter((h) => h.kind === "event");
    const ids = hits.map((h) => h.nodeId).sort();
    expect(ids).toEqual(["grappling", "scoring", "surf.physics"]);
  });

  it("is deterministic", () => {
    expect(searchAtlas(model, "tow")).toEqual(searchAtlas(model, "tow"));
  });
});
