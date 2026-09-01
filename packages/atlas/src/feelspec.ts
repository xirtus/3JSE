// FeelSpec — machine-readable mechanical/aesthetic intent (docs/3JSE_ATLAS_FULL_PLAN.md §6–16).
//
// FeelSpec describes *intent* in named dimensions (0..1 by convention); source code realizes it.
// This module: parse/validate the §8 schema, resolve profile inheritance (§14, deltas only),
// resolve weighted reference blends (§11), and enforce protected constraints (§13).
//
// Kept as plain JS objects — YAML is a caller concern (the editor can JSON.parse a form; a CLI
// can add a YAML step). Matches the engine-package rule: no fs, testable from a Record/object.

export interface FeelSpec {
  version: number;
  /** semantic system this profile describes, e.g. "vehicle.arcade" */
  system: string;
  profile: { id: string; label?: string };
  /** id of a profile this one inherits from; only deltas are stored here (§14) */
  extends?: string;
  /** weighted named reference profiles to blend toward (§10, §11) */
  references?: Record<string, number>;
  /** the design-space dimensions, 0..1 by convention (§9) */
  intent: Record<string, number>;
  /** dimension paths that must not move during a transformation (§13) */
  protected?: string[];
  /** concrete implementation overrides Atlas passes straight through (§8 `overrides`) */
  overrides?: Record<string, number | boolean | string>;
  /** tests that gate changes to this profile (§8 `tests`, §31) */
  tests?: string[];
}

export interface FeelSpecIssue {
  level: "error" | "warn";
  message: string;
}

/** Validate a raw object as a FeelSpec. Returns the typed spec plus any issues; throws only on
 *  a shape that can't be a FeelSpec at all. */
export function parseFeelSpec(raw: unknown): { spec: FeelSpec; issues: FeelSpecIssue[] } {
  if (typeof raw !== "object" || raw === null) throw new Error("FeelSpec must be an object.");
  const r = raw as Record<string, unknown>;
  const issues: FeelSpecIssue[] = [];

  if (typeof r.system !== "string" || !r.system) throw new Error("FeelSpec.system is required.");
  const profile = r.profile as { id?: unknown; label?: unknown } | undefined;
  if (!profile || typeof profile.id !== "string") throw new Error("FeelSpec.profile.id is required.");
  if (typeof r.intent !== "object" || r.intent === null) throw new Error("FeelSpec.intent is required.");

  const intent: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.intent as Record<string, unknown>)) {
    if (typeof v !== "number" || Number.isNaN(v)) {
      issues.push({ level: "error", message: `intent.${k} is not a number` });
      continue;
    }
    if (v < 0 || v > 1) issues.push({ level: "warn", message: `intent.${k} = ${v} is outside the 0..1 convention` });
    intent[k] = v;
  }

  const references: Record<string, number> = {};
  for (const [k, v] of Object.entries((r.references as Record<string, unknown>) ?? {})) {
    if (typeof v !== "number") { issues.push({ level: "error", message: `references.${k} is not a number` }); continue; }
    references[k] = v;
  }
  const refTotal = Object.values(references).reduce((a, b) => a + b, 0);
  if (Object.keys(references).length > 0 && Math.abs(refTotal - 1) > 0.001) {
    issues.push({ level: "warn", message: `reference weights sum to ${refTotal.toFixed(3)}, not 1` });
  }

  const spec: FeelSpec = {
    version: typeof r.version === "number" ? r.version : 1,
    system: r.system,
    profile: { id: profile.id, label: typeof profile.label === "string" ? profile.label : undefined },
    extends: typeof r.extends === "string" ? r.extends : undefined,
    references: Object.keys(references).length ? references : undefined,
    intent,
    protected: Array.isArray(r.protected) ? r.protected.filter((x): x is string => typeof x === "string") : undefined,
    overrides: (r.overrides as Record<string, number | boolean | string>) ?? undefined,
    tests: Array.isArray(r.tests) ? r.tests.filter((x): x is string => typeof x === "string") : undefined,
  };
  return { spec, issues };
}

/** Fold a profile's `extends` chain (§14): child intent/overrides win, arrays union. `lookup`
 *  resolves a parent id to its spec. Cycles are detected and reported, not followed. */
export function resolveInheritance(
  spec: FeelSpec,
  lookup: (id: string) => FeelSpec | undefined,
): { resolved: FeelSpec; issues: FeelSpecIssue[] } {
  const issues: FeelSpecIssue[] = [];
  const chain: FeelSpec[] = [];
  const seen = new Set<string>();
  let cur: FeelSpec | undefined = spec;
  while (cur) {
    if (seen.has(cur.profile.id)) {
      issues.push({ level: "error", message: `FeelSpec inheritance cycle at "${cur.profile.id}"` });
      break;
    }
    seen.add(cur.profile.id);
    chain.unshift(cur); // base-first
    if (!cur.extends) break;
    const parent = lookup(cur.extends);
    if (!parent) { issues.push({ level: "error", message: `extends "${cur.extends}" not found` }); break; }
    cur = parent;
  }

  const resolved: FeelSpec = {
    version: spec.version,
    system: spec.system,
    profile: spec.profile,
    intent: {},
    references: undefined,
    protected: [],
    overrides: {},
    tests: [],
  };
  for (const s of chain) {
    Object.assign(resolved.intent, s.intent);
    if (s.references) resolved.references = { ...(resolved.references ?? {}), ...s.references };
    if (s.overrides) Object.assign(resolved.overrides!, s.overrides);
    for (const p of s.protected ?? []) if (!resolved.protected!.includes(p)) resolved.protected!.push(p);
    for (const t of s.tests ?? []) if (!resolved.tests!.includes(t)) resolved.tests!.push(t);
  }
  if (!resolved.protected!.length) delete resolved.protected;
  if (!resolved.tests!.length) delete resolved.tests;
  if (!Object.keys(resolved.overrides!).length) delete resolved.overrides;
  return { resolved, issues };
}

/**
 * Weighted blend of `spec.intent` toward named reference profiles (§11). `profiles` supplies
 * each reference's dimension values. Numeric dimensions blend as weighted interpolation between
 * the spec's own value and the weighted reference target; dimensions only present in references
 * are pulled in at their weighted value. Structural (non-numeric) values are out of scope here
 * and are flagged for agent resolution (§11 "Structural conflicts require agent resolution").
 */
export function resolveFeel(
  spec: FeelSpec,
  profiles: Record<string, Record<string, number>>,
): { intent: Record<string, number>; unresolved: string[] } {
  const refs = spec.references ?? {};
  const total = Object.values(refs).reduce((a, b) => a + b, 0);
  if (total <= 0) return { intent: { ...spec.intent }, unresolved: [] };

  const dims = new Set<string>(Object.keys(spec.intent));
  for (const name of Object.keys(refs)) {
    for (const d of Object.keys(profiles[name] ?? {})) dims.add(d);
  }

  const out: Record<string, number> = {};
  const unresolved: string[] = [];
  for (const d of dims) {
    let refTarget = 0;
    let refWeight = 0;
    for (const [name, w] of Object.entries(refs)) {
      const p = profiles[name];
      if (p && d in p) { refTarget += p[d]! * w; refWeight += w; }
    }
    if (refWeight === 0) {
      out[d] = spec.intent[d] ?? 0;
      continue;
    }
    const normalizedTarget = refTarget / refWeight;
    const pull = refWeight / total; // how strongly the references collectively speak to this dim
    const base = spec.intent[d] ?? normalizedTarget;
    out[d] = clamp01(base * (1 - pull) + normalizedTarget * pull);
  }
  return { intent: out, unresolved };
}

export interface ProtectedViolation {
  path: string;
  before: number;
  after: number;
}

/** Check a proposed intent delta against `spec.protected` (§13). Returns violations; the caller
 *  (Atlas / agent) decides whether to warn, block, or search for an alternate tuning. */
export function checkProtected(
  spec: FeelSpec,
  before: Record<string, number>,
  after: Record<string, number>,
  epsilon = 1e-6,
): ProtectedViolation[] {
  const out: ProtectedViolation[] = [];
  for (const path of spec.protected ?? []) {
    const b = before[path];
    const a = after[path];
    if (b === undefined || a === undefined) continue;
    if (Math.abs(a - b) > epsilon) out.push({ path, before: b, after: a });
  }
  return out;
}

/** Human-readable diff of two intent maps — powers the §12 "proposed delta" preview. */
export function feelDelta(
  before: Record<string, number>,
  after: Record<string, number>,
): { path: string; before: number; after: number }[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { path: string; before: number; after: number }[] = [];
  for (const p of paths) {
    const b = before[p] ?? 0;
    const a = after[p] ?? 0;
    if (Math.abs(a - b) > 1e-6) out.push({ path: p, before: b, after: a });
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
