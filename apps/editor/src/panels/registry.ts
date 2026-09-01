import { ViewportPanel, HierarchyPanel, InspectorPanel } from "./adapters.js";
import { ConsolePanel } from "./ConsolePanel.js";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel.js";
import { InputMappingPanel } from "./InputMappingPanel.js";
import { PhysicsPanel } from "./PhysicsPanel.js";
import { GraphPanel } from "./GraphPanel.js";
import { AtlasPanel } from "./AtlasPanel.js";
import { CodeEditorPanel } from "./CodeEditorPanel.js";
import { DebuggerPanel } from "./DebuggerPanel.js";
import { OpenSourcePanel } from "./OpenSourcePanel.js";
import { PackagesPanel } from "./PackagesPanel.js";
import { AgentPanel } from "./AgentPanel.js";
import { ContentBrowserPanel } from "./ContentBrowserPanel.js";
import { planned } from "./planned.js";
import type { PanelDef } from "./types.js";

/**
 * Every panel docs/EDITOR.md names, registered the same way regardless of whether it's real
 * yet — adding the actual Terrain editor later (say) means writing TerrainPanel.tsx and
 * flipping one entry's `status`/`component` here, not restructuring DockLayout.tsx. This is
 * docs/PLUGIN_ARCHITECTURE.md's "Editor panels" extension point, concretely: a third-party
 * plugin's panel is one more entry in an array shaped exactly like these, nothing more
 * privileged than what's here.
 */
export const panels: PanelDef[] = [
  // center — full-tab editors, one visible at a time (docs/EDITOR.md: "Full-tab node canvas")
  { id: "viewport", title: "Viewport", region: "center", status: "active", component: ViewportPanel },
  // docs/ARCHITECTURE.md layer 5: Atlas is the primary visual authoring surface (semantic
  // navigation + FeelSpec tuning + agent scoping over the 3IR), docs/3JSE_ATLAS_FULL_PLAN.md.
  { id: "atlas", title: "Atlas", region: "center", status: "active", component: AtlasPanel },
  // The node-graph machinery stays available underneath as the execution architecture / one lens.
  { id: "graph", title: "3JSE Graph", region: "center", status: "active", component: GraphPanel },
  {
    id: "material-graph",
    title: "Material Graph",
    region: "center",
    status: "planned",
    component: planned("Material/Shader Graph", "RENDERING.md"),
  },
  { id: "code-editor", title: "Code Editor", region: "center", status: "active", component: CodeEditorPanel },
  {
    id: "animation",
    title: "Animation",
    region: "center",
    status: "planned",
    component: planned("Animation Tools", "ANIMATION.md"),
  },
  {
    id: "terrain",
    title: "Terrain / Water / Veg.",
    region: "center",
    status: "planned",
    component: planned("Terrain / Water / Vegetation", "VENDOR_INTEGRATIONS.md"),
  },
  {
    id: "particles",
    title: "Particles",
    region: "center",
    status: "planned",
    component: planned("Particle Editor", "PLUGIN_ARCHITECTURE.md"),
  },
  {
    id: "ui-editor",
    title: "UI / HUD",
    region: "center",
    status: "planned",
    component: planned("UI/HUD Editor", "GAMEPLAY_FRAMEWORK.md"),
  },

  // left — scene/project browsing
  { id: "hierarchy", title: "Hierarchy", region: "left", status: "active", component: HierarchyPanel },
  {
    id: "asset-deps",
    title: "Dependencies",
    region: "left",
    status: "planned",
    component: planned("Asset Dependency Viewer", "ASSET_PIPELINE.md"),
  },
  {
    id: "navigation",
    title: "Navigation",
    region: "left",
    status: "planned",
    component: planned("Navigation", "PLUGIN_ARCHITECTURE.md"),
  },
  {
    id: "source-control",
    title: "Source Control",
    region: "left",
    status: "planned",
    component: planned("Source Control", "EDITOR.md"),
  },

  // right — selection-scoped and project-scoped settings
  { id: "inspector", title: "Inspector", region: "right", status: "active", component: InspectorPanel },
  {
    id: "project-settings",
    title: "Project Settings",
    region: "right",
    status: "active",
    component: ProjectSettingsPanel,
  },
  {
    id: "input-mapping",
    title: "Input Mapping",
    region: "right",
    status: "active",
    component: InputMappingPanel,
  },
  {
    id: "environment",
    title: "Environment",
    region: "right",
    status: "planned",
    component: planned("Environment Settings", "RENDERING.md"),
  },
  { id: "physics-editor", title: "Physics", region: "right", status: "active", component: PhysicsPanel },
  { id: "agent", title: "Agent", region: "right", status: "active", component: AgentPanel },

  // bottom — cross-cutting tools
  { id: "console", title: "Console", region: "bottom", status: "active", component: ConsolePanel },
  { id: "content-browser", title: "Content Browser", region: "bottom", status: "active", component: ContentBrowserPanel },
  { id: "debugger", title: "Debugger", region: "bottom", status: "active", component: DebuggerPanel },
  {
    id: "profiler",
    title: "Profiler",
    region: "bottom",
    status: "planned",
    component: planned("Profiler", "PERFORMANCE.md"),
  },
  {
    id: "packaging",
    title: "Packaging",
    region: "bottom",
    status: "planned",
    component: planned("Packaging / Deployment", "BUILD_DEPLOYMENT.md"),
  },
  { id: "open-source", title: "Open Source", region: "bottom", status: "active", component: OpenSourcePanel },
  // docs/ROADMAP.md Phase 6 — official @3jse/* catalog + third-party plugins registered via
  // @3jse/plugins' PluginHost (docs/PLUGIN_ARCHITECTURE.md).
  { id: "packages", title: "Packages", region: "bottom", status: "active", component: PackagesPanel },
];
