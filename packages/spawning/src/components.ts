import { registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";

// docs/GAMEPLAY_FRAMEWORK.md's Spawning/Pooling row. Plain data, same convention as every
// other @3jse/* package: the spawn math lives in systems.ts, driven by these fields.

const spawnPointFields: ComponentField[] = [
  // Which pool/prefab this point emits. Resolved against the SpawnRegistry resource by name so
  // a Level file stays a plain string reference (docs/PROJECT_FORMAT.md), not an object graph.
  { name: "prefab", type: "string", default: "" },
  // seconds between spawns; 0 disables automatic spawning (point is then manual-only)
  { name: "interval", type: "number", default: 2, min: 0, max: 600, step: 0.1 },
  // don't spawn again while this many spawned-by-this-point entities are still alive
  { name: "maxAlive", type: "number", default: 8, min: 0, max: 1000, step: 1 },
  // stop after this many total spawns from this point; 0 = unlimited
  { name: "totalLimit", type: "number", default: 0, min: 0, max: 100000, step: 1 },
  // start firing immediately vs. wait one full interval
  { name: "spawnOnStart", type: "boolean", default: true },
  // random offset box applied to each spawn's local position
  { name: "jitterRadius", type: "number", default: 0, min: 0, max: 100, step: 0.1 },
  { name: "enabled", type: "boolean", default: true },
];

export type SpawnPointData = {
  prefab: string;
  interval: number;
  maxAlive: number;
  totalLimit: number;
  spawnOnStart: boolean;
  jitterRadius: number;
  enabled: boolean;
};

registerComponent({
  type: "SpawnPoint",
  label: "Spawn Point",
  fields: spawnPointFields,
  createDefault: () => defaultsFromFields(spawnPointFields) as SpawnPointData,
});

// Attached to spawned entities so a pool / a point can find its own live spawns without a
// side table. `sourceId` is the SpawnPoint entity id; `pool` is the pool key it came from.
const spawnedFields: ComponentField[] = [
  { name: "sourceId", type: "string", default: "" },
  { name: "pool", type: "string", default: "" },
];

export type SpawnedData = { sourceId: string; pool: string };

registerComponent({
  type: "Spawned",
  label: "Spawned",
  fields: spawnedFields,
  createDefault: () => defaultsFromFields(spawnedFields) as SpawnedData,
});
