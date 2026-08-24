import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseTsSubset } from "./tsFrontend.js";
import { interpret } from "./interpreter.js";
import { emit } from "./emitter.js";

// docs/ROADMAP.md Phase 0's exit criterion: "confirm the source-map round-trip
// (docs/GAMEPLAY_IR.md's bidirectional-editing claim) actually works on a small recognized TS
// subset before it's load-bearing for the whole engine." This file is that confirmation.

const SOURCE = `
function onDamage(amount: number, current: number): void {
  if (amount > current) {
    applyDeath();
  } else {
    applyDamage(amount);
  }
}
`;

function assertValidTs(code: string): void {
  const path = "emitted.ts";
  const sf = ts.createSourceFile(path, code, ts.ScriptTarget.ES2022, true);
  const program = ts.createProgram({
    rootNames: [path],
    options: { noEmit: true, strict: true },
    host: {
      ...ts.createCompilerHost({}),
      getSourceFile: (fileName) => (fileName === path ? sf : undefined),
      writeFile: () => {},
      fileExists: (fileName) => fileName === path,
      readFile: (fileName) => (fileName === path ? code : undefined),
    },
  });
  const diagnostics = program.getSyntacticDiagnostics(sf);
  expect(diagnostics, ts.formatDiagnostics(diagnostics, ts.createCompilerHost({}))).toHaveLength(0);
}

describe("3IR prototype — TS subset frontend", () => {
  it("parses the recognized subset into all 5 node kinds", () => {
    const graph = parseTsSubset(SOURCE);
    const kinds = new Set(Object.values(graph.nodes).map((n) => n.kind));
    expect(kinds).toEqual(new Set(["event", "variable", "pure", "branch", "call"]));
  });

  it("rejects a statement outside the recognized subset", () => {
    expect(() => parseTsSubset("function f(x: number): void { let y = x + 1; }")).toThrow();
  });
});

describe("3IR prototype — interpreter", () => {
  it("takes the 'then' branch and calls applyDeath when amount > current", () => {
    const graph = parseTsSubset(SOURCE);
    const result = interpret(graph, { amount: 10, current: 5 });
    expect(result.calls).toEqual([{ target: "applyDeath", args: [] }]);
  });

  it("takes the 'else' branch and calls applyDamage(amount) when amount <= current", () => {
    const graph = parseTsSubset(SOURCE);
    const result = interpret(graph, { amount: 3, current: 5 });
    expect(result.calls).toEqual([{ target: "applyDamage", args: [3] }]);
  });
});

describe("3IR prototype — JS/TS emitter + source map", () => {
  it("emits syntactically valid TypeScript", () => {
    const graph = parseTsSubset(SOURCE);
    const { code } = emit(graph);
    assertValidTs(code);
  });

  it("every source-map entry's line actually contains that node's emitted text", () => {
    const graph = parseTsSubset(SOURCE);
    const { code, sourceMap } = emit(graph);
    const lines = code.split("\n");

    expect(sourceMap.length).toBeGreaterThan(0);
    for (const entry of sourceMap) {
      const node = graph.nodes[entry.nodeId]!;
      const lineText = lines[entry.line - 1];
      expect(lineText, `node ${entry.nodeId} (${node.kind}) → line ${entry.line}`).toBeDefined();
      if (node.kind === "call") expect(lineText).toContain(node.target);
      if (node.kind === "branch") expect(lineText).toContain("if (");
      if (node.kind === "event") expect(lineText).toContain(`function ${node.name}`);
    }
  });

  it("round-trips: parse → emit → re-parse → interpret produces the same calls as the original graph", () => {
    const original = parseTsSubset(SOURCE);
    const { code } = emit(original);
    const reparsed = parseTsSubset(code);

    for (const [amount, current] of [
      [10, 5],
      [3, 5],
    ]) {
      const args = { amount, current };
      expect(interpret(reparsed, args)).toEqual(interpret(original, args));
    }
  });
});
