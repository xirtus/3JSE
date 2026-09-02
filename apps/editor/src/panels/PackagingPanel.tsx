import { useMemo, useState } from "react";
import { Button } from "@galacean/editor-ui";
import { serializeProject } from "@3jse/project";
import { publish, type BuildTarget, type QualityTier, type PublishResult } from "@3jse/packaging";
import { PACKAGE_CATALOG } from "../plugins.js";
import type { EditorContext } from "./types.js";

const TARGETS: BuildTarget[] = ["static-web", "pwa", "desktop", "mobile", "xr"];
const TIERS: QualityTier[] = ["ultra", "high", "medium", "low"];

/**
 * docs/BUILD_DEPLOYMENT.md's Publish, in the editor — over the real `@3jse/packaging` pipeline.
 * Serializes the live World to the `@3jse/project` format, tree-shakes the package set down to
 * what the scene's components actually need, and runs `publish()` for the chosen target/tier.
 * Shows the build manifest (packages kept vs shaken, chunks, assets, buildId) and the generated
 * static-host files (index.html, bootstrap.js, manifest.json, NOTICES). The actual bundling
 * step (esbuild) runs in the CLI/CI — this panel produces its deterministic plan.
 */
export function PackagingPanel({ ctx }: { ctx: EditorContext }) {
  const [target, setTarget] = useState<BuildTarget>("static-web");
  const [tier, setTier] = useState<QualityTier>("high");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [shownFile, setShownFile] = useState<string | null>(null);

  // Which @3jse/* packages the live scene's component types imply are in use.
  const usedPackages = useMemo(() => {
    const types = new Set<string>();
    for (const e of ctx.level.allEntities) for (const t of e.listComponentTypes()) types.add(t);
    const map: Record<string, string> = {
      CharacterController: "@3jse/character", CameraRig: "@3jse/character",
      RigidBody: "@3jse/physics-rapier", Collider: "@3jse/physics-rapier",
      AnimationController: "@3jse/animation", Saveable: "@3jse/save",
      Cinematic: "@3jse/cinematics", SpawnPoint: "@3jse/spawning",
    };
    const used = new Set<string>(["@3jse/runtime"]);
    for (const t of types) if (map[t]) used.add(map[t]!);
    return [...used];
  }, [ctx.level, ctx.playing]);

  function run() {
    const files = serializeProject(ctx.world, {
      name: ctx.level.name || "Untitled",
      engine: "0.0.0",
      dependencies: Object.fromEntries(PACKAGE_CATALOG.map((p) => [p.id, "workspace:*"])),
      startScene: ctx.world.allLevels[0]?.id ?? null,
    });
    const r = publish(
      {
        projectName: ctx.level.name || "Untitled",
        engine: "0.0.0",
        dependencies: Object.fromEntries(PACKAGE_CATALOG.map((p) => [p.id, "workspace:*"])),
        usedPackages,
        scenes: ctx.world.allLevels.map((l) => l.id),
        startScene: ctx.world.allLevels[0]?.id ?? null,
        assets: Object.entries(files).map(([path, content]) => ({ path, content, kind: "data" as const })),
        graphs: [],
        notices: [],
      },
      { target, tier, keepLodTiers: [0], production: true },
    );
    setResult(r);
    setShownFile("manifest.json");
    ctx.pushLog(r.ok ? "info" : "warn", `Publish ${target}/${tier}: ${r.ok ? "OK" : "BLOCKED"} — buildId ${r.manifest?.buildId}`);
  }

  const m = result?.manifest;
  return (
    <div style={{ display: "flex", height: "100%", fontSize: 12, overflow: "auto" }}>
      <div style={{ flex: "0 0 280px", padding: 10, borderRight: "1px solid #333" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Publish</div>
        <label style={{ color: "#8a8a8e" }}>Target</label>
        <select value={target} onChange={(e) => setTarget(e.target.value as BuildTarget)} style={sel}>
          {TARGETS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label style={{ color: "#8a8a8e" }}>Quality tier</label>
        <select value={tier} onChange={(e) => setTier(e.target.value as QualityTier)} style={sel}>
          {TIERS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <p style={{ color: "#8a8a8e" }}>Used packages ({usedPackages.length}): {usedPackages.join(", ")}</p>
        <Button size="xs" onClick={run}>Run publish plan</Button>
      </div>

      <div style={{ flex: 1, padding: 10, minWidth: 0 }}>
        {!result ? (
          <p style={{ color: "#8a8a8e" }}>Run a publish plan to see the build manifest + generated files.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
              <Stat label="build id" value={m!.buildId} />
              <Stat label="target" value={`${m!.target} / ${m!.tier}`} />
              <Stat label="packages" value={`${m!.packages.length} kept, ${m!.treeShakenOut.length} shaken`} />
              <Stat label="chunks" value={m!.chunks.length} />
              <Stat label="~bytes" value={m!.totalBytes.toLocaleString()} />
              <Stat label="status" value={result.ok ? "OK" : "BLOCKED"} color={result.ok ? "#22c55e" : "#ef4444"} />
            </div>
            {result.issues.map((i, n) => (
              <div key={n} style={{ color: i.level === "error" ? "#ef4444" : "#f59e0b" }}>{i.level}: {i.message}</div>
            ))}
            {m!.treeShakenOut.length > 0 && (
              <p style={{ color: "#8a8a8e" }}>tree-shaken out: {m!.treeShakenOut.join(", ")}</p>
            )}
            <div style={{ display: "flex", gap: 4, margin: "6px 0" }}>
              {Object.keys(result.files).map((f) => (
                <button key={f} onClick={() => setShownFile(f)} style={{ ...tab, background: shownFile === f ? "#3a3a3c" : "#1c1c1e" }}>{f}</button>
              ))}
            </div>
            {shownFile && (
              <pre style={{ background: "#111", color: "#cfcfd2", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 260, fontSize: 11 }}>
                {result.files[shownFile]}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const sel: React.CSSProperties = { width: "100%", margin: "2px 0 8px", background: "#1c1c1e", color: "#eee", border: "1px solid #3a3a3c", borderRadius: 4, padding: "3px" };
const tab: React.CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #3a3a3c", color: "#ccc", cursor: "pointer" };

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div style={{ color: "#8a8a8e", fontSize: 10, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: color ?? "#dedee1" }}>{value}</div>
    </div>
  );
}
