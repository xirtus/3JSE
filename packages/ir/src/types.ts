// docs/ROADMAP.md Phase 0's "throwaway 3IR prototype": hand-write ~5 IR node kinds, a JS
// emitter, and an interpreter; confirm the source-map round-trip claim in docs/GAMEPLAY_IR.md
// actually works on a small recognized TS subset before it's load-bearing for the rest of the
// engine (docs/ROADMAP.md Phase 3). This is deliberately the minimal slice of
// docs/GAMEPLAY_IR.md's "simplified 3IR node shape" — event/pure/call/branch/variable, no
// loop/await yet — not the production `@3jse/ir` compiler Phase 3 builds (interpreter + JS/TS
// backends, full type system, node canvas). Scope is the round-trip mechanism, not coverage.

export type IRType = "number" | "boolean" | "void";

/** A wire: an edge between two node pins. No `pin` yet — every node here has at most one
 *  value output, so "which node" is enough to identify what's being referenced. */
export interface IRRef {
  node: string;
}

export type PureOp = "const" | "gt" | "lt" | "gte" | "lte" | "eq" | "neq";

export interface EventNode {
  kind: "event";
  id: string;
  name: string;
  params: { name: string; type: IRType }[];
  /** First statement to execute — null for an empty body. */
  next: IRRef | null;
}

export interface PureNode {
  kind: "pure";
  id: string;
  op: PureOp;
  /** Empty for "const". Exactly 2 for every comparison op — this prototype doesn't need
   *  variadic pure nodes. */
  inputs: IRRef[];
  /** Only set for op === "const". */
  value?: number | boolean;
  outputType: IRType;
}

export interface CallNode {
  kind: "call";
  id: string;
  /** Name of a host/engine function — resolved by the interpreter's call table, or emitted
   *  as a plain identifier call by the JS backend. Not an EngineAPIRef yet (docs/GAMEPLAY_IR.md
   *  has one for the production compiler); a bare string is enough for the prototype's claim. */
  target: string;
  args: IRRef[];
  /** Next statement in exec order — mutated in place while the TS frontend chains statements. */
  next: IRRef | null;
}

/** No `next`: in this prototype, a branch is exec-terminal — whatever should happen after an
 *  if/else has to live inside both `then` and `else`. Good enough for the round-trip claim;
 *  the production IR's join-node semantics are real future work (docs/ROADMAP.md Phase 3). */
export interface BranchNode {
  kind: "branch";
  id: string;
  cond: IRRef;
  then: IRRef | null;
  else: IRRef | null;
}

export interface VariableNode {
  kind: "variable";
  id: string;
  scope: "local";
  name: string;
  type: IRType;
}

export type IRNode = EventNode | PureNode | CallNode | BranchNode | VariableNode;

export interface IRGraph {
  nodes: Record<string, IRNode>;
  /** id of the graph's single EventNode. */
  entry: string;
}
