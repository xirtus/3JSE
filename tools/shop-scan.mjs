/**
 * Shop scanner — generates candidate shop entries for human review.
 * Docs: docs/SHOP.md. Output: packages/vendor/shop-candidates.json
 *
 * Sources:
 *  1. threejs.org/examples/files.json — the official examples shelf (MIT).
 *  2. GitHub topic:threejs search via `gh api` (authenticated rate limits).
 *
 * The API license field is a HINT, never a verdict — candidates always
 * carry verifiedBy:"" and must be human-reviewed before shop.json.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const THREE_RELEASE = process.env.THREE_RELEASE || "r185";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

function gh(...args) {
  return JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

// ---- source 1: official three.js examples shelf ----
async function scanOfficialExamples() {
  const index = await fetchJson("https://threejs.org/examples/files.json");
  const out = [];
  for (const [group, slugs] of Object.entries(index)) {
    for (const slug of slugs) {
      out.push({
        id: `threejs-${slug.replaceAll("_", "-")}`,
        category: "example",
        group,
        title: `${group} / ${slug.replaceAll("_", " ")}`,
        author: "Three.js project",
        source: {
          repo: "github.com/mrdoob/three.js",
          pinnedCommit: THREE_RELEASE,
          liveDemo: `https://threejs.org/examples/#${slug}`,
          sourceFile: `https://github.com/mrdoob/three.js/blob/${THREE_RELEASE}/examples/${slug}.html`,
        },
        license: { spdx: "MIT", verifiedBy: "", verifiedAt: "", note: "three.js repo is MIT; shelf-wide, pending entry review" },
        tags: ["official", group],
        aiGenerated: false,
      });
    }
  }
  return out;
}

// ---- source 2: GitHub discovery ----
function scanGithub(query) {
  const q = `topic:threejs ${query} stars:>200`;
  const res = gh(`search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100`);
  return (res.items || []).map((r) => ({
    id: `gh-${r.full_name.replace("/", "--").toLowerCase()}`,
    category: "candidate",
    title: r.full_name,
    author: r.owner?.login ?? "",
    source: { repo: r.full_name, homepage: r.homepage || "" },
    stars: r.stargazers_count,
    description: r.description || "",
    updatedAt: r.updated_at,
    license: { spdx: r.license?.spdx_id || "", verifiedBy: "", verifiedAt: "", note: "GitHub API field — hint only, never a verdict" },
    tags: [],
    aiGenerated: false,
  }));
}

async function main() {
  const examples = await scanOfficialExamples();
  const ghCandidates = [
    ...scanGithub("topic:webgpu"),
    ...scanGithub("topic:shader"),
    ...scanGithub("topic:game"),
  ];
  const seen = new Set();
  const merged = [...examples, ...ghCandidates].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    policy: "docs/SHOP.md",
    notes:
      "Candidates only — nothing here is published. Every entry needs human review before it may be added to shop.json. GitHub license fields are hints, never verdicts (see the tiamat BOM case in VENDOR_INTEGRATIONS.md).",
    entries: merged,
  };
  const dest = join(root, "packages", "vendor", "shop-candidates.json");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(out, null, 2) + "\n");
  console.log(`shop-candidates.json written: ${merged.length} candidates (${examples.length} official examples, ${ghCandidates.length} GitHub)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
