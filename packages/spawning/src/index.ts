// @3jse/spawning — docs/GAMEPLAY_FRAMEWORK.md's Spawning / Pooling row.
export { ObjectPool, SpawnRegistry, SPAWN_REGISTRY_RESOURCE } from "./ObjectPool.js";
export { createSpawnSystem, type SpawnSystemOptions } from "./systems.js";
export type { SpawnPointData, SpawnedData } from "./components.js";

// Registers SpawnPoint / Spawned against @3jse/runtime's ComponentRegistry as a side effect.
import "./components.js";
