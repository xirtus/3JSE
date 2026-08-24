import RAPIER from "@dimforge/rapier3d-compat";
import type { Entity, InputManager } from "@3jse/runtime";
import type { PhysicsWorld } from "@3jse/physics-rapier";
import type { CharacterControllerData } from "./components.js";

const DEG2RAD = Math.PI / 180;

/** Rotates `current` toward `target` (radians) by at most `maxDelta`, taking the shorter way
 *  around the circle rather than always turning the same direction. */
function turnToward(current: number, target: number, maxDelta: number): number {
  let diff = ((target - current + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  const clamped = Math.max(-maxDelta, Math.min(maxDelta, diff));
  return current + clamped;
}

interface PerCharacterState {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  verticalVelocity: number;
  grounded: boolean;
  coyoteMs: number;
  hasJumpedSinceGrounded: boolean;
  /** The intended (pre-collision-correction) horizontal speed for the frame just computed —
   *  what @3jse/animation's locomotion blend tree reads to pick Idle/Walk/Run, via
   *  getHorizontalSpeed(). Deliberately not the *actual* post-collision movement distance/dt,
   *  which would visibly stutter the animation blend when sliding along a wall. */
  lastHorizontalSpeed: number;
}

/**
 * The kinematic capsule mover behind docs/GAMEPLAY_FRAMEWORK.md's CharacterController row
 * ("capsule movement, slopes, stairs, jumping, coyote time, ground/air state machine"). Built
 * directly on Rapier's own `KinematicCharacterController` — confirmed against the installed
 * package's type declarations, not assumed — rather than hand-rolled raycasts, matching
 * docs/PHYSICS.md's wrap-don't-build posture. A kinematic body is never affected by gravity or
 * forces (Rapier's own rule, not this project's choice), so vertical velocity/gravity/jumping/
 * coyote time are integrated here, by hand, every tick — that's the actual job of a character
 * controller on top of the physics engine, not something Rapier does for you.
 */
export class CharacterControllerManager {
  private readonly physics: PhysicsWorld;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly characters = new Map<string, PerCharacterState>();

  constructor(physics: PhysicsWorld) {
    this.physics = physics;
    this.controller = physics.raw().createCharacterController(0.02);
    this.controller.enableAutostep(0.3, 0.1, true);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle(50 * DEG2RAD);
    this.controller.setMinSlopeSlideAngle(40 * DEG2RAD);
  }

  private ensure(entity: Entity, data: CharacterControllerData): PerCharacterState {
    const existing = this.characters.get(entity.id);
    if (existing) return existing;

    const pos = entity.object3D!.position;
    const body = this.physics
      .raw()
      .createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    const collider = this.physics
      .raw()
      .createCollider(RAPIER.ColliderDesc.capsule(data.capsuleHalfHeight, data.capsuleRadius), body);

    const state: PerCharacterState = {
      body,
      collider,
      verticalVelocity: 0,
      grounded: false,
      coyoteMs: Number.POSITIVE_INFINITY,
      hasJumpedSinceGrounded: false,
      lastHorizontalSpeed: 0,
    };
    this.characters.set(entity.id, state);
    return state;
  }

  /** Advances one character by one tick: reads input, integrates gravity/jump, resolves
   *  movement against the world via Rapier's sliding character controller, and writes the
   *  result straight onto the Entity's Object3D — there's no separate write-back pass, unlike
   *  PhysicsSystem's dynamic bodies, because the resolved position is already known here (see
   *  the class doc comment on why kinematic bodies work this way). */
  step(entity: Entity, data: CharacterControllerData, input: InputManager, dt: number): void {
    if (!entity.object3D) return;
    const state = this.ensure(entity, data);

    const forwardAxis = input.getAxis("moveForward");
    const rightAxis = input.getAxis("moveRight");
    const dirX = rightAxis;
    const dirZ = -forwardAxis;
    const magnitude = Math.hypot(dirX, dirZ);
    const moveX = magnitude > 0 ? (dirX / magnitude) * data.moveSpeed * dt : 0;
    const moveZ = magnitude > 0 ? (dirZ / magnitude) * data.moveSpeed * dt : 0;
    state.lastHorizontalSpeed = magnitude > 0 ? data.moveSpeed : 0;

    if (magnitude > 0.001) {
      // See CameraRig.ts's doc comment for the matching -sin/-cos derivation this inverts.
      const targetYaw = Math.atan2(-dirX, -dirZ);
      entity.object3D.rotation.y = turnToward(
        entity.object3D.rotation.y,
        targetYaw,
        data.turnSpeedDegPerSec * DEG2RAD * dt,
      );
    }

    if (state.grounded) {
      state.coyoteMs = 0;
      state.hasJumpedSinceGrounded = false;
    } else {
      state.coyoteMs += dt * 1000;
    }

    const canJump = (state.grounded || state.coyoteMs < data.coyoteTimeMs) && !state.hasJumpedSinceGrounded;
    if (canJump && input.wasActionPressed("jump")) {
      state.verticalVelocity = data.jumpSpeed;
      state.hasJumpedSinceGrounded = true;
    } else {
      state.verticalVelocity += data.gravity * dt;
    }

    this.controller.computeColliderMovement(state.collider, { x: moveX, y: state.verticalVelocity * dt, z: moveZ });
    const corrected = this.controller.computedMovement();
    state.grounded = this.controller.computedGrounded();
    if (state.grounded && state.verticalVelocity < 0) {
      state.verticalVelocity = -0.5; // small downward bias keeps snap-to-ground engaged on slopes
    }

    const current = state.body.translation();
    const next = { x: current.x + corrected.x, y: current.y + corrected.y, z: current.z + corrected.z };
    state.body.setNextKinematicTranslation(next);
    entity.object3D.position.set(next.x, next.y, next.z);
  }

  isGrounded(entityId: string): boolean {
    return this.characters.get(entityId)?.grounded ?? false;
  }

  getHorizontalSpeed(entityId: string): number {
    return this.characters.get(entityId)?.lastHorizontalSpeed ?? 0;
  }
}
