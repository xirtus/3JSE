export { PhysicsWorld, PHYSICS_RESOURCE } from "./PhysicsWorld.js";
export { createPhysicsSystem } from "./systems.js";
export type { RigidBodyData, ColliderData } from "./components.js";

// Registers RigidBody/Collider against @3jse/runtime's ComponentRegistry as a side effect —
// importing @3jse/physics-rapier always gives you a working component set, same convention as
// @3jse/runtime's own Health/Spin/Movable (components/builtins.ts).
import "./components.js";
