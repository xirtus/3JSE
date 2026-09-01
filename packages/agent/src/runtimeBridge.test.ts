import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import { registerBuiltinSystems } from "@3jse/runtime/systems/builtins";
import {
  ConsoleSink,
  PerfRecorder,
  runtimeRun,
  runtimeGetPerf,
  runtimeCaptureState,
  capturedStateToText,
} from "./runtime.js";
import { buildEvidenceReport } from "./evidence.js";

function spinWorld() {
  const world = new World();
  registerBuiltinSystems(world.scheduler);
  const level = world.createLevel("Test", "level_fixed");
  const cube = level.createEntity("Cube", { id: "entity_cube" });
  cube.addComponent("Spin", { degreesPerSecond: 90 });
  return { world, level, cube };
}

describe("runtime.getPerf", () => {
  it("reports one timing sample per frame and a scene census", () => {
    const { world } = spinWorld();
    const perf = new PerfRecorder();
    runtimeRun(world, new ConsoleSink(), 30, 1 / 60, perf);

    const report = runtimeGetPerf(world, perf);
    expect(report.frames).toBe(30);
    expect(report.totalMs).toBeGreaterThanOrEqual(0);
    expect(report.avgMsPerFrame).toBeGreaterThanOrEqual(0);
    expect(report.minMsPerFrame).toBeLessThanOrEqual(report.maxMsPerFrame);
    expect(report.estimatedFps).toBeGreaterThanOrEqual(0);
    expect(report.scene).toMatchObject({ levels: 1, entities: 1, spatialEntities: 1 });
    expect(report.scene.systems).toBe(world.scheduler.describe().length);
    expect(report.scene.components.Spin).toBe(1);
    expect(report.note).toMatch(/CPU\/simulation timing only/);
  });

  it("is empty and safe before any run", () => {
    const { world } = spinWorld();
    const report = runtimeGetPerf(world, new PerfRecorder());
    expect(report).toMatchObject({ frames: 0, totalMs: 0, avgMsPerFrame: 0, estimatedFps: 0 });
  });

  it("runtimeRun still works without a recorder (back-compat)", () => {
    const { world, cube } = spinWorld();
    expect(() => runtimeRun(world, new ConsoleSink(), 60, 1 / 60)).not.toThrow();
    expect(cube.object3D!.rotation.y).toBeCloseTo(Math.PI / 2, 2);
  });
});

describe("runtime.captureState", () => {
  it("captures transforms and components as a rounded, deterministic snapshot", () => {
    const { world, cube } = spinWorld();
    runtimeRun(world, new ConsoleSink(), 60, 1 / 60); // quarter turn

    const a = runtimeCaptureState(world, { precision: 3 });
    expect(a.levels[0]!.id).toBe("level_fixed");
    const e = a.levels[0]!.entities[0]!;
    expect(e).toMatchObject({ id: "entity_cube", name: "Cube", spatial: true });
    expect(e.quaternion).toHaveLength(4);
    expect(e.components.Spin).toEqual({ degreesPerSecond: 90 });

    // Deterministic: same world state -> byte-identical text.
    expect(capturedStateToText(a)).toBe(capturedStateToText(runtimeCaptureState(world, { precision: 3 })));
    // And it changed from spinning.
    expect(e.quaternion![1]).not.toBe(0);
    void cube;
  });

  it("normalizes -0 so a zeroed axis does not flip the snapshot", () => {
    const { world } = spinWorld();
    const txt = capturedStateToText(runtimeCaptureState(world));
    expect(txt).not.toContain("-0");
  });
});

describe("buildEvidenceReport", () => {
  it("fills Build/runtime and Performance from structured inputs and flags an owed visual pass", () => {
    const { world } = spinWorld();
    const perf = new PerfRecorder();
    const sink = new ConsoleSink();
    runtimeRun(world, sink, 20, 1 / 60, perf);
    sink.log("error", "missing animation state 'chase'");

    const md = buildEvidenceReport({
      coreLoop: "cube spins 90°/s for 20 frames",
      gameplayPass: true,
      build: { typecheck: "pass", tests: "pass", build: { ok: false, detail: "editor build not run" } },
      console: sink.since(0),
      perf: runtimeGetPerf(world, perf),
      providerLedger: { spin: "project code (@3jse/runtime builtin)" },
      limitations: ["headless only"],
    });

    expect(md).toContain("# 3JSE Evidence Report");
    expect(md).toContain("Pass/fail: PASS");
    expect(md).toContain("typecheck: pass");
    expect(md).toContain("build: fail — editor build not run");
    expect(md).toContain("console errors: 1 — missing animation state 'chase'");
    expect(md).toMatch(/FPS\/frame time: ~[\d.]+ fps sim/);
    expect(md).toContain("spin -> project code");
    expect(md).toContain("screenshots captured: none (Visual QA pass still owed)");
    expect(md).toContain("- headless only");
  });
});
