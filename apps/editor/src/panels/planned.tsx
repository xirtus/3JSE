import type { ComponentType } from "react";
import type { EditorContext } from "./types.js";

/** A registered-but-not-yet-built panel. It exists in the registry (so the dock layout, the
 *  tab strip, and adding the real panel later are already solved problems — see registry.ts's
 *  doc comment) but says exactly what it is: not implemented, not a fake demo of functionality
 *  that doesn't exist yet. */
export function planned(title: string, docRef?: string): ComponentType<{ ctx: EditorContext }> {
  return function PlannedPanel() {
    return (
      <div className="panel-empty planned-panel">
        <p className="planned-title">{title}</p>
        <p className="planned-note">
          Not built yet{docRef ? (
            <>
              {" — see "}
              <code>docs/{docRef}</code>
            </>
          ) : (
            "."
          )}
        </p>
      </div>
    );
  };
}
