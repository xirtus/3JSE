import { describe, expect, it } from "vitest";
import { World, registerComponent, getComponentSchema } from "@3jse/runtime";
import { PluginHost, type Plugin } from "./PluginHost.js";
import { checkCompatibility } from "./manifest.js";

const spinAll: Plugin = {
  manifest: {
    id: "community/spin-all",
    version: "1.0.0",
    description: "Spins every entity tagged SpinAll around Y.",
    api: { components: 1, systems: 1 },
  },
  contributions: {
    components: () => {
      if (!getComponentSchema("SpinAll")) {
        registerComponent({ type: "SpinAll", label: "Spin All", fields: [], createDefault: () => ({}) });
      }
    },
    systems: () => [
      {
        name: "SpinAllSystem",
        stage: "variable",
        query: ["SpinAll"],
        run: (entities, { dt }) => {
          for (const e of entities) e.object3D?.rotateY(dt);
        },
      },
    ],
  },
};

describe("PluginHost", () => {
  it("registers, validates, and activates a plugin's components + systems", () => {
    const host = new PluginHost();
    const rec = host.register(spinAll);
    expect(rec.issues).toEqual([]);
    expect(rec.active).toBe(true);

    const world = new World();
    const results = host.activate({ world });
    expect(results[0]!.applied.sort()).toEqual(["components", "systems"]);
    expect(getComponentSchema("SpinAll")).toBeTruthy();

    // the system actually runs
    const level = world.createLevel("T");
    const e = level.createEntity("E");
    e.addComponent("SpinAll");
    world.step(1);
    expect(e.object3D!.rotation.y).toBeCloseTo(1, 5);
  });

  it("components run once even across multiple activate() calls", () => {
    const host = new PluginHost();
    host.register(spinAll);
    const world = new World();
    expect(() => {
      host.activate({ world });
      host.activate({ world }); // would throw "already registered" if components re-ran
    }).not.toThrow();
  });

  it("blocks activation on a hard API incompatibility, still lists it", () => {
    const host = new PluginHost();
    const rec = host.register({
      manifest: { id: "community/future", version: "1.0.0", api: { components: 2 } },
      contributions: { components: () => { throw new Error("should not run"); } },
    });
    expect(rec.active).toBe(false);
    expect(rec.issues[0]!.level).toBe("error");
    const world = new World();
    expect(() => host.activate({ world })).not.toThrow(); // blocked plugin's contribution never runs
    expect(host.list().map((p) => p.manifest.id)).toContain("community/future");
  });

  it("warns (does not block) when the engine API is a major ahead", () => {
    const issues = checkCompatibility({ id: "x", version: "1", api: { components: 1 } }, {
      components: 2, systems: 1, resources: 1, graphNodes: 0, materialNodes: 0,
      editorPanels: 1, inspectorFields: 0, importers: 0, agentTools: 1, buildTargets: 0,
    });
    expect(issues).toEqual([{ point: "components", level: "warn", message: expect.stringContaining("still supported") }]);
  });

  it("errors on an extension point that isn't stabilized (v0)", () => {
    const issues = checkCompatibility({ id: "x", version: "1", api: { materialNodes: 1 } });
    expect(issues[0]).toMatchObject({ point: "materialNodes", level: "error" });
  });

  it("rejects a duplicate plugin id", () => {
    const host = new PluginHost();
    host.register(spinAll);
    expect(() => host.register(spinAll)).toThrow(/already registered/);
  });

  it("forwards editor panel contributions to the sink", () => {
    const host = new PluginHost();
    host.register({
      manifest: { id: "community/panels", version: "1", api: { editorPanels: 1 } },
      contributions: { editorPanels: () => [{ id: "demo", title: "Demo" }] },
    });
    const got: unknown[] = [];
    host.activate({ onEditorPanels: (p) => got.push(...p) });
    expect(got).toEqual([{ id: "demo", title: "Demo" }]);
  });
});
