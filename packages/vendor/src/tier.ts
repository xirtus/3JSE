import type { RegistryEntry } from "./types.js";

/**
 * docs/VENDOR_INTEGRATIONS.md's hard gate, verbatim: "a Tier-A entry's `license.verifiedBy:
 * 'human'` field is a hard gate the fetcher UI enforces — an unverified or auto-detected-only
 * entry cannot be marked Tier A, full stop, regardless of what the upstream API field says."
 * `"pending"` and `null` both fail this gate — `tiamat`'s real registry entry is `"pending"`
 * specifically because its actual LICENSE file reads as plain MIT, but that isn't the same
 * thing as a human confirming *this registry entry*, which is what the gate checks.
 */
export function canMarkTierA(entry: Pick<RegistryEntry, "license">): boolean {
  return entry.license.verifiedBy === "human";
}

/** A registry entry claiming `tier: "A"` without satisfying the gate is a data-integrity bug,
 *  not a valid state — registry.test.ts asserts this never happens for the real registry data,
 *  and any UI/import flow should treat it as a hard error, not silently downgrade or upgrade
 *  it. `"reference"` and `"B"` entries have no such constraint — the gate only applies going
 *  *into* Tier A. */
export function isValidTierAssignment(entry: RegistryEntry): boolean {
  return entry.tier === "A" ? canMarkTierA(entry) : true;
}
