import { useMemo } from "react";
import { pluginHost, PACKAGE_CATALOG } from "../plugins.js";
import type { EditorContext } from "./types.js";

const STATUS_COLOR: Record<string, string> = { shipped: "#22c55e", partial: "#f59e0b", planned: "#9ca3af" };

/**
 * docs/ROADMAP.md Phase 6's "package registry / discovery surface". Left: the official
 * `@3jse/*` catalog (`@3jse/plugins` `PACKAGE_CATALOG`) grouped by roadmap phase, each row
 * showing capability, status, and which extension points it contributes to. Right: third-party
 * plugins registered with the editor's `PluginHost` — `community/orbit-marker` here, live in
 * the current scene, with any API-compatibility warnings shown inline.
 */
export function PackagesPanel(_: { ctx: EditorContext }) {
  const byPhase = useMemo(() => {
    const m = new Map<number, typeof PACKAGE_CATALOG>();
    for (const p of PACKAGE_CATALOG) {
      if (!m.has(p.phase)) m.set(p.phase, []);
      m.get(p.phase)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a - b);
  }, []);
  const plugins = pluginHost.list();

  return (
    <div style={{ display: "flex", gap: 16, height: "100%", overflow: "auto", padding: 10, fontSize: 12 }}>
      <div style={{ flex: "1 1 60%" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>
          Official packages ({PACKAGE_CATALOG.length})
        </div>
        {byPhase.map(([phase, pkgs]) => (
          <div key={phase} style={{ marginBottom: 10 }}>
            <div style={{ color: "#8a8a8e", textTransform: "uppercase", fontSize: 10, margin: "4px 0" }}>Phase {phase}</div>
            {pkgs.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 8, padding: "3px 0", borderBottom: "1px solid #26262a" }}>
                <code style={{ color: "#dedee1" }}>{p.id}</code>
                <span style={{ color: "#a8a8ac" }}>
                  {p.capability}
                  {p.points.length > 0 && <span style={{ color: "#6a6a6e" }}> · {p.points.join(", ")}</span>}
                </span>
                <span style={{ color: STATUS_COLOR[p.status] }}>{p.status}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ flex: "0 0 300px", borderLeft: "1px solid #333", paddingLeft: 12 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>
          Third-party plugins ({plugins.length})
        </div>
        {plugins.length === 0 && <p style={{ color: "#8a8a8e" }}>None registered.</p>}
        {plugins.map((rec) => (
          <div key={rec.manifest.id} style={{ marginBottom: 10 }}>
            <div>
              <code style={{ color: "#dedee1" }}>{rec.manifest.id}</code>{" "}
              <span style={{ color: "#6a6a6e" }}>v{rec.manifest.version}</span>{" "}
              <span style={{ color: rec.active ? "#22c55e" : "#ef4444" }}>{rec.active ? "active" : "blocked"}</span>
            </div>
            {rec.manifest.description && <div style={{ color: "#a8a8ac" }}>{rec.manifest.description}</div>}
            <div style={{ color: "#8a8a8e", fontSize: 11 }}>
              contributes: {rec.applied.length ? rec.applied.join(", ") : "—"}
            </div>
            {rec.issues.map((i, n) => (
              <div key={n} style={{ color: i.level === "error" ? "#ef4444" : "#f59e0b", fontSize: 11 }}>
                {i.level}: {i.message}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
