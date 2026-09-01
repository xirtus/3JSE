import { useEffect, useState } from "react";
import { runtimeGetPerf, type PerfReport } from "@3jse/agent";
import { getPerfRecorder } from "../perf.js";
import type { EditorContext } from "./types.js";

/**
 * docs/PERFORMANCE.md's Profiler panel — the headless `runtime.getPerf` (`@3jse/agent`) made
 * visible, fed by the *real* render loop (perf.ts) rather than a synthetic probe. Explicitly
 * scoped like the tool it wraps: measured CPU/simulation timing + a scene census, never draw
 * calls or GPU time (a real render pass would be needed for those — not faked here).
 */
export function ProfilerPanel({ ctx }: { ctx: EditorContext }) {
  const [report, setReport] = useState<PerfReport | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const perf = getPerfRecorder(ctx.world);
      if (perf) setReport(runtimeGetPerf(ctx.world, perf));
    }, 500);
    return () => clearInterval(id);
  }, [ctx.world]);

  if (!report || report.frames === 0) {
    return (
      <div style={{ padding: 10, fontSize: 12, color: "#8a8a8e" }}>
        <p>No samples yet — press Play. Every simulated frame is timed.</p>
      </div>
    );
  }

  const componentRows = Object.entries(report.scene.components).sort(([, a], [, b]) => b - a);

  return (
    <div style={{ display: "flex", gap: 16, height: "100%", overflow: "auto", padding: 10, fontSize: 12 }}>
      <div style={{ flex: "0 0 260px" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Simulation (CPU)</div>
        <Row label="frames sampled" value={report.frames} />
        <Row label="avg ms/frame" value={report.avgMsPerFrame} />
        <Row label="min / max ms" value={`${report.minMsPerFrame} / ${report.maxMsPerFrame}`} />
        <Row label="est. FPS" value={report.estimatedFps} />
        <p style={{ color: "#6a6a6e", marginTop: 8 }}>{report.note}</p>
      </div>
      <div style={{ flex: "0 0 200px" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Scene</div>
        <Row label="levels" value={report.scene.levels} />
        <Row label="entities" value={report.scene.entities} />
        <Row label="spatial" value={report.scene.spatialEntities} />
        <Row label="systems" value={report.scene.systems} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Components in use</div>
        {componentRows.map(([type, count]) => (
          <div key={type} style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 6, alignItems: "center", marginBottom: 2 }}>
            <code style={{ color: "#dedee1" }}>{type}</code>
            <div style={{ background: "#26262a", height: 8, borderRadius: 4 }}>
              <div
                style={{
                  width: `${Math.min(100, (count / report.scene.entities) * 100)}%`,
                  height: "100%",
                  background: "#3b82f6",
                  borderRadius: 4,
                }}
              />
            </div>
            <span style={{ color: "#8a8a8e" }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #26262a", padding: "2px 0" }}>
      <span style={{ color: "#8a8a8e" }}>{label}</span>
      <span style={{ color: "#dedee1" }}>{value}</span>
    </div>
  );
}
