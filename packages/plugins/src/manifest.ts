// Plugin manifest + extension-point API versioning — docs/PLUGIN_ARCHITECTURE.md.
//
// "The same extension points an official package uses, with no private API tier." A plugin
// declares which extension-point API versions it targets; the host warns (never silently
// fails) when the running engine doesn't satisfy that range.

/** The extension points a plugin can register against (docs/PLUGIN_ARCHITECTURE.md table). */
export type ExtensionPoint =
  | "components"
  | "systems"
  | "resources"
  | "graphNodes"
  | "materialNodes"
  | "editorPanels"
  | "inspectorFields"
  | "importers"
  | "agentTools"
  | "buildTargets";

/** Semver-major each extension-point API is currently at, in the running engine. Bumped
 *  independently of the engine version — a breaking change to the Component-schema API is a
 *  major bump on `components` only (docs/PLUGIN_ARCHITECTURE.md "Stability contract"). */
export const EXTENSION_POINT_API_VERSIONS: Record<ExtensionPoint, number> = {
  components: 1,
  systems: 1,
  resources: 1,
  graphNodes: 0, // not stabilized yet
  materialNodes: 0,
  editorPanels: 1,
  inspectorFields: 0,
  importers: 0,
  agentTools: 1,
  buildTargets: 0,
};

export interface PluginManifest {
  /** "@3jse/foo" for official, "community/foo" for third-party — no privilege gap either way. */
  id: string;
  version: string;
  official?: boolean;
  description?: string;
  capabilities?: string[];
  /** major version of each extension-point API this plugin was written against. A plugin that
   *  only uses `components` and `systems` lists just those two. */
  api: Partial<Record<ExtensionPoint, number>>;
}

export interface CompatIssue {
  point: ExtensionPoint;
  level: "warn" | "error";
  message: string;
}

/** Compare a manifest's targeted API majors against the running engine's.
 *  - same major            -> ok
 *  - engine major higher    -> warn (deprecation window; plugin may still work)
 *  - engine major lower / point at v0 -> error (API not available / not stabilized)
 */
export function checkCompatibility(
  manifest: PluginManifest,
  engine: Record<ExtensionPoint, number> = EXTENSION_POINT_API_VERSIONS,
): CompatIssue[] {
  const issues: CompatIssue[] = [];
  for (const [pointStr, wanted] of Object.entries(manifest.api)) {
    const point = pointStr as ExtensionPoint;
    const have = engine[point];
    if (have === undefined) {
      issues.push({ point, level: "error", message: `unknown extension point "${point}"` });
      continue;
    }
    if (have === 0) {
      issues.push({ point, level: "error", message: `extension point "${point}" is not stabilized in this engine (v0)` });
    } else if (wanted > have) {
      issues.push({ point, level: "error", message: `plugin targets ${point} API v${wanted}, engine provides v${have}` });
    } else if (wanted < have) {
      issues.push({
        point,
        level: "warn",
        message: `plugin targets ${point} API v${wanted}, engine is at v${have} — still supported, update before the next major`,
      });
    }
  }
  return issues;
}
