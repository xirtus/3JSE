import * as THREE from "three/webgpu";
import { scatterArea, toInstanceMatrices, type ScatterArea, type ScatterOptions } from "@3jse/foliage";

export interface FoliageSpecies {
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Runs @3jse/foliage's deterministic scatter and materialises it as a single InstancedMesh per
 * species. The field boundary + density are authoritative; nothing is stored per-instance.
 * Re-scatter only when the field or seed changes (scatter is pure and cheap but not free).
 */
export class FoliageRenderer {
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private readonly lastKey = new Map<string, string>();
  readonly group = new THREE.Group();

  constructor(scene: THREE.Object3D) {
    this.group.name = "FoliageRenderer";
    scene.add(this.group);
  }

  /** (Re)build a species field. `key` is any string that changes when the scatter should re-run
   *  (e.g. `${seed}:${density}:${minX},${minZ},${maxX},${maxZ}`). */
  set(species: FoliageSpecies, area: ScatterArea, opts: ScatterOptions, key: string): void {
    if (this.lastKey.get(species.id) === key) return;
    this.lastKey.set(species.id, key);

    const instances = scatterArea(area, opts);
    const matrices = toInstanceMatrices(instances);

    let mesh = this.meshes.get(species.id);
    if (mesh && mesh.count >= instances.length && mesh.geometry === species.geometry) {
      // reuse the buffer
    } else {
      if (mesh) {
        this.group.remove(mesh);
        mesh.dispose();
      }
      mesh = new THREE.InstancedMesh(species.geometry, species.material, Math.max(1, instances.length));
      mesh.name = `foliage:${species.id}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(species.id, mesh);
      this.group.add(mesh);
    }
    mesh.count = instances.length;
    const m = new THREE.Matrix4();
    for (let i = 0; i < instances.length; i++) {
      m.fromArray(matrices, i * 16);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  remove(speciesId: string): void {
    const m = this.meshes.get(speciesId);
    if (m) {
      this.group.remove(m);
      m.dispose();
      this.meshes.delete(speciesId);
      this.lastKey.delete(speciesId);
    }
  }

  instanceCount(speciesId: string): number {
    return this.meshes.get(speciesId)?.count ?? 0;
  }

  dispose(): void {
    for (const m of this.meshes.values()) m.dispose();
    this.meshes.clear();
    this.group.removeFromParent();
  }
}
