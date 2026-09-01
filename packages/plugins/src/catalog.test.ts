import { describe, expect, it } from "vitest";
import { PACKAGE_CATALOG, findPackage, packagesForPhase, packagesByStatus } from "./catalog.js";

describe("PACKAGE_CATALOG", () => {
  it("has unique ids, all official, all @3jse-scoped", () => {
    const ids = PACKAGE_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PACKAGE_CATALOG.every((p) => p.official && p.id.startsWith("@3jse/"))).toBe(true);
  });

  it("query helpers work", () => {
    expect(findPackage("@3jse/atlas")?.capability).toContain("FeelSpec");
    expect(packagesForPhase(2).map((p) => p.id)).toContain("@3jse/character");
    expect(packagesByStatus("shipped").length).toBeGreaterThan(5);
    expect(findPackage("@3jse/nope")).toBeUndefined();
  });

  it("every entry declares a valid phase and status", () => {
    for (const p of PACKAGE_CATALOG) {
      expect(p.phase).toBeGreaterThanOrEqual(1);
      expect(p.phase).toBeLessThanOrEqual(7);
      expect(["shipped", "partial", "planned"]).toContain(p.status);
    }
  });
});
