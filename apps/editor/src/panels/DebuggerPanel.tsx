import { useState } from "react";
import { Button } from "@galacean/editor-ui";
import { interpret, type RecordedCall } from "@3jse/ir";
import type { Entity } from "@3jse/runtime";
import { buildGraphDemoScene, createGraphDemoHost, emptyGraphDemoEffects } from "../sampleGraph.js";
import type { EditorContext } from "./types.js";

/** A raw `JSON.stringify` on a call arg is unreadable the moment one's an Entity — it drags in
 *  the entire Object3D subtree (matrix, userData, children, …). Entities print as `Name`
 *  instead; everything else still prints as JSON, e.g. a bare `Key`. */
function formatArg(value: unknown): string {
  if (value && typeof value === "object" && "id" in value && "name" in value && "object3D" in value) {
    return (value as Entity).name;
  }
  return JSON.stringify(value);
}

function formatCall(call: RecordedCall): string {
  return `${call.target}(${call.args.map(formatArg).join(", ")})`;
}

/**
 * docs/VISUAL_SCRIPTING.md's Debugging section, scoped slice: runs the demo graph against a
 * fresh scene (real @3jse/runtime Entities, packages/ir's entityRoundtrip.test.ts pattern) and
 * shows what happened — the recorded calls, the final Component state, and every IR node the
 * interpreter actually visited (packages/ir's InterpretResult.visited), which GraphPanel then
 * highlights. This is "Execution history" for one completed run, not "Breakpoints / step" or
 * live per-frame values during actual gameplay Play mode — both real future work: this slice's
 * interpreter has no pause/resume/step primitive, and no System wraps it into the Scheduler's
 * live tick loop yet.
 */
export function DebuggerPanel({ ctx }: { ctx: EditorContext }) {
  const [summary, setSummary] = useState<string[] | null>(null);

  function run(hasKey: boolean) {
    const { player, door } = buildGraphDemoScene();
    if (hasKey) player.addComponent("Key");
    const effects = emptyGraphDemoEffects();

    const result = interpret(
      ctx.graph,
      { other: player, door, doorOpenSfx: "sfx/door_open.wav" },
      createGraphDemoHost(effects),
    );

    ctx.setDebugVisitedNodeIds(result.visited);
    ctx.setSelectedGraphNodeId(result.visited[result.visited.length - 1] ?? null);

    setSummary([
      `Ran with ${hasKey ? "a Key" : "no Key"} on Player — visited ${result.visited.length} IR nodes (highlighted in the Graph panel).`,
      `Calls: ${result.calls.map(formatCall).join(" → ") || "(none)"}`,
      `Door.Collision.enabled: ${door.getComponent<{ enabled: boolean }>("Collision")!.enabled}`,
    ]);
    ctx.pushLog("info", `Debugger: ran door/trigger graph (${hasKey ? "with" : "without"} Key).`);
  }

  return (
    <div className="debugger-panel">
      <div className="debugger-controls">
        <Button size="xs" onClick={() => run(true)}>
          Run — Player has Key
        </Button>
        <Button size="xs" variant="outline" onClick={() => run(false)}>
          Run — no Key
        </Button>
        {summary && (
          <Button size="xs" variant="subtle" onClick={() => ctx.setDebugVisitedNodeIds([])}>
            Clear highlight
          </Button>
        )}
      </div>
      {summary ? (
        <div className="debugger-log">
          {summary.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      ) : (
        <p className="panel-empty-inline">Run the door/trigger graph against a fresh demo scene.</p>
      )}
    </div>
  );
}
