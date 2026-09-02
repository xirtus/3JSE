import { useMemo, useState } from "react";
import { autoMapSkeleton, retargetClip, type AnimationGraphDef, type RetargetClip } from "@3jse/animation";
import type { EditorContext } from "./types.js";

// The Third Person template's locomotion graph (mirrors @3jse/templates' LOCOMOTION_GRAPH).
const graph: AnimationGraphDef = {
  states: [
    { name: "Locomotion", loop: true, blendTree: [
      { clip: "Idle", threshold: 0 }, { clip: "Walk", threshold: 5 }, { clip: "Run", threshold: 10 },
    ] },
    { name: "Jump", clip: "Jump", loop: false },
  ],
  transitions: [
    { from: "Locomotion", to: "Jump", conditions: [{ param: "grounded", op: "==", value: 0 }], duration: 0.15 },
    { from: "Jump", to: "Locomotion", conditions: [{ param: "grounded", op: "==", value: 1 }], duration: 0.2 },
  ],
  entryState: "Locomotion",
};

// A stand-in Mixamo clip to demo retargeting onto a plain skeleton.
const mixamoClip: RetargetClip = {
  name: "mixamo.com",
  duration: 1,
  tracks: [
    { target: "mixamorig:Hips.position", times: [0, 1], values: [0, 100, 0, 0, 101, 3] },
    { target: "mixamorig:Hips.quaternion", times: [0], values: [0, 0, 0, 1] },
    { target: "mixamorig:LeftUpLeg.quaternion", times: [0], values: [0, 0, 0, 1] },
    { target: "mixamorig:Spine.quaternion", times: [0], values: [0, 0, 0, 1] },
    { target: "mixamorig:Head.quaternion", times: [0], values: [0, 0, 0, 1] },
  ],
};
const targetBones = ["Hips", "LeftUpLeg", "Spine", "Head"];

/**
 * docs/ANIMATION.md / docs/EDITOR.md Animation Tools — over the real `@3jse/animation` package.
 * Left: the locomotion state machine (states, transitions, blend-tree thresholds). Right: a
 * live retarget demo — auto-maps a Mixamo skeleton onto a plain one and shows which tracks
 * carried over, with a hip-height ratio slider.
 */
export function AnimationPanel(_: { ctx: EditorContext }) {
  const [srcHipY, setSrcHipY] = useState(100);
  const [tgtHipY, setTgtHipY] = useState(90);

  const map = useMemo(() => autoMapSkeleton(mixamoClip.tracks.map((t) => t.target.split(".")[0]!), targetBones), []);
  const retargeted = useMemo(
    () => retargetClip(mixamoClip, map, {
      sourceRest: { "mixamorig:Hips": { name: "h", position: [0, srcHipY, 0], quaternion: [0, 0, 0, 1] } },
      targetRest: { Hips: { name: "h", position: [0, tgtHipY, 0], quaternion: [0, 0, 0, 1] } },
    }),
    [map, srcHipY, tgtHipY],
  );

  return (
    <div style={{ display: "flex", height: "100%", fontSize: 12, overflow: "auto" }}>
      <div style={{ flex: "1 1 55%", padding: 10, borderRight: "1px solid #333" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Locomotion state machine</div>
        {graph.states.map((s) => (
          <div key={s.name} style={{ border: "1px solid #3a3a3c", borderRadius: 6, padding: 8, marginBottom: 8, background: "#202024" }}>
            <div style={{ color: "#f5f5f7", fontWeight: 600 }}>
              {s.name}{s.name === graph.entryState ? " · entry" : ""} {s.loop ? "· loop" : ""}
            </div>
            {s.blendTree ? (
              <table style={{ marginTop: 4, color: "#a8a8ac" }}>
                <tbody>
                  {s.blendTree.map((b) => (
                    <tr key={b.clip}><td style={{ paddingRight: 12 }}>{b.clip}</td><td>@ speed ≥ {b.threshold}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#a8a8ac" }}>clip: {s.clip}</div>
            )}
          </div>
        ))}
        <div style={{ fontWeight: 700, color: "#f5f5f7", margin: "8px 0 4px" }}>Transitions</div>
        {graph.transitions.map((t, i) => (
          <div key={i} style={{ color: "#a8a8ac" }}>
            {t.from} → {t.to} · {t.conditions.map((c) => `${c.param} ${c.op} ${c.value}`).join(", ")} · {t.duration}s
          </div>
        ))}
      </div>

      <div style={{ flex: "0 0 320px", padding: 10 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Retarget: Mixamo → plain skeleton</div>
        <div style={{ color: "#a8a8ac", marginBottom: 6 }}>
          auto-map: {Object.entries(map.bones).map(([s, t]) => `${s.replace("mixamorig:", "")}→${t}`).join(", ")}
        </div>
        <label style={{ color: "#8a8a8e" }}>source hip height: {srcHipY}</label>
        <input type="range" min={50} max={150} value={srcHipY} onChange={(e) => setSrcHipY(Number(e.target.value))} style={{ width: "100%" }} />
        <label style={{ color: "#8a8a8e" }}>target hip height: {tgtHipY}</label>
        <input type="range" min={50} max={150} value={tgtHipY} onChange={(e) => setTgtHipY(Number(e.target.value))} style={{ width: "100%" }} />
        <p style={{ color: "#8a8a8e" }}>hip Y ratio {(tgtHipY / srcHipY).toFixed(2)} → root translation scaled so the retarget doesn't sink</p>
        <div style={{ fontWeight: 700, color: "#f5f5f7", margin: "8px 0 4px" }}>Retargeted tracks ({retargeted.tracks.length})</div>
        {retargeted.tracks.map((t) => (
          <div key={t.target} style={{ color: "#a8a8ac" }}>
            <code>{t.target}</code>{t.target === "Hips.position" ? ` → y[1] ${t.values[1]!.toFixed(1)}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
