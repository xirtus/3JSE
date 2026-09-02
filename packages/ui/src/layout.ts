// A flexbox subset: row/column, gap, padding, fixed / percent / flex / auto sizing, cross-axis
// align. Deterministic and pure — a headless test asserts pixel rects.

import type { Size, UINode } from "./tree.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayoutMap = Record<string, Rect>;

export interface Viewport {
  width: number;
  height: number;
}

const DEFAULT_TEXT_H = 18;

export function computeLayout(root: UINode, viewport: Viewport): LayoutMap {
  const out: LayoutMap = {};
  place(root, { x: 0, y: 0, w: viewport.width, h: viewport.height }, out);
  return out;
}

function resolveSize(size: Size | undefined, available: number, fallback: number): number | "flex" | "auto" {
  if (size === undefined) return fallback;
  if (size === "auto") return "auto";
  if (typeof size === "number") return size;
  if (typeof size === "object") return "flex";
  if (size.endsWith("%")) return (parseFloat(size) / 100) * available;
  return fallback;
}

function intrinsic(node: UINode): { w: number; h: number } {
  if (node.kind === "text" || node.kind === "button") {
    const fs = node.style?.fontSize ?? 14;
    return { w: (node.text?.length ?? 0) * fs * 0.55 + (node.style?.padding ?? 0) * 2, h: fs + 6 + (node.style?.padding ?? 0) * 2 };
  }
  if (node.kind === "bar") return { w: 120, h: 12 };
  if (node.kind === "image") return { w: 64, h: 64 };
  return { w: 0, h: 0 };
}

function place(node: UINode, box: Rect, out: LayoutMap): void {
  if (node.visible === false) return;
  out[node.id] = box;

  const kids = (node.children ?? []).filter((c) => c.visible !== false);
  if (kids.length === 0) return;

  const s = node.style ?? {};
  const pad = s.padding ?? 0;
  const gap = s.gap ?? 0;
  const dir = s.direction ?? "column";
  const inner: Rect = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
  const mainAvail = dir === "row" ? inner.w : inner.h;
  const totalGap = gap * (kids.length - 1);

  // resolve each child's main size
  const sizes = kids.map((c) => {
    const raw = dir === "row" ? c.style?.width : c.style?.height;
    const r = resolveSize(raw, mainAvail, NaN);
    if (r === "flex") return { kind: "flex" as const, value: (raw as { flex: number }).flex };
    if (r === "auto" || Number.isNaN(r)) {
      const it = intrinsic(c);
      return { kind: "fixed" as const, value: dir === "row" ? it.w : it.h };
    }
    return { kind: "fixed" as const, value: r as number };
  });

  const fixedTotal = sizes.filter((x) => x.kind === "fixed").reduce((n, x) => n + x.value, 0);
  const flexTotal = sizes.filter((x) => x.kind === "flex").reduce((n, x) => n + x.value, 0);
  const freeSpace = Math.max(0, mainAvail - totalGap - fixedTotal);

  const resolvedMain = sizes.map((x) => (x.kind === "fixed" ? x.value : flexTotal > 0 ? (x.value / flexTotal) * freeSpace : 0));
  const used = resolvedMain.reduce((n, v) => n + v, 0) + totalGap;

  let cursor =
    s.justify === "center" ? (mainAvail - used) / 2
    : s.justify === "end" ? mainAvail - used
    : 0;
  const spaceBetween = s.justify === "space-between" && kids.length > 1 ? (mainAvail - used) / (kids.length - 1) : 0;

  kids.forEach((c, i) => {
    const mainSize = resolvedMain[i]!;
    const crossRaw = dir === "row" ? c.style?.height : c.style?.width;
    const crossR = resolveSize(crossRaw, dir === "row" ? inner.h : inner.w, NaN);
    let crossSize: number;
    if (s.align === "stretch" || crossRaw === undefined) crossSize = dir === "row" ? inner.h : inner.w;
    else if (typeof crossR === "number") crossSize = crossR;
    else crossSize = dir === "row" ? intrinsic(c).h || DEFAULT_TEXT_H : intrinsic(c).w;

    const crossFull = dir === "row" ? inner.h : inner.w;
    const crossOff =
      s.align === "center" ? (crossFull - crossSize) / 2
      : s.align === "end" ? crossFull - crossSize
      : 0;

    const childBox: Rect =
      dir === "row"
        ? { x: inner.x + cursor, y: inner.y + crossOff, w: mainSize, h: crossSize }
        : { x: inner.x + crossOff, y: inner.y + cursor, w: crossSize, h: mainSize };

    place(c, childBox, out);
    cursor += mainSize + gap + spaceBetween;
  });
}

/** Topmost interactive node (`button`) whose rect contains `point`. */
export function hitTest(layout: LayoutMap, tree: UINode, point: { x: number; y: number }): string | null {
  let hit: string | null = null;
  const walk = (n: UINode) => {
    if (n.visible === false) return;
    const r = layout[n.id];
    if (r && point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) {
      if (n.kind === "button" && n.action) hit = n.id;
    }
    n.children?.forEach(walk);
  };
  walk(tree);
  return hit;
}
