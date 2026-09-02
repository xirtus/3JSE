// docs/BUILD_DEPLOYMENT.md — the Publish pipeline as data. This package computes the
// deterministic *plan* + manifest + notices; an esbuild/rollup step (CLI/editor) executes it.
// Headless and pure, like @3jse/project.

export type BuildTarget = "static-web" | "pwa" | "desktop" | "mobile" | "xr";

export type QualityTier = "ultra" | "high" | "medium" | "low";

export interface AssetInput {
  /** project-relative path */
  path: string;
  /** raw bytes as a string (or a hash the caller already computed) — used for content hashing */
  content: string;
  kind: "texture" | "mesh" | "audio" | "animation" | "data" | "other";
  /** LOD tier this asset belongs to, if any (0 = base) */
  lodTier?: number;
}

export interface BuildOptions {
  target: BuildTarget;
  /** default quality tier baked into this target's variant (docs/PERFORMANCE.md) */
  tier: QualityTier;
  /** which LOD tiers to keep for this target (others are dropped) */
  keepLodTiers?: number[];
  /** minify / drop dev-only code */
  production?: boolean;
}

export interface PackagedAsset {
  path: string;
  /** finalized output path (may change extension after transcode) */
  outPath: string;
  kind: AssetInput["kind"];
  /** content hash for CDN cache-busting + build verification (docs/AI_AGENT_API.md) */
  hash: string;
  /** e.g. "ktx2", "meshopt", "draco", "passthrough" */
  transform: string;
  bytes: number;
  dropped: boolean;
  dropReason?: string;
}

export interface PackagedChunk {
  /** logical name — "entry" or a scene id */
  name: string;
  /** module specifiers this chunk pulls in (post tree-shake) */
  modules: string[];
  /** scene this chunk lazy-loads for, or null for the entry chunk */
  scene: string | null;
}

export interface ThirdPartyNotice {
  packageName: string;
  source: string;
  license: string;
  author: string;
}

export interface PublishGateIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

export interface BuildManifest {
  schemaVersion: 1;
  project: string;
  engine: string;
  target: BuildTarget;
  tier: QualityTier;
  /** @3jse/* + community packages actually shipped, after tree-shaking unused deps */
  packages: string[];
  /** packages removed because nothing in the project uses their capability */
  treeShakenOut: string[];
  chunks: PackagedChunk[];
  assets: PackagedAsset[];
  /** 3JSE Graph files compiled to JS (zero interpreter shipped) */
  compiledGraphs: string[];
  notices: ThirdPartyNotice[];
  /** total shipped bytes (assets + a rough code estimate) */
  totalBytes: number;
  /** deterministic hash of the whole manifest — the build id */
  buildId: string;
}

export interface PublishResult {
  ok: boolean;
  manifest: BuildManifest | null;
  issues: PublishGateIssue[];
  /** generated files ready for a static host (index.html, bootstrap, manifest.json, NOTICES) */
  files: Record<string, string>;
}
