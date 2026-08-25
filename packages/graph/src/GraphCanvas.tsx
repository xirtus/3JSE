import { useMemo } from "react";
import type { IRGraph } from "@3jse/ir";
import { layoutGraph, type GraphLayout } from "./layout.js";
import { extractEdges } from "./edges.js";
import { nodeLabel } from "./labels.js";

export interface GraphCanvasProps {
  graph: IRGraph;
  selectedNodeId?: string | null;
  onSelectNode?: (id: string) => void;
  /** IR node ids to render as "just executed" — the interpreter's execution trace, packages/ir's
   *  `interpret()` doesn't record this by node id today (RecordedCall is target+args only), so
   *  a caller wanting this passes whatever it separately tracked. Optional: the canvas is a
   *  faithful, correct render of the graph with or without it. */
  activeNodeIds?: readonly string[];
}

const FAMILY_COLOR: Record<string, string> = {
  event: "#e0553e",
  flow: "#4a7fd6",
  data: "#3fae6a",
};

/**
 * docs/ROADMAP.md Phase 3's `@3jse/graph` node canvas — this slice: a faithful, read-only
 * render of an `IRGraph` as boxes and wires, with click-to-select. Not yet: dragging nodes,
 * drawing new wires, or a node palette to add nodes (docs/VISUAL_SCRIPTING.md's full editing
 * surface) — those need a mutation story for IRGraph this slice doesn't build. What this *does*
 * prove: the same IRGraph the interpreter runs and the emitter compiles is directly renderable,
 * with no separate "graph-editor's own copy" of the logic to drift out of sync — exactly
 * docs/GAMEPLAY_IR.md's point.
 */
export function GraphCanvas({ graph, selectedNodeId, onSelectNode, activeNodeIds }: GraphCanvasProps) {
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const edges = useMemo(() => extractEdges(graph), [graph]);
  const active = useMemo(() => new Set(activeNodeIds ?? []), [activeNodeIds]);

  return (
    <svg
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ background: "#1a1d24", display: "block" }}
    >
      <defs>
        <marker id="ir-wire-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#6b7280" />
        </marker>
      </defs>

      {edges.map((edge) => (
        <Wire key={edge.id} edge={edge} layout={layout} />
      ))}

      {Object.values(graph.nodes).map((node) => {
        const pos = layout.nodes[node.id];
        if (!pos) return null;
        const label = nodeLabel(node);
        const selected = node.id === selectedNodeId;
        const isActive = active.has(node.id);
        return (
          <g
            key={node.id}
            transform={`translate(${pos.x}, ${pos.y})`}
            onClick={() => onSelectNode?.(node.id)}
            style={{ cursor: onSelectNode ? "pointer" : "default" }}
          >
            <rect
              width={pos.width}
              height={pos.height}
              rx={6}
              fill="#262b36"
              stroke={selected ? "#ffffff" : isActive ? "#f5c451" : "#3a4150"}
              strokeWidth={selected || isActive ? 2 : 1}
            />
            <rect width={pos.width} height={6} rx={3} fill={FAMILY_COLOR[label.family]} />
            <text x={10} y={24} fill="#e8eaf0" fontSize={12} fontFamily="ui-sans-serif, system-ui">
              {label.title}
            </text>
            {label.subtitle && (
              <text x={10} y={38} fill="#9aa1b0" fontSize={10} fontFamily="ui-monospace, monospace">
                {label.subtitle}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Wire({ edge, layout }: { edge: ReturnType<typeof extractEdges>[number]; layout: GraphLayout }) {
  const from = layout.nodes[edge.from];
  const to = layout.nodes[edge.to];
  if (!from || !to) return null;

  const exec = edge.kind === "exec";
  let x1: number, y1: number, x2: number, y2: number, c1x: number, c1y: number, c2x: number, c2y: number;
  if (exec) {
    // Flowchart convention: bottom-center → top-center, so this reads correctly whether the
    // next exec node is directly below (same-chain) or down-and-right (entering a branch's
    // then/else — layout.ts's doc comment).
    x1 = from.x + from.width / 2;
    y1 = from.y + from.height;
    x2 = to.x + to.width / 2;
    y2 = to.y;
    const dy = Math.max(Math.abs(y2 - y1) / 2, 20);
    (c1x = x1), (c1y = y1 + dy), (c2x = x2), (c2y = y2 - dy);
  } else {
    // Data-flow convention: producer's right edge → consumer's left edge.
    x1 = from.x + from.width;
    y1 = from.y + from.height / 2;
    x2 = to.x;
    y2 = to.y + to.height / 2;
    const dx = Math.max(Math.abs(x2 - x1) / 2, 24);
    (c1x = x1 + dx), (c1y = y1), (c2x = x2 - dx), (c2y = y2);
  }

  return (
    <path
      d={`M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`}
      fill="none"
      stroke={exec ? "#c7cbd4" : "#4a7fd6"}
      strokeWidth={exec ? 2 : 1.5}
      strokeDasharray={exec ? undefined : "3 3"}
      markerEnd="url(#ir-wire-arrow)"
    />
  );
}
