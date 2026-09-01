import { useMemo, useState } from "react";
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
  DOMAIN_COLOR,
  HEALTH_COLOR,
  HEALTH_GLYPH,
  type AtlasEdge,
  type AtlasNode,
  type AgentAction,
  type LensGraph,
} from "@3jse/atlas";
import { buildSampleAtlas, SAMPLE_EVIDENCE, applyAtlasKnob, readAtlasKnob } from "../sampleAtlas.js";
import type { EditorContext } from "./types.js";

const EDGE_STYLE: Record<AtlasEdge["kind"], { stroke: string; dash?: string }> = {
  dependency: { stroke: "#64748b" },
  event: { stroke: "#f59e0b", dash: "5 4" },
  provider: { stroke: "#14b8a6", dash: "2 4" },
  asset: { stroke: "#eab308", dash: "2 4" },
  ownership: { stroke: "#334155", dash: "1 3" },
};

const ACTIONS: AgentAction[] = ["explain", "modify", "tune", "optimize", "repair", "compare"];

type LensId = "system" | "events" | "performance" | "providers" | "assets";
const LENSES: { id: LensId; label: string }[] = [
  { id: "system", label: "System Map" },
  { id: "events", label: "Events" },
  { id: "performance", label: "Performance" },
  { id: "providers", label: "Providers" },
  { id: "assets", label: "Assets" },
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

  const model = useMemo(
    () => compileAtlas({ systems: registry.list(), evidence: SAMPLE_EVIDENCE }),
    [registry, rev],
  );
  const view: LensGraph = useMemo(() => {
    switch (lens) {
      case "events": return eventLens(model);
      case "performance": return performanceLens(model);
      case "providers": return providerLens(model);
      case "assets": return assetLens(model);
      default: return { nodes: model.nodes, edges: model.edges };
    }
  }, [model, lens]);
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

  function askAgent() {
    if (!selected) return;
    const pkg = exportAgentContext(model, selected.id, intent || "(no intent given)", { action });
    const preview = previewChange(model, selected.id);
    const blob = JSON.stringify({ context: pkg, preview }, null, 2);
    ctx.pushLog("info", `Atlas → agent (${action}) on ${selected.id}: ${preview.affected.length} systems, ${preview.fileCount} files, risk ${preview.risk}.`);
    ctx.pushLog("info", blob);
    try {
      void navigator.clipboard?.writeText(blob);
    } catch {
      /* clipboard blocked — the log copy above is the fallback */
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
}: {
  model: LensGraph;
  layout: ReturnType<typeof layoutAtlas>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const box = (id: string) => layout.nodes[id];
  return (
    <svg width={layout.width} height={layout.height} style={{ display: "block" }}>
      <defs>
        <marker id="atlas-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
        </marker>
      </defs>
      {model.edges.map((e) => {
        const a = box(e.source);
        const b = box(e.target);
        if (!a || !b) return null;
        const style = EDGE_STYLE[e.kind];
        const x1 = a.x + a.width;
        const y1 = a.y + a.height / 2;
        const x2 = b.x;
        const y2 = b.y + b.height / 2;
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={e.id}
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={style.stroke}
            strokeWidth={e.kind === "dependency" ? 1.6 : 1.2}
            strokeDasharray={style.dash}
            markerEnd={e.kind === "dependency" ? "url(#atlas-arrow)" : undefined}
            opacity={selectedId && e.source !== selectedId && e.target !== selectedId ? 0.25 : 0.9}
          />
        );
      })}
      {model.nodes.map((n) => {
        const b = box(n.id);
        if (!b) return null;
        const hue = DOMAIN_COLOR[n.domain];
        const isSel = n.id === selectedId;
        const dim = selectedId && !isSel && !isNeighbor(model, selectedId, n.id);
        return (
          <g key={n.id} transform={`translate(${b.x}, ${b.y})`} style={{ cursor: "pointer" }} onClick={() => onSelect(n.id)} opacity={dim ? 0.4 : 1}>
            <rect width={b.width} height={b.height} rx={6} fill="#202024" stroke={isSel ? "#fff" : hue} strokeWidth={isSel ? 2 : 1.4} />
            <rect width={4} height={b.height} rx={2} fill={hue} />
            <text x={12} y={18} fill="#f5f5f7" fontSize={12} fontWeight={600}>{n.label}</text>
            <text x={12} y={33} fill="#9a9a9e" fontSize={10}>{n.domain}</text>
            <text x={12} y={b.height - 22} fill={HEALTH_COLOR[n.status]} fontSize={10}>
              {HEALTH_GLYPH[n.status]} {n.status}
            </text>
            <text x={12} y={b.height - 8} fill="#8a8a8e" fontSize={10}>
              {n.tests.length ? `${n.tests.length} test path(s)` : "no tests"}
              {n.cpuMs != null ? ` · ${n.cpuMs.toFixed(2)} ms` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function isNeighbor(model: LensGraph, a: string, b: string): boolean {
  return model.edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
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
        <Button size="xs" onClick={onAsk} style={{ marginTop: 4 }}>Build scoped task → log + clipboard</Button>
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
