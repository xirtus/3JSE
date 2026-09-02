import { describe, expect, it } from "vitest";
import { worldLens, type RegionSpec } from "./world.js";
import { styleLens } from "./style.js";
import { TraceRecorder, traceLens, pulseCounts } from "./trace.js";
import { rigLens } from "./rig.js";

describe("worldLens (§5.10)", () => {
  const regions: RegionSpec[] = [
    { id: "archipelago", label: "Andreas Archipelago" },
    { id: "capital", label: "Capital", parent: "archipelago", scenes: ["castle", "museum"], quests: ["q1"] },
    { id: "forest", label: "Forest", parent: "archipelago", providers: ["dryad"] },
    { id: "castle", label: "Castle", parent: "capital", scenes: ["castle_hall"] },
  ];

  it("region nodes + containment edges, purpose summarises scene/quest counts", () => {
    const g = worldLens(regions);
    expect(g.nodes.map((n) => n.id)).toContain("region:capital");
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "region:archipelago", target: "region:capital", kind: "ownership" }));
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "region:capital", target: "region:castle" }));
    expect(g.nodes.find((n) => n.id === "region:capital")!.purpose).toMatch(/2 scene\(s\).*1 quest\(s\)/);
    expect(g.nodes.find((n) => n.id === "region:forest")!.providers).toEqual(["dryad"]);
  });
});

describe("styleLens (§5.8)", () => {
  it("a VISUAL PROFILE root with a child per declared aspect", () => {
    const g = styleLens({
      geometry: "ps1_n64_modern",
      shading: "cel_pbr_hybrid",
      water: { provider: "poseidon", style: "photoreal" },
      lighting: { saturation: 0.76, contrast: 0.62 },
      post: { bloom: 0.25, chromaticAberration: 0.02 },
    });
    expect(g.nodes.find((n) => n.id === "style:root")!.dependents).toContain("style:water");
    expect(g.nodes.find((n) => n.id === "style:water")!.providers).toEqual(["poseidon"]);
    expect(g.nodes.find((n) => n.id === "style:post")!.purpose).toMatch(/bloom: 0\.25/);
    expect(g.edges.every((e) => e.source === "style:root")).toBe(true);
  });
});

describe("TraceRecorder + traceLens (§5.5, §26–27)", () => {
  it("records within capacity, windows by time, spans", () => {
    const r = new TraceRecorder(3);
    for (let t = 0; t < 5; t++) r.record({ time: t, name: `e${t}`, from: "sys" });
    expect(r.window().map((e) => e.name)).toEqual(["e2", "e3", "e4"]);
    expect(r.window(3, 4).map((e) => e.name)).toEqual(["e3", "e4"]);
    expect(r.span).toEqual({ start: 2, end: 4 });
  });

  it("traceLens chains events by emitting system + counts pulses", () => {
    const evts = [
      { time: 0.1, name: "input.jump", from: "input", to: ["player"] },
      { time: 0.2, name: "player.airborne", from: "player", to: ["camera", "anim"] },
      { time: 0.5, name: "input.jump", from: "input", to: ["player"] },
    ];
    const g = traceLens(evts);
    expect(g.nodes).toHaveLength(3);
    // the two input.jump fires are chained (same `from`)
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "evt:0", target: "evt:2" }));
    expect(pulseCounts(evts)).toEqual({ input: 2, player: 3, camera: 1, anim: 1 });
  });
});

describe("rigLens (§5.11)", () => {
  it("groups bones by limb under Skeleton, lists Motion + Animation", () => {
    const g = rigLens({
      bones: [
        { name: "Hips" }, { name: "Spine", parent: "Hips" },
        { name: "LeftUpLeg", parent: "Hips" }, { name: "LeftFoot", parent: "LeftUpLeg" },
        { name: "LeftArm", parent: "Spine" }, { name: "LeftHand", parent: "LeftArm" },
      ],
      motion: ["Locomotion", "Foot IK", "Look-at"],
      clips: ["Idle", "Walk", "Run"],
      retargetQuality: 0.94,
      missingMappings: ["twist_01"],
    });
    const limbNodes = g.nodes.filter((n) => n.id.startsWith("rig:limb:")).map((n) => n.label).sort();
    expect(limbNodes).toEqual(["Arms", "Legs", "Spine"]);
    expect(g.nodes.find((n) => n.id === "rig:limb:Legs")!.purpose).toBe("2 bone(s)");
    expect(g.nodes.filter((n) => n.id.startsWith("rig:motion:"))).toHaveLength(3);
    expect(g.nodes.filter((n) => n.id.startsWith("rig:clip:"))).toHaveLength(3);
    expect(g.nodes.find((n) => n.id === "rig:skeleton")!.purpose).toMatch(/retarget quality 94%.*1 missing/);
  });
});
