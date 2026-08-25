import * as ts from "typescript";

/** Shared by every emitter test that needs to confirm emitted code actually parses — syntactic
 *  diagnostics only (no semantic/type-checking), since emitted snippets reference types like
 *  `Entity` that are expected to be imported at the call site, not resolvable in isolation. */
export function assertValidTs(code: string): void {
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
  if (diagnostics.length > 0) {
    throw new Error(`Emitted code has syntax errors:\n${ts.formatDiagnostics(diagnostics, ts.createCompilerHost({}))}`);
  }
}
