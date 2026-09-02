// Ties it together: a HUD document + a World + a renderer + a viewport. `update()` resolves
// bindings, lays out, and paints. `click(point)` hit-tests and returns the fired action.

import type { World } from "@3jse/runtime";
import { resolveTree } from "./bind.js";
import { computeLayout, hitTest, type Viewport } from "./layout.js";
import type { UIRenderer } from "./renderer.js";
import type { HUD, UINode } from "./tree.js";

export class HUDManager {
  private resolved: UINode;
  private layoutMap = {};

  constructor(
    private readonly hud: HUD,
    private readonly world: World,
    private readonly renderer: UIRenderer,
    private viewport: Viewport,
  ) {
    this.resolved = hud.root;
  }

  setViewport(v: Viewport): void {
    this.viewport = v;
  }

  /** Resolve bindings → layout → paint. Call once per frame (a `late`-stage System, or the
   *  renderer's rAF loop). */
  update(): void {
    this.resolved = resolveTree(this.hud.root, this.world);
    this.layoutMap = computeLayout(this.resolved, this.viewport);
    this.renderer.paint(this.resolved, this.layoutMap);
  }

  /** Hit-test `point` against the last layout; returns the fired `action` (or null). */
  click(point: { x: number; y: number }): string | null {
    const id = hitTest(this.layoutMap, this.resolved, point);
    if (!id) return null;
    const find = (n: UINode): UINode | undefined =>
      n.id === id ? n : n.children?.map(find).find(Boolean);
    return find(this.resolved)?.action ?? null;
  }

  currentTree(): UINode {
    return this.resolved;
  }
}
