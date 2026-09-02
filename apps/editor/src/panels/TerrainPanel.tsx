import { useMemo, useState } from "react";
import { valueNoise2D, fbm, TerrainStreamer } from "@3jse/terrain";
import { scatterArea } from "@3jse/foliage";
import type { EditorContext } from "./types.js";

/**
 * docs/VENDOR_INTEGRATIONS.md — the runtime terrain + foliage layer, over `@3jse/terrain` +
 * `@3jse/foliage`. No viewport meshing yet (that's the WebGPU viewport pass); this shows the
 * bounded-residency streamer's chunk set and the deterministic scatter's instance count for a
 * movable focus point, plus a top-down heightfield thumbnail.
 */
export function TerrainPanel(_: { ctx: EditorContext }) {
  const [seed, setSeed] = useState(7);
  const [focusX, setFocusX] = useState(0);
  const [ring, setRing] = useState(2);
  const [density, setDensity] = useState(0.5);

  const sampler = useMemo(() => fbm(valueNoise2D(seed), 4, 2, 0.5, 6, 0.05), [seed]);

  const { chunks, verts } = useMemo(() => {
    const s = new TerrainStreamer(sampler, { chunkSize: 32, ring, baseResolution: 16 });
    s.update(focusX, 0);
    const cs = s.chunks();
    return { chunks: cs.length, verts: cs.reduce((n, c) => n + c.mesh.positions.length / 3, 0) };
  }, [sampler, focusX, ring]);

  const instances = useMemo(
    () =>
      scatterArea(
        { minX: focusX - 40, minZ: -40, maxX: focusX + 40, maxZ: 40 },
        { density, seed, ground: sampler, constraints: { slopeMax: 0.7 } },
      ).length,
    [focusX, density, seed, sampler],
  );

  // 48x48 top-down heightfield thumbnail
  const thumb = useMemo(() => {
    const N = 48;
    const cells: string[] = [];
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const h = sampler(focusX - 60 + (x / N) * 120, -60 + (z / N) * 120);
        const g = Math.max(0, Math.min(255, Math.round(60 + h * 12)));
        cells.push(`rgb(${g},${Math.round(g * 1.1)},${Math.round(g * 0.8)})`);
      }
    return { N, cells };
  }, [sampler, focusX]);

  const knob = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number) => (
    <div style={{ margin: "3px 0" }}>
      <label style={{ color: "#8a8a8e" }}>{label}: {v}</label>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%", fontSize: 12, overflow: "auto" }}>
      <div style={{ flex: "0 0 240px", padding: 10, borderRight: "1px solid #333" }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Streamer</div>
        {knob("seed", seed, setSeed, 1, 50, 1)}
        {knob("focus X", focusX, setFocusX, -200, 200, 4)}
        {knob("residency ring", ring, setRing, 1, 4, 1)}
        {knob("foliage density", density, setDensity, 0, 2, 0.1)}
        <div style={{ color: "#dedee1", marginTop: 8 }}>
          <div>resident chunks: <strong>{chunks}</strong></div>
          <div>meshed vertices: <strong>{verts.toLocaleString()}</strong></div>
          <div>foliage instances (80×80 around focus): <strong>{instances}</strong></div>
        </div>
        <p style={{ color: "#6a6a6e" }}>Deterministic in the seed — same inputs, byte-identical chunks + instances. Viewport meshing is the WebGPU pass.</p>
      </div>
      <div style={{ flex: 1, padding: 10 }}>
        <div style={{ fontWeight: 700, color: "#f5f5f7", marginBottom: 4 }}>Heightfield (top-down, 120×120 around focus)</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${thumb.N}, 6px)`, width: thumb.N * 6, border: "1px solid #333" }}>
          {thumb.cells.map((c, i) => <div key={i} style={{ width: 6, height: 6, background: c }} />)}
        </div>
      </div>
    </div>
  );
}
