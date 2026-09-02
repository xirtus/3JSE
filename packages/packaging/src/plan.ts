// planBuild — the deterministic Publish plan (docs/BUILD_DEPLOYMENT.md §Publish steps 1–5).

import { fnv1a, stableStringify } from "./hash.js";
import type {
  AssetInput,
  BuildManifest,
  BuildOptions,
  PackagedAsset,
  PackagedChunk,
  ThirdPartyNotice,
} from "./types.js";

export interface PlanInput {
  projectName: string;
  engine: string;
  /** package name -> semver range, from the project manifest's `dependencies` */
  dependencies: Record<string, string>;
  /** the capabilities the project actually exercises — a package whose capability is unused is
   *  tree-shaken out (docs/PLUGIN_ARCHITECTURE.md "a game depends only on the systems it uses").
   *  Provide package names here; anything in `dependencies` not listed is dropped. */
  usedPackages: string[];
  /** scene ids for code-splitting (docs/BUILD_DEPLOYMENT.md step 4) */
  scenes: string[];
  startScene: string | null;
  assets: AssetInput[];
  /** 3JSE Graph files that will be compiled to JS (step 3) */
  graphs?: string[];
  /** attribution rows from @3jse/vendor's registry for shipped Tier A packages (step 6) */
  notices?: ThirdPartyNotice[];
}

/** Per-target texture/mesh finalization (docs/BUILD_DEPLOYMENT.md step 2). */
const TEXTURE_FORMAT: Record<BuildOptions["target"], string> = {
  "static-web": "ktx2",
  pwa: "ktx2",
  desktop: "ktx2",
  mobile: "astc-ktx2",
  xr: "ktx2",
};

export function planBuild(input: PlanInput, opts: BuildOptions): BuildManifest {
  const keepLods = opts.keepLodTiers ?? [0];

  // 1. tree-shake
  const declared = Object.keys(input.dependencies).sort();
  const used = new Set(input.usedPackages);
  const packages = declared.filter((p) => used.has(p));
  const treeShakenOut = declared.filter((p) => !used.has(p));

  // 2. asset finalization
  const assets: PackagedAsset[] = input.assets.map((a) => {
    const dropped = a.lodTier != null && !keepLods.includes(a.lodTier);
    const transform =
      dropped ? "dropped"
      : a.kind === "texture" ? TEXTURE_FORMAT[opts.target]
      : a.kind === "mesh" ? "meshopt+draco"
      : a.kind === "audio" ? "opus"
      : "passthrough";
    const hash = fnv1a(a.content);
    const ext =
      a.kind === "texture" ? ".ktx2"
      : a.kind === "audio" ? ".opus"
      : a.path.slice(a.path.lastIndexOf("."));
    const outPath = dropped ? a.path : a.path.replace(/\.[^.]+$/, `.${hash}${ext}`);
    return {
      path: a.path,
      outPath,
      kind: a.kind,
      hash,
      transform,
      bytes: dropped ? 0 : Math.round(a.content.length * (a.kind === "texture" ? 0.35 : a.kind === "mesh" ? 0.5 : 0.8)),
      dropped,
      dropReason: dropped ? `LOD tier ${a.lodTier} not kept for target ${opts.target}` : undefined,
    };
  });

  // 3. graph compilation (list only — the emit is @3jse/ir's job)
  const compiledGraphs = [...(input.graphs ?? [])].sort();

  // 4. code-split: an entry chunk + one lazy chunk per non-start scene
  const chunks: PackagedChunk[] = [
    { name: "entry", scene: null, modules: ["@3jse/runtime", ...packages].sort() },
    ...input.scenes
      .filter((s) => s !== input.startScene)
      .map((s): PackagedChunk => ({ name: s, scene: s, modules: [`scene:${s}`] })),
  ];

  // 5. manifest + build id
  const notices = [...(input.notices ?? [])].sort((a, b) => a.packageName.localeCompare(b.packageName));
  const codeBytesEstimate = packages.length * 12_000 + 40_000; // rough; the bundler produces the real number
  const totalBytes = assets.reduce((n, a) => n + a.bytes, 0) + codeBytesEstimate;

  const draft: Omit<BuildManifest, "buildId"> = {
    schemaVersion: 1,
    project: input.projectName,
    engine: input.engine,
    target: opts.target,
    tier: opts.tier,
    packages,
    treeShakenOut,
    chunks,
    assets,
    compiledGraphs,
    notices,
    totalBytes,
  };
  return { ...draft, buildId: fnv1a(stableStringify(draft)) };
}
