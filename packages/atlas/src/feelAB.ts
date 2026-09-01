// A/B FeelSpec auditioning — docs/3JSE_ATLAS_FULL_PLAN.md §16.
//
// "A = current, B = proposed. The user can respond: keep B's steering but A's suspension.
// Atlas generates a merged FeelSpec." Pure functions over two resolved intent maps.

export interface FeelABRow {
  dimension: string;
  a: number;
  b: number;
  /** signed change B - A; 0 when unchanged */
  delta: number;
}

/** Every dimension present in either side, with both values and the delta — the A/B table. */
export function feelABTable(a: Record<string, number>, b: Record<string, number>): FeelABRow[] {
  const dims = new Set([...Object.keys(a), ...Object.keys(b)]);
  const rows: FeelABRow[] = [];
  for (const d of dims) {
    const av = a[d] ?? 0;
    const bv = b[d] ?? 0;
    rows.push({ dimension: d, a: av, b: bv, delta: round(bv - av) });
  }
  return rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.dimension.localeCompare(y.dimension));
}

/**
 * Merge A and B per-dimension. `picks[dimension] === "b"` takes B's value; anything else
 * (including a missing key) keeps A. The result is a new intent map — feed it back into a
 * FeelSpec profile (§16 "Atlas generates a merged FeelSpec").
 */
export function mergeFeel(
  a: Record<string, number>,
  b: Record<string, number>,
  picks: Record<string, "a" | "b">,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[d] = picks[d] === "b" ? (b[d] ?? a[d] ?? 0) : (a[d] ?? b[d] ?? 0);
  }
  return out;
}

/** Count / summarise how far B moves from A — for the §12 "proposed delta" preview line. */
export function feelABSummary(a: Record<string, number>, b: Record<string, number>): {
  changed: number;
  total: number;
  maxDelta: number;
  meanAbsDelta: number;
} {
  const rows = feelABTable(a, b);
  const changed = rows.filter((r) => r.delta !== 0);
  const maxDelta = rows.reduce((m, r) => Math.max(m, Math.abs(r.delta)), 0);
  const meanAbsDelta = rows.length ? round(rows.reduce((s, r) => s + Math.abs(r.delta), 0) / rows.length) : 0;
  return { changed: changed.length, total: rows.length, maxDelta: round(maxDelta), meanAbsDelta };
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
