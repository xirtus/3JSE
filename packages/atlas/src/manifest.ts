// atlas/ project manifest loader — docs/3JSE_ATLAS_FULL_PLAN.md §44.
//
//   atlas/
//     systems/*.json    -> one AtlasSystemSpec each
//     feelspec/*.json    -> one FeelSpec each
//
// Works over a virtual filesystem (a Record<path, string>), per the engine-package rule —
// no fs, testable, "recoverable without the editor". JSON now; a YAML front-end is a caller
// concern (the plan's examples are YAML, but the parse step is trivially swappable).

import type { AtlasSystemSpec } from "./defineSystem.js";
import { parseFeelSpec, type FeelSpec, type FeelSpecIssue } from "./feelspec.js";

export interface AtlasManifest {
  systems: AtlasSystemSpec[];
  feelSpecs: Record<string, FeelSpec>;
  issues: { path: string; level: "error" | "warn"; message: string }[];
}

/** Parse every `atlas/systems/*.json` and `atlas/feelspec/*.json` in `files`. Malformed files
 *  are reported in `issues`, never thrown — a bad profile shouldn't blank the whole Atlas. */
export function parseAtlasManifest(files: Record<string, string>): AtlasManifest {
  const systems: AtlasSystemSpec[] = [];
  const feelSpecs: Record<string, FeelSpec> = {};
  const issues: AtlasManifest["issues"] = [];

  for (const [path, text] of Object.entries(files)) {
    const norm = path.replace(/\\/g, "/");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      issues.push({ path: norm, level: "error", message: `invalid JSON: ${(e as Error).message}` });
      continue;
    }

    if (/(^|\/)atlas\/systems\/[^/]+\.json$/.test(norm)) {
      const spec = json as Partial<AtlasSystemSpec>;
      if (!spec.id || !spec.label || !spec.domain) {
        issues.push({ path: norm, level: "error", message: "system spec needs id, label, domain" });
        continue;
      }
      systems.push(spec as AtlasSystemSpec);
    } else if (/(^|\/)atlas\/feelspec\/[^/]+\.json$/.test(norm)) {
      try {
        const { spec, issues: fi } = parseFeelSpec(json);
        feelSpecs[spec.profile.id] = spec;
        for (const i of fi as FeelSpecIssue[]) issues.push({ path: norm, level: i.level, message: i.message });
      } catch (e) {
        issues.push({ path: norm, level: "error", message: (e as Error).message });
      }
    }
    // other files under atlas/ (views/, traces/, profiles/) are ignored by this loader for now
  }

  // duplicate system id check
  const seen = new Set<string>();
  for (const s of systems) {
    if (seen.has(s.id)) issues.push({ path: "atlas/systems", level: "error", message: `duplicate system id "${s.id}"` });
    seen.add(s.id);
  }

  return { systems, feelSpecs, issues };
}
