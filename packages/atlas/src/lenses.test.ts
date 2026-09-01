import { describe, expect, it } from "vitest";
import { compileAtlas } from "./compile.js";
import { eventLens, performanceLens, providerLens, assetLens } from "./lenses.js";
import type { AtlasSystemSpec } from "./defineSystem.js";

const systems: AtlasSystemSpec[] = [
  { id: "input", label: "Input", domain: "core", emits: ["input.jump"] },
  { id: "player", label: "Player", domain: "gameplay", listens: ["input.jump"], emits: ["player.airborne"], providers: ["poseidon"], assets: ["hero.glb"] },
  { id: "camera", label: "Camera", domain: "gameplay", requires: ["player"], listens: ["player.airborne"] },
  { id: "hud", label: "HUD", domain: "ui" }, // no events -> excluded from event lens
];

const model = compileAtlas({
  systems,
  evidence: { player: { cpuMs: 0.9 }, camera: { cpuMs: 0.2 } },
});

describe("Atlas lenses (§5)", () => {
  it("eventLens turns event names into nodes with emit/listen edges", () => {
    const g = eventLens(model);
    expect(g.nodes.some((n) => n.id === "event:input.jump")).toBe(true);
    expect(g.nodes.some((n) => n.id === "hud")).toBe(false); // no events
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "input", target: "event:input.jump", label: "emits" }));
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "event:input.jump", target: "player", label: "listens" }));
  });

  it("performanceLens keeps only measured systems, ranked by cpuMs", () => {
    const g = performanceLens(model);
    expect(g.nodes.map((n) => n.id)).toEqual(["player", "camera"]); // 0.9 before 0.2
    expect(g.nodes.every((n) => n.cpuMs != null)).toBe(true);
  });

  it("providerLens shows providers + their users only", () => {
    const g = providerLens(model);
    expect(g.nodes.some((n) => n.id === "provider:poseidon")).toBe(true);
    expect(g.nodes.some((n) => n.id === "player")).toBe(true);
    expect(g.nodes.some((n) => n.id === "camera")).toBe(false);
  });

  it("assetLens shows assets + their users only", () => {
    const g = assetLens(model);
    expect(g.nodes.some((n) => n.id === "asset:hero.glb")).toBe(true);
    expect(g.nodes.some((n) => n.id === "player")).toBe(true);
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "asset:hero.glb", target: "player", kind: "asset" }));
  });
});
