import { LEVEL_SCHEMA_VERSION, PROJECT_SCHEMA_VERSION } from "./types.js";

/**
 * docs/PROJECT_FORMAT.md §Versioning: "a versioned, ordered chain of small migration functions
 * (v3 → v4 → v5 …) run automatically on load, each one narrow enough to unit-test against a
 * real fixture file from that version." A file newer than the running engine understands is
 * refused loudly, not silently up-converted.
 *
 * There is exactly one schema version so far, so both chains are empty — the machinery is
 * here so the first real migration is a one-line addition, not a refactor.
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const LEVEL_MIGRATIONS: Record<number, Migration> = {
  // 1: (data) => ({ ...data, schemaVersion: 2, /* ...rename a field... */ }),
};
const PROJECT_MIGRATIONS: Record<number, Migration> = {};

function runChain(
  data: Record<string, unknown>,
  migrations: Record<number, Migration>,
  target: number,
  label: string,
): Record<string, unknown> {
  let version = typeof data.schemaVersion === "number" ? data.schemaVersion : 1;
  if (version > target) {
    throw new Error(
      `${label} file is schemaVersion ${version} but this engine understands at most ${target}. ` +
        `Refusing to load — upgrade @3jse packages.`,
    );
  }
  let out = data;
  while (version < target) {
    const step = migrations[version];
    if (!step) {
      throw new Error(`No ${label} migration registered for schemaVersion ${version} → ${version + 1}.`);
    }
    out = step(out);
    version = typeof out.schemaVersion === "number" ? out.schemaVersion : version + 1;
  }
  return out;
}

export function migrateLevel(data: Record<string, unknown>): Record<string, unknown> {
  return runChain(data, LEVEL_MIGRATIONS, LEVEL_SCHEMA_VERSION, "Level");
}

export function migrateProject(data: Record<string, unknown>): Record<string, unknown> {
  return runChain(data, PROJECT_MIGRATIONS, PROJECT_SCHEMA_VERSION, "Project");
}
