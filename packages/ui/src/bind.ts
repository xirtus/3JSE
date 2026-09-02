// Data binding: resolve a HUD tree's bindings against a live World each frame, producing a
// concrete tree the renderer paints. Binding paths are "resource:<Key>" or
// "entity:<id>.<Component>.<field>" (docs/GAMEPLAY_FRAMEWORK.md's HUD-from-events model).

import type { World } from "@3jse/runtime";
import type { UIBinding, UINode } from "./tree.js";

export function resolvePath(world: World, path: string): unknown {
  if (path.startsWith("resource:")) return world.getResource(path.slice("resource:".length));
  const m = /^entity:([^.]+)\.([^.]+)\.(.+)$/.exec(path);
  if (m) {
    for (const level of world.allLevels) {
      const e = level.getEntity(m[1]!);
      const c = e?.getComponent<Record<string, unknown>>(m[2]!);
      if (c && m[3]! in c) return c[m[3]!];
    }
  }
  return undefined;
}

function fmt(value: unknown, spec?: string): string {
  if (spec === undefined) return String(value ?? "");
  return spec.replace(/%\.(\d+)f/g, (_, d) => Number(value).toFixed(Number(d)))
    .replace(/%d/g, () => String(Math.round(Number(value))))
    .replace(/%s/g, () => String(value ?? ""));
}

function applyBinding(node: UINode, b: UIBinding, value: unknown): void {
  if (b.to === "text") node.text = fmt(value, b.format);
  else if (b.to === "visible") node.visible = Boolean(value);
  else if (b.to === "color") node.style = { ...(node.style ?? {}), color: String(value) };
  else if (b.to === "fill") {
    let f = Number(value);
    if (b.range) f = (f - b.range.min) / (b.range.max - b.range.min);
    node.style = { ...(node.style ?? {}), fill: Math.max(0, Math.min(1, f)) };
  }
}

/** A deep copy of `tree` with every binding resolved against `world`. */
export function resolveTree(tree: UINode, world: World): UINode {
  const clone = structuredClone(tree) as UINode;
  const walk = (n: UINode) => {
    for (const b of n.bind ?? []) applyBinding(n, b, resolvePath(world, b.path));
    n.children?.forEach(walk);
  };
  walk(clone);
  return clone;
}
