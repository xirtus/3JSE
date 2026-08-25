import registryData from "./registry.json";
import type { RegistryFile, RegistryEntry, ProjectModule, RejectedEntry } from "./types.js";

// Typed once, here, rather than at every call site — `registryData` is `resolveJsonModule`'s
// inferred (wide) literal type; `REGISTRY` is the one place that asserts it actually matches
// `RegistryFile`. registry.test.ts's schema-shape assertions are what actually back that up,
// not just this cast.
export const REGISTRY: RegistryFile = registryData as RegistryFile;

export function listEntries(): readonly RegistryEntry[] {
  return REGISTRY.entries;
}

export function getEntry(id: string): RegistryEntry | undefined {
  return REGISTRY.entries.find((e) => e.id === id);
}

export function listProjectModules(): readonly ProjectModule[] {
  return REGISTRY.projectModules;
}

export function getProjectModule(id: string): ProjectModule | undefined {
  return REGISTRY.projectModules.find((m) => m.id === id);
}

/** Resolves a `ProjectModule`'s `entries` (ids) into the real `RegistryEntry` objects — the
 *  join `docs/VENDOR_INTEGRATIONS.md`'s registry/module split implies but doesn't store
 *  pre-computed, so one entry's data never drifts out of sync between being read standalone
 *  (`getEntry`) and read through a module (this function). */
export function entriesForModule(moduleId: string): RegistryEntry[] {
  const module = getProjectModule(moduleId);
  if (!module) return [];
  return module.entries.map((id) => getEntry(id)).filter((e): e is RegistryEntry => e !== undefined);
}

export function listRejected(): readonly RejectedEntry[] {
  return REGISTRY.rejected;
}
