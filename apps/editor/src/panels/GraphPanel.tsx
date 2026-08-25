import { GraphCanvas } from "@3jse/graph";
import type { EditorContext } from "./types.js";

/** docs/ROADMAP.md Phase 3's `@3jse/graph` node canvas, wired into the editor. See
 *  @3jse/graph's GraphCanvas.tsx doc comment for exactly what this slice does and doesn't do
 *  (read-only render + click-to-select; no drag/wire-editing/palette yet). */
export function GraphPanel({ ctx }: { ctx: EditorContext }) {
  return (
    <div className="graph-panel">
      <GraphCanvas
        graph={ctx.graph}
        selectedNodeId={ctx.selectedGraphNodeId}
        onSelectNode={ctx.setSelectedGraphNodeId}
        activeNodeIds={ctx.debugVisitedNodeIds}
      />
    </div>
  );
}
