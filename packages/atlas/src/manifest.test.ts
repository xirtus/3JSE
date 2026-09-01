import { describe, expect, it } from "vitest";
import { parseAtlasManifest } from "./manifest.js";
import { compileAtlas } from "./compile.js";

const files: Record<string, string> = {
  "atlas/systems/player.json": JSON.stringify({
    id: "player.movement",
    label: "Movement",
    domain: "gameplay",
    requires: ["input"],
    knobs: { moveSpeed: { type: "number", default: 5 } },
  }),
  "atlas/systems/input.json": JSON.stringify({ id: "input", label: "Input", domain: "core" }),
  "atlas/feelspec/movement.json": JSON.stringify({
    version: 1,
    system: "player.movement",
    profile: { id: "xirtus-movement-v1" },
    intent: { responsiveness: 0.8, weight: 0.4 },
  }),
  "atlas/systems/bad.json": "{ not json",
  "atlas/traces/trace-1.json": JSON.stringify({ ignored: true }),
};

describe("parseAtlasManifest (§44)", () => {
  it("loads systems + feelspecs, reports the malformed file, ignores traces/", () => {
    const m = parseAtlasManifest(files);
    expect(m.systems.map((s) => s.id).sort()).toEqual(["input", "player.movement"]);
    expect(m.feelSpecs["xirtus-movement-v1"]!.intent.responsiveness).toBe(0.8);
    expect(m.issues.some((i) => i.path.endsWith("bad.json") && i.level === "error")).toBe(true);
  });

  it("its systems feed compileAtlas directly", () => {
    const m = parseAtlasManifest(files);
    const model = compileAtlas({ systems: m.systems, includeProviders: false });
    expect(model.nodes.find((n) => n.id === "player.movement")!.knobs).toEqual({ moveSpeed: 5 });
    expect(model.edges).toContainEqual(expect.objectContaining({ source: "input", target: "player.movement", kind: "dependency" }));
  });

  it("flags a duplicate system id", () => {
    const dup = { ...files, "atlas/systems/input2.json": JSON.stringify({ id: "input", label: "Input 2", domain: "core" }) };
    expect(parseAtlasManifest(dup).issues.some((i) => i.message.includes("duplicate system id"))).toBe(true);
  });
});
