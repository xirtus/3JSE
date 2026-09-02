// @3jse/atlas — the Atlas Semantic Core (docs/3JSE_ATLAS_FULL_PLAN.md §54, §63).
//
// Headless: a semantic model over a 3JSE project (systems, feel, providers, assets, tests,
// runtime health) plus the agent-scoping and search that make it navigable. The editor's
// AtlasPanel renders this; nothing here needs a DOM. Atlas is generated from the project and is
// never the source of program logic (§2.1, §60).

export {
  defineSystem,
  SystemRegistry,
  systemRegistry,
  knobValue,
  type AtlasSystemSpec,
  type AtlasKnob,
  type AtlasDomain,
} from "./defineSystem.js";

export {
  parseFeelSpec,
  resolveInheritance,
  resolveFeel,
  checkProtected,
  feelDelta,
  type FeelSpec,
  type FeelSpecIssue,
  type ProtectedViolation,
} from "./feelspec.js";

export {
  deriveHealth,
  type HealthStatus,
  type HealthResult,
  type SystemEvidence,
} from "./health.js";

export {
  compileAtlas,
  childrenOf,
  focusDomain,
  type AtlasModel,
  type AtlasNode,
  type AtlasEdge,
  type AtlasNodeType,
  type AtlasEdgeKind,
  type CompileInput,
  type ProviderMeta,
  type AssetMeta,
} from "./compile.js";

export {
  layoutAtlas,
  type AtlasLayout,
  type NodeBox,
  type LayoutOptions,
  type LayoutInput,
} from "./layout.js";

export {
  exportAgentContext,
  previewChange,
  type AgentContextPackage,
  type AgentAction,
  type ExportOptions,
} from "./agentContext.js";

export { searchAtlas, type SearchResult, type SearchKind } from "./search.js";

export { DOMAIN_COLOR, HEALTH_COLOR, HEALTH_GLYPH } from "./colors.js";

// v0.2 — additional lenses (§5), A/B FeelSpec (§16), atlas/ manifest (§44)
export {
  eventLens,
  performanceLens,
  providerLens,
  assetLens,
  stateMachineLens,
  gameplayFlowLens,
  type LensGraph,
} from "./lenses.js";
export {
  feelABTable,
  mergeFeel,
  feelABSummary,
  type FeelABRow,
} from "./feelAB.js";
export { parseAtlasManifest, type AtlasManifest } from "./manifest.js";
