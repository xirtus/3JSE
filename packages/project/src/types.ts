// On-disk shapes for docs/PROJECT_FORMAT.md. Every serialized file carries an explicit
// `schemaVersion` checked on load — never inferred from content shape.

export const LEVEL_SCHEMA_VERSION = 1;
export const PROJECT_SCHEMA_VERSION = 1;

export interface SerializedTransform {
  /** Object3D.position */
  position: [number, number, number];
  /** Euler radians, matches Object3D.rotation (Prefab.ts uses the same shape) */
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SerializedProjectEntity {
  id: string;
  name: string;
  /** entity id of the parent, or null for a Level-root entity */
  parent: string | null;
  /** null for a non-spatial Entity (a manager, a spawn director) */
  transform: SerializedTransform | null;
  /** component type -> plain-JSON field data; key order is normalised on write */
  components: Record<string, Record<string, unknown>>;
  /** set when this entity was spawned from a Prefab */
  prefab?: { prefabId: string; prefabName: string };
}

export interface SerializedLevel {
  kind: "Level";
  schemaVersion: number;
  id: string;
  name: string;
  /** flat list; hierarchy is expressed via each entity's `parent` id (PROJECT_FORMAT.md:
   *  "Stable IDs, not array position"). Written sorted by id for diff stability. */
  entities: SerializedProjectEntity[];
}

export interface SerializedProjectManifest {
  kind: "Project";
  schemaVersion: number;
  name: string;
  /** engine version this project was authored against */
  engine: string;
  /** @3jse/* (and community) package name -> semver range the project depends on */
  dependencies: Record<string, string>;
  /** relative paths under the project root, one per Level file */
  scenes: string[];
  /** id of the Level to open first */
  startScene: string | null;
}

export interface ProjectMeta {
  name: string;
  engine: string;
  dependencies: Record<string, string>;
  startScene: string | null;
}

/** A project as a virtual filesystem: POSIX-style relative path -> file text. The editor's
 *  shell adapter (Tauri fs / browser File System Access) or a CLI maps this to real files;
 *  keeping it a plain map is what makes save/load testable with no renderer, no disk, and is
 *  docs/PROJECT_FORMAT.md's "recoverable without the editor" taken literally. */
export type ProjectFiles = Record<string, string>;
