import { useState } from "react";
import { Button } from "@galacean/editor-ui";
import { listEntries, createMockFetcher, generateNoticesEntry, type StagedImport, type Tier } from "@3jse/vendor";
import type { EditorContext } from "./types.js";

const fetcher = createMockFetcher();

const TIER_CLASS: Record<Tier, string> = {
  A: "vendor-tier-a",
  B: "vendor-tier-b",
  reference: "vendor-tier-reference",
};
const TIER_LABEL: Record<Tier, string> = { A: "Tier A", B: "Tier B", reference: "Reference" };

/**
 * docs/VENDOR_INTEGRATIONS.md's "Open Source" Content Browser sub-panel — Browse half fully real
 * (the actual curated `@3jse/vendor` registry — registry.json, not fixture data invented for
 * this panel); Import half real for Tier B (stages via the mock fetcher — see fetcher.ts's doc
 * comment for exactly what "mock" means here: the contract is real, live GitHub fetching isn't
 * built yet). Tier A's "Import" is "install the wrapper package normally" (an ordinary plugin
 * install, per the doc) — shown as the target package name, not wired to a real installer here
 * (no Content Browser/package-install flow exists yet, docs/ASSET_PIPELINE.md). A `"reference"`
 * entry (`apate`, `minos`, `quantum-core`, …) never gets an Import affordance at all — its own
 * registry notes say why (different runtime, no plugin shape, no verifiable license).
 */
export function OpenSourcePanel({ ctx }: { ctx: EditorContext }) {
  const [staged, setStaged] = useState<Record<string, StagedImport>>({});

  async function importTierB(id: string) {
    const entry = listEntries().find((e) => e.id === id);
    if (!entry) return;
    const result = await fetcher.stageTierB(entry);
    setStaged((prev) => ({ ...prev, [id]: result }));
    ctx.pushLog("info", `Staged "${id}" at ${result.stagedPath} (Tier B — inert reference source, not executed).`);
  }

  return (
    <div className="open-source-panel">
      {listEntries().map((entry) => {
        const stagedResult = staged[entry.id];
        return (
          <section className="vendor-entry" key={entry.id}>
            <div className="vendor-entry-header">
              <span className="vendor-entry-id">{entry.title}</span>
              <span className={`vendor-tier ${TIER_CLASS[entry.tier]}`}>{TIER_LABEL[entry.tier]}</span>
            </div>
            <div className="vendor-entry-meta">
              <code>{entry.source}</code>
              <span>
                {entry.license.spdx ?? "unknown license"} · verified: {entry.license.verifiedBy ?? "no"}
              </span>
              <span>{entry.capability}</span>
            </div>
            {entry.notes && <p className="vendor-notes">{entry.notes}</p>}

            {entry.tier === "A" ? (
              <p className="panel-empty-inline">Installs as {entry.package} (ordinary plugin install).</p>
            ) : entry.tier === "reference" ? (
              <p className="panel-empty-inline">Reference only — not an installable plugin.</p>
            ) : stagedResult ? (
              <div className="vendor-staged">
                <p className="panel-empty-inline">Staged at {stagedResult.stagedPath}</p>
                <pre className="vendor-notices">{generateNoticesEntry(entry, stagedResult)}</pre>
              </div>
            ) : (
              <Button size="xs" variant="outline" onClick={() => importTierB(entry.id)}>
                Import (stage as reference source)
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}
