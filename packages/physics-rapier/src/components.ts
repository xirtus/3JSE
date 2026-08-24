import { registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";

// RigidBody/Collider are plain data, exactly like Health/Spin/Movable in @3jse/runtime — the
// actual Rapier body only comes into existence when PhysicsWorld.ensureBody() sees an Entity
// carrying both (systems.ts). This is what keeps physics an *optional* plugin: nothing in
// @3jse/runtime knows these types exist (docs/PLUGIN_ARCHITECTURE.md).

const rigidBodyFields: ComponentField[] = [
  { name: "bodyType", type: "string", default: "dynamic" }, // "dynamic" | "fixed" | "kinematic"
  { name: "mass", type: "number", default: 1, min: 0.01, max: 1000, step: 0.1 },
  { name: "linearDamping", type: "number", default: 0, min: 0, max: 10, step: 0.05 },
  { name: "angularDamping", type: "number", default: 0, min: 0, max: 10, step: 0.05 },
];

registerComponent({
  type: "RigidBody",
  label: "Rigid Body",
  fields: rigidBodyFields,
  createDefault: () =>
    defaultsFromFields(rigidBodyFields) as {
      bodyType: string;
      mass: number;
      linearDamping: number;
      angularDamping: number;
    },
});

const colliderFields: ComponentField[] = [
  { name: "shape", type: "string", default: "box" }, // "box" | "sphere" | "capsule"
  { name: "sizeX", type: "number", default: 1, min: 0.01, max: 100, step: 0.1 },
  { name: "sizeY", type: "number", default: 1, min: 0.01, max: 100, step: 0.1 },
  { name: "sizeZ", type: "number", default: 1, min: 0.01, max: 100, step: 0.1 },
  { name: "radius", type: "number", default: 0.5, min: 0.01, max: 50, step: 0.05 },
  // capsule-only: Rapier's capsule half-height excludes the two end caps, matching
  // @3jse/character's CapsuleHalfHeight field (docs/PHYSICS.md's collider vocabulary is meant
  // to line up with the kinematic character capsule, not invent a second convention).
  { name: "halfHeight", type: "number", default: 0.5, min: 0.01, max: 50, step: 0.05 },
  { name: "friction", type: "number", default: 0.5, min: 0, max: 2, step: 0.05 },
  { name: "restitution", type: "number", default: 0.2, min: 0, max: 1, step: 0.05 },
];

registerComponent({
  type: "Collider",
  label: "Collider",
  fields: colliderFields,
  createDefault: () =>
    defaultsFromFields(colliderFields) as {
      shape: string;
      sizeX: number;
      sizeY: number;
      sizeZ: number;
      radius: number;
      halfHeight: number;
      friction: number;
      restitution: number;
    },
});

// `type`, not `interface`: Entity.getComponent<T extends Record<string, unknown>>() needs T to
// structurally satisfy that constraint, which a named `interface` doesn't do on its own here —
// confirmed by tsc, not guessed (an inline object-literal generic arg, used elsewhere in this
// codebase, works for the same underlying reason).
export type RigidBodyData = {
  bodyType: string;
  mass: number;
  linearDamping: number;
  angularDamping: number;
};

export type ColliderData = {
  shape: string;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  radius: number;
  halfHeight: number;
  friction: number;
  restitution: number;
};
