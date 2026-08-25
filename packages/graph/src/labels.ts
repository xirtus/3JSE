import type { IRNode } from "@3jse/ir";

export interface NodeLabel {
  title: string;
  subtitle?: string;
  /** Drives the node header's accent color in GraphCanvas.tsx — exec-position kinds vs.
   *  value-producing kinds, the same event/flow/data family split docs/VISUAL_SCRIPTING.md's
   *  node families table uses, just collapsed to what this slice's node kinds actually need. */
  family: "event" | "flow" | "data";
}

export function nodeLabel(node: IRNode): NodeLabel {
  switch (node.kind) {
    case "event":
      return { title: node.name, subtitle: node.params.map((p) => `${p.name}: ${p.type}`).join(", "), family: "event" };
    case "call":
      return { title: `Call ${node.target}`, family: "flow" };
    case "set":
      return { title: `Set ${node.component}.${node.field}`, family: "flow" };
    case "branch":
      return { title: "Branch", family: "flow" };
    case "query":
      return { title: `${node.component}.hasComponent()`, family: "data" };
    case "get":
      return { title: `Get ${node.component}.${node.field}`, family: "data" };
    case "pure":
      return {
        title: node.op === "const" ? String(node.value) : node.op,
        subtitle: node.op === "const" ? "const" : undefined,
        family: "data",
      };
    case "variable":
      return { title: node.name, subtitle: node.type, family: "data" };
  }
}
