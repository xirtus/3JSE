import { serializeEntity, type Entity, type Level, type SerializedEntity } from "@3jse/runtime";
import { defaultSaveStorage, type SaveStorage } from "./SaveStorage.js";

/** The Resource key SaveService registers itself under — same convention as InputManager's
 *  INPUT_RESOURCE and @3jse/physics-rapier's PHYSICS_RESOURCE (docs/RUNTIME.md). */
export const SAVE_RESOURCE = "Save";

const SLOT_PREFIX = "3jse:save:";

export interface SaveSnapshot {
  savedAt: number;
  /** Keyed by Entity *name*, not runtime id — ids are freshly generated each session
   *  (docs/ENTITY_COMPONENT_MODEL.md), so name is the only stable-enough key available without
   *  a real asset/entity GUID system (real future work, noted rather than built around). A
   *  renamed Entity simply won't reattach its old save data — an accepted, honest limitation
   *  for this first pass. */
  entities: Record<string, SerializedEntity>;
}

function applyToEntity(entity: Entity, data: SerializedEntity): void {
  if (entity.object3D && data.transform) {
    entity.object3D.position.fromArray(data.transform.position);
    entity.object3D.rotation.set(...data.transform.rotation);
    entity.object3D.scale.fromArray(data.transform.scale);
  }
  // Only updates components the live Entity already carries — a saved snapshot never
  // resurrects a Component type that isn't already registered/present, avoiding a save file
  // silently reshaping a scene it's applied to.
  for (const [type, componentData] of Object.entries(data.components)) {
    const live = entity.getComponent<Record<string, unknown>>(type);
    if (live) Object.assign(live, componentData);
  }
}

/**
 * Snapshot-and-restore for every Entity tagged with the Saveable component
 * (docs/GAMEPLAY_FRAMEWORK.md's SaveGame row). Reuses @3jse/runtime's serializeEntity — the
 * same function Prefab.ts's createPrefab() is built on — rather than a second, parallel
 * serialization format: a save snapshot and a Prefab capture the same thing (an Entity's
 * Transform + Components), just for a different purpose and a different storage location.
 */
export class SaveService {
  private readonly storage: SaveStorage;

  constructor(storage: SaveStorage = defaultSaveStorage()) {
    this.storage = storage;
  }

  captureSnapshot(level: Level): SaveSnapshot {
    const entities: Record<string, SerializedEntity> = {};
    for (const entity of level.allEntities) {
      if (!entity.hasComponent("Saveable")) continue;
      entities[entity.name] = serializeEntity(entity);
    }
    return { savedAt: Date.now(), entities };
  }

  /** Returns how many tagged Entities in `level` actually matched a name in the snapshot and
   *  were updated — 0 doesn't mean failure, it means nothing in the snapshot matched anything
   *  currently in the Level (a very different scene, or everything got renamed). */
  applySnapshot(level: Level, snapshot: SaveSnapshot): number {
    let applied = 0;
    for (const [name, data] of Object.entries(snapshot.entities)) {
      const entity = level.allEntities.find((e) => e.name === name);
      if (!entity) continue;
      applyToEntity(entity, data);
      applied++;
    }
    return applied;
  }

  save(level: Level, slot: string): void {
    this.storage.setItem(SLOT_PREFIX + slot, JSON.stringify(this.captureSnapshot(level)));
  }

  /** Returns the number of Entities updated, or `null` if the slot doesn't exist at all — a
   *  slot existing but matching zero live Entities returns 0, a real, distinct outcome from
   *  "there was nothing to load." */
  load(level: Level, slot: string): number | null {
    const raw = this.storage.getItem(SLOT_PREFIX + slot);
    if (raw === null) return null;
    return this.applySnapshot(level, JSON.parse(raw) as SaveSnapshot);
  }

  hasSlot(slot: string): boolean {
    return this.storage.getItem(SLOT_PREFIX + slot) !== null;
  }

  deleteSlot(slot: string): void {
    this.storage.removeItem(SLOT_PREFIX + slot);
  }

  listSlots(): string[] {
    return this.storage
      .keys()
      .filter((key) => key.startsWith(SLOT_PREFIX))
      .map((key) => key.slice(SLOT_PREFIX.length));
  }
}
