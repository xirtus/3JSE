import type { IRGraph, IRNode, IRRef, IRType } from "@3jse/ir";

/** In-memory only — there's no project-file persistence for a 3JSE Graph asset yet
 *  (docs/PROJECT_FORMAT.md, docs/ROADMAP.md Phase 3's `@3jse/graph` doesn't own file storage
 *  either). One store per running agent session/editor instance, addressed by an id an agent
 *  picks (e.g. an Entity's Behavior component naming which graph it runs). */
export class GraphStore {
  private readonly graphs = new Map<string, IRGraph>();

  get(id: string): IRGraph | undefined {
    return this.graphs.get(id);
  }

  set(id: string, graph: IRGraph): void {
    this.graphs.set(id, graph);
  }

  list(): string[] {
    return Array.from(this.graphs.keys());
  }
}

function requireGraph(store: GraphStore, graphId: string): IRGraph {
  const graph = store.get(graphId);
  if (!graph) throw new Error(`Unknown graph "${graphId}".`);
  return graph;
}

/** docs/AI_AGENT_API.md's `graph.read`: "the agent edits the same JSON the Graph editor
 *  renders, never 'draws' nodes via simulated interaction" — this returns the literal `IRGraph`
 *  @3jse/graph's GraphCanvas renders, not a separate agent-facing projection of it. */
export function graphRead(store: GraphStore, graphId: string): IRGraph {
  return requireGraph(store, graphId);
}

export interface GraphWritePatch {
  /** Upserts each node by id — a fresh node, or an edit to an existing one's non-wire fields
   *  (e.g. changing a `pure` node's `op`, a `call` node's `target`). Wiring changes go through
   *  `graphConnect` instead, so a patch can't silently invalidate a connection's type check. */
  setNodes?: Record<string, IRNode>;
  removeNodes?: string[];
  setEntry?: string;
}

/** docs/AI_AGENT_API.md's `graph.write`: "patch a 3JSE Graph's IR directly." Creates the graph
 *  (empty, entry set by the patch) if `graphId` hasn't been written to yet — an agent building a
 *  new Behavior doesn't need a separate "create graph" call. */
export function graphWrite(store: GraphStore, graphId: string, patch: GraphWritePatch): IRGraph {
  let graph = store.get(graphId);
  if (!graph) {
    graph = { nodes: {}, entry: "" };
    store.set(graphId, graph);
  }
  if (patch.setNodes) {
    for (const [id, node] of Object.entries(patch.setNodes)) graph.nodes[id] = node;
  }
  if (patch.removeNodes) {
    for (const id of patch.removeNodes) delete graph.nodes[id];
  }
  if (patch.setEntry !== undefined) graph.entry = patch.setEntry;
  return graph;
}

/** The output type of a value-producing node, where it's statically known — `event`/`call`/
 *  `branch`/`set` don't produce values and return `undefined`, same as `graphConnect`'s
 *  "no declared expected type, skip the check" case below. */
function outputTypeOf(graph: IRGraph, nodeId: string): IRType | undefined {
  const node = graph.nodes[nodeId];
  if (!node) return undefined;
  switch (node.kind) {
    case "pure":
    case "get":
    case "query":
      return node.outputType;
    case "variable":
      return node.type;
    default:
      return undefined;
  }
}

/** Only the slots whose expected type this IR vocabulary actually declares statically — a
 *  Branch's `cond` and any node's `entity` slot. `value`/`args[i]`/`inputs[i]` have no declared
 *  expected type at the IR level yet (types.ts's GetNode/SetNode doc comments — that needs a
 *  ComponentRegistry-driven struct type, real future work), so `graphConnect` skips the check
 *  for those rather than pretending to validate something it can't. */
const SLOT_EXPECTED_TYPE: Partial<Record<string, IRType>> = {
  cond: "boolean",
  entity: "entityRef",
};

export interface GraphConnectRequest {
  /** Producer node id — the wire's source. */
  from: string;
  /** Consumer node id — the wire's destination. */
  to: string;
  /** Which field on the consumer this wire fills — a bare field name ("cond", "entity",
   *  "value") or an indexed array slot ("args[0]", "inputs[1]"). */
  toSlot: string;
}

/** docs/AI_AGENT_API.md's `graph.connect`: "Wire two node pins, type-checked against 3IR's type
 *  system at call time." Mutates `to`'s slot in place on the graph already in the store — call
 *  `graphRead` first for the id, or build it via `graphWrite`. */
export function graphConnect(store: GraphStore, graphId: string, req: GraphConnectRequest): IRGraph {
  const graph = requireGraph(store, graphId);
  if (!graph.nodes[req.from]) throw new Error(`Unknown node "${req.from}".`);
  const target = graph.nodes[req.to];
  if (!target) throw new Error(`Unknown node "${req.to}".`);

  const expected = SLOT_EXPECTED_TYPE[req.toSlot];
  if (expected) {
    const actual = outputTypeOf(graph, req.from);
    if (actual && actual !== expected) {
      throw new Error(
        `Type mismatch: "${req.toSlot}" on ${target.kind} node "${req.to}" wants ${expected}, but "${req.from}" produces ${actual}.`,
      );
    }
  }

  const ref: IRRef = { node: req.from };
  // IRNode is a discriminated union with no index signature — an agent's `toSlot` request is a
  // runtime string, not a field a generic type could name statically, so this reaches through
  // it deliberately (the same pattern Entity's Component data itself uses everywhere else in
  // this codebase: plain-object mutation by field name, validated by the caller, not the type
  // system).
  const dynTarget = target as unknown as Record<string, unknown>;
  const arrayMatch = /^(\w+)\[(\d+)\]$/.exec(req.toSlot);
  if (arrayMatch) {
    const [, field, idxStr] = arrayMatch;
    const arr = dynTarget[field!];
    if (!Array.isArray(arr)) throw new Error(`"${req.toSlot}" is not an array slot on ${target.kind} node "${req.to}".`);
    arr[Number(idxStr)] = ref;
  } else {
    if (!(req.toSlot in dynTarget)) throw new Error(`"${req.toSlot}" is not a valid slot on ${target.kind} node "${req.to}".`);
    dynTarget[req.toSlot] = ref;
  }
  return graph;
}
