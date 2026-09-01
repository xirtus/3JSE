import type { Entity, Level, World } from "@3jse/runtime";
import { stableStringify } from "./stableJson.js";
import {
  LEVEL_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  type ProjectFiles,
  type ProjectMeta,
  type SerializedLevel,
  type SerializedProjectEntity,
  type SerializedProjectManifest,
  type SerializedTransform,
} from "./types.js";

function serializeTransform(entity: Entity): SerializedTransform | null {
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
  const id = parent?.userData?.entityId;
  return typeof id === "string" ? id : null;
}

export function serializeEntity(entity: Entity): SerializedProjectEntity {
  const components: Record<string, Record<string, unknown>> = {};
  for (const type of entity.listComponentTypes()) {
    const data = entity.getComponent<Record<string, unknown>>(type);
    if (data) components[type] = { ...data };
  }
  const out: SerializedProjectEntity = {
    id: entity.id,
    name: entity.name,
    parent: parentEntityId(entity),
    transform: serializeTransform(entity),
    components,
  };
  if (entity.prefabInstance) {
    out.prefab = {
      prefabId: entity.prefabInstance.prefabId,
      prefabName: entity.prefabInstance.prefabName,
    };
  }
  return out;
}

export function serializeLevel(level: Level): SerializedLevel {
  const entities = level.allEntities
    .map(serializeEntity)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    kind: "Level",
    schemaVersion: LEVEL_SCHEMA_VERSION,
    id: level.id,
    name: level.name,
    entities,
  };
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "level"
  );
}

/**
 * A whole World → the docs/PROJECT_FORMAT.md directory tree as a virtual filesystem:
 * `project.json` plus one `scenes/<slug>.json` per Level. Deterministic content and paths, so
 * re-saving an unchanged project is a no-op in Git.
 */
export function serializeProject(world: World, meta: ProjectMeta): ProjectFiles {
  const files: ProjectFiles = {};
  const usedPaths = new Set<string>();
  const scenePaths: string[] = [];

  for (const level of world.allLevels) {
    let base = `scenes/${slug(level.name)}`;
    let path = `${base}.json`;
    if (usedPaths.has(path)) path = `${base}-${level.id}.json`;
    usedPaths.add(path);
    scenePaths.push(path);
    files[path] = stableStringify(serializeLevel(level));
  }

  const manifest: SerializedProjectManifest = {
    kind: "Project",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: meta.name,
    engine: meta.engine,
    dependencies: meta.dependencies,
    scenes: scenePaths.sort(),
    startScene: meta.startScene,
  };
  files["project.json"] = stableStringify(manifest);
  return files;
}
