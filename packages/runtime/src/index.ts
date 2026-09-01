export { World } from "./World.js";
export { Level } from "./Level.js";
export { Entity } from "./Entity.js";
export { Scheduler } from "./Scheduler.js";
export { EntityRegistry, NULL_HANDLE, type EntityHandle } from "./EntityRegistry.js";
export {
  snapshotWorld,
  restoreWorld,
  snapshotLevel,
  restoreLevel,
  snapshotEntity,
  type WorldSnapshot,
  type LevelSnapshot,
  type EntitySnapshot,
} from "./snapshot.js";
export type { SystemDef, SystemStage, SystemContext } from "./Scheduler.js";
export {
  registerComponent,
  getComponentSchema,
  listComponentSchemas,
  defaultsFromFields,
} from "./ComponentRegistry.js";
export type { ComponentSchema, ComponentField, FieldType } from "./ComponentRegistry.js";

// Not re-exported from this barrel (deliberately): these are demo Systems (see their own doc
// comments), and this file's `import "./components/builtins.js"` below means anything that
// transitively imports systems/builtins.ts through *this* module can never have its own,
// independent HMR accept boundary — an edit would invalidate this whole barrel, cascading into
// every other package's component-registration side effects and hitting registerComponent()'s
// "already registered" guard (see apps/editor/src/sampleScene.ts's installHotReload doc comment).
// Import from the "@3jse/runtime/systems/builtins" subpath instead.

export { InputManager, INPUT_RESOURCE } from "./InputManager.js";
export type { AxisBinding } from "./InputManager.js";

export {
  serializeEntity,
  createPrefab,
  instantiatePrefab,
  diffPrefabOverrides,
} from "./Prefab.js";
export type { Prefab, SerializedEntity, SerializedTransform } from "./Prefab.js";

// Registers Health/Spin/Movable against the module-level ComponentRegistry as a side effect —
// importing @3jse/runtime always gives you a working component set out of the box.
import "./components/builtins.js";
