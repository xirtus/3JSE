import { describe, expect, it } from "vitest";
import { REGISTRY, listEntries, getEntry, listProjectModules, getProjectModule, entriesForModule, listRejected } from "./registry.js";
import { canMarkTierA, isValidTierAssignment } from "./tier.js";
import { createMockFetcher } from "./fetcher.js";
import { generateNoticesEntry } from "./notices.js";

describe("registry.json — schema shape", () => {
  it("every entry has the required fields the registry's own schema demands", () => {
    for (const entry of listEntries()) {
      expect(entry.id, "id").toBeTruthy();
      expect(entry.title, `${entry.id}.title`).toBeTruthy();
      expect(entry.source, `${entry.id}.source`).toBeTruthy();
      expect(["A", "B", "reference"], `${entry.id}.tier`).toContain(entry.tier);
      expect(entry.license, `${entry.id}.license`).toBeTruthy();
      expect(["human", "pending", null], `${entry.id}.license.verifiedBy`).toContain(entry.license.verifiedBy);
    }
  });

  it("every projectModules[].entries id actually resolves to a real entry", () => {
    for (const module of listProjectModules()) {
      for (const id of module.entries) {
        expect(getEntry(id), `module "${module.id}" references entry "${id}"`).toBeDefined();
      }
    }
  });

  it("every entry's projectModules[] id actually resolves to a real module", () => {
    const moduleIds = new Set(listProjectModules().map((m) => m.id));
    for (const entry of listEntries()) {
      for (const moduleId of entry.projectModules) {
        expect(moduleIds.has(moduleId), `entry "${entry.id}" references module "${moduleId}"`).toBe(true);
      }
    }
  });
});

describe("tier gate", () => {
  it("only license.verifiedBy === 'human' can be marked Tier A", () => {
    expect(canMarkTierA({ license: { spdx: "MIT", verifiedBy: "human", verifiedAt: null } })).toBe(true);
    expect(canMarkTierA({ license: { spdx: "MIT", verifiedBy: "pending", verifiedAt: null } })).toBe(false);
    expect(canMarkTierA({ license: { spdx: null, verifiedBy: null, verifiedAt: null } })).toBe(false);
  });

  it("the tiamat case study: a 'pending' license never satisfies the gate even though the file itself is plain MIT", () => {
    const tiamat = getEntry("tiamat")!;
    expect(tiamat.license.spdx).toBe("MIT");
    expect(tiamat.license.verifiedBy).toBe("pending");
    expect(canMarkTierA(tiamat)).toBe(false);
    expect(tiamat.tier).toBe("B");
  });

  it("every Tier A entry in the real registry actually satisfies the gate", () => {
    for (const entry of listEntries()) {
      expect(isValidTierAssignment(entry), `${entry.id} claims tier ${entry.tier}`).toBe(true);
    }
  });

  it("every Tier A entry has a wrapping @3jse/* package; Tier B/reference entries never do", () => {
    for (const entry of listEntries()) {
      if (entry.tier === "A") expect(entry.package, entry.id).toMatch(/^@3jse\//);
      else expect(entry.package, entry.id).toBeNull();
    }
  });
});

describe("reference-tier entries", () => {
  it("minos is a reference entry (different runtime, algorithm-only) — not eligible for import", () => {
    const minos = getEntry("minos")!;
    expect(minos.tier).toBe("reference");
    expect(minos.stack.language).toBe("rust");
  });

  it("apate is a reference entry — a technique comparison, not a plugin", () => {
    expect(getEntry("apate")!.tier).toBe("reference");
  });

  it("quantum-core has no verifiable license and is correctly a reference entry with no package", () => {
    const quantumCore = getEntry("quantum-core")!;
    expect(quantumCore.license.spdx).toBeNull();
    expect(quantumCore.tier).toBe("reference");
  });
});

describe("entriesForModule", () => {
  it("resolves a module's entry ids into real entry objects", () => {
    const water = entriesForModule("water");
    expect(water.map((e) => e.id).sort()).toEqual(["poseidon", "tiamat", "webgpu-ocean-mpm"].sort());
  });

  it("an entry can appear under more than one module — tiamat under both water and fluid", () => {
    const water = entriesForModule("water").map((e) => e.id);
    const fluid = entriesForModule("fluid").map((e) => e.id);
    expect(water).toContain("tiamat");
    expect(fluid).toContain("tiamat");
  });

  it("returns an empty array for an unknown module id", () => {
    expect(entriesForModule("not-a-real-module")).toEqual([]);
  });
});

describe("rejected entries", () => {
  it("lists at least one rejected entry with a reason, not silently omitted", () => {
    const rejected = listRejected();
    expect(rejected.length).toBeGreaterThan(0);
    for (const r of rejected) {
      expect(r.reason, r.id).toBeTruthy();
    }
  });
});

describe("createMockFetcher", () => {
  it("stages a Tier B entry, carrying its real registry metadata through", async () => {
    const fetcher = createMockFetcher(() => new Date("2026-08-24T12:00:00.000Z"));
    const tiamat = getEntry("tiamat")!;

    const staged = await fetcher.stageTierB(tiamat);

    expect(staged.entryId).toBe("tiamat");
    expect(staged.stagedPath).toBe("/plugins/_vendor/tiamat/");
    expect(staged.licenseText).toContain("MIT License");
    expect(staged.staticInspection.some((line) => line.includes(tiamat.source))).toBe(true);
    expect(staged.stagedAt).toBe("2026-08-24T12:00:00.000Z");
  });

  it("refuses to stage a Tier A entry", async () => {
    const poseidon = getEntry("poseidon")!;
    await expect(createMockFetcher().stageTierB(poseidon)).rejects.toThrow(/not Tier B/);
  });

  it("refuses to stage a reference entry", async () => {
    const minos = getEntry("minos")!;
    await expect(createMockFetcher().stageTierB(minos)).rejects.toThrow(/not Tier B/);
  });

  it("an entry with no verifiable license (kimodo-cpp) still stages, with an honest placeholder license text", async () => {
    const kimodoCpp = getEntry("kimodo-cpp")!;
    const staged = await createMockFetcher().stageTierB(kimodoCpp);
    expect(staged.licenseText).toContain("not in this mock's table");
  });
});

describe("generateNoticesEntry", () => {
  it("includes title, source, commit, license, and the wrapping package for a Tier A entry", () => {
    const poseidon = getEntry("poseidon")!;
    const text = generateNoticesEntry(poseidon);
    expect(text).toContain("@3jse/water-poseidon");
    expect(text).toContain(poseidon.source);
    expect(text).toContain(poseidon.pinnedCommit!);
    expect(text).toContain("MIT");
  });

  it("includes staged license text for a Tier B entry when provided", async () => {
    const tiamat = getEntry("tiamat")!;
    const staged = await createMockFetcher().stageTierB(tiamat);
    expect(generateNoticesEntry(tiamat, staged)).toContain("MIT License");
  });

  it("handles an entry with no pinnedCommit (quantum-core) without crashing", () => {
    const quantumCore = getEntry("quantum-core")!;
    expect(generateNoticesEntry(quantumCore)).toContain("unpinned");
  });
});

describe("REGISTRY", () => {
  it("exposes the whole parsed file, including version/policy metadata", () => {
    expect(REGISTRY.version).toBe(1);
    expect(REGISTRY.policy).toBe("docs/VENDOR_INTEGRATIONS.md");
  });
});
