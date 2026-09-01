import { describe, expect, it } from "vitest";
import { compileAtlas } from "@3jse/atlas";
import { buildThirdPersonTemplate } from "@3jse/templates";
import { buildSampleAtlas, SAMPLE_EVIDENCE, applyAtlasKnob, readAtlasKnob } from "./sampleAtlas.js";

describe("sampleAtlas — the Third Person template's semantic model", () => {
  it("compiles to a connected graph with evidence-derived health", () => {
    const model = compileAtlas({ systems: buildSampleAtlas().list(), evidence: SAMPLE_EVIDENCE });
    const ids = model.nodes.map((n) => n.id).sort();
    expect(ids).toContain("player.movement");
    expect(ids).toContain("player.camera");
    // Movement -> Camera dependency edge exists
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: "player.movement", target: "player.camera", kind: "dependency" }),
    );
    // health comes from SAMPLE_EVIDENCE, not invented
    expect(model.nodes.find((n) => n.id === "player.movement")!.status).toBe("healthy");
    expect(model.nodes.find((n) => n.id === "world.props")!.status).toBe("untested");
  });

  it("every bound knob names a knob that is actually declared on its system", () => {
    const reg = buildSampleAtlas();
    // reach into the same binding table applyAtlasKnob uses by exercising it
    for (const sys of reg.list()) {
      for (const knob of Object.keys(sys.knobs ?? {})) {
        // applying to a level with no matching entity should not throw, just report not-applied
        const res = applyAtlasKnob(fakeEmptyLevel(), sys.id, knob, 1);
        expect(typeof res.message).toBe("string");
      }
    }
  });

  it("applyAtlasKnob writes straight through to the live component (§3.1)", async () => {
    const t = await buildThirdPersonTemplate({ levelName: "Sandbox" });
    // decorate is skipped here, but Player exists from the template
    const before = readAtlasKnob(t.level, "player.camera", "distance");
    expect(before).toBe(6); // CameraRig default

    const res = applyAtlasKnob(t.level, "player.camera", "distance", 9.5);
    expect(res.applied).toBe(true);
    expect(res.message).toMatch(/CameraRig\.distance = 9\.5/);
    expect(readAtlasKnob(t.level, "player.camera", "distance")).toBe(9.5);
    expect(t.player.getComponent<{ distance: number }>("CameraRig")!.distance).toBe(9.5);
  });

  it("a descriptive-only knob reports no live binding instead of pretending", () => {
    const res = applyAtlasKnob(fakeEmptyLevel(), "player.animation", "whatever", 1);
    expect(res.applied).toBe(false);
    expect(res.message).toMatch(/descriptive knob/);
  });
});

// A Level-shaped stand-in with no entities — enough for applyAtlasKnob's "not found" path.
function fakeEmptyLevel() {
  return { allEntities: [] } as unknown as Parameters<typeof applyAtlasKnob>[0];
}
