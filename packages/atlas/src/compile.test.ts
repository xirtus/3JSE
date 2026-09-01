import { describe, expect, it } from "vitest";
import { compileAtlas, focusDomain, childrenOf, type CompileInput } from "./compile.js";
import type { AtlasSystemSpec } from "./defineSystem.js";

const systems: AtlasSystemSpec[] = [
  { id: "input", label: "Input", domain: "core", emits: ["input.jump"] },
  {
    id: "player.movement",
    label: "Movement",
    domain: "gameplay",
    requires: ["input"],
    listens: ["input.jump"],
    emits: ["player.airborne"],
    knobs: { jumpImpulse: { type: "number", default: 1.7, min: 0, max: 5 } },
    tests: ["tests/movement/**"],
  },
  {
    id: "player.camera",
    label: "Camera",
    domain: "gameplay",
    requires: ["player.movement"],
    listens: ["player.airborne"],
    providers: ["poseidon"],
    knobs: { distance: { type: "number", default: 5.5, value: 6.2 } },
  },
  { id: "player.jump", label: "Jump", domain: "gameplay", parent: "player.movement" },
];

const input: CompileInput = {
  systems,
  evidence: {
    "player.movement": { tests: { passed: 6, failed: 0, total: 6 }, cpuMs: 0.2 },
    "player.camera": { tests: { passed: 2, failed: 1, total: 3 } },
  },
  providers: { poseidon: { id: "poseidon", label: "Poseidon", license: "MIT", capabilities: ["ocean"] } },
};

describe("compileAtlas", () => {
  it("builds system nodes with health, dependents, and flattened knobs", () => {
    const m = compileAtlas(input);
    const mv = m.nodes.find((n) => n.id === "player.movement")!;
    expect(mv.status).toBe("healthy");
    expect(mv.dependents).toEqual(["player.camera"]);
    expect(mv.knobs).toEqual({ jumpImpulse: 1.7 });

    const cam = m.nodes.find((n) => n.id === "player.camera")!;
    expect(cam.status).toBe("failing");
    expect(cam.knobs).toEqual({ distance: 6.2 }); // knob `value` wins over `default`
  });

  it("emits dependency edges only between known systems, danglers surfaced", () => {
    const m = compileAtlas({
      systems: [{ id: "a", label: "A", domain: "core", requires: ["ghost"] }],
    });
    expect(m.edges).toEqual([]);
    expect(m.dangling).toEqual([{ from: "a", ref: "ghost", kind: "dependency" }]);
  });

  it("wires event edges from an emitter to every listener of that event", () => {
    const m = compileAtlas(input);
    const ev = m.edges.filter((e) => e.kind === "event");
    expect(ev).toContainEqual(expect.objectContaining({ source: "input", target: "player.movement", label: "input.jump" }));
    expect(ev).toContainEqual(expect.objectContaining({ source: "player.movement", target: "player.camera", label: "player.airborne" }));
  });

  it("adds provider nodes + edges, and marks an unregistered provider", () => {
    const m = compileAtlas({ systems: [{ id: "s", label: "S", domain: "world", providers: ["mystery"] }] });
    const p = m.nodes.find((n) => n.id === "provider:mystery")!;
    expect(p.type).toBe("provider");
    expect(p.healthReasons).toContain("provider not in registry");
    expect(m.edges).toContainEqual(expect.objectContaining({ source: "provider:mystery", target: "s", kind: "provider" }));
  });

  it("includeProviders:false yields a pure system map", () => {
    const m = compileAtlas({ ...input, includeProviders: false });
    expect(m.nodes.some((n) => n.type === "provider")).toBe(false);
    expect(m.edges.some((e) => e.kind === "provider")).toBe(false);
  });

  it("focusDomain + childrenOf support progressive disclosure", () => {
    const m = compileAtlas({ ...input, includeProviders: false });
    const gameplay = focusDomain(m, "gameplay");
    expect(gameplay.nodes.every((n) => n.domain === "gameplay")).toBe(true);
    expect(childrenOf(m, "player.movement").map((n) => n.id)).toEqual(["player.jump"]);
    expect(childrenOf(m, undefined).some((n) => n.id === "player.jump")).toBe(false);
  });
});
