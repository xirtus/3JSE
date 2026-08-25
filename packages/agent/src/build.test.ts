import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildTypecheck, buildRunTests, type CommandRunner } from "./build.js";
import { createNodeCommandRunner } from "./buildRunner.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function fakeRunner(exitCode: number, stdout: string, stderr = ""): CommandRunner {
  return { run: async () => ({ exitCode, stdout, stderr }) };
}

describe("build tools — injected runner (fast, deterministic)", () => {
  it("buildTypecheck reports ok:true and the captured output on a clean exit", async () => {
    const result = await buildTypecheck(fakeRunner(0, "no errors"), "/some/project");
    expect(result).toEqual({ ok: true, output: "no errors" });
  });

  it("buildTypecheck reports ok:false with stdout+stderr on a non-zero exit", async () => {
    const result = await buildTypecheck(fakeRunner(2, "src/foo.ts(3,1): error TS1234", "warning: something"), "/some/project");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("error TS1234");
    expect(result.output).toContain("warning: something");
  });

  it("buildRunTests reports ok:false on a failing test run", async () => {
    const result = await buildRunTests(fakeRunner(1, "1 failed | 4 passed"), "/some/project");
    expect(result.ok).toBe(false);
    expect(result.output).toContain("1 failed");
  });
});

describe("build tools — real subprocess (createNodeCommandRunner), against a real package", () => {
  it("buildTypecheck actually runs `pnpm typecheck` in @3jse/vendor and reports success", async () => {
    const vendorDir = resolve(HERE, "../../vendor");
    const result = await buildTypecheck(createNodeCommandRunner(20_000), vendorDir);
    expect(result.ok, result.output).toBe(true);
  }, 25_000);

  // A real, prior incident, not a hypothetical: the first version of createNodeCommandRunner()
  // left the spawned child's stdin as a live, unclosed pipe and had no timeout at all — a
  // command that reads stdin for a prompt (or just genuinely hangs) blocked forever, and this
  // package's OWN test suite hung for ~15 minutes before vitest's outer timeout finally gave up.
  // buildRunner.ts's doc comment has the full story; this test is what proves the fix — a command
  // that hangs past `timeoutMs` gets SIGKILLed and reported, not left to wedge the caller.
  it("a command that hangs past timeoutMs is killed and reported, not left running", async () => {
    const runner = createNodeCommandRunner(300);
    const result = await runner.run("sleep", ["30"], process.cwd());
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("killed after exceeding 300ms timeout");
  }, 5_000);
});
