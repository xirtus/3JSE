import type { Entity } from "./Entity.js";
import type { Level } from "./Level.js";

export interface SerializedTransform {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler radians, matches Object3D.rotation
  scale: [number, number, number];
}

export interface SerializedEntity {
  name: string;
  transform: SerializedTransform | null;
  components: Record<string, Record<string, unknown>>;
  children: SerializedEntity[];
}

/** A serializable Entity template — docs/ENTITY_COMPONENT_MODEL.md's Prefab. In-memory only for
 *  now: there's no Asset Pipeline / project file storage yet (docs/ROADMAP.md Phase 1), so a
 *  Prefab here is a plain JS object an app holds onto, not yet a `.json` file under `/prefabs`
 *  (docs/PROJECT_FORMAT.md) — the shape is already exactly what that file would contain. */
export interface Prefab {
  id: string;
  name: string;
  root: SerializedEntity;
}

let nextPrefabId = 1;

function serializeTransform(entity: Entity): SerializedTransform | null {
  const o = entity.object3D;
  if (!o) return null;
  return {
    position: o.position.toArray() as [number, number, number],
    rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
    scale: o.scale.toArray() as [number, number, number],
  };
}

export function serializeEntity(entity: Entity): SerializedEntity {
  const components: Record<string, Record<string, unknown>> = {};
  for (const type of entity.listComponentTypes()) {
    const data = entity.getComponent<Record<string, unknown>>(type);
    if (data) components[type] = { ...data };
  }
  return {
    name: entity.name,
    transform: serializeTransform(entity),
    components,
    children: entity.getChildEntities().map(serializeEntity),
  };
}

export function createPrefab(name: string, entity: Entity): Prefab {
  return { id: `prefab_${nextPrefabId++}`, name, root: serializeEntity(entity) };
}

function instantiateNode(level: Level, node: SerializedEntity, parent: Entity | null): Entity {
  const entity = level.createEntity(node.name, { spatial: node.transform !== null, parent });
  if (entity.object3D && node.transform) {
    entity.object3D.position.fromArray(node.transform.position);
    entity.object3D.rotation.set(...node.transform.rotation);
    entity.object3D.scale.fromArray(node.transform.scale);
  }
  for (const [type, data] of Object.entries(node.components)) {
    entity.addComponent(type, { ...data });
  }
  for (const child of node.children) {
    instantiateNode(level, child, entity);
  }
  return entity;
}

/** Spawns a live Entity tree from a Prefab — the runtime-side half (a shipped game's
 *  @3jse/spawning calls this too, not just the editor), matching docs/ENTITY_COMPONENT_MODEL.md's
 *  "Prefab instances track their source Prefab." */
export function instantiatePrefab(level: Level, prefab: Prefab, parent: Entity | null = null): Entity {
  const entity = instantiateNode(level, prefab.root, parent);
  entity.prefabInstance = { prefabId: prefab.id, prefabName: prefab.name };
  return entity;
}

/** Component/field paths on `entity` that differ from `prefab`'s stored source — the "variant
 *  override" set (docs/ROADMAP.md Phase 2). Computed on demand by diffing live state against the
 *  captured snapshot rather than tracked via separate mutation bookkeeping: one source of truth
 *  (current live components) instead of two that can drift apart. Only checks the root node's
 *  components against `entity`'s own — child-entity overrides are out of scope for this pass. */
export function diffPrefabOverrides(entity: Entity, prefab: Prefab): string[] {
  const overrides: string[] = [];
  const source = prefab.root.components;
  for (const type of entity.listComponentTypes()) {
    const live = entity.getComponent<Record<string, unknown>>(type);
    if (!live) continue;
    const original = source[type];
    if (!original) {
      overrides.push(type); // whole component added since the prefab was captured
      continue;
    }
    for (const key of Object.keys(live)) {
      if (live[key] !== original[key]) overrides.push(`${type}.${key}`);
    }
  }
  return overrides;
}
