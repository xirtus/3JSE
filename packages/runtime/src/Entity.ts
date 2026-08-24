// Imported from "three/webgpu", not plain "three": that entry point is a separate prebuilt
// bundle from three's core build, so mixing the two import specifiers across packages would
// create two non-identical Object3D/Scene classes. Every package that touches the scene graph
// must import from the same specifier the renderer does — see apps/editor/src/Viewport.tsx.
import * as THREE from "three/webgpu";
import { getComponentSchema } from "./ComponentRegistry.js";
import type { Level } from "./Level.js";

let nextId = 1;

/**
 * The addressable "thing" in a Level — docs/ENTITY_COMPONENT_MODEL.md.
 *
 * Transform is not a generic component: per the design doc, Object3D *is* the Transform's
 * storage, so a spatial Entity's position/rotation/scale live on `object3D` directly and
 * there is no separate Transform copy to drift out of sync. An Entity with `object3D: null`
 * is a non-spatial Entity (a manager, a spawn director) and is never part of the render scene.
 */
export class Entity {
  readonly id: string;
  name: string;
  readonly level: Level;
  object3D: THREE.Object3D | null;
  /** Set by instantiatePrefab() (Prefab.ts) — lets the Hierarchy panel render prefab instances
   *  distinctly and lets diffPrefabOverrides() find the source to diff against
   *  (docs/ENTITY_COMPONENT_MODEL.md's Prefab, docs/EDITOR.md's Hierarchy panel). */
  prefabInstance?: { prefabId: string; prefabName: string };

  private readonly components = new Map<string, Record<string, unknown>>();

  constructor(level: Level, name: string, spatial = true) {
    this.id = `entity_${nextId++}`;
    this.name = name;
    this.level = level;
    this.object3D = spatial ? new THREE.Object3D() : null;
    if (this.object3D) {
      this.object3D.name = name;
      // Lets the Viewport walk a raycast hit's Object3D back up to the owning Entity
      // without a separate side-table (docs/EDITOR.md's click-to-select).
      this.object3D.userData.entityId = this.id;
    }
  }

  addComponent<T extends Record<string, unknown>>(type: string, overrides?: Partial<T>): T {
    const schema = getComponentSchema(type);
    if (!schema) throw new Error(`Unknown component type "${type}" — did you registerComponent() it?`);
    const data = { ...schema.createDefault(), ...overrides } as T;
    this.components.set(type, data);
    return data;
  }

  getComponent<T extends Record<string, unknown> = Record<string, unknown>>(
    type: string,
  ): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  hasComponent(type: string): boolean {
    return this.components.has(type);
  }

  hasAll(types: string[]): boolean {
    return types.every((t) => this.components.has(t));
  }

  removeComponent(type: string): void {
    this.components.delete(type);
  }

  listComponentTypes(): string[] {
    return Array.from(this.components.keys());
  }

  setParent(parent: Entity | null): void {
    if (!this.object3D) throw new Error(`Entity "${this.name}" is non-spatial and cannot be reparented.`);
    if (parent && !parent.object3D) {
      throw new Error(`Cannot parent "${this.name}" under non-spatial entity "${parent.name}".`);
    }
    (parent?.object3D ?? this.level.scene).add(this.object3D);
  }

  /** Entities whose Object3D is a direct child of this one's — real Entities, not incidental
   *  visual meshes an app added directly (a Mesh carries no entityId, so it's excluded by
   *  construction). Used by the Hierarchy panel's tree and by Prefab.ts's serialization. */
  getChildEntities(): Entity[] {
    if (!this.object3D) return [];
    const children: Entity[] = [];
    for (const child of this.object3D.children) {
      const id = child.userData.entityId as string | undefined;
      const entity = id ? this.level.getEntity(id) : undefined;
      if (entity) children.push(entity);
    }
    return children;
  }
}
