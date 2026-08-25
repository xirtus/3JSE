export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Seam between build.ts's tools and an actual subprocess — build.test.ts injects a fake one for
 *  fast, deterministic unit tests; `createNodeCommandRunner()` (buildRunner.ts, a separate
 *  subpath — see package.json/index.ts) is the real one. This file stays free of any
 *  `node:child_process` import on purpose: it's reachable from apps/editor's browser-hosted
 *  Agent Panel through `@3jse/agent`'s main barrel, and a Node-builtin import here would break
 *  Vite's bundling of that panel even if the function that used it were never called client-side
 *  — the same reasoning packages/runtime's `systems/builtins` subpath split documents. */
export interface CommandRunner {
  run(cmd: string, args: string[], cwd: string): Promise<CommandResult>;
}

export interface BuildToolResult {
  ok: boolean;
  output: string;
}

function summarize(result: CommandResult): BuildToolResult {
  return { ok: result.exitCode === 0, output: (result.stdout + result.stderr).trim() };
}

/** docs/AI_AGENT_API.md's `build.typecheck`: "Run the TS/IR type checker without a full build."
 *  Runs the package's own `typecheck` script (every package in this monorepo has one —
 *  tsconfig.base.json's convention) rather than re-implementing tsc invocation here, so it stays
 *  in sync with whatever each package actually declares as its type-check step. */
export async function buildTypecheck(runner: CommandRunner, projectDir: string): Promise<BuildToolResult> {
  return summarize(await runner.run("pnpm", ["typecheck"], projectDir));
}

/** docs/AI_AGENT_API.md's `build.runTests`: "Run the project's automated test suite." Same
 *  posture as `buildTypecheck` — runs the package's own `test` script. */
export async function buildRunTests(runner: CommandRunner, projectDir: string): Promise<BuildToolResult> {
  return summarize(await runner.run("pnpm", ["test", "--", "--run"], projectDir));
}
