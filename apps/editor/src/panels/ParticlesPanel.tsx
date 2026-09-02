import { useEffect, useMemo, useRef, useState } from "react";
import { ParticlePool, type EmitterDef } from "@3jse/vfx";
import type { EditorContext } from "./types.js";

const preset: EmitterDef = {
  maxParticles: 400,
  rate: 120,
  burst: 0,
  life: { min: 1.2, max: 2.2 },
  speed: { min: 2, max: 5 },
  direction: [0, 1, 0],
  spread: 0.5,
  gravity: [0, -3, 0],
  drag: 0.4,
  sizeOverLife: [{ t: 0, v: 0 }, { t: 0.2, v: 1 }, { t: 1, v: 0 }],
  colorOverLife: [{ t: 0, color: [1, 0.9, 0.4] }, { t: 0.5, color: [1, 0.4, 0.1] }, { t: 1, color: [0.3, 0.3, 0.4] }],
  seed: 12345,
};

/**
 * docs/EDITOR.md Particle Editor — over the real `@3jse/vfx` CPU sim. A live 2D preview (XY
 * projection of the pool) plus knobs for the main EmitterDef fields. The same `ParticlePool`
 * a headless test drives; here it's stepped on an interval and drawn to a canvas.
 */
export function ParticlesPanel(_: { ctx: EditorContext }) {
  const [rate, setRate] = useState(preset.rate);
  const [spread, setSpread] = useState(preset.spread);
  const [gravityY, setGravityY] = useState(preset.gravity[1]);
  const [drag, setDrag] = useState(preset.drag);
  const [count, setCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const def = useMemo<EmitterDef>(
    () => ({ ...preset, rate, spread, gravity: [0, gravityY, 0], drag }),
    [rate, spread, gravityY, drag],
  );
  const poolRef = useRef(new ParticlePool(def));
  useEffect(() => { poolRef.current = new ParticlePool(def); }, [def]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const pool = poolRef.current;
      pool.step(dt, [0, 0, 0]);
      setCount(pool.count);

      const cv = canvasRef.current;
      const ctx2d = cv?.getContext("2d");
      if (cv && ctx2d) {
        ctx2d.fillStyle = "#0c0c0e";
        ctx2d.fillRect(0, 0, cv.width, cv.height);
        const { positions, sizes, colors } = pool.buffers();
        const scale = 22;
        for (let i = 0; i < pool.count; i++) {
          const x = cv.width / 2 + positions[i * 3]! * scale;
          const y = cv.height - 20 - positions[i * 3 + 1]! * scale;
          const r = Math.max(0.5, sizes[i]! * 4);
          ctx2d.fillStyle = `rgb(${Math.round(colors[i * 3]! * 255)},${Math.round(colors[i * 3 + 1]! * 255)},${Math.round(colors[i * 3 + 2]! * 255)})`;
          ctx2d.beginPath();
          ctx2d.arc(x, y, r, 0, Math.PI * 2);
          ctx2d.fill();
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const knob = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number) => (
    <div style={{ margin: "3px 0" }}>
      <label style={{ color: "#8a8a8e" }}>{label}: {v}</label>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%", fontSize: 12, overflow: "hidden" }}>
      <div style={{ flex: "0 0 220px", padding: 10, borderRight: "1px solid #333" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Emitter · {count} live</div>
        {knob("rate /s", rate, setRate, 0, 400, 5)}
        {knob("spread (rad)", spread, setSpread, 0, Math.PI, 0.05)}
        {knob("gravity Y", gravityY, setGravityY, -20, 5, 0.5)}
        {knob("drag", drag, setDrag, 0, 3, 0.1)}
        <p style={{ color: "#6a6a6e" }}>Same @3jse/vfx ParticlePool a headless test drives — this one is stepped on rAF and drawn XY.</p>
      </div>
      <div style={{ flex: 1, background: "#0c0c0e" }}>
        <canvas ref={canvasRef} width={520} height={420} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
    </div>
  );
}
