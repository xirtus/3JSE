import { describe, expect, it } from "vitest";
import { World } from "./World.js";
import { registerComponent, getComponentSchema } from "./ComponentRegistry.js";

// Phase 1.1 check — the archetype index behind Level.query() vs. the `allEntities.filter(hasAll)`
// full scan it replaced, at scale, against the real @3jse/runtime. Correctness parity is a hard
// assertion (a real regression guard for 20k entities across ~7 archetypes); the timing is
// logged and only loosely asserted so CI never flakes on a slow shared runner.

for (const name of ["Position", "Velocity", "Health2", "AI", "Renderable", "Rare"]) {
  if (!getComponentSchema(name)) {
    registerComponent({ type: name, label: name, fields: [], createDefault: () => ({}) });
  }
}

describe("Level.query archetype index — scale + parity", () => {
  const N = 20_000;
  const world = new World();
  const level = world.createLevel("Bench");
  for (let i = 0; i < N; i++) {
    const e = level.createEntity(`e${i}`, { spatial: false });
    e.addComponent("Position");
    if (i % 2 === 0) e.addComponent("Velocity");
    if (i % 3 === 0) e.addComponent("Health2");
    if (i % 5 === 0) e.addComponent("AI");
    if (i % 2 === 1) e.addComponent("Renderable");
    if (i % 500 === 0) e.addComponent("Rare");
  }
  const all = level.allEntities;
  const naive = (types: string[]) => all.filter((en) => types.every((t) => en.hasComponent(t)));
  const QUERIES = [
    ["Position", "Velocity"],
    ["Position", "AI"],
    ["Health2", "AI"],
    ["Rare"],
    ["Position", "Velocity", "Health2", "AI"],
  ];

  it("returns identical results to the full scan for every query, at 20k entities", () => {
    for (const q of QUERIES) {
      expect(level.query(q).map((e) => e.id)).toEqual(naive(q).map((e) => e.id));
    }
  });

  it("is not materially slower than the full scan (and is usually much faster)", () => {
    const ITERS = 1000;
    const run = (fn: (q: string[]) => unknown) => {
      for (const q of QUERIES) fn(q); // warm
      const t0 = performance.now();
      for (let i = 0; i < ITERS; i++) for (const q of QUERIES) fn(q);
      return performance.now() - t0;
    };
    const idx = run((q) => level.query(q));
    const scan = run((q) => naive(q));
    const per = (ms: number) => (ms / (ITERS * QUERIES.length)).toFixed(5);
    // eslint-disable-next-line no-console
    console.log(
      `[archetype bench] ${N} entities — indexed ${per(idx)} ms/query vs full-scan ${per(scan)} ms/query (${(scan / idx).toFixed(1)}x)`,
    );
    expect(idx).toBeLessThan(scan * 1.5);
  });
});
