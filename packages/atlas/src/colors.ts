// Semantic color system — docs/3JSE_ATLAS_FULL_PLAN.md §20.
// "Color communicates domain, not decoration." One dominant hue per node; health is a separate
// overlay state. Shared by the editor panel and any other Atlas renderer so 2D and 3D stay
// consistent (§48.9).

import type { AtlasDomain } from "./defineSystem.js";
import type { HealthStatus } from "./health.js";

/** Domain -> dominant hue (hex). Matches the §20 table. */
export const DOMAIN_COLOR: Record<AtlasDomain, string> = {
  gameplay: "#f59e0b", // amber/orange
  physics: "#3b82f6", // blue
  animation: "#8b5cf6", // violet
  world: "#22c55e", // green
  ai: "#d946ef", // magenta
  ui: "#06b6d4", // cyan
  audio: "#f43f5e", // rose
  assets: "#eab308", // gold
  providers: "#14b8a6", // teal
  style: "#a855f7", // purple
  core: "#94a3b8", // neutral slate
};

/** Health -> badge color (§20 rules 3–6, §32). Separate from domain hue. */
export const HEALTH_COLOR: Record<HealthStatus, string> = {
  healthy: "#22c55e",
  warning: "#f59e0b",
  failing: "#ef4444",
  unknown: "#9ca3af",
  modified: "#3b82f6",
  untested: "#9ca3af",
  profiling: "#a855f7",
  "agent-working": "#06b6d4",
};

export const HEALTH_GLYPH: Record<HealthStatus, string> = {
  healthy: "●",
  warning: "▲",
  failing: "✕",
  unknown: "○",
  modified: "◆",
  untested: "◌",
  profiling: "◐",
  "agent-working": "⟳",
};
