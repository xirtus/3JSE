// @3jse/materials — the Material Graph (docs/RENDERING.md, docs/EDITOR.md). A node graph that
// compiles to Three.js TSL, with a CPU reference evaluator for headless visual-regression-lite
// checks. Nothing here imports three; codegen is a string, like @3jse/packaging's bootstrap.

export {
  validateGraph,
  OP_ARITY,
  type MaterialGraph,
  type MatNode,
  type MatEdge,
  type MatOp,
  type MatType,
  type OutputSlot,
  type GraphIssue,
} from "./graph.js";
export { compileToTSL, type CompileResult } from "./compile.js";
export { evaluateGraph, type EvalInputs, type Value } from "./evaluate.js";
