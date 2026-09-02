import * as THREE from "three/webgpu";
import { TerrainStreamer, type HeightSampler, type StreamerOptions } from "@3jse/terrain";

/**
 * Turns @3jse/terrain's headless chunk output into live BufferGeometry in a THREE scene — the
 * "GPU/viewport half" the gap analysis calls out. The mesher / LOD / bounded residency logic
 * all lives in @3jse/terrain (and is unit-tested there); this class only owns the THREE object
 * lifecycle. Usable from the editor Viewport and from a shipped game's bootstrap alike.
 */
export class TerrainRenderer {
  private readonly streamer: TerrainStreamer;
  private readonly meshes = new Map<string, THREE.Mesh>();
  readonly group = new THREE.Group();

  constructor(
    scene: THREE.Object3D,
    sampler: HeightSampler,
    opts: StreamerOptions,
    private readonly material: THREE.Material = new THREE.MeshStandardMaterial({ color: 0x3c4a3a, roughness: 0.95, flatShading: false }),
  ) {
    this.group.name = "TerrainRenderer";
    this.streamer = new TerrainStreamer(sampler, opts);
    scene.add(this.group);
  }

  /** Call each frame with the focus (camera/player) world position. */
  update(focusX: number, focusZ: number): void {
    const delta = this.streamer.update(focusX, focusZ);

    for (const key of delta.removed) {
      const m = this.meshes.get(key);
      if (m) {
        this.group.remove(m);
        m.geometry.dispose();
        this.meshes.delete(key);
      }
    }
    for (const rc of [...delta.added, ...delta.updated]) {
      let mesh = this.meshes.get(rc.key);
      const geom = this.buildGeometry(rc.mesh);
      if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry = geom;
      } else {
        mesh = new THREE.Mesh(geom, this.material);
        mesh.name = `terrain:${rc.key}`;
        this.meshes.set(rc.key, mesh);
        this.group.add(mesh);
      }
    }
  }

  private buildGeometry(chunk: { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array }): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(chunk.normals, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(chunk.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
    return g;
  }

  get chunkCount(): number {
    return this.meshes.size;
  }
  heightAt(x: number, z: number): number {
    return this.streamer.heightAt(x, z);
  }

  dispose(): void {
    for (const m of this.meshes.values()) m.geometry.dispose();
    this.meshes.clear();
    this.group.removeFromParent();
  }
}
