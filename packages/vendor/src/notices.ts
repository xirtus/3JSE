import type { RegistryEntry, StagedImport } from "./types.js";

/** docs/VENDOR_INTEGRATIONS.md: "auto-generates a THIRD_PARTY_NOTICES file from every installed
 *  Tier A package's and every staged Tier B import's registry entry" — "source URL, pinned
 *  commit, license text, author." One entry's worth of that file; a Publish build concatenates
 *  one of these per installed/staged package (docs/BUILD_DEPLOYMENT.md), not built here. */
export function generateNoticesEntry(entry: RegistryEntry, staged?: Pick<StagedImport, "licenseText">): string {
  const lines = [
    `${entry.title} (${entry.id})${entry.package ? ` — ${entry.package}` : ""}`,
    `Source: https://${entry.source}`,
  ];
  if (entry.author) lines.push(`Author: ${entry.author.name}`);
  lines.push(`Commit: ${entry.pinnedCommit ?? "(unpinned — link-only reference entry)"}`, `License: ${entry.license.spdx ?? "unknown"}`);
  if (staged?.licenseText) lines.push("", staged.licenseText);
  return lines.join("\n");
}
