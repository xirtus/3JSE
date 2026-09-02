import { describe, expect, it } from "vitest";
import { compileAtlas } from "./compile.js";
import { eventLens, performanceLens, providerLens, assetLens, stateMachineLens, gameplayFlowLens } from "./lenses.js";
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

describe("Atlas lenses — state machine + gameplay flow (§5.3, §5.2)", () => {
  it("stateMachineLens turns a system's declared FSM into state nodes + trigger-labelled edges", () => {
    const m = compileAtlas({
      systems: [{
        id: "player.locomotion",
        label: "Locomotion",
        domain: "gameplay",
        stateMachine: {
          initial: "grounded",
          states: ["grounded", "airborne", "grinding"],
          transitions: [
            { from: "grounded", to: "airborne", on: "jump" },
            { from: "airborne", to: "grinding", on: "grind" },
            { from: "grinding", to: "airborne", on: "detach" },
            { from: "airborne", to: "grounded", on: "land" },
          ],
        },
      }],
      includeProviders: false,
    });
    const g = stateMachineLens(m, "player.locomotion");
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["state:airborne", "state:grinding", "state:grounded"]);
    expect(g.nodes.find((n) => n.id === "state:grounded")!.status).toBe("healthy"); // initial
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "state:grounded", target: "state:airborne", label: "jump" }));
    expect(stateMachineLens(m, "nope")).toEqual({ nodes: [], edges: [] });
  });

  it("gameplayFlowLens stitches per-system flow beats into one design sequence", () => {
    const m = compileAtlas({
      systems: [
        { id: "level", label: "Level", domain: "gameplay", flow: ["Spawn", "Surf Section", "Checkpoint", "Finish"] },
        { id: "tricks", label: "Tricks", domain: "gameplay", flow: ["Surf Section", "Trick Window", "Checkpoint"] },
      ],
      includeProviders: false,
    });
    const g = gameplayFlowLens(m);
    expect(g.nodes.map((n) => n.label)).toEqual(["Spawn", "Surf Section", "Checkpoint", "Finish", "Trick Window"]);
    // shared "Surf Section -> Checkpoint" appears once
    expect(g.edges.filter((e) => e.source === "beat:Surf Section" && e.target === "beat:Checkpoint")).toHaveLength(1);
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "beat:Surf Section", target: "beat:Trick Window" }));
    // the shared beat records both contributors
    expect(g.nodes.find((n) => n.label === "Surf Section")!.healthReasons[0]).toMatch(/level|tricks/);
  });
});
