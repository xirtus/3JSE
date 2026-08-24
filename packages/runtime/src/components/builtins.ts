import { registerComponent, defaultsFromFields, type ComponentField } from "../ComponentRegistry.js";

// A handful of real component schemas to prove the generic Component path (as opposed to
// Transform, which is special-cased onto Object3D — see ENTITY_COMPONENT_MODEL.md) actually
// round-trips through registration, storage, and Inspector-style introspection.

const healthFields: ComponentField[] = [
  { name: "current", type: "number", default: 100, min: 0, max: 100, step: 1 },
  { name: "max", type: "number", default: 100, min: 1, max: 1000, step: 1 },
];

registerComponent({
  type: "Health",
  label: "Health",
  fields: healthFields,
  createDefault: () => defaultsFromFields(healthFields) as { current: number; max: number },
});

// Spin exists to give the Scheduler (docs/RUNTIME.md) something real to drive during Play
// mode — a visible, testable proof that a System can mutate live Object3D state each tick.
const spinFields: ComponentField[] = [
  { name: "degreesPerSecond", type: "number", default: 45, min: -360, max: 360, step: 1 },
];

registerComponent({
  type: "Spin",
  label: "Spin",
  fields: spinFields,
  createDefault: () => defaultsFromFields(spinFields) as { degreesPerSecond: number },
});

// Movable pairs with MoveSystem (systems/builtins.ts) to give InputManager something real to
// drive — the same "small, real, testable" role Spin plays for the Scheduler.
const movableFields: ComponentField[] = [
  { name: "speed", type: "number", default: 3, min: 0, max: 50, step: 0.5 },
];

registerComponent({
  type: "Movable",
  label: "Movable",
  fields: movableFields,
  createDefault: () => defaultsFromFields(movableFields) as { speed: number },
});
