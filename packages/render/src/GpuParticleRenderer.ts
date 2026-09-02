import * as THREE from "three/webgpu";
import { attribute, float, smoothstep, uv, vec2 } from "three/tsl";
import type { ParticlePool } from "@3jse/vfx";

/**
 * GPU-side particle rendering path. Drop-in for {@link ParticleRenderer} — same
 * `sync(pools)` call site — but the per-particle **size** and the soft round sprite mask are
 * evaluated in a TSL node graph on the GPU (`PointsNodeMaterial`), and the per-frame position/
 * colour/size streams land in `StorageBufferAttribute`s rather than plain vertex attributes, so
 * large pools upload and draw considerably cheaper than the `THREE.PointsMaterial` path.
 *
 * The **simulation** still runs on the CPU in @3jse/vfx (SoA integration, spawn/kill, curves) —
 * that stays the single headless authority (docs/PERFORMANCE.md, engine-package "Headless-first").
 * A full GPU-*compute* re-simulation would move that authority off the headless core and out of
 * vitest reach, so it's deliberately not done here; this is the render bridge, tuned.
 */
export class GpuParticleRenderer {
  private readonly points = new Map<string, THREE.Points>();
  readonly group = new THREE.Group();
  private readonly material: THREE.Material;

  constructor(scene: THREE.Object3D, material?: THREE.Material) {
    this.group.name = "GpuParticleRenderer";
    scene.add(this.group);

    if (material) {
      this.material = material;
    } else {
      const m = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false });
      m.blending = THREE.AdditiveBlending;
      // per-particle size straight from the streamed `size` attribute (world-ish units)
      m.sizeNode = attribute<"float">("size", "float").mul(40);
      m.colorNode = attribute<"vec3">("color", "vec3");
      // soft disc: fade the last 25% of the sprite radius to zero
      const d = uv().sub(vec2(0.5, 0.5)).length();
      m.opacityNode = smoothstep(float(0.5), float(0.25), d);
      this.material = m;
    }
  }

  /** Call each frame after the ParticleSystem has stepped its pools. */
  sync(pools: Map<string, ParticlePool>): void {
    for (const id of [...this.points.keys()]) {
      if (!pools.has(id)) {
        const p = this.points.get(id)!;
        this.group.remove(p);
        p.geometry.dispose();
        this.points.delete(id);
      }
    }
    for (const [id, pool] of pools) {
      const { positions, colors, sizes } = pool.buffers();
      let pts = this.points.get(id);
      if (!pts) {
        pts = new THREE.Points(new THREE.BufferGeometry(), this.material);
        pts.name = `gpu-particles:${id}`;
        pts.frustumCulled = false;
        this.points.set(id, pts);
        this.group.add(pts);
      }
      const g = pts.geometry as THREE.BufferGeometry;
      const posAttr = g.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!posAttr || posAttr.array.length !== positions.length) {
        g.setAttribute("position", new THREE.StorageBufferAttribute(positions, 3));
        g.setAttribute("color", new THREE.StorageBufferAttribute(colors, 3));
        g.setAttribute("size", new THREE.StorageBufferAttribute(sizes, 1));
      } else {
        (posAttr.array as Float32Array).set(positions);
        posAttr.needsUpdate = true;
        const colAttr = g.getAttribute("color") as THREE.BufferAttribute;
        (colAttr.array as Float32Array).set(colors);
        colAttr.needsUpdate = true;
        const sizeAttr = g.getAttribute("size") as THREE.BufferAttribute;
        (sizeAttr.array as Float32Array).set(sizes);
        sizeAttr.needsUpdate = true;
      }
      g.setDrawRange(0, pool.count);
    }
  }

  count(id: string): number {
    return (this.points.get(id)?.geometry as THREE.BufferGeometry | undefined)?.drawRange.count ?? 0;
  }

  dispose(): void {
    for (const p of this.points.values()) p.geometry.dispose();
    this.points.clear();
    this.group.removeFromParent();
  }
}
