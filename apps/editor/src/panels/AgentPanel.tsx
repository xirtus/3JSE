import { useEffect, useMemo, useState } from "react";
import { Button } from "@galacean/editor-ui";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentServer, GraphStore, ConsoleSink } from "@3jse/agent";
import { activeLlmConfig, activeLlmLabel, subscribeLlm } from "../llm/store.js";
import { askPlanner } from "../llm/plan.js";
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
 * Two paths:
 *  - **Run Demo Task** — one fixed, hand-written OBSERVE→ACT→VERIFY→DIFF task run step-by-step
 *    through the real MCP protocol. Proves the *plumbing* (plan display, live tool-call log,
 *    before/after diff) with no model involved.
 *  - **Plan with AI** — enabled once a provider is configured in the AI Providers panel. Sends
 *    the selected Entity's current component state + your goal to that model and prints the plan
 *    it proposes. It does **not** execute anything automatically — the human still drives the
 *    tool calls. This is docs/AI_AGENT_API.md's PLAN stage, surfaced for a human to act on.
 */
export function AgentPanel({ ctx }: { ctx: EditorContext }) {
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [running, setRunning] = useState(false);
  const [diff, setDiff] = useState<{ before: unknown; after: unknown } | null>(null);
  const [goal, setGoal] = useState("");
  const [planning, setPlanning] = useState(false);
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [, forceLlm] = useState(0);
  useEffect(() => subscribeLlm(() => forceLlm((n) => n + 1)), []);
  const llmLabel = activeLlmLabel();

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

  async function planWithAi() {
    const entity = ctx.selectedEntity;
    if (!entity || planning) return;
    const cfg = activeLlmConfig();
    if (!cfg) {
      ctx.pushLog("warn", "Agent Panel: no AI provider configured — set one in the AI Providers panel.");
      return;
    }
    const snapshot = {
      id: entity.id,
      name: entity.name,
      components: entity.listComponentTypes().map((type) => ({ type, data: entity.getComponent(type) })),
      availableTools: [
        "scene.query", "scene.addComponent", "scene.setComponent", "scene.removeComponent",
        "scene.createEntity", "runtime.run", "runtime.getConsole",
      ],
    };
    setPlanning(true);
    setAiPlan(`Asking ${cfg.model}…`);
    try {
      const res = await askPlanner(cfg, {
        context: JSON.stringify(snapshot, null, 2),
        intent: goal,
        action: "modify",
      });
      ctx.pushLog("info", `Agent plan (${res.model}, ${res.ms} ms):\n${res.text}`);
      setAiPlan(res.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.pushLog("error", `Agent plan call failed: ${msg}`);
      setAiPlan(`Call failed: ${msg}`);
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="agent-panel">
      <Button size="xs" onClick={runDemoTask} disabled={running}>
        {running ? "Running…" : "Run Demo Task on Selected Entity"}
      </Button>
      {!ctx.selectedEntity && <p className="panel-empty-inline">Select an Entity in the Hierarchy first.</p>}

      <div style={{ borderTop: "1px solid #333", marginTop: 8, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7" }}>Plan with AI</div>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="What should happen to the selected Entity? e.g. 'make it a pickup that heals the player on contact'."
          rows={3}
          style={{ width: "100%", background: "#1c1c1e", color: "#eee", border: "1px solid #3a3a3c", borderRadius: 4, padding: 4, fontSize: 12 }}
        />
        <Button size="xs" onClick={planWithAi} disabled={planning || !ctx.selectedEntity || !llmLabel}>
          {planning ? "Asking…" : llmLabel ? `Plan with ${llmLabel}` : "Plan with AI"}
        </Button>
        {!llmLabel && (
          <p style={{ color: "#8a8a8e", fontSize: 11, margin: 0 }}>
            Configure a provider in the <strong>AI Providers</strong> panel first.
          </p>
        )}
        {aiPlan && (
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#141416", border: "1px solid #2a2a2c", borderRadius: 4, padding: 6, maxHeight: 320, overflow: "auto", color: "#dedee1", fontSize: 11 }}>
            {aiPlan}
          </pre>
        )}
      </div>

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
