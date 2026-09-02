import { useEffect, useMemo, useState } from "react";
import { Button } from "@galacean/editor-ui";
import {
  compileAtlas,
  layoutAtlas,
  searchAtlas,
  exportAgentContext,
  previewChange,
  eventLens,
  performanceLens,
  providerLens,
  assetLens,
  traceLens,
  pulseCounts,
  DOMAIN_COLOR,
  HEALTH_COLOR,
  HEALTH_GLYPH,
  type AtlasEdge,
  type AtlasNode,
  type AgentAction,
  type LensGraph,
} from "@3jse/atlas";
import { NodeCanvas, type CanvasNode, type CanvasEdge } from "@3jse/graph";
import { buildSampleAtlas, SAMPLE_EVIDENCE, applyAtlasKnob, readAtlasKnob } from "../sampleAtlas.js";
import { traceRecorder } from "../sampleScene.js";
import { activeLlmConfig, activeLlmLabel, subscribeLlm } from "../llm/store.js";
import { askPlanner } from "../llm/plan.js";
import type { EditorContext } from "./types.js";

const EDGE_STYLE: Record<AtlasEdge["kind"], { stroke: string; dash?: string }> = {
  dependency: { stroke: "#64748b" },
  event: { stroke: "#f59e0b", dash: "5 4" },
  provider: { stroke: "#14b8a6", dash: "2 4" },
  asset: { stroke: "#eab308", dash: "2 4" },
  ownership: { stroke: "#334155", dash: "1 3" },
};

const ACTIONS: AgentAction[] = ["explain", "modify", "tune", "optimize", "repair", "compare"];

type LensId = "system" | "events" | "performance" | "providers" | "assets" | "trace";
const LENSES: { id: LensId; label: string }[] = [
  { id: "system", label: "System Map" },
  { id: "events", label: "Events" },
  { id: "performance", label: "Performance" },
  { id: "providers", label: "Providers" },
  { id: "assets", label: "Assets" },
  { id: "trace", label: "Trace" },
];

/**
 * docs/3JSE_ATLAS_FULL_PLAN.md §53/§54/§63 — the Atlas Semantic Core, rendered. Left: the System
 * Map (hand-rolled SVG, deterministic layered layout from `@3jse/atlas`, no react-flow — same
 * posture as GraphPanel/GraphCanvas). Right: the node inspector — purpose, evidence-derived
 * health, dependencies, events, tests, files, and knobs whose edits write straight to the live
 * component (§3.1), plus the §28 agent-context export / §30 change preview.
 *
 * The model is compiled from `buildSampleAtlas()` (the Third Person template's semantic
 * declarations, §63 "apply it to one existing 3JSE game"). No live LLM is wired — "Ask Agent"
 * assembles the scoped context package and hands it to the log + clipboard, the same honesty as
 * AgentPanel: the plumbing is real, natural-language planning is not implemented here.
 */
export function AtlasPanel({ ctx }: { ctx: EditorContext }) {
  const registry = useMemo(() => buildSampleAtlas(), []);
  const [selectedId, setSelectedId] = useState<string | null>("player.movement");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<AgentAction>("modify");
  const [intent, setIntent] = useState("");
  const [lens, setLens] = useState<LensId>("system");
  // bump to recompile after a knob edit so the inspector reflects live values
  const [rev, setRev] = useState(0);
  // Trace lens time scrubber: playhead in seconds (null = show the whole window / "Live"),
  // plus a rAF play toggle that sweeps it across the recorded span so events light up in order.
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [tracePlay, setTracePlay] = useState(false);
  // "Ask agent" → live LLM (when a provider is configured in the AI Providers panel).
  const [asking, setAsking] = useState(false);
  const [planText, setPlanText] = useState<string | null>(null);
  const [, forceLlm] = useState(0);
  useEffect(() => subscribeLlm(() => forceLlm((n) => n + 1)), []);
  const llmLabel = activeLlmLabel();

  const model = useMemo(
    () => compileAtlas({ systems: registry.list(), evidence: SAMPLE_EVIDENCE }),
    [registry, rev],
  );

  const traceSpan = lens === "trace" ? traceRecorder.span : null;
  // Events revealed up to the playhead (or all of them when Live). traceLens indexes `evt:i`
  // off this same array, so the pulse set below can address nodes by position.
  const traceWindow = useMemo(
    () => (lens === "trace" ? traceRecorder.window(-Infinity, playhead ?? Infinity) : []),
    [lens, playhead, rev],
  );
  // Nodes to pulse: event fires within 0.3s behind the playhead.
  const pulse = useMemo(() => {
    if (lens !== "trace" || playhead == null) return null;
    const set = new Set<string>();
    traceWindow.forEach((e, i) => {
      if (playhead - e.time >= 0 && playhead - e.time <= 0.3) set.add(`evt:${i}`);
    });
    return set;
  }, [lens, playhead, traceWindow]);

  const view: LensGraph = useMemo(() => {
    switch (lens) {
      case "events": return eventLens(model);
      case "performance": return performanceLens(model);
      case "providers": return providerLens(model);
      case "assets": return assetLens(model);
      case "trace": return traceLens(traceWindow);
      default: return { nodes: model.nodes, edges: model.edges };
    }
  }, [model, lens, rev, traceWindow]);

  // Sweep the playhead across the span while playing (≈ real-time over event seconds).
  useEffect(() => {
    if (lens !== "trace" || !tracePlay) return;
    const span = traceRecorder.span;
    if (!span || span.end <= span.start) { setTracePlay(false); return; }
    let raf = 0;
    let last = performance.now();
    setPlayhead((p) => (p == null || p >= span.end ? span.start : p));
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((p) => {
        const next = (p ?? span.start) + dt;
        if (next >= span.end) { setTracePlay(false); return span.end; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lens, tracePlay]);
  const layout = useMemo(() => layoutAtlas(view), [view]);
  const results = useMemo(() => (query ? searchAtlas(model, query, 12) : []), [model, query]);
  const selected = model.nodes.find((n) => n.id === selectedId) ?? null;

  function knobChange(systemId: string, knob: string, value: number) {
    const spec = registry.get(systemId);
    const k = spec?.knobs?.[knob];
    if (k) k.value = value; // update the declaration so the recompiled model shows it
    const res = applyAtlasKnob(ctx.level, systemId, knob, value);
    ctx.pushLog(res.applied ? "info" : "warn", res.message);
    setRev((r) => r + 1);
  }

  async function askAgent() {
    if (!selected || asking) return;
    const pkg = exportAgentContext(model, selected.id, intent || "(no intent given)", { action });
    const preview = previewChange(model, selected.id);
    const blob = JSON.stringify({ context: pkg, preview }, null, 2);
    ctx.pushLog("info", `Atlas → agent (${action}) on ${selected.id}: ${preview.affected.length} systems, ${preview.fileCount} files, risk ${preview.risk}.`);

    const cfg = activeLlmConfig();
    if (!cfg) {
      // No provider wired — keep the original behaviour: dump the scoped task to the log +
      // clipboard so it can be pasted into any chat. The AI Providers panel wires a model.
      ctx.pushLog("info", blob);
      try {
        void navigator.clipboard?.writeText(blob);
      } catch {
        /* clipboard blocked — the log copy above is the fallback */
      }
      setPlanText("No AI provider configured. Open the AI Providers panel to pick one — the scoped task was copied to the clipboard and logged so you can paste it into any chat.");
      return;
    }

    setAsking(true);
    setPlanText(`Asking ${cfg.model}…`);
    try {
      const res = await askPlanner(cfg, { context: blob, intent, action });
      const usage = res.usage?.outputTokens != null ? ` · ${res.usage.outputTokens} out tok` : "";
      ctx.pushLog("info", `Atlas agent (${res.model}, ${res.ms} ms${usage}):\n${res.text}`);
      setPlanText(res.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.pushLog("error", `Atlas agent call failed: ${msg}`);
      setPlanText(`Call failed: ${msg}`);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="atlas-panel" style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* ---- System Map ---- */}
      <div style={{ flex: "1 1 60%", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--panel-border, #333)" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            {LENSES.map((l) => (
              <button
                key={l.id}
                onClick={() => setLens(l.id)}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: "1px solid #3a3a3c",
                  background: lens === l.id ? "#3a3a3c" : "#1c1c1e",
                  color: lens === l.id ? "#fff" : "#aaa",
                  cursor: "pointer",
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
          {lens === "trace" && (
            <TraceScrubber
              span={traceSpan}
              playhead={playhead}
              playing={tracePlay}
              counts={pulseCounts(traceWindow)}
              onSeek={(t) => { setTracePlay(false); setPlayhead(t); }}
              onTogglePlay={() => setTracePlay((p) => !p)}
              onLive={() => { setTracePlay(false); setPlayhead(null); }}
            />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search systems, knobs, events, mechanics, tests…"
            style={{ width: "100%", padding: "4px 6px", background: "#1c1c1e", color: "#eee", border: "1px solid #3a3a3c", borderRadius: 4 }}
          />
          {results.length > 0 && (
            <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, maxHeight: 140, overflow: "auto", fontSize: 12 }}>
              {results.map((r) => (
                <li key={`${r.kind}:${r.nodeId}:${r.label}`}>
                  <button
                    onClick={() => { setSelectedId(r.nodeId); setQuery(""); }}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#ddd", padding: "3px 4px", cursor: "pointer" }}
                  >
                    <span style={{ color: "#888", textTransform: "uppercase", fontSize: 10 }}>{r.kind}</span>{" "}
                    <strong>{r.label}</strong> <span style={{ color: "#888" }}>· {r.context}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ flex: 1, overflow: "auto", background: "#161618" }}>
          <SystemMap
            model={view}
            layout={layout}
            selectedId={selectedId}
            onSelect={setSelectedId}
            pulse={pulse}
          />
        </div>
        <Legend />
      </div>

      {/* ---- Inspector ---- */}
      <div style={{ flex: "0 0 340px", borderLeft: "1px solid var(--panel-border, #333)", overflow: "auto", padding: 10, fontSize: 12 }}>
        {!selected ? (
          <p style={{ color: "#888" }}>Select a system in the map.</p>
        ) : (
          <NodeInspector
            key={selected.id}
            node={selected}
            model={model}
            registry={registry}
            level={ctx.level}
            action={action}
            setAction={setAction}
            intent={intent}
            setIntent={setIntent}
            onKnob={knobChange}
            onAsk={askAgent}
            asking={asking}
            planText={planText}
            llmLabel={llmLabel}
          />
        )}
      </div>
    </div>
  );
}

function SystemMap({
  model,
  layout,
  selectedId,
  onSelect,
  pulse,
}: {
  model: LensGraph;
  layout: ReturnType<typeof layoutAtlas>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  pulse?: Set<string> | null;
}) {
  // Node positions: auto-layout, overridden by any the user has dragged (per lens/session).
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const pos = (id: string) => moved[id] ?? layout.nodes[id];

  const canvasNodes: CanvasNode[] = model.nodes.flatMap((n) => {
    const b = pos(n.id);
    if (!b) return [];
    const lit = pulse?.has(n.id) ?? false;
    const hue = lit ? "#fde047" : DOMAIN_COLOR[n.domain];
    return [{
      id: n.id,
      x: b.x, y: b.y, width: layout.nodes[n.id]?.width ?? 200, height: layout.nodes[n.id]?.height ?? 84,
      title: n.label,
      subtitle: n.domain,
      accent: hue,
      badge: `${lit ? "◉ " : ""}${HEALTH_GLYPH[n.status]} ${n.status}${n.cpuMs != null ? ` · ${n.cpuMs.toFixed(2)} ms` : ""}`,
      bodyLines: n.tests.length ? [`${n.tests.length} test path(s)`] : ["no tests"],
    }];
  });

  const canvasEdges: CanvasEdge[] = model.edges.map((e) => {
    const style = EDGE_STYLE[e.kind];
    return { id: e.id, from: e.source, to: e.target, color: style.stroke, dashed: !!style.dash, kind: "value" as const, label: e.label };
  });

  return (
    <NodeCanvas
      nodes={canvasNodes}
      edges={canvasEdges}
      selectedId={selectedId}
      onSelect={(id) => id && onSelect(id)}
      onNodeMove={(id, x, y) => setMoved((m) => ({ ...m, [id]: { x, y } }))}
    />
  );
}

function NodeInspector({
  node,
  model,
  registry,
  level,
  action,
  setAction,
  intent,
  setIntent,
  onKnob,
  onAsk,
  asking,
  planText,
  llmLabel,
}: {
  node: AtlasNode;
  model: ReturnType<typeof compileAtlas>;
  registry: ReturnType<typeof buildSampleAtlas>;
  level: EditorContext["level"];
  action: AgentAction;
  setAction: (a: AgentAction) => void;
  intent: string;
  setIntent: (s: string) => void;
  onKnob: (systemId: string, knob: string, value: number) => void;
  onAsk: () => void;
  asking: boolean;
  planText: string | null;
  llmLabel: string | null;
}) {
  const spec = registry.get(node.id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f7" }}>{node.label}</div>
        <div style={{ color: "#8a8a8e" }}>{node.id} · {node.domain}</div>
      </div>
      {node.purpose && <p style={{ margin: 0, color: "#cfcfd2" }}>{node.purpose}</p>}

      <Row label="Health">
        <span style={{ color: HEALTH_COLOR[node.status] }}>{HEALTH_GLYPH[node.status]} {node.status}</span>
        {node.healthReasons.length > 0 && <span style={{ color: "#8a8a8e" }}> — {node.healthReasons.join("; ")}</span>}
      </Row>
      {node.requires.length > 0 && <Row label="Requires">{node.requires.join(", ")}</Row>}
      {node.dependents.length > 0 && <Row label="Depended on by">{node.dependents.join(", ")}</Row>}
      {node.emits.length > 0 && <Row label="Emits">{node.emits.join(", ")}</Row>}
      {node.listens.length > 0 && <Row label="Listens">{node.listens.join(", ")}</Row>}
      {node.providers.length > 0 && <Row label="Providers">{node.providers.join(", ")}</Row>}
      {node.tests.length > 0 && <Row label="Tests">{node.tests.join(", ")}</Row>}
      {node.owns.length > 0 && <Row label="Owns">{node.owns.join(", ")}</Row>}
      {node.feelSpec && <Row label="FeelSpec">{node.feelSpec}</Row>}
      {node.mechanic && <Row label="Mechanic">{node.mechanic}</Row>}

      {spec?.knobs && Object.keys(spec.knobs).length > 0 && (
        <div>
          <div style={{ fontWeight: 700, color: "#f5f5f7", margin: "4px 0" }}>Tuning (live)</div>
          {Object.entries(spec.knobs).map(([name, k]) => {
            if (k.type !== "number") return null;
            const live = readAtlasKnob(level, node.id, name);
            const cur = live ?? (typeof k.value === "number" ? k.value : (k.default as number));
            return (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 6, alignItems: "center", margin: "4px 0" }}>
                <label title={k.describe} style={{ color: "#cfcfd2" }}>
                  {name}{k.unit ? ` (${k.unit})` : ""}
                </label>
                <input
                  type="number"
                  value={cur}
                  min={k.min}
                  max={k.max}
                  step={k.step}
                  onChange={(e) => onKnob(node.id, name, Number(e.target.value))}
                  style={{ width: "100%", background: "#1c1c1e", color: "#eee", border: "1px solid #3a3a3c", borderRadius: 4, padding: "2px 4px" }}
                />
              </div>
            );
          })}
        </div>
      )}

      <div style={{ borderTop: "1px solid #333", paddingTop: 8 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 4 }}>Ask agent (§28/§30)</div>
        <select value={action} onChange={(e) => setAction(e.target.value as AgentAction)} style={{ width: "100%", background: "#1c1c1e", color: "#eee", border: "1px solid #3a3a3c", borderRadius: 4, padding: "3px" }}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Describe the goal in terms of feel — e.g. 'clean landings keep more momentum, sideways landings punish harder'."
          rows={3}
          style={{ width: "100%", marginTop: 4, background: "#1c1c1e", color: "#eee", border: "1px solid #3a3a3c", borderRadius: 4, padding: 4 }}
        />
        <PreviewLine model={model} id={node.id} />
        <Button size="xs" onClick={onAsk} disabled={asking} style={{ marginTop: 4 }}>
          {asking
            ? "Asking…"
            : llmLabel
              ? `Ask ${llmLabel}`
              : "Build scoped task → log + clipboard"}
        </Button>
        {!llmLabel && (
          <p style={{ color: "#8a8a8e", margin: "4px 0 0", fontSize: 11 }}>
            No AI provider yet — set one in the <strong>AI Providers</strong> panel to get a plan back here.
          </p>
        )}
        {planText && (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#141416",
              border: "1px solid #2a2a2c",
              borderRadius: 4,
              padding: 6,
              marginTop: 6,
              maxHeight: 320,
              overflow: "auto",
              color: "#dedee1",
              fontSize: 11,
            }}
          >
            {planText}
          </pre>
        )}
      </div>
    </div>
  );
}

function PreviewLine({ model, id }: { model: ReturnType<typeof compileAtlas>; id: string }) {
  const p = previewChange(model, id);
  return (
    <p style={{ color: "#8a8a8e", margin: "6px 0 0" }}>
      Affects {p.affected.length} system(s), {p.fileCount} file(s), {p.testCount} test path(s) · risk <strong style={{ color: p.risk === "high" ? "#ef4444" : p.risk === "medium" ? "#f59e0b" : "#22c55e" }}>{p.risk}</strong>
    </p>
  );
}

function TraceScrubber({
  span,
  playhead,
  playing,
  counts,
  onSeek,
  onTogglePlay,
  onLive,
}: {
  span: { start: number; end: number } | null;
  playhead: number | null;
  playing: boolean;
  counts: Record<string, number>;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onLive: () => void;
}) {
  if (!span || span.end <= span.start) {
    return (
      <div style={{ fontSize: 11, color: "#8a8a8e", padding: "4px 2px" }}>
        No trace events yet — play a sequence in the Sequencer to record runtime events.
      </div>
    );
  }
  const at = playhead ?? span.end;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={onTogglePlay}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #3a3a3c", background: "#1c1c1e", color: "#eee", cursor: "pointer" }}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <input
          type="range"
          min={span.start}
          max={span.end}
          step={(span.end - span.start) / 500 || 0.001}
          value={at}
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 11, color: "#cfcfd2", minWidth: 64, textAlign: "right" }}>
          {at.toFixed(2)}s
        </span>
        <button
          onClick={onLive}
          title="Show the whole recorded window"
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #3a3a3c", background: playhead == null ? "#3a3a3c" : "#1c1c1e", color: playhead == null ? "#fff" : "#aaa", cursor: "pointer" }}
        >
          ● Live
        </button>
      </div>
      {top.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "#9a9a9e" }}>
          {top.map(([sys, n]) => (
            <span key={sys}>
              <span style={{ color: "#fde047" }}>●</span> {sys} <strong style={{ color: "#cfcfd2" }}>{n}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 6 }}>
      <span style={{ color: "#8a8a8e" }}>{label}</span>
      <span style={{ color: "#dedee1", wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "4px 8px", fontSize: 10, color: "#9a9a9e", borderTop: "1px solid var(--panel-border, #333)" }}>
      <span><span style={{ color: "#64748b" }}>──▶</span> dependency</span>
      <span><span style={{ color: "#f59e0b" }}>╌╌</span> event</span>
      <span><span style={{ color: "#14b8a6" }}>····</span> provider</span>
      <span style={{ color: "#22c55e" }}>● healthy</span>
      <span style={{ color: "#9ca3af" }}>◌ untested</span>
      <span style={{ color: "#ef4444" }}>✕ failing</span>
    </div>
  );
}
