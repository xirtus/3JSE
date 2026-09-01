import { describe, expect, it } from "vitest";
import {
  parseFeelSpec,
  resolveInheritance,
  resolveFeel,
  checkProtected,
  feelDelta,
  type FeelSpec,
} from "./feelspec.js";

const base = {
  version: 1,
  system: "vehicle.arcade",
  profile: { id: "xirtus-arcade-driving-v3", label: "Xirtus Arcade Driving v3" },
  references: { burnout_like: 0.5, outrun_like: 0.3, heavy_openworld_like: 0.2 },
  intent: { steeringResponse: 0.78, stability: 0.72, collisionDrama: 0.88 },
  protected: ["acceleration.topSpeed"],
  tests: ["driving.slalom"],
};

describe("parseFeelSpec", () => {
  it("parses the §8 shape and flags out-of-range dims + non-unit reference sums", () => {
    const { spec, issues } = parseFeelSpec({ ...base, intent: { ...base.intent, weird: 1.4 } });
    expect(spec.system).toBe("vehicle.arcade");
    expect(spec.protected).toEqual(["acceleration.topSpeed"]);
    expect(issues.find((i) => i.message.includes("weird"))?.level).toBe("warn");
  });

  it("throws only on a shape that cannot be a FeelSpec", () => {
    expect(() => parseFeelSpec(null)).toThrow();
    expect(() => parseFeelSpec({ profile: { id: "x" }, intent: {} })).toThrow(/system/);
    expect(() => parseFeelSpec({ system: "s", intent: {} })).toThrow(/profile\.id/);
  });
});

describe("resolveInheritance", () => {
  it("folds an extends chain, child wins, arrays union", () => {
    const parent: FeelSpec = {
      version: 1,
      system: "vehicle.arcade",
      profile: { id: "arcade-base" },
      intent: { steeringResponse: 0.6, stability: 0.9, grip: 0.8 },
      protected: ["grip.base"],
      tests: ["driving.highSpeed"],
    };
    const child = parseFeelSpec({ ...base, extends: "arcade-base" }).spec;
    const { resolved, issues } = resolveInheritance(child, (id) => (id === "arcade-base" ? parent : undefined));
    expect(issues).toEqual([]);
    expect(resolved.intent).toEqual({ steeringResponse: 0.78, stability: 0.72, grip: 0.8, collisionDrama: 0.88 });
    expect(resolved.protected?.sort()).toEqual(["acceleration.topSpeed", "grip.base"]);
    expect(resolved.tests?.sort()).toEqual(["driving.highSpeed", "driving.slalom"]);
  });

  it("detects an inheritance cycle instead of looping forever", () => {
    const a: FeelSpec = { version: 1, system: "s", profile: { id: "a" }, extends: "b", intent: {} };
    const b: FeelSpec = { version: 1, system: "s", profile: { id: "b" }, extends: "a", intent: {} };
    const { issues } = resolveInheritance(a, (id) => (id === "a" ? a : id === "b" ? b : undefined));
    expect(issues.some((i) => i.message.includes("cycle"))).toBe(true);
  });
});

describe("resolveFeel (weighted reference blend, §11)", () => {
  it("pulls each dimension toward the weighted reference target", () => {
    const spec = parseFeelSpec(base).spec;
    const profiles = {
      burnout_like: { steeringResponse: 0.9, collisionDrama: 0.95, stability: 0.7 },
      outrun_like: { steeringResponse: 0.7, collisionDrama: 0.5, stability: 0.85 },
      heavy_openworld_like: { steeringResponse: 0.5, collisionDrama: 0.7, stability: 0.55 },
    };
    const { intent } = resolveFeel(spec, profiles);
    // references sum to 1 -> full pull -> result equals the weighted reference average
    const wAvg = 0.9 * 0.5 + 0.7 * 0.3 + 0.5 * 0.2;
    expect(intent.steeringResponse).toBeCloseTo(wAvg, 5);
    for (const v of Object.values(intent)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });

  it("no references -> intent passes through unchanged", () => {
    const spec = parseFeelSpec({ ...base, references: {} }).spec;
    expect(resolveFeel(spec, {}).intent).toEqual(spec.intent);
  });
});

describe("checkProtected + feelDelta", () => {
  it("flags a protected dimension that moved and reports the human diff", () => {
    const spec = parseFeelSpec({ ...base, protected: ["topSpeed", "jumpHeight"] }).spec;
    const before = { topSpeed: 1, jumpHeight: 0.5, bodyRoll: 0.42 };
    const after = { topSpeed: 1, jumpHeight: 0.4, bodyRoll: 0.66 };
    expect(checkProtected(spec, before, after)).toEqual([{ path: "jumpHeight", before: 0.5, after: 0.4 }]);
    expect(feelDelta(before, after)).toEqual([
      { path: "bodyRoll", before: 0.42, after: 0.66 },
      { path: "jumpHeight", before: 0.5, after: 0.4 },
    ]);
  });
});
