import { useMemo } from "react";
import { ResizablePanel } from "@galacean/editor-ui";
import { panels as panelRegistry } from "./registry.js";
import { RegionTabs } from "./RegionTabs.js";
import type { EditorContext, PanelDef, PanelRegion } from "./types.js";

/**
 * Resizable, tabbed panel shell — docs/EDITOR.md's "dockable/rearrangeable" requirement, honestly
 * scoped: this is resizable splits + tab groups per region, not full drag-to-undock/floating
 * windows (a real docking engine is its own project). ResizablePanel wraps a single edge and is
 * uncontrolled (no resize callback) — confirmed from @galacean/editor-ui's source, not guessed —
 * so each split just needs an explicit min/max range and the correct handlerPosition/reverse
 * pairing for which side is growing.
 */
export function DockLayout({ ctx }: { ctx: EditorContext }) {
  const grouped = useMemo(() => {
    const byRegion: Record<PanelRegion, PanelDef[]> = { left: [], center: [], right: [], bottom: [] };
    for (const panel of panelRegistry) byRegion[panel.region].push(panel);
    return byRegion;
  }, []);

  return (
    <div className="dock-root">
      <ResizablePanel direction="horizontal" handlerPosition="right" range={{ min: 180, max: 480 }}>
        <div className="dock-pane" style={{ width: 220 }}>
          <RegionTabs panels={grouped.left} ctx={ctx} />
        </div>
      </ResizablePanel>

      <div className="dock-center-column">
        <div className="dock-center-top">
          <RegionTabs panels={grouped.center} ctx={ctx} />
        </div>
        <ResizablePanel direction="vertical" handlerPosition="top" reverse range={{ min: 120, max: 420 }}>
          <div className="dock-pane" style={{ height: 220 }}>
            <RegionTabs panels={grouped.bottom} ctx={ctx} />
          </div>
        </ResizablePanel>
      </div>

      <ResizablePanel direction="horizontal" handlerPosition="left" reverse range={{ min: 220, max: 560 }}>
        <div className="dock-pane" style={{ width: 280 }}>
          <RegionTabs panels={grouped.right} ctx={ctx} />
        </div>
      </ResizablePanel>
    </div>
  );
}
