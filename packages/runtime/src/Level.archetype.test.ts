import { describe, expect, it } from "vitest";
import { World } from "./World.js";
import "./components/builtins.js"; // registers Health / Spin / Movable

// The archetype index behind Level.query() must be observationally identical to the old
// full-scan `allEntities.filter(e => e.hasAll(types))`. These tests pin the behaviours that
// an index (buckets, a query cache, structural moves) could plausibly get wrong.

describe("Level.query archetype index", () => {
  it("tracks entities as components are added, in creation order", () => {
    const level = new World().createLevel("T");
    const a = level.createEntity("A");
    const b = level.createEntity("B");
    const c = level.createEntity("C");

    expect(level.query(["Health"])).toEqual([]);

    c.addComponent("Health"); // added out of creation order...
    a.addComponent("Health");
    b.addComponent("Health");

    // ...still returned in creation order a, b, c.
    expect(level.query(["Health"])).toEqual([a, b, c]);
  });

  it("removing a component moves the entity out of matching queries", () => {
    const level = new World().createLevel("T");
    const a = level.createEntity("A");
    const b = level.createEntity("B");
    a.addComponent("Health");
    a.addComponent("Spin");
    b.addComponent("Health");

    expect(level.query(["Health", "Spin"])).toEqual([a]);
    a.removeComponent("Spin");
    expect(level.query(["Health", "Spin"])).toEqual([]);
    expect(level.query(["Health"])).toEqual([a, b]);
  });

  it("query is order-independent in its argument", () => {
    const level = new World().createLevel("T");
    const a = level.createEntity("A");
    a.addComponent("Health");
    a.addComponent("Spin");
    a.addComponent("Movable");

    expect(level.query(["Spin", "Health"])).toEqual([a]);
    expect(level.query(["Health", "Spin"])).toEqual([a]);
    expect(level.query(["Movable", "Spin", "Health"])).toEqual([a]);
  });

  it("query([]) returns every entity regardless of components", () => {
    const level = new World().createLevel("T");
    const a = level.createEntity("A");
    const b = level.createEntity("B");
    b.addComponent("Health");
    expect(level.query([]).sort((x, y) => x.seq - y.seq)).toEqual([a, b]);
  });

  it("a cached query still sees an entity that later enters a brand-new archetype", () => {
    const level = new World().createLevel("T");
    const a = level.createEntity("A");
    a.addComponent("Health");

    // Prime the cache for ["Health"] while only the {Health} archetype exists.
    expect(level.query(["Health"])).toEqual([a]);

    // New entity in a never-before-seen signature {Health, Spin} — must still match ["Health"].
    const b = level.createEntity("B");
    b.addComponent("Health");
    b.addComponent("Spin");

    expect(level.query(["Health"])).toEqual([a, b]);
    expect(level.query(["Spin"])).toEqual([b]);
  });

  it("destroyEntity drops the entity from every future query", () => {
    const level = new World().createLevel("T");
    const a = level.createEntity("A");
    const b = level.createEntity("B");
    a.addComponent("Health");
    b.addComponent("Health");
    expect(level.query(["Health"])).toEqual([a, b]);

    level.destroyEntity(a.id);
    expect(level.query(["Health"])).toEqual([b]);
  });

  it("re-adding a component after removal restores query membership", () => {
    const level = new World().createLevel("T");
    const a = level.createEntity("A");
    a.addComponent("Spin");
    expect(level.query(["Spin"])).toEqual([a]);
    a.removeComponent("Spin");
    expect(level.query(["Spin"])).toEqual([]);
    a.addComponent("Spin");
    expect(level.query(["Spin"])).toEqual([a]);
  });

  it("matches the naive full scan for a random component mix", () => {
    const level = new World().createLevel("T");
    const types = ["Health", "Spin", "Movable"];
    const entities = Array.from({ length: 40 }, (_, i) => {
      const e = level.createEntity(`E${i}`);
      for (const t of types) if ((i * 7 + t.length) % 3 === 0) e.addComponent(t);
      return e;
    });
    const naive = (q: string[]) => entities.filter((e) => q.every((t) => e.hasComponent(t)));

    for (const q of [["Health"], ["Spin"], ["Movable"], ["Health", "Spin"], types, []]) {
      expect(level.query(q)).toEqual(naive(q));
    }
  });
});
