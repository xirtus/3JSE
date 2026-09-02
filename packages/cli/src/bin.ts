#!/usr/bin/env node
// The `3jse` executable. Reads a project directory, runs publish, writes the output.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { parseArgs } from "./args.js";
import { runPublish } from "./publish.js";
import { PACKAGE_CATALOG } from "@3jse/plugins";
import type { BuildTarget, QualityTier } from "@3jse/packaging";

const { command, flags, bools } = parseArgs(process.argv.slice(2));

function readDirRecursive(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[relative(root, full).split("\\").join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(root);
  return out;
}

async function main() {
  if (!command || command === "help" || bools.has("help")) {
    console.log(`3jse — 3JSE engine CLI

  3jse publish [projectDir]   Build a shippable bundle (docs/BUILD_DEPLOYMENT.md)
    --target <t>              static-web | pwa | desktop | mobile | xr   (default static-web)
    --tier <q>               ultra | high | medium | low                (default high)
    --out <dir>              output directory                            (default ./dist)

  3jse info                   List the official @3jse/* package catalog
`);
    return;
  }

  if (command === "info") {
    for (const p of PACKAGE_CATALOG) console.log(`${p.status.padEnd(8)} ${p.id.padEnd(24)} ${p.capability}`);
    return;
  }

  if (command === "publish") {
    const projectDir = flags.projectDir ?? process.argv.slice(2).find((a) => !a.startsWith("--") && a !== "publish") ?? ".";
    const outDir = flags.out ?? "dist";
    const target = (flags.target ?? "static-web") as BuildTarget;
    const tier = (flags.tier ?? "high") as QualityTier;

    let projectFiles: Record<string, string>;
    try {
      projectFiles = statSync(projectDir).isDirectory() ? readDirRecursive(projectDir) : {};
    } catch {
      console.error(`3jse publish: cannot read project directory "${projectDir}"`);
      process.exit(1);
    }

    const manifestFile = projectFiles["project.json"] ?? projectFiles["3jse.json"];
    const manifest = manifestFile ? (JSON.parse(manifestFile) as Record<string, unknown>) : {};

    const result = await runPublish(
      {
        projectName: (manifest.name as string) ?? "Untitled",
        engine: (manifest.engine as string) ?? "0.0.0",
        dependencies: (manifest.dependencies as Record<string, string>) ?? Object.fromEntries(PACKAGE_CATALOG.map((p) => [p.id, "workspace:*"])),
        usedPackages: (manifest.dependencies ? Object.keys(manifest.dependencies as object) : ["@3jse/runtime"]),
        scenes: (manifest.scenes as string[]) ?? [],
        startScene: (manifest.startScene as string) ?? null,
        projectFiles,
        target,
        tier,
      },
      async (src) => {
        // esbuild is an optional peer — loaded by specifier so tsc doesn't require its types.
        const spec = "esbuild";
        const esbuild = (await import(spec).catch(() => null)) as
          | { transform: (s: string, o: object) => Promise<{ code: string }> }
          | null;
        if (!esbuild) throw new Error("esbuild not installed");
        const r = await esbuild.transform(src, { minify: true, format: "esm", target: "es2022" });
        return r.code;
      },
    );

    for (const i of result.issues) console.error(`  ${i.level}: ${i.message}`);
    if (!result.ok) {
      console.error("3jse publish: BLOCKED — fix the errors above.");
      process.exit(1);
    }

    mkdirSync(outDir, { recursive: true });
    for (const [path, content] of Object.entries(result.files)) {
      const dest = join(outDir, path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
    console.log(`3jse publish: ${target}/${tier} -> ${outDir}/  (buildId ${result.buildId}, ${result.bundled ? "bundled" : "run build.mjs to bundle"})`);
    return;
  }

  console.error(`3jse: unknown command "${command}" — try \`3jse help\``);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
