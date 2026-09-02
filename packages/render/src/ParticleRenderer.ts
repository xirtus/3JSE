import * as THREE from "three/webgpu";
import type { ParticlePool } from "@3jse/vfx";

/**
 * One THREE.Points per @3jse/vfx ParticlePool. The CPU sim (SoA integration, spawn, kill,
 * curves) is all in @3jse/vfx; this only streams `pool.buffers()` into GPU attributes each
 * frame. For large counts, use {@link GpuParticleRenderer} instead — same `sync(pools)` call
 * site, but per-particle size + the soft sprite run in a TSL node graph and the streams land in
 * storage buffers.
 */
export class ParticleRenderer {
  private readonly points = new Map<string, THREE.Points>();
  readonly group = new THREE.Group();

  constructor(
    scene: THREE.Object3D,
    private readonly material: THREE.Material = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, depthWrite: false }),
  ) {
    this.group.name = "ParticleRenderer";
    scene.add(this.group);
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
      const { positions, colors } = pool.buffers();
      let pts = this.points.get(id);
      if (!pts) {
        pts = new THREE.Points(new THREE.BufferGeometry(), this.material);
        pts.name = `particles:${id}`;
        pts.frustumCulled = false;
        this.points.set(id, pts);
        this.group.add(pts);
      }
      const g = pts.geometry as THREE.BufferGeometry;
      const posAttr = g.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!posAttr || posAttr.array.length !== positions.length) {
        g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      } else {
        (posAttr.array as Float32Array).set(positions);
        posAttr.needsUpdate = true;
        const colAttr = g.getAttribute("color") as THREE.BufferAttribute;
        (colAttr.array as Float32Array).set(colors);
        colAttr.needsUpdate = true;
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
