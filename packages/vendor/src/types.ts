// docs/VENDOR_INTEGRATIONS.md's `@3jse/vendor` registry — types matching src/registry.json's
// actual, real shape (not re-derived from the doc's illustrative JSON snippet, which is a
// simplified example, not the schema the real, curated registry data grew into). Richer than
// that snippet in a few load-bearing ways worth naming: a third `"reference"` tier (a
// non-pluginable entry that's still worth cataloguing — a technique comparison, a native-runtime
// algorithm reference, an engine-coupled UX pattern to port ideas from, never code), a
// `projectModules` cross-reference layer (one capability category, e.g. "water," can list
// several candidate entries; one entry, e.g. `tiamat`, can serve more than one category), and a
// `rejected` list (entries explicitly turned away, with the reason kept — not just silently
// absent).

export type Tier = "A" | "B" | "reference";

export interface LicenseInfo {
  spdx: string | null;
  /** "human" is the only value `tier.ts`'s gate accepts for Tier A. `"pending"` is the
   *  `tiamat` case docs/VENDOR_INTEGRATIONS.md is built around: GitHub's own detector can't be
   *  trusted as a verdict (a BOM byte before the LICENSE text, an auto-classifier that gives up)
   *  — real evidence the license is fine isn't the same thing as a human having signed off on
   *  *this registry entry* yet. `null` means genuinely unknown/unverified (`quantum-core`,
   *  `kimodo-cpp`). */
  verifiedBy: "human" | "pending" | null;
  verifiedAt: string | null;
  file?: string | null;
  note?: string;
  /** What GitHub's own auto-detector reported, when it disagrees with the real license text —
   *  kept as data, not just prose, so a Curator pass can query for "every entry where the API
   *  field and the human-read file disagree." */
  apiField?: string;
  /** ML-model-weight-specific licensing nuance (`kimodo`'s NVIDIA checkpoints have different
   *  terms than the code repo itself) — not every entry has weights, so this is optional and
   *  free-text rather than a forced sub-schema fitting every possible case. */
  weights?: string;
}

export interface StackInfo {
  renderer: string;
  framework: string;
  language?: string;
}

export interface ForkInfo {
  source: string;
  note?: string;
}

export interface AuthorInfo {
  name: string;
  x?: string;
}

export interface ProjectModule {
  id: string;
  label: string;
  unrealAnalog?: string;
  godotAnalog?: string;
  templates: string[];
  /** Registry entry ids offering this capability — resolved against `entries` by `registry.ts`,
   *  not embedded inline, so one entry can appear under more than one module (`tiamat` under
   *  both "water" and "fluid") without duplicating its data. */
  entries: string[];
  /** `false` for entries that are editor-only tooling with no place in a shipped game — e.g.
   *  `motion-gen`'s NVIDIA/GGML text-to-motion tools (`docs/BUILD_DEPLOYMENT.md`'s Publish-build
   *  posture never bundles these regardless of tier). */
  shipsInPublishBuild?: boolean;
}

export interface RegistryEntry {
  id: string;
  title: string;
  source: string;
  homepage?: string;
  demo?: string;
  docs?: string;
  author?: AuthorInfo;
  seenIn?: string[];
  forks?: ForkInfo[];
  /** A real commit SHA (the reviewed pin), a branch name pending a Curator pass ("main"/
   *  "master" — real future work, not yet pinned), or `null` for a link-only reference entry
   *  with nothing to pin (`quantum-core`'s CodePen snippet). */
  pinnedCommit: string | null;
  license: LicenseInfo;
  stack: StackInfo;
  tier: Tier;
  /** The wrapping `@3jse/<capability>-<upstream>` package — only ever set once an entry has
   *  actually graduated to Tier A. */
  package: string | null;
  /** The package name a Tier B entry *would* graduate to, once verified — distinct from
   *  `package` (which stays `null` until that actually happens) so the registry can express
   *  "this is where it's headed" without prematurely claiming it's real. */
  plannedPackage?: string;
  capability: string;
  projectModules: string[];
  /** Which `ROADMAP.md` phase this entry is relevant to — `null` for reference-only entries with
   *  no phase-gated delivery (`minos`, `quantum-core`). */
  phase: number | null;
  editorOnly?: boolean;
  notes?: string;
}

export interface RejectedEntry {
  id: string;
  source: string;
  reason: string;
}

export interface RegistryFile {
  version: number;
  updatedAt: string;
  policy: string;
  notes: string;
  projectModules: ProjectModule[];
  entries: RegistryEntry[];
  rejected: RejectedEntry[];
}

/** The result of staging a Tier B entry — docs/VENDOR_INTEGRATIONS.md's "2. Browse → Import
 *  flow" and "3. Sandboxing on import": inert reference source under `/plugins/_vendor/<id>/`
 *  (docs/PROJECT_FORMAT.md), never executed at import time. */
export interface StagedImport {
  entryId: string;
  stagedPath: string;
  licenseText: string;
  /** Stand-in for the doc's "static inspection (what does it import, what does it touch)" —
   *  fetcher.ts's mock implementation doesn't run a real static analyzer over fetched source
   *  (there is no live network fetch in this slice — see fetcher.ts's doc comment), so this is
   *  descriptive metadata, not the output of one. */
  staticInspection: string[];
  stagedAt: string;
}
