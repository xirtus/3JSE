import { getComponentSchema, World, type Entity, type Level } from "@3jse/runtime";
import { migrateLevel, migrateProject } from "./migrate.js";
import type {
  ProjectFiles,
  ProjectMeta,
  SerializedLevel,
  SerializedProjectEntity,
  SerializedProjectManifest,
} from "./types.js";

export interface LoadResult {
  world: World;
  meta: ProjectMeta;
  levels: Level[];
  /** component types encountered on load that had no registered schema — data was kept
   *  verbatim (round-trip lossless) but the Inspector can't render them until registered. */
  unknownComponents: string[];
}

export interface LoadOptions {
  /** reuse an existing World instead of creating one (the editor keeps one live World) */
  world?: World;
  /** called for each recoverable problem instead of throwing */
  onWarning?: (message: string) => void;
}

function applyEntity(level: Level, data: SerializedProjectEntity, unknown: Set<string>): Entity {
  const entity = level.createEntity(data.name, {
    spatial: data.transform !== null,
    id: data.id,
  });
  if (entity.object3D && data.transform) {
    entity.object3D.position.fromArray(data.transform.position);
    entity.object3D.rotation.set(
      data.transform.rotation[0],
      data.transform.rotation[1],
      data.transform.rotation[2],
    );
    entity.object3D.scale.fromArray(data.transform.scale);
  }
  for (const [type, fields] of Object.entries(data.components)) {
    if (getComponentSchema(type)) {
      entity.addComponent(type, { ...fields });
    } else {
      unknown.add(type);
      // Keep the data so a re-save is lossless even with the schema package absent.
      (entity as unknown as { _rawComponents?: Record<string, unknown> })._rawComponents ??= {};
      (entity as unknown as { _rawComponents: Record<string, unknown> })._rawComponents[type] = {
        ...fields,
      };
    }
  }
  if (data.prefab) {
    entity.prefabInstance = { prefabId: data.prefab.prefabId, prefabName: data.prefab.prefabName };
  }
  return entity;
}

export function loadLevelInto(world: World, raw: unknown, unknown: Set<string>): Level {
  const data = migrateLevel(raw as Record<string, unknown>) as unknown as SerializedLevel;
  if (data.kind !== "Level") throw new Error(`Expected a Level file, got kind="${data.kind}".`);

  const level = world.createLevel(data.name, data.id);
  const byId = new Map<string, Entity>();

  // Pass 1: create every entity flat (parent links may point forward or backward).
  for (const e of data.entities) byId.set(e.id, applyEntity(level, e, unknown));

  // Pass 2: reparent, now that every target exists.
  for (const e of data.entities) {
    if (!e.parent) continue;
    const child = byId.get(e.id);
    const parent = byId.get(e.parent);
    if (child && parent && child.object3D) child.setParent(parent);
  }
  return level;
}

/**
 * The docs/PROJECT_FORMAT.md directory tree (as a virtual filesystem) → a live World.
 * `@3jse/runtime` has no editor dependency, so this is also exactly what a headless boot
 * script would call ("recoverable without the editor").
 */
export function loadProject(files: ProjectFiles, opts: LoadOptions = {}): LoadResult {
  const manifestText = files["project.json"];
  if (!manifestText) throw new Error("No project.json in the provided files.");
  const manifest = migrateProject(JSON.parse(manifestText)) as unknown as SerializedProjectManifest;
  if (manifest.kind !== "Project") {
    throw new Error(`project.json has kind="${manifest.kind}", expected "Project".`);
  }

  const world = opts.world ?? new World();
  const unknown = new Set<string>();
  const levels: Level[] = [];

  for (const scenePath of manifest.scenes) {
    const text = files[scenePath];
    if (!text) {
      const msg = `project.json lists scene "${scenePath}" but no such file was provided.`;
      if (opts.onWarning) opts.onWarning(msg);
      else throw new Error(msg);
      continue;
    }
    levels.push(loadLevelInto(world, JSON.parse(text), unknown));
  }

  if (unknown.size && opts.onWarning) {
    opts.onWarning(`Unregistered component types kept verbatim: ${[...unknown].sort().join(", ")}`);
  }

  return {
    world,
    meta: {
      name: manifest.name,
      engine: manifest.engine,
      dependencies: manifest.dependencies,
      startScene: manifest.startScene,
    },
    levels,
    unknownComponents: [...unknown].sort(),
  };
}
