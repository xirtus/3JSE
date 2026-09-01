// Atlas node health — docs/3JSE_ATLAS_FULL_PLAN.md §32. "Health must be derived from evidence."
//
// No node invents its own status. Health is a pure function of what the harness measured: test
// results, a perf report, console output, plus transient editor state (an agent is working on
// it, the user has unsaved edits).

export type HealthStatus =
  | "healthy"
  | "warning"
  | "failing"
  | "unknown"
  | "modified"
  | "untested"
  | "profiling"
  | "agent-working";

/** Everything Atlas knows about a system's current state, from the harness's verify surface. */
export interface SystemEvidence {
  /** test totals attributed to this system (matched by its `tests` globs) */
  tests?: { passed: number; failed: number; total: number };
  /** measured cost in ms/frame (from runtime.getPerf or the Profiler) */
  cpuMs?: number;
  /** budget this system should stay under, ms/frame — a soft warning threshold */
  cpuBudgetMs?: number;
  /** console errors/warnings attributed to this system since the last run */
  consoleErrors?: number;
  consoleWarnings?: number;
  /** the user has edited this system's files / knobs and not re-verified */
  dirty?: boolean;
  /** an agent task is in flight against this system */
  agentWorking?: boolean;
  /** a profiling pass is currently running */
  profiling?: boolean;
}

export interface HealthResult {
  status: HealthStatus;
  /** short reasons, most important first — shown on hover / in the inspector */
  reasons: string[];
}

/**
 * Precedence (most urgent first): agent-working / profiling are transient live states and win;
 * then failing (a test failed or a console error); then warning (over budget, console warnings,
 * some tests present but not all passing without an outright failure); then modified (dirty,
 * everything else fine); then untested (no tests at all); then healthy; then unknown (no
 * evidence of any kind).
 */
export function deriveHealth(ev: SystemEvidence | undefined): HealthResult {
  if (!ev) return { status: "unknown", reasons: ["no evidence"] };

  if (ev.agentWorking) return { status: "agent-working", reasons: ["agent task in flight"] };
  if (ev.profiling) return { status: "profiling", reasons: ["profiling pass running"] };

  const reasons: string[] = [];
  const hasTests = !!ev.tests && ev.tests.total > 0;
  const testsFailing = hasTests && ev.tests!.failed > 0;
  const errored = (ev.consoleErrors ?? 0) > 0;

  if (testsFailing) reasons.push(`${ev.tests!.failed}/${ev.tests!.total} tests failing`);
  if (errored) reasons.push(`${ev.consoleErrors} console error(s)`);
  if (testsFailing || errored) return { status: "failing", reasons };

  const overBudget =
    ev.cpuMs !== undefined && ev.cpuBudgetMs !== undefined && ev.cpuMs > ev.cpuBudgetMs;
  const warned = (ev.consoleWarnings ?? 0) > 0;
  const partialTests = hasTests && ev.tests!.passed < ev.tests!.total;

  if (overBudget) reasons.push(`${ev.cpuMs!.toFixed(2)} ms > ${ev.cpuBudgetMs} ms budget`);
  if (warned) reasons.push(`${ev.consoleWarnings} console warning(s)`);
  if (partialTests) reasons.push(`${ev.tests!.passed}/${ev.tests!.total} tests passing`);
  if (overBudget || warned || partialTests) return { status: "warning", reasons };

  if (ev.dirty) return { status: "modified", reasons: ["unsaved edits, not re-verified"] };

  if (!hasTests) {
    const info: string[] = ["no tests declared"];
    if (ev.cpuMs !== undefined) info.push(`${ev.cpuMs.toFixed(2)} ms`);
    return { status: "untested", reasons: info };
  }

  const ok: string[] = [`${ev.tests!.passed}/${ev.tests!.total} tests passing`];
  if (ev.cpuMs !== undefined) ok.push(`${ev.cpuMs.toFixed(2)} ms`);
  return { status: "healthy", reasons: ok };
}
