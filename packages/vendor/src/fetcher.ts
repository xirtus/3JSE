import type { RegistryEntry, StagedImport } from "./types.js";

const LICENSE_TEXT_BY_SPDX: Record<string, string> = {
  MIT: "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...",
  "Apache-2.0": 'Apache License\nVersion 2.0, January 2004\n\nLicensed under the Apache License, Version 2.0 (the "License")...',
};

export interface VendorFetcher {
  /** docs/VENDOR_INTEGRATIONS.md's Tier B "Import": "fetches a pinned-commit tarball... and
   *  stages it under /plugins/_vendor/<id>/ in the project." Throws for a Tier A or reference
   *  entry — Tier A import is "installs the @3jse/* wrapper package normally," an ordinary
   *  plugin install, not this fetcher's job; a `"reference"` entry (`apate`, `minos`,
   *  `quantum-core`) is explicitly "never imported" per its own registry notes. */
  stageTierB(entry: RegistryEntry): Promise<StagedImport>;
}

/**
 * No live implementation in this slice — actually fetching a GitHub tarball, verifying its
 * commit hash, and running the doc's "static inspection (what does it import, what does it
 * touch)" over real fetched source is real integration work this package doesn't attempt yet.
 * This mock proves the *contract* (stage a Tier B entry → get back a `StagedImport` with the
 * registry's real metadata carried through faithfully) so the editor's Open Source panel and
 * this package's own tests have something real to run against; swapping in a live
 * implementation later doesn't change either caller.
 */
export function createMockFetcher(now: () => Date = () => new Date()): VendorFetcher {
  return {
    async stageTierB(entry) {
      if (entry.tier !== "B") {
        throw new Error(`"${entry.id}" is tier "${entry.tier}", not Tier B — stageTierB() is only for Tier B entries.`);
      }
      const spdx = entry.license.spdx;
      return {
        entryId: entry.id,
        stagedPath: `/plugins/_vendor/${entry.id}/`,
        licenseText: (spdx && LICENSE_TEXT_BY_SPDX[spdx]) ?? `(license text for ${spdx ?? "an unverified/unknown license"} not in this mock's table)`,
        staticInspection: [
          `source: ${entry.source}${entry.pinnedCommit ? ` @ ${entry.pinnedCommit}` : " (no pinned commit on file)"}`,
          `stack: ${entry.stack.framework}, renderer=${entry.stack.renderer}`,
          "not executed at import time — inert reference source only (docs/VENDOR_INTEGRATIONS.md §3)",
        ],
        stagedAt: now().toISOString(),
      };
    },
  };
}
