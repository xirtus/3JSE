import { INPUT_RESOURCE, type InputManager, type SystemDef } from "@3jse/runtime";
import type { PhysicsWorld } from "@3jse/physics-rapier";
import { CharacterControllerManager } from "./CharacterControllerManager.js";
import { computeCameraPose, type CameraPose } from "./CameraRig.js";
import type { CameraRigData, CharacterControllerData } from "./components.js";

/** The Resource key the Viewport (or any renderer) reads to drive the camera in follow mode —
 *  docs/GAMEPLAY_FRAMEWORK.md's CameraRig. Only present once a CameraRig-carrying Entity has
 *  actually ticked at least once. */
export const CAMERA_FOLLOW_RESOURCE = "CameraFollow";

/**
 * Registers the character-movement step as a System — same registration mechanism
 * @3jse/physics-rapier's createPhysicsSystem uses, for the same reason (the manager instance
 * only exists after Rapier's async init, so it can't be a static export). Runs in the "fixed"
 * stage, registered *before* @3jse/physics-rapier's PhysicsSystem in Scheduler order (systems
 * within a stage run in registration order — docs/RUNTIME.md's tick loop) so kinematic
 * characters queue their movement for this tick before PhysicsWorld.step() commits it and
 * advances every dynamic/fixed body.
 *
 * `manager` can be supplied by the caller (rather than always constructing a fresh one) so
 * other Systems — @3jse/animation's locomotion blend tree reading getHorizontalSpeed()/
 * isGrounded(), for instance — can hold the same instance instead of this System owning a
 * private one nothing else can reach.
 */
export function createCharacterControllerSystem(
  physics: PhysicsWorld,
  manager: CharacterControllerManager = new CharacterControllerManager(physics),
): SystemDef {
  return {
    name: "CharacterControllerSystem",
    stage: "fixed",
    query: ["CharacterController"],
    run: (entities, { world, dt }) => {
      const input = world.getResource<InputManager>(INPUT_RESOURCE);
      if (!input) return;
      for (const entity of entities) {
        const data = entity.getComponent<CharacterControllerData>("CharacterController");
        if (!data) continue;
        manager.step(entity, data, input, dt);
      }
    },
  };
}

/** Registered in the "variable" stage — after "fixed" (where CharacterControllerSystem just
 *  moved the target) always fully completes, per docs/RUNTIME.md's stage ordering — so the
 *  camera pose this computes each tick reflects the target's *current* frame position, not
 *  last frame's. */
export function createCameraRigSystem(): SystemDef {
  return {
    name: "CameraRigSystem",
    stage: "variable",
    query: ["CameraRig"],
    run: (entities, { world }) => {
      // Last CameraRig entity in the query wins if there's more than one — matches "one active
      // camera" being the norm; supporting multiple simultaneous render views is future work.
      for (const entity of entities) {
        const data = entity.getComponent<CameraRigData>("CameraRig");
        if (!data || !entity.object3D) continue;
        const pose: CameraPose = computeCameraPose(entity.object3D.position, entity.object3D.rotation.y, {
          mode: data.mode ?? "thirdPerson",
          distance: data.distance,
          height: data.height,
          pitchDegrees: data.pitchDegrees ?? 55,
          eyeHeight: data.eyeHeight ?? 1.6,
          forwardOffset: data.forwardOffset ?? 0.2,
          orbitYawDegrees: data.orbitYawDegrees ?? 45,
        });
        world.setResource(CAMERA_FOLLOW_RESOURCE, pose);
      }
    },
  };
}
