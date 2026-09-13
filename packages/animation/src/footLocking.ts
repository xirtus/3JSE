import { Vector3 } from "three";

// Foot locking via cubic inertialization — a port of Daniel Holden's recipe
// (theorangeduck.com/page/inverse-kinematics-foot-locking, MIT, 2024). When no contact is
// active the output tracks the input toe; when contact is active it tracks a static floor
// position captured at lock time; the switch between the two is a cubic inertialization blend
// so the toe never pops. The output is a toe *target* to feed into solveLegChain.

export interface FootLockingState {
  /** current blended output position */
  position: Vector3;
  /** current blended output velocity */
  velocity: Vector3;
  /** input source position (previous frame, then current) */
  inputPosition: Vector3;
  /** input source velocity (finite-differenced) */
  inputVelocity: Vector3;
  /** inertialization offset position */
  offsetPosition: Vector3;
  /** inertialization offset velocity */
  offsetVelocity: Vector3;
  /** time since the last inertialization transition */
  time: number;
  /** locked contact location (floor height) */
  contact: Vector3;
  /** whether the contact is currently locked */
  locked: boolean;
}

export interface FootLockingParams {
  /** floor height to snap the locked contact to */
  contactHeight: number;
  /** distance from input beyond which a locked foot unlocks */
  unlockDistance: number;
  /** distance below which an unlocked, in-contact foot locks */
  lockDistance: number;
  /** inertialization blend time (seconds) */
  blendTime: number;
}

export function createFootLockingState(position: Vector3): FootLockingState {
  return {
    position: position.clone(),
    velocity: new Vector3(),
    inputPosition: position.clone(),
    inputVelocity: new Vector3(),
    offsetPosition: new Vector3(),
    offsetVelocity: new Vector3(),
    time: 1e9, // fully settled — no active blend
    contact: position.clone(),
    locked: false,
  };
}

function inertializeCubicUpdate(
  position: Vector3,
  velocity: Vector3,
  time: { v: number },
  inputPosition: Vector3,
  inputVelocity: Vector3,
  offsetPosition: Vector3,
  offsetVelocity: Vector3,
  dt: number,
  blendTime: number,
): void {
  const t = Math.min(Math.max((time.v + dt) / Math.max(blendTime, 1e-8), 0), 1);
  const w0 = 2 * t * t * t - 3 * t * t + 1;
  const w1 = (t * t * t - 2 * t * t + t) * blendTime;
  const w2 = (6 * t * t - 6 * t) / Math.max(blendTime, 1e-8);
  const w3 = 3 * t * t - 4 * t + 1;

  position.copy(inputPosition).addScaledVector(offsetPosition, w0).addScaledVector(offsetVelocity, w1);
  velocity.copy(inputVelocity).addScaledVector(offsetPosition, w2).addScaledVector(offsetVelocity, w3);
  time.v += dt;
}

function inertializeCubicTransition(
  offsetPosition: Vector3,
  offsetVelocity: Vector3,
  time: { v: number },
  sourcePosition: Vector3,
  sourceVelocity: Vector3,
  destinationPosition: Vector3,
  destinationVelocity: Vector3,
  blendTime: number,
): void {
  const t = Math.min(Math.max(time.v / Math.max(blendTime, 1e-8), 0), 1);
  const w0 = 2 * t * t * t - 3 * t * t + 1;
  const w1 = (t * t * t - 2 * t * t + t) * blendTime;
  const w2 = (6 * t * t - 6 * t) / Math.max(blendTime, 1e-8);
  const w3 = 3 * t * t - 4 * t + 1;

  // Faithful to the C: the velocity offset reads the *new* offset position (sequential writes).
  offsetPosition
    .copy(sourcePosition)
    .addScaledVector(offsetPosition, w0)
    .addScaledVector(offsetVelocity, w1)
    .sub(destinationPosition);
  offsetVelocity
    .copy(sourceVelocity)
    .addScaledVector(offsetPosition, w2)
    .addScaledVector(offsetVelocity, w3)
    .sub(destinationVelocity);
  time.v = 0;
}

/**
 * Advance one foot-locking state by `dt`, given the input toe position and whether the source
 * animation reports contact this frame. `state.position` becomes the toe target for the frame.
 */
export function updateFootLockingState(
  state: FootLockingState,
  inputPosition: Vector3,
  inputContact: boolean,
  params: FootLockingParams,
  dt: number,
): void {
  state.inputVelocity.copy(inputPosition).sub(state.inputPosition).multiplyScalar(1 / Math.max(dt, 1e-8));
  state.inputPosition.copy(inputPosition);

  const time = { v: state.time };
  const target = state.locked ? state.contact : state.inputPosition;
  const targetVel = state.locked ? ZERO : state.inputVelocity;
  inertializeCubicUpdate(
    state.position,
    state.velocity,
    time,
    target,
    targetVel,
    state.offsetPosition,
    state.offsetVelocity,
    dt,
    params.blendTime,
  );
  state.time = time.v;

  const inputDistance = state.position.distanceTo(state.inputPosition);

  if (!state.locked && inputContact && inputDistance < params.lockDistance) {
    state.locked = true;
    state.contact.copy(state.inputPosition);
    state.contact.y = params.contactHeight;
    const t = { v: state.time };
    inertializeCubicTransition(
      state.offsetPosition,
      state.offsetVelocity,
      t,
      state.inputPosition,
      state.inputVelocity,
      state.contact,
      ZERO,
      params.blendTime,
    );
    state.time = t.v;
  } else if (state.locked && (!inputContact || inputDistance > params.unlockDistance)) {
    state.locked = false;
    const t = { v: state.time };
    inertializeCubicTransition(
      state.offsetPosition,
      state.offsetVelocity,
      t,
      state.contact,
      ZERO,
      state.inputPosition,
      state.inputVelocity,
      params.blendTime,
    );
    state.time = t.v;
  }
}

const ZERO = new Vector3(0, 0, 0);
