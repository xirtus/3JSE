import { useMemo, useState } from "react";
import { Button } from "@galacean/editor-ui";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentServer, GraphStore, ConsoleSink } from "@3jse/agent";
import type { EditorContext } from "./types.js";

type StepStatus = "pending" | "running" | "done" | "error";

interface PlanStep {
  label: string;
  tool: string;
  args: Record<string, unknown>;
  status: StepStatus;
  result?: string;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content;
  return content?.[0]?.text ?? "";
}

/**
 * docs/EDITOR.md's Agent Panel: "shows the agent's current plan, the tool calls it's making
 * against the same command API the rest of the editor uses, and a running diff of what's
 * changed." Connects a real `@3jse/agent` MCP server to the *same* live `ctx.world`/`ctx.level`
 * every other panel edits (not a sandboxed copy) over a real `Client`/`InMemoryTransport` pair —
 * so a Health component this panel adds shows up in the Inspector immediately, same undo/version
 * history as a manual edit (docs/AI_AGENT_API.md's structural guarantee).
 *
 * No live LLM connection in this slice — there's no AI provider wired into this project, and
 * fabricating one would misrepresent what's actually happening. "Plan" here is one fixed,
 * hand-written demo task (add Health to the selected Entity, run it headless, report the diff),
 * run step-by-step through the real MCP protocol so the panel proves the *plumbing* — plan
 * display, live tool-call log, before/after diff — is real, not that natural-language planning
 * is implemented (it isn't; docs/AI_AGENT_API.md's PLAN stage and trust tiers are real future
 * work, same as `@3jse/agent`'s server.ts doc comment already flags).
 */
export function AgentPanel({ ctx }: { ctx: EditorContext }) {
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [running, setRunning] = useState(false);
  const [diff, setDiff] = useState<{ before: unknown; after: unknown } | null>(null);

  const client = useMemo(() => {
    const server = createAgentServer({ world: ctx.world, level: ctx.level, graphs: new GraphStore(), console: new ConsoleSink() });
    const c = new Client({ name: "3jse-editor-agent-panel", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    void Promise.all([c.connect(clientTransport), server.connect(serverTransport)]);
    return c;
  }, [ctx.world, ctx.level]);

  async function runDemoTask() {
    const entity = ctx.selectedEntity;
    if (!entity) {
      ctx.pushLog("warn", "Agent Panel: select an Entity first — the demo task needs one to act on.");
      return;
    }
    setRunning(true);
    setDiff(null);

    // scene.query's contract filters by componentTypes, not entityId — every step below that
    // needs "just this Entity" queries everything and picks it out client-side, the same way an
    // agent inspecting one specific Entity out of a broader scene.query result would.
    const findMine = (text: string) => (JSON.parse(text) as { id: string }[]).find((e) => e.id === entity.id);

    const plan: PlanStep[] = [
      { label: "OBSERVE — read the Entity's current state", tool: "scene.query", args: {}, status: "pending" },
      {
        label: "ACT — add a Health component",
        tool: "scene.addComponent",
        args: { entityId: entity.id, type: "Health", overrides: { current: 3 } },
        status: "pending",
      },
      { label: "VERIFY — run 30 frames headless", tool: "runtime.run", args: { frames: 30 }, status: "pending" },
      { label: "VERIFY — check the console for errors", tool: "runtime.getConsole", args: {}, status: "pending" },
      { label: "DIFF — read the Entity's state again", tool: "scene.query", args: {}, status: "pending" },
    ];
    setSteps([...plan]);

    let before: unknown;
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i]!;
      step.status = "running";
      setSteps([...plan]);
      try {
        const result = await client.callTool({ name: step.tool, arguments: step.args });
        const text = textOf(result);
        step.status = result.isError ? "error" : "done";
        step.result = text.length > 200 ? `${text.slice(0, 200)}…` : text;
        setSteps([...plan]);

        if (step.tool === "scene.query") {
          const mine = findMine(text);
          if (i === 0) before = mine;
          else setDiff({ before, after: mine });
        }
      } catch (err) {
        step.status = "error";
        step.result = err instanceof Error ? err.message : String(err);
        setSteps([...plan]);
        break;
      }
    }

    ctx.refresh();
    ctx.pushLog("info", `Agent Panel: demo task finished on "${entity.name}".`);
    setRunning(false);
  }

  return (
    <div className="agent-panel">
      <Button size="xs" onClick={runDemoTask} disabled={running}>
        {running ? "Running…" : "Run Demo Task on Selected Entity"}
      </Button>
      {!ctx.selectedEntity && <p className="panel-empty-inline">Select an Entity in the Hierarchy first.</p>}

      {steps.length > 0 && (
        <ol className="agent-plan">
          {steps.map((step, i) => (
            <li key={i} className={`agent-step agent-step-${step.status}`}>
              <span className="agent-step-label">{step.label}</span>
              <code className="agent-step-tool">{step.tool}</code>
              {step.result && <div className="agent-step-result">{step.result}</div>}
            </li>
          ))}
        </ol>
      )}

      {diff && (
        <div className="agent-diff">
          <div className="component-title">Diff</div>
          <pre className="agent-diff-block">{JSON.stringify(diff.before, null, 2)}</pre>
          <div className="agent-diff-arrow">↓</div>
          <pre className="agent-diff-block">{JSON.stringify(diff.after, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
