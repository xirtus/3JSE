import { useMemo } from "react";
import { emit } from "@3jse/ir";
import type { EditorContext } from "./types.js";

/**
 * docs/VISUAL_SCRIPTING.md's "Bidirectional editing, from the graph editor's side": "Any graph
 * can be viewed as generated TypeScript in the Code Editor panel... live-updated as the graph
 * changes." This slice does the read half exactly, using packages/ir's real source map (not a
 * separately-maintained line-mapping) to sync selection both ways with GraphPanel — click a
 * node there and its line highlights here; click a line here and the node selects there.
 *
 * The other half — "Edits made in the Code Editor... re-parse and update the graph view" — needs
 * an editable text widget and the "Code node" opaque-boundary fallback (docs/GAMEPLAY_IR.md's
 * "honest limit"); not built yet, since GraphCanvas has no graph-mutation story for a re-parse to
 * feed into (GraphCanvas.tsx's own doc comment). This panel is read-only.
 */
export function CodeEditorPanel({ ctx }: { ctx: EditorContext }) {
  const { code, sourceMap } = useMemo(() => emit(ctx.graph), [ctx.graph]);
  const lines = useMemo(() => code.split("\n"), [code]);
  const lineToNode = useMemo(() => {
    const m = new Map<number, string>();
    for (const entry of sourceMap) m.set(entry.line, entry.nodeId);
    return m;
  }, [sourceMap]);

  return (
    <pre className="code-editor-panel">
      {lines.map((line, i) => {
        const lineNo = i + 1;
        const nodeId = lineToNode.get(lineNo);
        const selected = nodeId !== undefined && nodeId === ctx.selectedGraphNodeId;
        return (
          <div
            key={lineNo}
            className={selected ? "code-line code-line-selected" : "code-line"}
            onClick={() => nodeId && ctx.setSelectedGraphNodeId(nodeId)}
          >
            <span className="code-line-no">{lineNo}</span>
            <span className="code-line-text">{line || " "}</span>
          </div>
        );
      })}
    </pre>
  );
}
