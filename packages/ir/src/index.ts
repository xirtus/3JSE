export type {
  IRType,
  IRRef,
  PureOp,
  EventNode,
  PureNode,
  CallNode,
  BranchNode,
  VariableNode,
  QueryNode,
  GetNode,
  SetNode,
  IRNode,
  IRGraph,
} from "./types.js";
export { interpret, type RecordedCall, type InterpretResult } from "./interpreter.js";
export { emit, type SourceMapEntry, type EmitResult } from "./emitter.js";
export { parseTsSubset } from "./tsFrontend.js";
export type { IRHost } from "./host.js";
export { compileToTickFn, type TickFn } from "./toSystem.js";
