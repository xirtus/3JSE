// @3jse/project — read/write a 3JSE project as the docs/PROJECT_FORMAT.md directory tree.
// Pure over a virtual filesystem (path -> text); a shell adapter maps it to real files.

export {
  LEVEL_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  type ProjectFiles,
  type ProjectMeta,
  type SerializedLevel,
  type SerializedProjectEntity,
  type SerializedProjectManifest,
  type SerializedTransform,
} from "./types.js";
export { serializeEntity, serializeLevel, serializeProject } from "./serialize.js";
export { loadProject, loadLevelInto, type LoadOptions, type LoadResult } from "./load.js";
export { migrateLevel, migrateProject } from "./migrate.js";
export { stableStringify } from "./stableJson.js";
