// @3jse/packaging — the Publish pipeline as data (docs/BUILD_DEPLOYMENT.md). Headless: computes
// the deterministic build plan, manifest, third-party notices, publish-gate result, and the
// generated static-host files. An esbuild/rollup step (CLI/editor) executes the plan.

export { planBuild, type PlanInput } from "./plan.js";
export { checkPublishGate, type GateInput } from "./gate.js";
export { publish, generateThirdPartyNotices, type PublishInput } from "./publish.js";
export { fnv1a, stableStringify } from "./hash.js";
export type {
  BuildTarget,
  QualityTier,
  BuildOptions,
  AssetInput,
  PackagedAsset,
  PackagedChunk,
  ThirdPartyNotice,
  PublishGateIssue,
  BuildManifest,
  PublishResult,
} from "./types.js";
