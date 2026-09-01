// Plugin host — registers a plugin's contributions against the typed extension points and
// keeps a discovery list. docs/PLUGIN_ARCHITECTURE.md: "adding a subsystem is a small,
// predictable, well-bounded operation."

import type { SystemDef, World } from "@3jse/runtime";
import {
  checkCompatibility,
  EXTENSION_POINT_API_VERSIONS,
  type CompatIssue,
  type ExtensionPoint,
  type PluginManifest,
} from "./manifest.js";

/** What a plugin actually contributes. Every field is optional — a pure-gameplay plugin uses
 *  just `components` + `systems`; a subsystem plugin uses many, through the same shape. */
export interface PluginContributions {
  /** Register Component schemas as a side effect (calls `registerComponent`). Runs once. */
  components?: () => void;
  /** Return SystemDefs to add to a World's scheduler. */
  systems?: () => SystemDef[];
  /** Set global Resources/Services on the World. */
  resources?: (world: World) => void;
  /** MCP-shaped agent tools — the server is passed opaque so this package needn't depend on
   *  the MCP SDK; the editor/CLI casts it. */
  agentTools?: (server: unknown) => void;
  /** Editor panel definitions — opaque here (React lives in the editor). The editor's plugin
   *  loader casts these to its PanelDef shape. */
  editorPanels?: () => unknown[];
}

export interface Plugin {
  manifest: PluginManifest;
  contributions: PluginContributions;
}

export interface RegisteredPlugin {
  manifest: PluginManifest;
  issues: CompatIssue[];
  /** false when a hard incompatibility blocked activation */
  active: boolean;
  /** which points actually ran */
  applied: ExtensionPoint[];
}

export interface ActivateContext {
  world?: World;
  /** the MCP server, if the host has one (editor/CLI) */
  agentServer?: unknown;
  /** sink for editor panel contributions */
  onEditorPanels?: (panels: unknown[]) => void;
}

export class PluginHost {
  private readonly plugins = new Map<string, RegisteredPlugin>();
  private readonly componentsInitialized = new Set<string>();

  constructor(
    private readonly engineApi: Record<ExtensionPoint, number> = EXTENSION_POINT_API_VERSIONS,
  ) {}

  /** Validate + record a plugin. Does not run contributions — call `activate`. */
  register(plugin: Plugin): RegisteredPlugin {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered.`);
    }
    const issues = checkCompatibility(plugin.manifest, this.engineApi);
    const blocked = issues.some((i) => i.level === "error");
    const rec: RegisteredPlugin = { manifest: plugin.manifest, issues, active: !blocked, applied: [] };
    this.plugins.set(plugin.manifest.id, rec);
    this.pending.set(plugin.manifest.id, plugin);
    return rec;
  }

  private readonly pending = new Map<string, Plugin>();

  /** Run the contributions of every registered, non-blocked plugin against `ctx`. Idempotent
   *  for `components` (a schema is registered once even across multiple activate() calls). */
  activate(ctx: ActivateContext): RegisteredPlugin[] {
    const out: RegisteredPlugin[] = [];
    for (const [id, plugin] of this.pending) {
      const rec = this.plugins.get(id)!;
      if (!rec.active) { out.push(rec); continue; }
      const applied: ExtensionPoint[] = [];

      if (plugin.contributions.components && !this.componentsInitialized.has(id)) {
        plugin.contributions.components();
        this.componentsInitialized.add(id);
        applied.push("components");
      }
      if (plugin.contributions.systems && ctx.world) {
        for (const sys of plugin.contributions.systems()) ctx.world.scheduler.register(sys);
        applied.push("systems");
      }
      if (plugin.contributions.resources && ctx.world) {
        plugin.contributions.resources(ctx.world);
        applied.push("resources");
      }
      if (plugin.contributions.agentTools && ctx.agentServer) {
        plugin.contributions.agentTools(ctx.agentServer);
        applied.push("agentTools");
      }
      if (plugin.contributions.editorPanels && ctx.onEditorPanels) {
        ctx.onEditorPanels(plugin.contributions.editorPanels());
        applied.push("editorPanels");
      }
      rec.applied = applied;
      out.push(rec);
    }
    return out;
  }

  /** Discovery surface — what the editor's "Plugins" / Open Source panel lists. */
  list(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  get(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id);
  }
}
