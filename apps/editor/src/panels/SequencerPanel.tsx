import { useEffect, useState } from "react";
import { Button } from "@galacean/editor-ui";
import { sequences } from "../sequences.js";
import { cinematicEventLog } from "../sampleScene.js";
import type { EditorContext } from "./types.js";

interface CinematicSnapshot {
  entityId: string;
  entityName: string;
  sequence: string;
  playing: boolean;
  time: number;
}

/**
 * docs/EDITOR.md Phase 5's Sequencer panel, over the real `@3jse/cinematics` runtime — no
 * separate authoring-only data model. Lists every live `Cinematic`-tagged entity, lets you
 * Play/Pause and scrub its `time` field directly (CinematicSystem's doc comment: an external
 * write to `time` is treated as a seek), and shows the sequence's tracks + the most recent
 * event markers CinematicSystem has crossed.
 *
 * `Level.allEntities`/component reads are live snapshots, not React state (same posture as
 * HierarchyPanel/Viewport) — a light poll re-renders this panel so Play-mode playhead motion
 * (driven by the Viewport's rAF loop, not React) is visible without wiring a bespoke subscriber.
 */
export function SequencerPanel({ ctx }: { ctx: EditorContext }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  const cinematics: CinematicSnapshot[] = ctx.level.allEntities
    .filter((e) => e.hasComponent("Cinematic"))
    .map((e) => {
      const d = e.getComponent<{ sequence: string; playing: boolean; time: number }>("Cinematic")!;
      return { entityId: e.id, entityName: e.name, sequence: d.sequence, playing: d.playing, time: d.time };
    });

  function setField(entityId: string, field: "playing" | "time", value: boolean | number) {
    const e = ctx.level.getEntity(entityId);
    const d = e?.getComponent<Record<string, unknown>>("Cinematic");
    if (d) d[field] = value;
  }

  return (
    <div style={{ display: "flex", height: "100%", fontSize: 12, overflow: "auto" }}>
      <div style={{ flex: "1 1 60%", padding: 10 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Cinematics ({cinematics.length})</div>
        {cinematics.length === 0 && <p style={{ color: "#8a8a8e" }}>No entity carries a Cinematic component.</p>}
        {cinematics.map((c) => {
          const seq = sequences[c.sequence];
          return (
            <div key={c.entityId} style={{ marginBottom: 14, borderBottom: "1px solid #26262a", paddingBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ color: "#f5f5f7" }}>{c.entityName}</strong>
                <span style={{ color: "#8a8a8e" }}>→ {c.sequence}</span>
                <Button size="xs" onClick={() => setField(c.entityId, "playing", !c.playing)}>
                  {c.playing ? "Pause" : "Play"}
                </Button>
                <Button size="xs" onClick={() => setField(c.entityId, "time", 0)}>Rewind</Button>
              </div>
              {seq ? (
                <>
                  <input
                    type="range"
                    min={0}
                    max={seq.duration}
                    step={seq.duration / 200}
                    value={c.time}
                    onChange={(e) => setField(c.entityId, "time", Number(e.target.value))}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                  <div style={{ color: "#8a8a8e" }}>
                    {c.time.toFixed(2)}s / {seq.duration}s {seq.loop ? "(loop)" : ""} · {seq.tracks.length} track(s)
                  </div>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#a8a8ac" }}>
                    {seq.tracks.map((t, i) => (
                      <li key={i}>
                        {t.kind === "property" && `property · ${t.entity || "(unset)"} · ${t.channel} · ${t.keyframes.length} keyframe(s)`}
                        {t.kind === "event" && `event · ${t.markers.length} marker(s)`}
                        {t.kind === "activation" && `activation · ${t.entity} · ${t.ranges.length} range(s)`}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p style={{ color: "#ef4444" }}>sequence "{c.sequence}" not found in the registry.</p>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ flex: "0 0 260px", borderLeft: "1px solid #333", padding: 10 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Recent event markers</div>
        {cinematicEventLog.length === 0 && <p style={{ color: "#8a8a8e" }}>None fired yet — press Play.</p>}
        <ul style={{ margin: 0, paddingLeft: 16, color: "#a8a8ac" }}>
          {cinematicEventLog.map((e, i) => (
            <li key={i}>
              <code>{e.name}</code> @ {e.time.toFixed(2)}s
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
