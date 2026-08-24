import type { SystemDef } from "@3jse/runtime";
import type { PhysicsWorld } from "./PhysicsWorld.js";

/**
 * Registers the physics step as a System — same registration mechanism any Gameplay Framework
 * or compiled 3JSE Graph system uses (docs/RUNTIME.md), just closed over a PhysicsWorld instance
 * because that instance only exists after Rapier's async init resolves and so can't be a static
 * export the way spinSystem/moveSystem are in @3jse/runtime.
 *
 * Query is deliberately empty — not `["RigidBody", "Collider"]` — so the Scheduler always calls
 * this every tick (it only skips a System when its query matches zero entities; an empty query
 * matches the whole Level). `physics.step()` is the physics world's heartbeat: kinematic
 * controllers built on `PhysicsWorld.raw()` (docs/PHYSICS.md's escape hatch — @3jse/character's
 * CharacterControllerManager is the first of these) queue movement via
 * `setNextKinematicTranslation` and depend on this step() to commit it and refresh the
 * broad-phase, even in a Level that happens to have zero plain RigidBody/Collider entities.
 * Stepping a Rapier world with no bodies is effectively free, so running unconditionally costs
 * nothing in the common case and fixes a real bug in the uncommon one.
 */
export function createPhysicsSystem(physics: PhysicsWorld): SystemDef {
  return {
    name: "PhysicsSystem",
    stage: "fixed",
    query: [],
    run: (entities, { dt }) => {
      const physicsEntities = entities.filter((e) => e.hasComponent("RigidBody") && e.hasComponent("Collider"));
      for (const entity of physicsEntities) physics.ensureBody(entity);
      physics.step(dt);
      for (const entity of physicsEntities) physics.writeTransform(entity);
    },
  };
}
