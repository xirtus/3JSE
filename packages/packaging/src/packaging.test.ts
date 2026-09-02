import { describe, expect, it } from "vitest";
import { planBuild, publish, checkPublishGate, generateThirdPartyNotices } from "./index.js";
import type { AssetInput, BuildOptions } from "./index.js";

const deps = {
  "@3jse/runtime": "workspace:*",
  "@3jse/character": "workspace:*",
  "@3jse/physics-rapier": "workspace:*",
  "@3jse/networking": "workspace:*", // declared but unused -> tree-shaken
};

const assets: AssetInput[] = [
  { path: "assets/hero.glb", content: "x".repeat(1000), kind: "mesh" },
  { path: "assets/albedo.png", content: "y".repeat(2000), kind: "texture" },
  { path: "assets/hero_lod2.glb", content: "z".repeat(800), kind: "mesh", lodTier: 2 },
  { path: "audio/theme.wav", content: "w".repeat(500), kind: "audio" },
];

const base: Parameters<typeof planBuild>[0] = {
  projectName: "Demo",
  engine: "0.0.0",
  dependencies: deps,
  usedPackages: ["@3jse/runtime", "@3jse/character", "@3jse/physics-rapier"],
  scenes: ["level_main", "level_boss"],
  startScene: "level_main",
  assets,
  graphs: ["graphs/door.json"],
};

const opts: BuildOptions = { target: "static-web", tier: "high", keepLodTiers: [0], production: true };

describe("planBuild", () => {
  it("tree-shakes unused packages", () => {
    const m = planBuild(base, opts);
    expect(m.packages).toEqual(["@3jse/character", "@3jse/physics-rapier", "@3jse/runtime"]);
    expect(m.treeShakenOut).toEqual(["@3jse/networking"]);
  });

  it("drops LOD tiers not kept for the target, transcodes the rest, hashes content", () => {
    const m = planBuild(base, opts);
    const lod2 = m.assets.find((a) => a.path === "assets/hero_lod2.glb")!;
    expect(lod2.dropped).toBe(true);
    expect(lod2.bytes).toBe(0);
    const tex = m.assets.find((a) => a.path === "assets/albedo.png")!;
    expect(tex.transform).toBe("ktx2");
    expect(tex.outPath).toMatch(/albedo\.[0-9a-f]{8}\.ktx2$/);
    const audio = m.assets.find((a) => a.kind === "audio")!;
    expect(audio.transform).toBe("opus");
  });

  it("code-splits: entry chunk + one lazy chunk per non-start scene", () => {
    const m = planBuild(base, opts);
    expect(m.chunks.map((c) => c.name)).toEqual(["entry", "level_boss"]);
    expect(m.chunks[0]!.modules).toContain("@3jse/runtime");
  });

  it("is deterministic — same inputs, same buildId", () => {
    expect(planBuild(base, opts).buildId).toBe(planBuild(base, opts).buildId);
    expect(planBuild(base, opts).buildId).not.toBe(planBuild(base, { ...opts, target: "mobile" }).buildId);
  });

  it("mobile target uses an ASTC texture format", () => {
    const m = planBuild(base, { ...opts, target: "mobile" });
    expect(m.assets.find((a) => a.kind === "texture")!.transform).toBe("astc-ktx2");
  });
});

describe("checkPublishGate", () => {
  it("FAILS on a referenced-but-unattributed staged import", () => {
    const m = planBuild(base, opts);
    const issues = checkPublishGate({
      manifest: m,
      stagedVendorPaths: ["plugins/_vendor/coolwater"],
      referenced: { "plugins/_vendor/coolwater": true },
    });
    expect(issues.some((i) => i.level === "error" && i.code === "unattributed-staged-import")).toBe(true);
  });

  it("passes when the staged import was promoted, or is unused (warn only)", () => {
    const m = planBuild(base, opts);
    const promoted = checkPublishGate({
      manifest: m,
      stagedVendorPaths: ["plugins/_vendor/coolwater"],
      referenced: { "plugins/_vendor/coolwater": true },
      promoted: { "plugins/_vendor/coolwater": { packageName: "community/coolwater", source: "gh", license: "MIT", author: "x" } },
    });
    expect(promoted.every((i) => i.level !== "error")).toBe(true);

    const unused = checkPublishGate({
      manifest: m,
      stagedVendorPaths: ["plugins/_vendor/coolwater"],
      referenced: { "plugins/_vendor/coolwater": false },
    });
    expect(unused.some((i) => i.level === "warn" && i.code === "unused-staged-import")).toBe(true);
    expect(unused.some((i) => i.level === "error")).toBe(false);
  });
});

describe("publish", () => {
  it("emits index.html, bootstrap.js, manifest.json, NOTICES for static-web", () => {
    const r = publish(base, opts);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.files).sort()).toEqual(["THIRD_PARTY_NOTICES.md", "bootstrap.js", "index.html", "manifest.json"]);
    expect(r.files["index.html"]).toContain("<canvas id=\"game\">");
    expect(r.files["bootstrap.js"]).toContain('START_SCENE = "level_main"');
    expect(r.files["bootstrap.js"]).toContain("world.step(dt)");
  });

  it("pwa target adds a webmanifest + service worker keyed to the build id", () => {
    const r = publish(base, { ...opts, target: "pwa" });
    expect(r.files["sw.js"] ?? "").toContain(`3jse-${r.manifest!.buildId}`);
    expect(JSON.parse(r.files["manifest.webmanifest"] ?? "{}").display).toBe("fullscreen");
  });

  it("a gate error blocks the build: ok=false, no host files", () => {
    const blocked = publish(
      { ...base, gate: { stagedVendorPaths: ["_vendor/x"], referenced: { "_vendor/x": true } } },
      opts,
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.files).toEqual({});
    expect(blocked.manifest).not.toBeNull(); // still returned for inspection
  });
});

describe("generateThirdPartyNotices", () => {
  it("lists each component, or says there are none", () => {
    expect(generateThirdPartyNotices([])).toContain("ships no third-party code");
    const md = generateThirdPartyNotices([
      { packageName: "@3jse/water-poseidon", source: "github.com/owenyuwono/poseidon", license: "MIT", author: "Owen Yuwono" },
    ]);
    expect(md).toContain("## @3jse/water-poseidon");
    expect(md).toContain("License: MIT");
  });
});
