import * as THREE from "three/webgpu"; // see the note in Entity.ts
import { Entity } from "./Entity.js";
import type { World } from "./World.js";

let nextLevelId = 1;

/** A serializable unit of Entities — docs/ENTITY_COMPONENT_MODEL.md, docs/WORLD_SYSTEM.md. */
export class Level {
  readonly id: string;
  name: string;
  readonly world: World;
  readonly scene: THREE.Scene;
  private readonly entities = new Map<string, Entity>();

  constructor(world: World, name: string) {
    this.id = `level_${nextLevelId++}`;
    this.name = name;
    this.world = world;
    this.scene = new THREE.Scene();
  }

  createEntity(name: string, opts: { spatial?: boolean; parent?: Entity | null } = {}): Entity {
    const entity = new Entity(this, name, opts.spatial ?? true);
    this.entities.set(entity.id, entity);
    if (entity.object3D) {
      (opts.parent?.object3D ?? this.scene).add(entity.object3D);
    }
    return entity;
  }

  destroyEntity(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    entity.object3D?.removeFromParent();
    this.entities.delete(id);
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  get allEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /** Entities not parented under another Entity — the top level of the Hierarchy panel's tree
   *  (docs/EDITOR.md). A non-spatial Entity has no parent concept and always counts as root. */
  rootEntities(): Entity[] {
    return this.allEntities.filter((e) => !e.object3D || e.object3D.parent === this.scene);
  }

  /** Walks up from a raycast-hit Object3D (which may be a mesh nested under an Entity's
   *  transform, not the transform itself) to find the owning Entity, if any. */
  findEntityFromObject3D(object: THREE.Object3D | null): Entity | undefined {
    let node: THREE.Object3D | null = object;
    while (node) {
      const entityId = node.userData.entityId as string | undefined;
      if (entityId) return this.entities.get(entityId);
      node = node.parent;
    }
    return undefined;
  }

  /** Every Entity whose components include all of `types`. The full scan is Phase 1-honest —
   *  see docs/PERFORMANCE.md; archetype indexing is unbuilt future work, not pretended-away. */
  query(types: string[]): Entity[] {
    return this.allEntities.filter((e) => e.hasAll(types));
  }
}
