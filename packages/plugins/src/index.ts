// @3jse/plugins — the plugin manifest shape, host, and package-discovery surface
// (docs/PLUGIN_ARCHITECTURE.md, docs/ROADMAP.md Phase 6). Headless; the editor's plugin loader
// adds the panel/React glue on top.

export {
  EXTENSION_POINT_API_VERSIONS,
  checkCompatibility,
  type ExtensionPoint,
  type PluginManifest,
  type CompatIssue,
} from "./manifest.js";

export {
  PluginHost,
  type Plugin,
  type PluginContributions,
  type RegisteredPlugin,
  type ActivateContext,
} from "./PluginHost.js";

export {
  PACKAGE_CATALOG,
  findPackage,
  packagesForPhase,
  packagesByStatus,
  type PackageEntry,
} from "./catalog.js";
