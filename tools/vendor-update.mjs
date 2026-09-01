/**
 * Vendor update tracker — the "others maintain the wheel, we track it" tool.
 * Reports how far each vendored upstream has drifted from its pin, whether a
 * newer three.js release exists, and which npm deps are outdated.
 * Run: node tools/vendor-update.mjs   (report only — never mutates)
 */
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function gh(...args) {
  try { return JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8" })); }
  catch { return null; }
}
const ghRepo = (owner, repo) => gh(`repos/${owner}/${repo}`);

async function upstreamDrift() {
  const reg = JSON.parse(await readFile(join(root, "packages", "vendor", "src", "registry.json"), "utf8"));
  const vendored = reg.entries.filter((e) => e.vendored);
  console.log(`Vendored upstream (${vendored.length}):\n`);
  const rows = await Promise.all(vendored.map(async (e) => {
    const m = e.source.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!m) return [e.id, "?", "no source"];
    const repo = ghRepo(m[1], m[2]);
    if (!repo) return [e.id, "?", "api error"];
    const head = gh(`repos/${m[1]}/${m[2]}/commits?per_page=1&sha=${repo.default_branch}`);
    const latestSha = head?.[0]?.sha ?? "?";
    const behind = head?.[0] && e.pinnedCommit !== latestSha ? "BEHIND" : "current";
    return [e.id, latestSha.slice(0, 7), behind];
  }));
  for (const [id, sha, status] of rows) console.log(`  ${status === "BEHIND" ? "⚠ " : "✓ "}${id.padEnd(20)} pin ${sha}  ${status}`);
  return rows.filter((r) => r[2] === "BEHIND").length;
}

async function threeDrift() {
  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const installed = rootPkg.devDependencies?.three ?? rootPkg.dependencies?.three ?? "?";
  const latest = gh("repos/mrdoob/three.js/releases/latest")?.tag_name ?? "?";
  const behind = latest !== "?" && !installed.includes(latest.replace(/^r/, "").replace(/^v/, ""));
  console.log(`\nthree.js: installed ${installed} — latest release ${latest}${behind ? "  ⚠ BEHIND" : "  ✓"}`);
  return behind ? 1 : 0;
}

async function npmDrift() {
  console.log("\nnpm workspace deps vs latest:");
  const depFiles = [];
  const rootPkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  depFiles.push(rootPkg);
  for (const dir of ["packages", "apps"]) {
    for (const sub of await readdir(join(root, dir))) {
      try { depFiles.push(JSON.parse(await readFile(join(root, dir, sub, "package.json"), "utf8"))); } catch { /* skip */ }
    }
  }
  const wanted = new Map();
  for (const p of depFiles)
    for (const [n, r] of Object.entries({ ...p.dependencies, ...p.devDependencies, ...p.peerDependencies }))
      if (!n.startsWith("@3jse/") && !n.startsWith("@types/")) wanted.set(n, r);

  let outdated = 0;
  try {
    const raw = execFileSync("pnpm", ["outdated", "-r", "--format", "json"], { encoding: "utf8", cwd: root, maxBuffer: 16 * 1024 * 1024 });
    const map = JSON.parse(raw || "{}");
    for (const [name, info] of Object.entries(map)) {
      console.log(`  ⚠ ${name.padEnd(28)} ${info.current} → ${info.latest}`);
      outdated++;
    }
  } catch (e) { /* pnpm exits 1 when outdated exist; stdout still carries the JSON */ }
  if (!outdated) console.log("  ✓ all current");
  return outdated;
}

const [up, th, np] = [await upstreamDrift(), await threeDrift(), await npmDrift()];
console.log(`\n${up} upstream behind · ${th} three drift · ${np} npm outdated. Review, then bump pins deliberately — updates are adoption decisions, not automatic.`);
