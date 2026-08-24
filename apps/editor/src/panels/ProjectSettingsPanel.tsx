import { useRef, useState } from "react";
import { Button } from "@galacean/editor-ui";
import { listComponentSchemas } from "@3jse/runtime";
import { SAVE_RESOURCE, type SaveService } from "@3jse/save";
import type { EditorContext } from "./types.js";

/** Registered Resources/Services, Component types, and SaveGame slots — docs/EDITOR.md's
 *  Project Settings. Quality tiers, input mappings (see InputMappingPanel.tsx), and build
 *  targets are the rest of that panel's eventual scope (docs/PERFORMANCE.md,
 *  docs/BUILD_DEPLOYMENT.md) — not built yet, so not shown here rather than faked. */
export function ProjectSettingsPanel({ ctx }: { ctx: EditorContext }) {
  const resourceKeys = ctx.world.listResourceKeys();
  const schemas = listComponentSchemas();
  const save = ctx.world.getResource<SaveService>(SAVE_RESOURCE);
  const slotRef = useRef<HTMLInputElement>(null);
  const [, forceTick] = useState(0);

  function currentSlot(): string {
    return slotRef.current?.value.trim() || "default";
  }

  function handleSave() {
    if (!save) return;
    const slot = currentSlot();
    save.save(ctx.level, slot);
    ctx.pushLog("info", `Saved to slot "${slot}".`);
    forceTick((n) => n + 1);
  }

  function handleLoad() {
    if (!save) return;
    const slot = currentSlot();
    const applied = save.load(ctx.level, slot);
    if (applied === null) {
      ctx.pushLog("warn", `No save data in slot "${slot}".`);
    } else {
      ctx.pushLog("info", `Loaded slot "${slot}" — ${applied} Entit${applied === 1 ? "y" : "ies"} updated.`);
    }
    forceTick((n) => n + 1);
  }

  return (
    <div className="settings-panel">
      {save && (
        <section className="component-block">
          <div className="component-title">Save Game</div>
          <div className="save-slot-row">
            <input ref={slotRef} type="text" defaultValue="default" placeholder="slot name" />
            <Button size="xs" onClick={handleSave}>
              Save
            </Button>
            <Button size="xs" variant="outline" onClick={handleLoad}>
              Load
            </Button>
          </div>
          <ul className="settings-list">
            {save.listSlots().length === 0 ? (
              <p className="panel-empty-inline">No save slots yet.</p>
            ) : (
              save.listSlots().map((slot) => <li key={slot}><code>{slot}</code></li>)
            )}
          </ul>
        </section>
      )}

      <section className="component-block">
        <div className="component-title">Registered Resources</div>
        {resourceKeys.length === 0 ? (
          <p className="panel-empty-inline">None registered.</p>
        ) : (
          <ul className="settings-list">
            {resourceKeys.map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="component-block">
        <div className="component-title">Registered Components</div>
        <ul className="settings-list">
          {schemas.map((schema) => (
            <li key={schema.type}>
              <code>{schema.type}</code>
              <span className="settings-list-detail">
                {schema.fields.map((f) => f.name).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
