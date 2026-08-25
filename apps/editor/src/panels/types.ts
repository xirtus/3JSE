import type { ComponentType } from "react";
import type { Entity, Prefab, World, Level } from "@3jse/runtime";
import type { IRGraph } from "@3jse/ir";

export interface LogEntry {
  id: number;
  time: number;
  level: "info" | "warn" | "error";
  message: string;
}

/**
 * The one context object every panel reads from — the concrete shape behind
 * docs/PLUGIN_ARCHITECTURE.md's "Editor panels" extension point and docs/EDITOR.md's "panels are
 * declared through the same panel-registration API third-party plugins use." A third-party
 * panel gets exactly this, nothing more privileged — there is no separate built-in-panel API.
 */
export interface EditorContext {
  world: World;
  level: Level;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedEntity: Entity | null;
  playing: boolean;
  togglePlay: () => void;
  prefabs: Prefab[];
  onSaveAsPrefab: (entity: Entity) => void;
  onInstantiatePrefab: (prefab: Prefab) => void;
  logs: LogEntry[];
  pushLog: (level: LogEntry["level"], message: string) => void;
  /** Forces a re-render after a structural mutation React doesn't know about — e.g. a Hierarchy
   *  rename, or a future reparent/delete. Level.allEntities et al. are live snapshots, not React
   *  state (docs/PROJECT_FORMAT.md), so this is the seam any panel uses to say "something in the
   *  World changed, re-read it." */
  refresh: () => void;

  /** docs/ROADMAP.md Phase 3's 3JSE Graph demo content — the door/trigger worked example from
   *  docs/VISUAL_SCRIPTING.md, shared across GraphPanel/CodeEditorPanel/DebuggerPanel so they
   *  stay in sync (one graph, three views — docs/GAMEPLAY_IR.md's whole point). No canvas
   *  editing yet (GraphCanvas's own doc comment), so this is fixed demo content, not a project
   *  asset — the Graph/Code/Debugger panels below are read/run-only over it. */
  graph: IRGraph;
  selectedGraphNodeId: string | null;
  setSelectedGraphNodeId: (id: string | null) => void;
  /** The last interpret() run's full visited-node trace (packages/ir's InterpretResult) — what
   *  DebuggerPanel's "Run" populates and GraphPanel highlights, docs/VISUAL_SCRIPTING.md's
   *  "Execution history" / active-wire idea, scoped to "highlight what a completed run visited"
   *  rather than live per-frame values during actual gameplay (real future work). */
  debugVisitedNodeIds: string[];
  setDebugVisitedNodeIds: (ids: string[]) => void;
}

export type PanelRegion = "left" | "center" | "right" | "bottom";

export interface PanelDef {
  id: string;
  title: string;
  region: PanelRegion;
  /** "active" panels have real, working content; "planned" panels are registered so the dock
   *  layout, tab strip, and this whole scaffold are already proven under the full ~23-panel
   *  load docs/EDITOR.md specifies, well before every subsystem behind them exists. */
  status: "active" | "planned";
  component: ComponentType<{ ctx: EditorContext }>;
}
