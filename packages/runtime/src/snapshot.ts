// In-memory World/Level snapshot + restore — docs/ROADMAP.md Phase 1.1, docs/RUNTIME.md's
// per-machine determinism / time-travel debugging, docs/AI_AGENT_API.md's counterfactual replay.
//
// This is the *whole* live entity state as a plain JS object, and the inverse operation.
// Deliberately NOT the same as:
//   - @3jse/save   — selective (only `Saveable`-tagged), matched back by name, for save games.
//   - @3jse/project — the on-disk PROJECT_FORMAT tree, stable ids, Git-diff-friendly layout.
// snapshot()/restore() is the fast, total, id-preserving round-trip a replay/undo system wants.

import type { Entity } from "./Entity.js";
import type { Level } from "./Level.js";
import type { World } from "./World.js";
import type { SerializedTransform } from "./Prefab.js";

export interface EntitySnapshot {
  id: string;
  name: string;
  spatial: boolean;
  /** id of the Entity this one is parented under, or null when parented to the Level scene */
  parentId: string | null;
  /** local transform (matches Object3D local position/rotation/scale), null for non-spatial */
  transform: SerializedTransform | null;
  components: Record<string, Record<string, unknown>>;
}

export interface LevelSnapshot {
  id: string;
  name: string;
  /** creation order — restore replays it, so ids and archetype/handle allocation are stable */
  entities: EntitySnapshot[];
}

export interface WorldSnapshot {
  levels: LevelSnapshot[];
}

function snapshotTransform(entity: Entity): SerializedTransform | null {
  const o = entity.object3D;
  if (!o) return null;
  return {
    position: [o.position.x, o.position.y, o.position.z],
    rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
    scale: [o.scale.x, o.scale.y, o.scale.z],
  };
}

function parentEntityId(entity: Entity): string | null {
  const parent = entity.object3D?.parent;
  const pid = parent?.userData?.entityId as string | undefined;
  return pid ?? null;
}

export function snapshotEntity(entity: Entity): EntitySnapshot {
  const components: Record<string, Record<string, unknown>> = {};
  for (const type of entity.listComponentTypes()) {
    const data = entity.getComponent<Record<string, unknown>>(type);
    if (data) components[type] = { ...data };
  }
  return {
    id: entity.id,
    name: entity.name,
    spatial: entity.object3D != null,
    parentId: parentEntityId(entity),
    transform: snapshotTransform(entity),
    components,
  };
}

export function snapshotLevel(level: Level): LevelSnapshot {
  // allEntities is Map insertion order == creation order.
  return { id: level.id, name: level.name, entities: level.allEntities.map(snapshotEntity) };
}

export function snapshotWorld(world: World): WorldSnapshot {
  return { levels: world.allLevels.map(snapshotLevel) };
}

/**
 * Rebuild `level` from `snap`. Every current entity is destroyed first, then the snapshot is
 * replayed in its recorded (creation) order: entities are created under their persisted ids
 * with no parent, their components restored, their local transforms set; a second pass wires
 * `parentId` links (so a child recorded before its parent still resolves). Because this goes
 * through the normal `createEntity`/`addComponent`/`setParent` paths, the archetype index and
 * the EntityRegistry are rebuilt correctly — but the new EntityHandles differ, which is the
 * point: a handle captured before restore is *meant* to read as stale afterwards.
 */
export function restoreLevel(level: Level, snap: LevelSnapshot): void {
  for (const e of [...level.allEntities]) level.destroyEntity(e.id);
  level.name = snap.name;

  for (const es of snap.entities) {
    const entity = level.createEntity(es.name, { spatial: es.spatial, id: es.id });
    if (entity.object3D && es.transform) {
      entity.object3D.position.set(...es.transform.position);
      entity.object3D.rotation.set(...es.transform.rotation);
      entity.object3D.scale.set(...es.transform.scale);
    }
    for (const [type, data] of Object.entries(es.components)) {
      entity.addComponent(type, { ...data });
    }
  }
  // parent pass — after every entity exists
  for (const es of snap.entities) {
    if (!es.parentId) continue;
    const child = level.getEntity(es.id);
    const parent = level.getEntity(es.parentId);
    if (child && parent) child.setParent(parent);
  }
}

export function restoreWorld(world: World, snap: WorldSnapshot): void {
  const wanted = new Set(snap.levels.map((l) => l.id));
  // drop levels not in the snapshot
  for (const lvl of [...world.allLevels]) {
    if (!wanted.has(lvl.id)) {
      for (const e of [...lvl.allEntities]) lvl.destroyEntity(e.id);
      world.removeLevel(lvl.id);
    }
  }
  for (const ls of snap.levels) {
    const level = world.getLevel(ls.id) ?? world.createLevel(ls.name, ls.id);
    restoreLevel(level, ls);
  }
}
