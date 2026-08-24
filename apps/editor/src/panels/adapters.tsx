import { Viewport } from "../Viewport.js";
import { Hierarchy } from "../Hierarchy.js";
import { Inspector } from "../Inspector.js";
import type { EditorContext } from "./types.js";

// Thin adapters, not rewrites: Viewport/Hierarchy/Inspector keep their own tested prop APIs
// (docs/EDITOR.md doesn't require every panel to be *authored* against the registry's ctx
// shape, only *registered* through it) — these just unpack the one shared EditorContext into
// each component's existing props.

export function ViewportPanel({ ctx }: { ctx: EditorContext }) {
  return (
    <Viewport
      world={ctx.world}
      level={ctx.level}
      selectedId={ctx.selectedId}
      onSelect={ctx.setSelectedId}
      playing={ctx.playing}
    />
  );
}

export function HierarchyPanel({ ctx }: { ctx: EditorContext }) {
  return (
    <Hierarchy
      level={ctx.level}
      selectedId={ctx.selectedId}
      onSelect={ctx.setSelectedId}
      prefabs={ctx.prefabs}
      onInstantiatePrefab={ctx.onInstantiatePrefab}
      onRefresh={ctx.refresh}
    />
  );
}

export function InspectorPanel({ ctx }: { ctx: EditorContext }) {
  return (
    <Inspector entity={ctx.selectedEntity} prefabs={ctx.prefabs} onSaveAsPrefab={ctx.onSaveAsPrefab} />
  );
}
