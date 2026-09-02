// The Publish gate (docs/BUILD_DEPLOYMENT.md step 6): Publish FAILS, not just warns, if
// anything shipping traces back to an unattributed staged Tier B import.

import type { BuildManifest, PublishGateIssue, ThirdPartyNotice } from "./types.js";

export interface GateInput {
  manifest: BuildManifest;
  /** paths of staged Tier B imports still in the project (/plugins/_vendor/, /_vendor/) */
  stagedVendorPaths?: string[];
  /** which staged imports were promoted to a proper attributed plugin (id -> notice) */
  promoted?: Record<string, ThirdPartyNotice>;
  /** whether the bundle actually references each staged path (a path present but unused is fine) */
  referenced?: Record<string, boolean>;
}

export function checkPublishGate(input: GateInput): PublishGateIssue[] {
  const issues: PublishGateIssue[] = [];
  const promoted = input.promoted ?? {};
  const referenced = input.referenced ?? {};

  for (const p of input.stagedVendorPaths ?? []) {
    const isReferenced = referenced[p] !== false; // default: assume referenced unless told otherwise
    const isPromoted = p in promoted;
    if (isReferenced && !isPromoted) {
      issues.push({
        level: "error",
        code: "unattributed-staged-import",
        message: `staged import "${p}" ships in the bundle but was never promoted to an attributed plugin — promote it or remove it before publishing`,
      });
    } else if (!isReferenced && !isPromoted) {
      issues.push({
        level: "warn",
        code: "unused-staged-import",
        message: `staged import "${p}" is present but unused — it will not ship, but remove it to keep the project clean`,
      });
    }
  }

  // every shipped Tier A package needs a notice
  const noticedPackages = new Set(input.manifest.notices.map((n) => n.packageName));
  for (const pkg of input.manifest.packages) {
    if (pkg.startsWith("@3jse/") && !pkg.match(/water-poseidon|foliage-gaia|flora-dryad|terrain-demiurge/)) continue;
    if (!noticedPackages.has(pkg) && (pkg.startsWith("community/") || pkg.match(/poseidon|gaia|dryad|demiurge/))) {
      issues.push({
        level: "error",
        code: "missing-notice",
        message: `package "${pkg}" ships without a THIRD_PARTY_NOTICES entry`,
      });
    }
  }

  return issues;
}
