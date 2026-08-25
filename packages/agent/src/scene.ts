import { serializeEntity, type Level, type SerializedEntity } from "@3jse/runtime";

/** docs/AI_AGENT_API.md's `scene.query`: "returns the same JSON shape ENTITY_COMPONENT_MODEL.md
 *  describes" — that shape is exactly `serializeEntity()`'s output, plus a stable `id` an agent
 *  can address in later calls (`serializeEntity` itself doesn't need one — a Prefab's root
 *  doesn't have a live identity yet). */
export interface SceneEntity extends SerializedEntity {
  id: string;
}

function toSceneEntity(entity: Parameters<typeof serializeEntity>[0]): SceneEntity {
  return { id: entity.id, ...serializeEntity(entity) };
}

/** `filter.componentTypes`, when given, matches docs/AI_AGENT_API.md's "Read entities/components
 *  matching a filter" — an empty/omitted filter returns every Entity in the Level. */
export function sceneQuery(level: Level, filter?: { componentTypes?: string[] }): SceneEntity[] {
  const types = filter?.componentTypes;
  const entities = types && types.length > 0 ? level.query(types) : level.allEntities;
  return entities.map(toSceneEntity);
}

export function sceneCreateEntity(level: Level, name: string): SceneEntity {
  return toSceneEntity(level.createEntity(name));
}

export function sceneDestroyEntity(level: Level, entityId: string): void {
  level.destroyEntity(entityId);
}

function requireEntity(level: Level, entityId: string) {
  const entity = level.getEntity(entityId);
  if (!entity) throw new Error(`Unknown Entity "${entityId}".`);
  return entity;
}

/** "Mutate Component data — schema-validated, same path as the Inspector": `addComponent`
 *  already throws on an unregistered type or (via the schema) fills in declared defaults —
 *  this tool doesn't re-implement that validation, it calls the identical Entity method the
 *  Inspector's "Add Component" row does (apps/editor/src/Inspector.tsx). */
export function sceneAddComponent(
  level: Level,
  entityId: string,
  type: string,
  overrides?: Record<string, unknown>,
): SceneEntity {
  const entity = requireEntity(level, entityId);
  entity.addComponent(type, overrides);
  return toSceneEntity(entity);
}

export function sceneRemoveComponent(level: Level, entityId: string, type: string): void {
  requireEntity(level, entityId).removeComponent(type);
}

export function sceneSetProperty(level: Level, entityId: string, componentType: string, field: string, value: unknown): SceneEntity {
  const entity = requireEntity(level, entityId);
  const data = entity.getComponent<Record<string, unknown>>(componentType);
  if (!data) throw new Error(`"${entity.name}" has no Component "${componentType}".`);
  data[field] = value;
  return toSceneEntity(entity);
}
