// @3jse/ui — the UI / HUD framework (docs/GAMEPLAY_FRAMEWORK.md UI/HUD row, docs/EDITOR.md
// UI/HUD Editor). A retained widget tree with a flexbox-subset layout, data binding to
// World resources / component fields, hit-testing, and a pluggable renderer. Headless: layout,
// binding, hit-test, and paint (NullRenderer) all run in a plain vitest with no DOM.

export {
  panel,
  text,
  bar,
  button,
  type UINode,
  type UIStyle,
  type UIBinding,
  type HUD,
  type Size,
} from "./tree.js";
export {
  computeLayout,
  hitTest,
  type Rect,
  type LayoutMap,
  type Viewport,
} from "./layout.js";
export { resolveTree, resolvePath } from "./bind.js";
export { NullRenderer, type UIRenderer, type DrawOp } from "./renderer.js";
export { HUDManager } from "./HUDManager.js";
