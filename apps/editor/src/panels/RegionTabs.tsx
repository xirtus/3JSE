import { useState } from "react";
import { SegmentControl, SegmentControlItem } from "@galacean/editor-ui";
import type { EditorContext, PanelDef } from "./types.js";

/** One dock region: a tab strip (skipped entirely for a single-panel region — Viewport doesn't
 *  need a tab to itself) plus whichever panel is active. Defaults to the first "active" panel
 *  so a region opens on real content instead of a "not built yet" stub when one exists. */
export function RegionTabs({ panels, ctx }: { panels: PanelDef[]; ctx: EditorContext }) {
  const [activeId, setActiveId] = useState<string>(
    () => panels.find((p) => p.status === "active")?.id ?? panels[0]?.id ?? "",
  );
  const active = panels.find((p) => p.id === activeId) ?? panels[0];
  if (!active) return null;
  const ActivePanel = active.component;

  return (
    <div className="dock-region">
      {panels.length > 1 && (
        <div className="dock-region-tabs">
          <SegmentControl value={activeId} onValueChange={setActiveId} size="sm" variant="subtle">
            {panels.map((p) => (
              <SegmentControlItem key={p.id} value={p.id}>
                {p.title}
              </SegmentControlItem>
            ))}
          </SegmentControl>
        </div>
      )}
      <div className="dock-region-body">
        <ActivePanel ctx={ctx} />
      </div>
    </div>
  );
}
