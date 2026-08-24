import type { SystemDef } from "../Scheduler.js";
import { INPUT_RESOURCE, type InputManager } from "../InputManager.js";

const DEG2RAD = Math.PI / 180;

/** Rotates any Entity with a Spin component around Y. A minimal, real System — registered
 *  the same way a Gameplay Framework or 3JSE Graph-compiled system would be (docs/RUNTIME.md). */
export const spinSystem: SystemDef = {
  name: "SpinSystem",
  stage: "variable",
  query: ["Spin"],
  run: (entities, { dt }) => {
    for (const entity of entities) {
      const spin = entity.getComponent<{ degreesPerSecond: number }>("Spin");
      if (!spin || !entity.object3D) continue;
      entity.object3D.rotateY(spin.degreesPerSecond * DEG2RAD * dt);
    }
  },
};

/** Moves any Entity with a Movable component along the World's registered InputManager's
 *  "moveForward"/"moveRight" axes — proves InputManager actually drives gameplay state, the
 *  same role Spin plays for the plain tick loop. A stand-in for @3jse/character's real
 *  CharacterController (docs/GAMEPLAY_FRAMEWORK.md), not a substitute for it. */
export const moveSystem: SystemDef = {
  name: "MoveSystem",
  stage: "variable",
  query: ["Movable"],
  run: (entities, { world, dt }) => {
    const input = world.getResource<InputManager>(INPUT_RESOURCE);
    if (!input) return;
    const forward = input.getAxis("moveForward");
    const right = input.getAxis("moveRight");
    if (forward === 0 && right === 0) return;
    for (const entity of entities) {
      const movable = entity.getComponent<{ speed: number }>("Movable");
      if (!movable || !entity.object3D) continue;
      entity.object3D.position.x += right * movable.speed * dt;
      entity.object3D.position.z -= forward * movable.speed * dt; // -Z is "forward"
    }
  },
};

export function registerBuiltinSystems(scheduler: { register: (s: SystemDef) => void }): void {
  scheduler.register(spinSystem);
  scheduler.register(moveSystem);
}
