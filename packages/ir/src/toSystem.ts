import type { IRGraph } from "./types.js";
import type { IRHost } from "./host.js";
import { interpret } from "./interpreter.js";

/** The shape `@3jse/runtime`'s `SystemDef.run` expects (`Scheduler.ts`) — not imported from
 *  `@3jse/runtime` (host.ts's doc comment on why `@3jse/ir` has no dependency on it). Whoever
 *  wires this into a real `SystemDef` gets a function that's already structurally compatible. */
export type TickFn<TEntity = unknown> = (entities: readonly TEntity[]) => void;

/**
 * docs/GAMEPLAY_IR.md: "the JS/TS backend... registered into the Runtime scheduler exactly like
 * a hand-written System." This is that claim's interpreter-backed half: wraps `interpret()` so
 * it runs once per entity in a System's query, every tick — the missing piece between "IR runs
 * standalone in a Debugger panel" (packages/ir's entityRoundtrip.test.ts,
 * apps/editor's DebuggerPanel.tsx) and "IR-authored logic actually drives live gameplay,"
 * which is what docs/AI_AGENT_API.md's plan→act→verify loop needs to observe real effects from
 * (docs/ROADMAP.md Phase 4's prerequisite on Phase 3's 3IR being more than a demo).
 *
 * Deliberately NOT the JS-emitter half of that claim: compiling `emit()`'s output string into an
 * actually-running function would mean executing dynamically generated code at runtime (`new
 * Function(...)` or equivalent) — a real capability with real security implications, not
 * attempted here. The interpreter is slower per docs/GAMEPLAY_IR.md's own tradeoff table, but
 * it's what "editor / live-debug mode" is for, and it's what this function uses.
 *
 * `selfParam` is the EventNode param each entity in the System's query is bound to;
 * `extraBindings` covers everything else the graph references by name (other entity refs,
 * asset/resource refs — VariableNode's doc comment in types.ts).
 */
export function compileToTickFn<TEntity = unknown>(
  graph: IRGraph,
  selfParam: string,
  host: IRHost,
  extraBindings: Record<string, unknown> = {},
): TickFn<TEntity> {
  return (entities) => {
    for (const entity of entities) {
      interpret(graph, { ...extraBindings, [selfParam]: entity }, host);
    }
  };
}
