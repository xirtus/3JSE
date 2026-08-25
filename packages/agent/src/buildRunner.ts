import { spawn } from "node:child_process";
import type { CommandRunner } from "./build.js";

/** Node-only (spawns a real subprocess) — deliberately its own subpath, not the main
 *  `@3jse/agent` barrel (build.ts's doc comment explains why: keeping `node:child_process` out
 *  of what apps/editor's Agent Panel bundles). This is for a Node-hosted `@3jse/agent` MCP
 *  server instance — a stdio transport talking to an external agent, the primary way
 *  docs/AI_AGENT_API.md actually expects a connection, not this repo's in-browser demo
 *  (server.ts's own doc comment).
 *
 * Two things this got wrong on the first pass, found by actually running it against a real
 * package rather than trusting the happy path: the spawned child inherited a live `stdin` pipe
 * that was never written to or closed, so anything the child ran that reads stdin for an
 * interactive prompt (a package manager's own confirmation prompt, for instance) would hang
 * forever waiting for input that was never coming — a real ~15-minute hang in this package's own
 * test suite, not a hypothetical. And there was no timeout at all, so a genuine hang in *any*
 * spawned command had no way to fail loudly instead of wedging the whole VERIFY step
 * indefinitely — unacceptable for a tool `docs/AI_AGENT_API.md`'s headless verify loop depends
 * on completing. Both are fixed at the source here, not worked around by the caller: `stdin` is
 * explicitly `"ignore"`d (any prompt sees immediate EOF instead of hanging), and every spawned
 * command is bounded by `timeoutMs`, `SIGKILL`ed if it runs past it.
 */
export function createNodeCommandRunner(timeoutMs = 60_000): CommandRunner {
  return {
    run(cmd, args, cwd) {
      return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, killSignal: "SIGKILL" });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        proc.on("error", reject);
        proc.on("close", (code, signal) => {
          if (signal === "SIGKILL") {
            stderr += `\n[killed after exceeding ${timeoutMs}ms timeout]`;
          }
          resolve({ exitCode: code ?? 1, stdout, stderr });
        });
      });
    },
  };
}
