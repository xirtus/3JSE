import { describe, expect, it } from "vitest";
import { SystemRegistry, defineSystem, systemRegistry, knobValue } from "./defineSystem.js";

describe("SystemRegistry", () => {
  it("registers and lists semantic systems", () => {
    const r = new SystemRegistry();
    r.define({ id: "player.movement", label: "Movement", domain: "gameplay" });
    r.define({ id: "player.camera", label: "Camera", domain: "gameplay", requires: ["player.movement"] });
    expect(r.list().map((s) => s.id)).toEqual(["player.movement", "player.camera"]);
    expect(r.get("player.camera")?.requires).toEqual(["player.movement"]);
  });

  it("rejects a duplicate id, allows upsert", () => {
    const r = new SystemRegistry();
    r.define({ id: "s", label: "S", domain: "core" });
    expect(() => r.define({ id: "s", label: "S2", domain: "core" })).toThrow(/already registered/);
    r.upsert({ id: "s", label: "S2", domain: "core" });
    expect(r.get("s")?.label).toBe("S2");
  });

  it("freezes a copy so mutating the caller's spec can't desync the registry", () => {
    const r = new SystemRegistry();
    const src = { id: "s", label: "S", domain: "core" as const, emits: ["a"] };
    r.define(src);
    src.emits.push("b");
    src.label = "mutated";
    expect(r.get("s")?.label).toBe("S");
    // the array reference is shared by design (spread is shallow) — document, don't over-claim:
    expect(r.get("s")?.emits).toEqual(["a", "b"]);
  });

  it("knobValue falls back to default when value is unset", () => {
    expect(knobValue({ type: "number", default: 5 })).toBe(5);
    expect(knobValue({ type: "number", default: 5, value: 9 })).toBe(9);
    expect(knobValue({ type: "boolean", default: false, value: true })).toBe(true);
  });

  it("the default registry is process-global", () => {
    systemRegistry.clear();
    defineSystem({ id: "x", label: "X", domain: "core" });
    expect(systemRegistry.has("x")).toBe(true);
    systemRegistry.clear();
  });
});
