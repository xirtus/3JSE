// Started as docs/ROADMAP.md Phase 0's "throwaway 3IR prototype" (event/pure/call/branch/
// variable, confirming the source-map round-trip claim on a small recognized TS subset — see
// roundtrip.test.ts). This file has since grown into Phase 3 slice 1: query/get/set add the
// Component-read/write vocabulary docs/GAMEPLAY_IR.md's worked examples actually need (e.g.
// VISUAL_SCRIPTING.md's door/trigger example — see entityRoundtrip.test.ts), interpreted and
// emitted against real @3jse/runtime Entities through the IRHost adapter in host.ts. Still not
// the full production compiler: no loop/await, no ComponentSchema-driven struct types (get/set
// take a bare component+field string pair, not a generated type), no @3jse/graph node canvas,
// and the TS-subset frontend (tsFrontend.ts) hasn't been taught this vocabulary yet — graphs in
// this vocabulary are hand-built IRGraph literals, standing in for what a canvas would emit.

export type IRType = "number" | "boolean" | "string" | "entityRef" | "void";

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
  value?: number | boolean | string;
  outputType: IRType;
}

export interface CallNode {
  kind: "call";
  id: string;
  /** The callee, emitted verbatim followed by `(args)` — a bare function name ("applyDamage")
   *  or a simple dotted path ("saveService.setFlag"). Resolved by the interpreter's IRHost.call
   *  table under the same string. Not a real EngineAPIRef yet (docs/GAMEPLAY_IR.md's production
   *  compiler resolves calls against the actual Runtime/Component API surface, with argument
   *  types checked against it) — a bare string is enough for this slice's claim: that IR can
   *  express and round-trip a call into named engine-ish functions with typed arguments. */
  target: string;
  args: IRRef[];
  /** Next statement in exec order — mutated in place while a frontend chains statements. */
  next: IRRef | null;
}

/** Value-producing: docs/VISUAL_SCRIPTING.md's `other.HasComponent<Key>()`. A dedicated kind
 *  rather than folding into PureNode because it's about ECS state (needs an EntityRef + a
 *  Component type), not two typed operands. */
export interface QueryNode {
  kind: "query";
  id: string;
  op: "hasComponent";
  entity: IRRef;
  component: string;
  outputType: "boolean";
}

/** Value-producing read of one field of one Component on one Entity — docs/GAMEPLAY_IR.md's
 *  "calls into the engine's Component/Resource API." `field`'s real type would come from the
 *  Component's generated struct type (docs/ENTITY_COMPONENT_MODEL.md) in the production
 *  compiler; here it's just `outputType`, set by whoever builds the node. */
export interface GetNode {
  kind: "get";
  id: string;
  entity: IRRef;
  component: string;
  field: string;
  outputType: IRType;
}

/** Exec node: writes one field of one Component on one Entity — the IR shape behind
 *  docs/VISUAL_SCRIPTING.md's `SetComponent(door, Collision.enabled = false)`. */
export interface SetNode {
  kind: "set";
  id: string;
  entity: IRRef;
  component: string;
  field: string;
  value: IRRef;
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

/** `scope` is always "local" in this slice — every named reference (an event param, or an
 *  external binding like an asset ref or an injected service) is resolved the same way, through
 *  the flat `bindings` map passed to `interpret()`/`compileToRunFn()`. docs/GAMEPLAY_IR.md's
 *  full local/component/resource scope distinction is real future work, not needed to prove
 *  this slice's claim. */
export interface VariableNode {
  kind: "variable";
  id: string;
  scope: "local";
  name: string;
  type: IRType;
}

export type IRNode = EventNode | PureNode | CallNode | BranchNode | VariableNode | QueryNode | GetNode | SetNode;

export interface IRGraph {
  nodes: Record<string, IRNode>;
  /** id of the graph's single EventNode. */
  entry: string;
}
