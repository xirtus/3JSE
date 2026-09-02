import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from "react";

// A generic, graph-model-agnostic node canvas: pan (drag background), zoom (wheel), node drag,
// click-to-select, bezier edges. The IR-coupled GraphCanvas stays for 3JSE Graph; Atlas,
// Material Graph, the anim graph and the VFX graph render their own node models through this
// instead of each hand-rolling pan/zoom/drag. docs/VISUAL_SCRIPTING.md's editing surface,
// generalised — "wire editing" (creating edges) is still per-model and lives in the caller.

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle?: string;
  /** left accent bar colour (domain / family) */
  accent?: string;
  /** small text in the node body */
  badge?: string;
  bodyLines?: string[];
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  color?: string;
  dashed?: boolean;
  /** "exec" routes bottom→top, "value"/default routes right→left */
  kind?: "exec" | "value";
  label?: string;
}

export interface NodeCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** fired live while dragging a node; caller persists it */
  onNodeMove?: (id: string, x: number, y: number) => void;
  height?: number | string;
  background?: string;
}

interface View {
  x: number;
  y: number;
  k: number; // zoom
}

export function NodeCanvas({ nodes, edges, selectedId, onSelect, onNodeMove, height = "100%", background = "#161618" }: NodeCanvasProps) {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ mode: "pan" | "node"; id?: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const onPointerDownBg = useCallback((e: PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { mode: "pan", startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelect?.(null);
  }, [view.x, view.y, onSelect]);

  const onPointerDownNode = useCallback((e: PointerEvent, n: CanvasNode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    drag.current = { mode: "node", id: n.id, startX: e.clientX, startY: e.clientY, origX: n.x, origY: n.y };
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelect?.(n.id);
  }, [onSelect]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === "pan") {
      setView((v) => ({ ...v, x: d.origX + dx, y: d.origY + dy }));
    } else if (d.id) {
      onNodeMove?.(d.id, d.origX + dx / view.k, d.origY + dy / view.k);
    }
  }, [view.k, onNodeMove]);

  const onPointerUp = useCallback(() => { drag.current = null; }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const mx = e.clientX - (rect?.left ?? 0);
    const my = e.clientY - (rect?.top ?? 0);
    setView((v) => {
      const k = clamp(v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.25, 3);
      // zoom toward the cursor
      const wx = (mx - v.x) / v.k;
      const wy = (my - v.y) / v.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
  }, []);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      style={{ background, display: "block", touchAction: "none", cursor: drag.current?.mode === "pan" ? "grabbing" : "grab" }}
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      <defs>
        <marker id="nc-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
        </marker>
      </defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {edges.map((edge) => {
          const a = byId.get(edge.from);
          const b = byId.get(edge.to);
          if (!a || !b) return null;
          return <path key={edge.id} d={edgePath(a, b, edge.kind ?? "value")} fill="none"
            stroke={edge.color ?? (edge.kind === "exec" ? "#c7cbd4" : "#4a7fd6")}
            strokeWidth={edge.kind === "exec" ? 2 : 1.5}
            strokeDasharray={edge.dashed ? "4 4" : undefined}
            markerEnd="url(#nc-arrow)"
            opacity={selectedId && edge.from !== selectedId && edge.to !== selectedId ? 0.25 : 0.9} />;
        })}
        {nodes.map((n) => {
          const sel = n.id === selectedId;
          return (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`} style={{ cursor: "move" }}
              onPointerDown={(e) => onPointerDownNode(e, n)}>
              <rect width={n.width} height={n.height} rx={6} fill="#20232a"
                stroke={sel ? "#fff" : n.accent ?? "#3a4150"} strokeWidth={sel ? 2 : 1.3} />
              {n.accent && <rect width={4} height={n.height} rx={2} fill={n.accent} />}
              <text x={12} y={18} fill="#e8eaf0" fontSize={12} fontWeight={600}>{n.title}</text>
              {n.subtitle && <text x={12} y={32} fill="#9aa1b0" fontSize={10}>{n.subtitle}</text>}
              {n.badge && <text x={12} y={n.height - 8} fill="#8a8a8e" fontSize={10}>{n.badge}</text>}
              {(n.bodyLines ?? []).map((line, i) => (
                <text key={i} x={12} y={48 + i * 13} fill="#b8bcc6" fontSize={10}>{line}</text>
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** Bezier path between two node boxes. `exec` routes bottom-centre → top-centre. */
export function edgePath(a: CanvasNode, b: CanvasNode, kind: "exec" | "value"): string {
  if (kind === "exec") {
    const x1 = a.x + a.width / 2, y1 = a.y + a.height;
    const x2 = b.x + b.width / 2, y2 = b.y;
    const dy = Math.max(Math.abs(y2 - y1) / 2, 20);
    return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
  }
  const x1 = a.x + a.width, y1 = a.y + a.height / 2;
  const x2 = b.x, y2 = b.y + b.height / 2;
  const dx = Math.max(Math.abs(x2 - x1) / 2, 24);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
