// The retained UI/HUD widget tree (docs/GAMEPLAY_FRAMEWORK.md's UI/HUD row, docs/EDITOR.md's
// UI/HUD Editor). A plain data tree — inspectable, serializable, bindable — with a flexbox
// subset for layout. A pluggable renderer paints it (DOMRenderer in the browser, NullRenderer
// for tests). No React, no DOM here.

export type Size = number | `${number}%` | "auto" | { flex: number };

export interface UIStyle {
  direction?: "row" | "column";
  gap?: number;
  padding?: number;
  width?: Size;
  height?: Size;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "space-between";
  background?: string;
  color?: string;
  fontSize?: number;
  /** 0..1 for progress `bar` nodes */
  fill?: number;
  opacity?: number;
  radius?: number;
}

export interface UIBinding {
  /** "resource:Score" or "entity:<id>.<Component>.<field>" */
  path: string;
  /** which visual property the value drives */
  to: "text" | "fill" | "visible" | "color";
  /** printf-ish, e.g. "Score: %d" or "%.1f" — only for `to: "text"` */
  format?: string;
  /** map a numeric value into 0..1 for `to: "fill"` (value - min) / (max - min) */
  range?: { min: number; max: number };
}

export interface UINode {
  id: string;
  kind: "panel" | "text" | "button" | "bar" | "image";
  style?: UIStyle;
  /** literal text for a `text`/`button` node (overridden by a `to: "text"` binding) */
  text?: string;
  /** image src for an `image` node */
  src?: string;
  /** action name emitted when a `button` node is activated */
  action?: string;
  /** data bindings resolved against the World each frame */
  bind?: UIBinding[];
  children?: UINode[];
  /** set false by a `to: "visible"` binding — skipped by layout + render */
  visible?: boolean;
}

/** A HUD document: a root node + a viewport it lays out into. */
export interface HUD {
  name: string;
  root: UINode;
}

export function panel(id: string, style: UIStyle, children: UINode[]): UINode {
  return { id, kind: "panel", style, children, visible: true };
}
export function text(id: string, value: string, style?: UIStyle, bind?: UIBinding[]): UINode {
  return { id, kind: "text", text: value, style, bind, visible: true };
}
export function bar(id: string, style: UIStyle, bind?: UIBinding[]): UINode {
  return { id, kind: "bar", style, bind, visible: true };
}
export function button(id: string, label: string, action: string, style?: UIStyle): UINode {
  return { id, kind: "button", text: label, action, style, visible: true };
}
