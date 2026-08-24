import * as ts from "typescript";
import type { CallNode, IRGraph, IRNode, IRRef, IRType, PureOp } from "./types.js";

const COMPARISON_OP: Partial<Record<ts.SyntaxKind, PureOp>> = {
  [ts.SyntaxKind.GreaterThanToken]: "gt",
  [ts.SyntaxKind.LessThanToken]: "lt",
  [ts.SyntaxKind.GreaterThanEqualsToken]: "gte",
  [ts.SyntaxKind.LessThanEqualsToken]: "lte",
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: "eq",
  [ts.SyntaxKind.EqualsEqualsToken]: "eq",
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "neq",
  [ts.SyntaxKind.ExclamationEqualsToken]: "neq",
};

/**
 * docs/GAMEPLAY_IR.md's "TypeScript adapter" frontend, prototype slice: parses a small,
 * deliberately narrow, *recognized* TS subset into 3IR — not a general TS-to-IR compiler. The
 * subset: one top-level named function declaration, number/boolean parameters, a body that is
 * either empty or a single `if`/`else` statement whose condition is one binary comparison
 * between two recognized expressions (a parameter reference or a number/boolean literal), and
 * whose branches are each zero or more calls to a plain named function (`foo(a, b);`). Anything
 * outside that — exactly docs/GAMEPLAY_IR.md's "honest limit" — throws, on purpose: the
 * production frontend turns this into an opaque "code" node instead of failing; this prototype
 * only needs to prove the round-trip mechanism on the subset it does recognize.
 */
export function parseTsSubset(source: string): IRGraph {
  const sf = ts.createSourceFile("input.ts", source, ts.ScriptTarget.ES2022, true);
  const nodes: Record<string, IRNode> = {};
  let uid = 0;
  const nextId = (prefix: string) => `${prefix}_${uid++}`;

  const fn = sf.statements.find(ts.isFunctionDeclaration);
  if (!fn || !fn.name || !fn.body) {
    throw new Error("Recognized subset requires exactly one top-level named function declaration with a body.");
  }

  const params = fn.parameters.map((p) => {
    if (!ts.isIdentifier(p.name)) throw new Error("Recognized subset requires plain identifier parameter names.");
    const typeText = p.type ? p.type.getText(sf) : "number";
    if (typeText !== "number" && typeText !== "boolean") {
      throw new Error(`Recognized subset only supports number/boolean parameters, got "${typeText}".`);
    }
    return { name: p.name.text, type: typeText as IRType };
  });

  const paramVarIds = new Map<string, string>();
  for (const p of params) {
    const varId = nextId("var");
    nodes[varId] = { kind: "variable", id: varId, scope: "local", name: p.name, type: p.type };
    paramVarIds.set(p.name, varId);
  }

  function refFor(expr: ts.Expression): IRRef {
    if (ts.isIdentifier(expr)) {
      const varId = paramVarIds.get(expr.text);
      if (!varId) throw new Error(`Unrecognized identifier "${expr.text}" — only function parameters are supported.`);
      return { node: varId };
    }
    if (ts.isNumericLiteral(expr)) {
      const id = nextId("const");
      nodes[id] = { kind: "pure", id, op: "const", inputs: [], value: Number(expr.text), outputType: "number" };
      return { node: id };
    }
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
      const id = nextId("const");
      nodes[id] = {
        kind: "pure",
        id,
        op: "const",
        inputs: [],
        value: expr.kind === ts.SyntaxKind.TrueKeyword,
        outputType: "boolean",
      };
      return { node: id };
    }
    throw new Error(`Recognized subset does not support expression: ${expr.getText(sf)}`);
  }

  function condRef(rawExpr: ts.Expression): IRRef {
    // Unwraps redundant parens — including the ones the emitter itself wraps a condition in
    // (emitter.ts's refText), so parse → emit → re-parse round-trips instead of rejecting its
    // own output.
    let expr = rawExpr;
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
    if (!ts.isBinaryExpression(expr)) {
      throw new Error("Recognized subset only supports a single binary comparison as an if-condition.");
    }
    const op = COMPARISON_OP[expr.operatorToken.kind];
    if (!op) throw new Error(`Recognized subset does not support operator "${expr.operatorToken.getText(sf)}".`);
    const left = refFor(expr.left);
    const right = refFor(expr.right);
    const id = nextId("pure");
    nodes[id] = { kind: "pure", id, op, inputs: [left, right], outputType: "boolean" };
    return { node: id };
  }

  function statementToRef(stmt: ts.Statement): IRRef | null {
    if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
      const callExpr = stmt.expression;
      if (!ts.isIdentifier(callExpr.expression)) {
        throw new Error("Recognized subset only supports calling a plain named function.");
      }
      const id = nextId("call");
      nodes[id] = {
        kind: "call",
        id,
        target: callExpr.expression.text,
        args: callExpr.arguments.map(refFor),
        next: null,
      };
      return { node: id };
    }
    if (ts.isIfStatement(stmt)) {
      const id = nextId("branch");
      const cond = condRef(stmt.expression);
      const then = blockToChain(stmt.thenStatement);
      const elseChain = stmt.elseStatement ? blockToChain(stmt.elseStatement) : null;
      nodes[id] = { kind: "branch", id, cond, then, else: elseChain };
      return { node: id };
    }
    throw new Error(`Recognized subset does not support statement: ${stmt.getText(sf)}`);
  }

  function blockToChain(stmt: ts.Statement): IRRef | null {
    const stmts = ts.isBlock(stmt) ? stmt.statements : [stmt];
    let headRef: IRRef | null = null;
    let prevCall: CallNode | undefined;
    for (const s of stmts) {
      const ref = statementToRef(s);
      if (!ref) continue;
      if (headRef === null) headRef = ref;
      else if (prevCall) prevCall.next = ref;
      else throw new Error("Recognized subset does not support a statement following a branch in the same block.");
      const node = nodes[ref.node];
      prevCall = node?.kind === "call" ? node : undefined;
    }
    return headRef;
  }

  const entryId = nextId("event");
  const bodyRef = blockToChain(fn.body);
  nodes[entryId] = { kind: "event", id: entryId, name: fn.name.text, params, next: bodyRef };

  return { nodes, entry: entryId };
}
