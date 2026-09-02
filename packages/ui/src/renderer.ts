// The renderer seam. `paint(tree, layout)` turns a resolved tree + its rects into draw ops.
// NullRenderer records them (tests). A DOMRenderer (browser) diffs against real DOM nodes.

import type { LayoutMap } from "./layout.js";
import type { UINode } from "./tree.js";

export interface DrawOp {
  id: string;
  kind: UINode["kind"];
  rect: { x: number; y: number; w: number; h: number };
  text?: string;
  fill?: number;
  background?: string;
  color?: string;
  action?: string;
}

export interface UIRenderer {
  paint(tree: UINode, layout: LayoutMap): void;
  ops(): DrawOp[];
  clear(): void;
}

export class NullRenderer implements UIRenderer {
  private _ops: DrawOp[] = [];

  paint(tree: UINode, layout: LayoutMap): void {
    this._ops = [];
    const walk = (n: UINode) => {
      if (n.visible === false) return;
      const rect = layout[n.id];
      if (rect) {
        this._ops.push({
          id: n.id,
          kind: n.kind,
          rect,
          text: n.text,
          fill: n.style?.fill,
          background: n.style?.background,
          color: n.style?.color,
          action: n.action,
        });
      }
      n.children?.forEach(walk);
    };
    walk(tree);
  }
  ops(): DrawOp[] {
    return [...this._ops];
  }
  clear(): void {
    this._ops = [];
  }
}
