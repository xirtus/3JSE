import * as ts from "typescript";
import type { CallNode, IRGraph, IRNode, IRRef, IRType, PureOp, SetNode } from "./types.js";

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

function irTypeForParam(typeText: string): IRType {
  if (typeText === "number" || typeText === "boolean" || typeText === "string") return typeText;
  if (typeText === "Entity") return "entityRef"; // emitter.ts's tsTypeText does the inverse mapping
  throw new Error(`Recognized subset only supports number/boolean/string/Entity parameters, got "${typeText}".`);
}

/**
 * docs/GAMEPLAY_IR.md's "TypeScript adapter" frontend: parses a small, deliberately narrow,
 * *recognized* TS subset into 3IR — not a general TS-to-IR compiler. The subset: one top-level
 * named function declaration, number/boolean/string/Entity parameters, a body that is either
 * empty or a single `if`/`else` statement whose condition is a binary comparison or a
 * `x.hasComponent("Type")` check, and whose branches are each zero or more statements of: a call
 * to a plain or single-level-dotted named function (`foo(a, b)`, `service.method(a)`), or an
 * assignment to `entity.getComponent<any>("Type")!.field`. Anything outside that — exactly
 * docs/GAMEPLAY_IR.md's "honest limit" — throws, on purpose: the production frontend turns this
 * into an opaque "code" node instead of failing; this slice only needs to prove the round-trip
 * mechanism on the vocabulary it does recognize (packages/ir/src/entityRoundtrip.test.ts).
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
    return { name: p.name.text, type: irTypeForParam(typeText) };
  });

  // Identifier → VariableNode id, for both real function params and free identifiers referring
  // to an external binding (e.g. an imported asset ref) — the same "resolved by name through
  // `interpret()`'s bindings map" contract either way (types.ts's VariableNode doc comment).
  // Free identifiers get a real type only when first *used* somewhere type-revealing; otherwise
  // "string" is the honest-but-arbitrary default — this frontend doesn't have a type checker.
  const varIds = new Map<string, string>();
  for (const p of params) {
    const varId = nextId("var");
    nodes[varId] = { kind: "variable", id: varId, scope: "local", name: p.name, type: p.type };
    varIds.set(p.name, varId);
  }

  function variableRef(name: string, inferredType: IRType): IRRef {
    let varId = varIds.get(name);
    if (!varId) {
      varId = nextId("var");
      nodes[varId] = { kind: "variable", id: varId, scope: "local", name, type: inferredType };
      varIds.set(name, varId);
    }
    return { node: varId };
  }

  /** `entity.getComponent<...>("Component")!.field` (a read) or the same shape as an assignment
   *  target — the one Component-access syntax this subset recognizes, matching emitter.ts's
   *  `set`/`get` output exactly so re-parsing the emitter's own text works. */
  function componentAccessTarget(expr: ts.Expression): { entityExpr: ts.Expression; component: string; field: string } | null {
    if (!ts.isPropertyAccessExpression(expr)) return null;
    let inner: ts.Expression = expr.expression;
    if (ts.isNonNullExpression(inner)) inner = inner.expression;
    if (!ts.isCallExpression(inner)) return null;
    if (!ts.isPropertyAccessExpression(inner.expression)) return null;
    if (inner.expression.name.text !== "getComponent") return null;
    const arg = inner.arguments[0];
    if (!arg || !ts.isStringLiteral(arg)) return null;
    return { entityExpr: inner.expression.expression, component: arg.text, field: expr.name.text };
  }

  function calleeText(expr: ts.Expression): string {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      return `${expr.expression.text}.${expr.name.text}`;
    }
    throw new Error(`Recognized subset does not support callee: ${expr.getText(sf)}`);
  }

  function expression(rawExpr: ts.Expression): IRRef {
    let expr = rawExpr;
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression;

    if (ts.isIdentifier(expr)) return variableRef(expr.text, "string");
    if (ts.isNumericLiteral(expr)) {
      const id = nextId("const");
      nodes[id] = { kind: "pure", id, op: "const", inputs: [], value: Number(expr.text), outputType: "number" };
      return { node: id };
    }
    if (ts.isStringLiteral(expr)) {
      const id = nextId("const");
      nodes[id] = { kind: "pure", id, op: "const", inputs: [], value: expr.text, outputType: "string" };
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
    if (ts.isBinaryExpression(expr)) {
      const op = COMPARISON_OP[expr.operatorToken.kind];
      if (!op) throw new Error(`Recognized subset does not support operator "${expr.operatorToken.getText(sf)}".`);
      const id = nextId("pure");
      nodes[id] = { kind: "pure", id, op, inputs: [expression(expr.left), expression(expr.right)], outputType: "boolean" };
      return { node: id };
    }
    const getTarget = componentAccessTarget(expr);
    if (getTarget) {
      const id = nextId("get");
      nodes[id] = {
        kind: "get",
        id,
        entity: expression(getTarget.entityExpr),
        component: getTarget.component,
        field: getTarget.field,
        // No ComponentRegistry type lookup in this slice (types.ts's GetNode doc comment) — the
        // interpreter and emitter both ignore outputType for "get", so this is documentation
        // only, not load-bearing.
        outputType: "number",
      };
      return { node: id };
    }
    if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === "hasComponent") {
      const arg = expr.arguments[0];
      if (!arg || !ts.isStringLiteral(arg)) throw new Error('Recognized subset requires hasComponent("Type") with a string literal.');
      const id = nextId("query");
      nodes[id] = {
        kind: "query",
        id,
        op: "hasComponent",
        entity: expression(expr.expression.expression),
        component: arg.text,
        outputType: "boolean",
      };
      return { node: id };
    }
    throw new Error(`Recognized subset does not support expression: ${expr.getText(sf)}`);
  }

  function statementToRef(stmt: ts.Statement): IRRef | null {
    if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
      const callExpr = stmt.expression;
      const id = nextId("call");
      nodes[id] = { kind: "call", id, target: calleeText(callExpr.expression), args: callExpr.arguments.map(expression), next: null };
      return { node: id };
    }
    if (
      ts.isExpressionStatement(stmt) &&
      ts.isBinaryExpression(stmt.expression) &&
      stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const target = componentAccessTarget(stmt.expression.left);
      if (!target) {
        throw new Error('Recognized subset only supports assigning to entity.getComponent<...>("Type")!.field.');
      }
      const id = nextId("set");
      nodes[id] = {
        kind: "set",
        id,
        entity: expression(target.entityExpr),
        component: target.component,
        field: target.field,
        value: expression(stmt.expression.right),
        next: null,
      };
      return { node: id };
    }
    if (ts.isIfStatement(stmt)) {
      const id = nextId("branch");
      const cond = expression(stmt.expression);
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
    let prevChainable: CallNode | SetNode | undefined;
    for (const s of stmts) {
      const ref = statementToRef(s);
      if (!ref) continue;
      if (headRef === null) headRef = ref;
      else if (prevChainable) prevChainable.next = ref;
      else throw new Error("Recognized subset does not support a statement following a branch in the same block.");
      const node = nodes[ref.node];
      prevChainable = node?.kind === "call" || node?.kind === "set" ? node : undefined;
    }
    return headRef;
  }

  const entryId = nextId("event");
  const bodyRef = blockToChain(fn.body);
  nodes[entryId] = { kind: "event", id: entryId, name: fn.name.text, params, next: bodyRef };

  return { nodes, entry: entryId };
}
