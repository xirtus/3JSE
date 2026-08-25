import type { IRGraph, IRRef } from "@3jse/ir";

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayout {
  nodes: Record<string, NodeLayout>;
  width: number;
  height: number;
}

const NODE_W = 200;
const NODE_H = 46;
const ROW_H = 64;
const SPINE_COL_W = 260;
// Must be >= SPINE_COL_W: a value node one depth-level left of a spine node otherwise lands
// inside the *previous* spine node's box (NODE_W=200 wide, sitting SPINE_COL_W back) instead of
// clearing it — found by actually rendering this in apps/editor and seeing a Query node hidden
// behind the Event node it was one hop away from, not by inspection.
const VALUE_COL_W = 260;
const MARGIN = 40;
const GUTTER = 12;

/**
 * docs/ROADMAP.md Phase 3's `@3jse/graph` node canvas, layout half: turns an `IRGraph` (which
 * has no position data — 3IR is pure logic, docs/GAMEPLAY_IR.md) into screen coordinates. Not a
 * general graph-drawing algorithm — a simple, deterministic recursive layout tuned for this
 * slice's graphs (a linear exec chain, one level of branching, small value-input trees): the
 * exec chain (event → call/set/branch → …) runs down a vertical "spine," a branch's `then`/
 * `else` chains spine out one column to the right, and each exec node's value-producing inputs
 * (args, cond, entity, value) are placed in columns to the *left* of the spine by input depth.
 * A node referenced from more than one place (a shared Variable, say) is only ever positioned
 * once — first use wins — so the canvas can draw one box with multiple wires fanning out of it,
 * which is the actually-correct rendering, not a layout bug to fix.
 *
 * Every node placement goes through one shared per-column allocator (`place()`): whichever y a
 * caller asks for, a node never lands closer than NODE_H+GUTTER to another node already in that
 * exact x column, pushing down instead of overlapping. Without this, two calls in the same exec
 * chain whose argument value-trees land in the same column (e.g. two different Call nodes each
 * with one arg, one column to their left) can compute nearby-but-distinct y's that still overlap
 * once NODE_H is accounted for — also found by rendering it, not by inspection.
 */
export function layoutGraph(graph: IRGraph): GraphLayout {
  const nodes: Record<string, NodeLayout> = {};
  const columnNextY = new Map<number, number>();
  let maxY = MARGIN;

  function place(id: string, x: number, yHint: number): number {
    const existing = nodes[id];
    if (existing) return existing.y;
    const y = Math.max(yHint, columnNextY.get(x) ?? -Infinity);
    nodes[id] = { id, x, y, width: NODE_W, height: NODE_H };
    columnNextY.set(x, y + NODE_H + GUTTER);
    maxY = Math.max(maxY, y + NODE_H);
    return y;
  }

  function placeValueTree(ref: IRRef | undefined, spineX: number, yHint: number, depth: number): void {
    if (!ref || nodes[ref.node]) return;
    const node = graph.nodes[ref.node];
    if (!node) return;
    const x = spineX - (depth + 1) * VALUE_COL_W;
    const y = place(node.id, x, yHint);

    if (node.kind === "pure" && node.op !== "const") {
      node.inputs.forEach((input) => placeValueTree(input, spineX, y, depth + 1));
    } else if (node.kind === "query" || node.kind === "get") {
      placeValueTree(node.entity, spineX, y, depth + 1);
    }
  }

  function layoutChain(startRef: IRRef | null, spineX: number, startY: number): number {
    let y = startY;
    let ref = startRef;
    while (ref) {
      const node = graph.nodes[ref.node];
      if (!node) break;
      y = place(node.id, spineX, y);

      if (node.kind === "call") {
        node.args.forEach((arg) => placeValueTree(arg, spineX, y, 0));
        ref = node.next;
      } else if (node.kind === "set") {
        placeValueTree(node.entity, spineX, y, 0);
        placeValueTree(node.value, spineX, y, 0);
        ref = node.next;
      } else if (node.kind === "branch") {
        placeValueTree(node.cond, spineX, y, 0);
        const thenEndY = layoutChain(node.then, spineX + SPINE_COL_W, y + ROW_H);
        layoutChain(node.else, spineX + SPINE_COL_W, thenEndY + ROW_H);
        ref = null; // branch has no `next` in this slice — types.ts's BranchNode doc comment
      } else {
        ref = null;
      }
      if (node.kind !== "branch") y += ROW_H;
    }
    return y;
  }

  const entry = graph.nodes[graph.entry];
  if (!entry || entry.kind !== "event") throw new Error("IRGraph.entry must reference an EventNode.");
  place(entry.id, MARGIN, MARGIN);
  layoutChain(entry.next, MARGIN + SPINE_COL_W, MARGIN);

  // Value trees can extend left of x=0 (branch value inputs are placed left of the spine, and
  // nested inputs go further left still) — normalize so every node has a positive x.
  const minX = Math.min(...Object.values(nodes).map((n) => n.x), 0);
  const shift = minX < MARGIN ? MARGIN - minX : 0;
  if (shift > 0) {
    for (const n of Object.values(nodes)) n.x += shift;
  }

  const maxX = Math.max(...Object.values(nodes).map((n) => n.x + n.width), 400);
  return { nodes, width: maxX + MARGIN, height: maxY + MARGIN };
}
