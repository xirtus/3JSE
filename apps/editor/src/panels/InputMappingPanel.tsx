import { INPUT_RESOURCE, type InputManager } from "@3jse/runtime";
import type { EditorContext } from "./types.js";

/** Read-only view of the InputManager's bound actions/axes (docs/EDITOR.md's Input Mapping).
 *  Editing bindings from the panel — rebinding a key by clicking a field — is real future work,
 *  not faked here; this shows exactly what @3jse/runtime is actually holding right now. */
export function InputMappingPanel({ ctx }: { ctx: EditorContext }) {
  const input = ctx.world.getResource<InputManager>(INPUT_RESOURCE);

  if (!input) {
    return (
      <div className="panel-empty">
        <p>No InputManager registered on this World.</p>
      </div>
    );
  }

  const axes = input.listAxisNames();
  const actions = input.listActionNames();

  return (
    <div className="settings-panel">
      <section className="component-block">
        <div className="component-title">Axes</div>
        {axes.length === 0 ? (
          <p className="panel-empty-inline">None bound.</p>
        ) : (
          <ul className="settings-list">
            {axes.map((name) => {
              const binding = input.getAxisBinding(name)!;
              return (
                <li key={name}>
                  <code>{name}</code>
                  <span className="settings-list-detail">
                    +[{binding.positive.join(", ")}] / -[{binding.negative.join(", ")}]
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="component-block">
        <div className="component-title">Actions</div>
        {actions.length === 0 ? (
          <p className="panel-empty-inline">None bound.</p>
        ) : (
          <ul className="settings-list">
            {actions.map((name) => (
              <li key={name}>
                <code>{name}</code>
                <span className="settings-list-detail">{input.getActionBinding(name)!.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
