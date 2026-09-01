import { describe, expect, it } from "vitest";
import { compileAtlas } from "./compile.js";
import { exportAgentContext, previewChange } from "./agentContext.js";
import type { AtlasSystemSpec } from "./defineSystem.js";

const systems: AtlasSystemSpec[] = [
  { id: "player.physics", label: "Physics", domain: "physics", owns: ["src/player/physics.ts"], tests: ["tests/physics/**"] },
  {
    id: "player.tricks.landing",
    label: "Landing",
    domain: "gameplay",
    requires: ["player.physics"],
    owns: ["src/gameplay/tricks/landing.ts"],
    tests: ["tests/tricks/landing.spec.ts"],
    feelSpec: "profiles/player-tricks.yaml",
    knobs: { landingTolerance: { type: "number", default: 32, unit: "degrees" } },
  },
  { id: "combo", label: "Combo", domain: "gameplay", requires: ["player.tricks.landing"], owns: ["src/gameplay/combo.ts"] },
  { id: "unrelated", label: "HUD", domain: "ui", owns: ["src/ui/hud.ts"] },
];

describe("exportAgentContext (§28)", () => {
  const model = compileAtlas({ systems, includeProviders: false });

  it("scopes to the 1-ring: target + direct neighbours only, not the whole project", () => {
    const ctx = exportAgentContext(model, "player.tricks.landing", "Make clean landings keep more momentum.");
    expect(ctx.system).toBe("player.tricks.landing");
    expect(ctx.neighbors).toEqual(["combo", "player.physics"]);
    expect(ctx.neighbors).not.toContain("unrelated");
    expect(ctx.files).toEqual([
      "src/gameplay/combo.ts",
      "src/gameplay/tricks/landing.ts",
      "src/player/physics.ts",
    ]);
    expect(ctx.tests).toEqual(["tests/physics/**", "tests/tricks/landing.spec.ts"]);
    expect(ctx.feelSpec).toBe("profiles/player-tricks.yaml");
    expect(ctx.knobs).toEqual({ landingTolerance: 32 });
  });

  it("carries health + an optional runtime-evidence pointer, defaults action to modify", () => {
    const withEv = compileAtlas({
      systems,
      includeProviders: false,
      evidence: { "player.tricks.landing": { tests: { passed: 5, failed: 1, total: 6 } } },
    });
    const ctx = exportAgentContext(withEv, "player.tricks.landing", "fix it", {
      action: "repair",
      runtimeEvidence: "traces/trace-0042.json",
    });
    expect(ctx.action).toBe("repair");
    expect(ctx.status).toBe("failing");
    expect(ctx.runtimeEvidence).toBe("traces/trace-0042.json");
  });

  it("throws on an unknown node", () => {
    expect(() => exportAgentContext(model, "nope", "x")).toThrow(/no node/);
  });
});

describe("previewChange (§30)", () => {
  it("summarises blast radius and a coarse risk level", () => {
    const model = compileAtlas({ systems, includeProviders: false });
    const p = previewChange(model, "player.tricks.landing");
    expect(p.modify).toBe("player.tricks.landing");
    expect(p.affected).toEqual(["combo", "player.physics"]);
    expect(p.risk).toBe("low");
  });
});
