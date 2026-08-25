/**
 * License notebook scanner — records every workspace dependency's license so
 * licensing is bookkeeping, not archaeology. Docs: VENDOR_INTEGRATIONS.md
 * ("Assemble-first posture"). Output: packages/vendor/licenses.json
 *
 * - workspace deps: license + repo pulled from the npm registry metadata
 *   (the registry's own field — recorded, not trusted: verifiedBy:"npm-registry")
 * - vendor registry entries: merged with their human-verified status
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE = new Set(["@types/three"]); // types mirror the lib's own license; skip noise

// Human-verified overrides for packages whose npm metadata lacks a license field.
// Verified against the repo LICENSE file (see docs/VENDOR_INTEGRATIONS.md).
const OVERRIDES = {
  "@galacean/editor-ui": {
    license: "MIT",
    note: "No license field in the npm package.json; repo LICENSE is MIT — human-verified (VENDOR_INTEGRATIONS.md case study).",
  },
};

async function workspaceDeps() {
  const pkgs = [];
  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  pkgs.push(rootPkg);
  for (const dir of ["packages", "apps"]) {
    for (const sub of await readdir(join(root, dir))) {
      const p = join(root, dir, sub, "package.json");
      try { pkgs.push(JSON.parse(await readFile(p, "utf8"))); } catch { /* no package.json */ }
    }
  }
  const deps = new Map();
  for (const p of pkgs) {
    for (const [name, range] of Object.entries({ ...p.dependencies, ...p.devDependencies, ...p.peerDependencies })) {
      if (name.startsWith("@3jse/") || name.startsWith("@types/") || IGNORE.has(name)) continue;
      if (!deps.has(name)) deps.set(name, range);
    }
  }
  return deps;
}

async function npmMeta(name, range) {
  // 1. the actually-installed package.json — source of truth.
  //    pnpm keeps real packages under node_modules/.pnpm/<name>@<version>/node_modules/<name>;
  //    resolve by scanning that dir (handles scoped names, unhoisted packages).
  try {
    const store = join(root, "node_modules", ".pnpm");
    const prefix = name.replace("/", "+") + "@";
    for (const dir of await readdir(store)) {
      if (!dir.startsWith(prefix)) continue;
      const p = join(store, dir, "node_modules", ...name.split("/"), "package.json");
      const m = JSON.parse(await readFile(p, "utf8"));
      const override = OVERRIDES[name] ?? {};
      const repo = (m.repository?.url || "").replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\/github\.com/, "https://github.com");
      return {
        name,
        version: m.version,
        range,
        license: override.license ?? (typeof m.license === "string" ? m.license : m.license?.type ?? ""),
        repo,
        homepage: m.homepage || "",
        verifiedBy: override.license ? "human" : "installed-package-json",
        note: override.note ?? "",
      };
    }
  } catch { /* store unreadable — fall through to the registry */ }
  // 2. npm registry metadata (recorded, not trusted)
  const version = (range.match(/\d+\.\d+\.\d+/) || [null])[0];
  const url = version
    ? `https://registry.npmjs.org/${name}/${version}`
    : `https://registry.npmjs.org/${name}/latest`;
  const res = await fetch(url);
  if (!res.ok) return { name, range, license: "", repo: "", note: `registry lookup failed (${res.status})` };
  const m = await res.json();
  const repo = m.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\/github\.com/, "https://github.com") || "";
  return {
    name,
    version: m.version,
    range,
    license: typeof m.license === "string" ? m.license : m.license?.type ?? "",
    repo,
    homepage: m.homepage || "",
  };
}

async function main() {
  const deps = await workspaceDeps();
  const entries = [];
  for (const [name, range] of [...deps].sort(([a], [b]) => a.localeCompare(b))) {
    const m = await npmMeta(name, range);
    entries.push({
      name: m.name,
      version: m.version,
      range,
      license: m.license || "",
      repo: m.repo,
      verifiedBy: m.verifiedBy || "npm-registry",
      scope: "workspace-dependency",
      note: m.note || "",
    });
    console.log(`${m.name}@${m.version}  ${m.license || "?"}  ${m.repo}`);
  }

  // vendored upstream repos (packages/vendor/upstream/*) — LICENSE file read at the pin
  const SPDX_HINTS = [
    ["MIT License", "MIT"], ["MIT", "MIT"], ["Apache License", "Apache-2.0"],
    ["GNU GENERAL PUBLIC LICENSE", "GPL-3.0"], ["GNU AFFERO", "AGPL-3.0"],
    ["BSD", "BSD"], ["Zlib", "Zlib"], ["ISC", "ISC"], ["Mozilla Public", "MPL-2.0"],
  ];
  const upstreamRoot = join(root, "packages", "vendor", "upstream");
  try {
    for (const id of await readdir(upstreamRoot)) {
      const up = join(upstreamRoot, id);
      let license = "", note = "";
      try {
        const text = await readFile(join(up, "LICENSE"), "utf8");
        for (const [needle, spdx] of SPDX_HINTS) {
          if (text.slice(0, 400).includes(needle)) { license = spdx; break; }
        }
        if (!license) note = "LICENSE present but pattern unrecognized — human read required";
      } catch { note = "no LICENSE file at pin"; }
      let repo = "", pkgName = "";
      try {
        const pj = JSON.parse(await readFile(join(up, "package.json"), "utf8"));
        pkgName = pj.name || "";
        repo = (pj.repository?.url || "").replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\/github\.com/, "https://github.com");
      } catch { /* demo repos may lack package.json */ }
      entries.push({
        name: id,
        pkgName,
        source: `github.com/owenyuwono/${id}`,
        license,
        repo,
        verifiedBy: "", // machine pattern-match; registry merge below carries the human verdict
        scope: "vendored-upstream",
        vendored: `packages/vendor/upstream/${id}`,
        note,
      });
    }
  } catch { /* no upstream dir */ }

  // merge human-verified vendor registry entries (registry.json lives in src/ now)
  try {
    const reg = JSON.parse(await readFile(join(root, "packages", "vendor", "src", "registry.json"), "utf8"));
    for (const e of reg.entries || []) {
      entries.push({
        name: e.id,
        source: e.source || "",
        pinnedCommit: e.pinnedCommit || "",
        license: e.license?.spdx || "",
        licenseNote: e.license?.note || "",
        verifiedBy: e.license?.verifiedBy || "",
        scope: "vendor-registry",
        tier: e.tier || "",
      });
    }
  } catch (e) {
    console.warn("vendor registry merge skipped:", e.message);
  }

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    policy: "docs/VENDOR_INTEGRATIONS.md (Assemble-first posture)",
    notes:
      "verifiedBy values: 'human' (LICENSE file read at pinned revision), 'npm-registry' (registry metadata — recorded, not trusted), '' (unverified). Prefer MIT / Apache-2.0 / BSD / GPL-compatible imports; GPL imports are fine (3JSE is GPL-3.0) but their copyleft flows onward — see policy.",
    entries,
  };
  await writeFile(join(root, "packages", "vendor", "licenses.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`\nlicenses.json written: ${entries.length} entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
