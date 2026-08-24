import { describe, expect, it } from "vitest";
import { World } from "./World.js";
import "./components/builtins.js";

describe("Scheduler — hot reload (function swap)", () => {
  it("re-registering an existing System name replaces its run function in place", () => {
    const world = new World();
    const level = world.createLevel("Test");
    // Reusing the already-registered Spin component's field as a plain mutable counter — the
    // point of this test is Scheduler swap semantics, not component schema setup.
    const entity = level.createEntity("Counter");
    entity.addComponent<{ degreesPerSecond: number }>("Spin", { degreesPerSecond: 0 });

    world.scheduler.register({
      name: "CounterSystem",
      stage: "variable",
      query: ["Spin"],
      run: (entities) => {
        for (const e of entities) e.getComponent<{ degreesPerSecond: number }>("Spin")!.degreesPerSecond += 1;
      },
    });
    world.step(1);
    expect(entity.getComponent<{ degreesPerSecond: number }>("Spin")!.degreesPerSecond).toBe(1);

    // Swap in a differently-behaved function under the same name — the "hot edit".
    world.scheduler.register({
      name: "CounterSystem",
      stage: "variable",
      query: ["Spin"],
      run: (entities) => {
        for (const e of entities) e.getComponent<{ degreesPerSecond: number }>("Spin")!.degreesPerSecond += 10;
      },
    });
    world.step(1);

    // 1 (old run) + 10 (new run) — proves the swap took effect on the very next tick, the old
    // entity state (the 1 already accumulated) survived untouched, and only one System ran
    // (not both, which would have produced 12).
    expect(entity.getComponent<{ degreesPerSecond: number }>("Spin")!.degreesPerSecond).toBe(11);
  });

  it("unregister() still removes a System by name", () => {
    const world = new World();
    const level = world.createLevel("Test");
    level.createEntity("Anything"); // query: [] matches "every entity", so one must exist to match.
    let ticks = 0;
    world.scheduler.register({ name: "Ticker", stage: "variable", query: [], run: () => ticks++ });
    world.step(1);
    world.scheduler.unregister("Ticker");
    world.step(1);
    expect(ticks).toBe(1);
  });
});
