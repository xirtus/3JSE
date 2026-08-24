import type { EditorContext } from "./types.js";

/** Runtime logs, clickable-to-source once TypeScript/Graph source maps exist
 *  (docs/EDITOR.md's Console, docs/GAMEPLAY_IR.md) — for now, the editor's own action log:
 *  Play/Pause, component add/remove, prefab save/instantiate. Real entries, not sample data. */
export function ConsolePanel({ ctx }: { ctx: EditorContext }) {
  if (ctx.logs.length === 0) {
    return (
      <div className="panel-empty">
        <p>No log entries yet. Play the scene, or add/remove a component, to see one.</p>
      </div>
    );
  }
  return (
    <div className="console-panel">
      {ctx.logs
        .slice()
        .reverse()
        .map((entry) => (
          <div key={entry.id} className={`console-entry console-entry-${entry.level}`}>
            <span className="console-time">{formatTime(entry.time)}</span>
            <span className="console-message">{entry.message}</span>
          </div>
        ))}
    </div>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour12: false });
}
