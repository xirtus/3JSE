import type { ConsoleEntry, PerfReport } from "./runtime.js";

/**
 * Generates the 3JSE Harness evidence report (3JSE_Harness_v0.1/templates/EVIDENCE_REPORT.example.md)
 * from a headless run's structured outputs. This is docs/HARNESS.md's convergence row made real:
 * "Evidence report fields -> runtime.getConsole / runtime.getPerf / runtime.captureFrame — the
 * verify step as engine APIs." The harness no longer hand-writes the Build/runtime and Performance
 * sections; it runs the game headless and calls this.
 *
 * Caller still supplies what only a human/agent can judge — what loop was exercised, the visual
 * pass, the provider ledger, known limitations — but those are prompts in the output, not fiction.
 */
export interface EvidenceInput {
  /** One line: what core loop was actually played/tested headless. */
  coreLoop: string;
  /** Did the exercised loop pass its own gameplay assertions? */
  gameplayPass: boolean | "n/a";
  build?: { typecheck?: BuildStatus; tests?: BuildStatus; build?: BuildStatus };
  console: ConsoleEntry[];
  perf?: PerfReport;
  /** capability -> provider/reference chosen (the routing ledger's conclusion). */
  providerLedger?: Record<string, string>;
  /** external asset -> license/attribution string. */
  assets?: Record<string, string>;
  /** Screenshot file paths already captured (Visual QA is still a separate, human pass). */
  screenshots?: string[];
  visualNotes?: string;
  limitations?: string[];
}

export type BuildStatus = "pass" | "fail" | "not run" | { ok: boolean; detail?: string };

function statusLine(s: BuildStatus | undefined): string {
  if (s == null) return "not run";
  if (typeof s === "string") return s;
  return (s.ok ? "pass" : "fail") + (s.detail ? ` — ${s.detail}` : "");
}

export function buildEvidenceReport(input: EvidenceInput): string {
  const errors = input.console.filter((e) => e.level === "error");
  const warns = input.console.filter((e) => e.level === "warn");
  const L: string[] = [];

  L.push("# 3JSE Evidence Report", "");
  L.push(`_Generated ${new Date().toISOString()} from a headless run._`, "");

  L.push("## Core loop");
  L.push(`- What was actually played/tested: ${input.coreLoop}`);
  L.push(
    `- Pass/fail: ${input.gameplayPass === "n/a" ? "n/a" : input.gameplayPass ? "PASS" : "FAIL"}`,
    "",
  );

  L.push("## Build/runtime");
  L.push(`- typecheck: ${statusLine(input.build?.typecheck)}`);
  L.push(`- tests: ${statusLine(input.build?.tests)}`);
  L.push(`- build: ${statusLine(input.build?.build)}`);
  L.push(
    `- console errors: ${errors.length === 0 ? "none" : `${errors.length} — ` + errors.map((e) => e.message).join("; ")}`,
  );
  if (warns.length) L.push(`- console warnings: ${warns.length} — ${warns.map((e) => e.message).join("; ")}`);
  L.push("");

  L.push("## Visual evidence");
  L.push(
    `- screenshots captured: ${input.screenshots?.length ? input.screenshots.join(", ") : "none (Visual QA pass still owed)"}`,
  );
  L.push(`- fresh-eyes issues found/fixed: ${input.visualNotes ?? "—"}`, "");

  L.push("## Performance");
  if (input.perf) {
    const p = input.perf;
    L.push(`- target device/browser: headless Node (${p.note})`);
    L.push(
      `- FPS/frame time: ~${p.estimatedFps} fps sim (${p.avgMsPerFrame} ms/frame avg over ${p.frames} frames; ${p.minMsPerFrame}–${p.maxMsPerFrame} ms)`,
    );
    L.push(`- draw calls: not measured headless — Profiler panel owes this`);
    L.push(
      `- notable hotspots: scene = ${p.scene.entities} entities (${p.scene.spatialEntities} spatial), ${p.scene.systems} systems, ${p.scene.levels} level(s)`,
    );
  } else {
    L.push("- target device/browser:", "- FPS/frame time:", "- draw calls:", "- notable hotspots:");
  }
  L.push("");

  L.push("## Provider / asset ledger");
  const pl = input.providerLedger ?? {};
  L.push(
    Object.keys(pl).length
      ? Object.entries(pl).map(([cap, prov]) => `- ${cap} -> ${prov}`).join("\n")
      : "- capability -> provider/reference:",
  );
  const assets = input.assets ?? {};
  L.push(
    Object.keys(assets).length
      ? Object.entries(assets).map(([a, lic]) => `- ${a}: ${lic}`).join("\n")
      : "- external assets + licenses:",
  );
  L.push("");

  L.push("## Known limitations");
  L.push(...(input.limitations?.length ? input.limitations.map((x) => `- ${x}`) : ["-"]));
  L.push("");

  return L.join("\n");
}
