/**
 * Deterministic JSON for docs/PROJECT_FORMAT.md's serialization rules: "a trivial value change
 * [produces] a one-line diff instead of a reshuffled file."
 *
 * `stableStringify` recursively sorts object keys and pretty-prints with a fixed 2-space
 * indent. Arrays keep their order (element order is meaningful — it's why the format uses
 * stable IDs, not array position, for *references*). The known file shapes below build their
 * top-level objects in an explicit, schema-defined field order; open-ended maps (a component
 * bag, a component's own fields) get key-sorted here. Both are deterministic; neither is
 * "alphabetical by accident."
 */

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2) + "\n";
}
