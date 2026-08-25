import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import { registerBuiltinSystems } from "@3jse/runtime/systems/builtins";
import { ConsoleSink, runtimeRun, runtimeGetConsole, runtimeStep, runtimePause } from "./runtime.js";

describe("runtime tools", () => {
  it("runtime.run steps the World the requested number of frames, headless", () => {
    const world = new World();
    registerBuiltinSystems(world.scheduler);
    const level = world.createLevel("Test");
    const cube = level.createEntity("Cube");
    cube.addComponent("Spin", { degreesPerSecond: 90 });

    const sink = new ConsoleSink();
    runtimeRun(world, sink, 60, 1 / 60); // 1 simulated second

    expect(cube.object3D!.rotation.y).toBeCloseTo(Math.PI / 2, 2);
    expect(world.isPlaying).toBe(true);
  });

  it("a System throwing mid-run is captured to the console sink instead of crashing the run — the shark example's 'catch a missing reference' step", () => {
    const world = new World();
    const level = world.createLevel("Test");
    // query: [] with no entities never runs (Scheduler.ts: "matched.length > 0" gate) — give it
    // one entity so the System actually executes and throws.
    level.createEntity("Anything");
    world.scheduler.register({
      name: "Boom",
      stage: "variable",
      query: [],
      run: () => {
        throw new Error("missing animation state 'chase'");
      },
    });

    const sink = new ConsoleSink();
    expect(() => runtimeRun(world, sink, 3)).not.toThrow();

    const errors = runtimeGetConsole(sink).filter((e) => e.level === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("missing animation state 'chase'");
  });

  it("runtime.getConsole(since) only returns entries after the given cursor", () => {
    const sink = new ConsoleSink();
    sink.log("log", "first");
    const cursor = sink.length;
    sink.log("log", "second");
    sink.log("warn", "third");

    expect(runtimeGetConsole(sink, cursor).map((e) => e.message)).toEqual(["second", "third"]);
  });

  it("runtime.pause / runtime.step control execution independent of runtime.run", () => {
    const world = new World();
    registerBuiltinSystems(world.scheduler);
    const level = world.createLevel("Test");
    const cube = level.createEntity("Cube");
    cube.addComponent("Spin", { degreesPerSecond: 90 });

    runtimePause(world);
    expect(world.isPlaying).toBe(false);

    runtimeStep(world, 1 / 60);
    expect(cube.object3D!.rotation.y).toBeGreaterThan(0);
  });
});
