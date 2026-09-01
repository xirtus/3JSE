export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vec3Like;
  lookAt: Vec3Like;
}

/**
 * Pure math, no Three.js/Rapier dependency — the third-person "spring-arm" camera rig from
 * docs/GAMEPLAY_FRAMEWORK.md's CameraRig row, computed as a function of the target's position
 * and facing (its Object3D.rotation.y, i.e. yaw) rather than an independent orbit the player
 * drives directly. That's a deliberate, simpler choice than free mouse-look for this first
 * pass: the camera trails behind whichever way the character is facing, which
 * CharacterControllerManager already turns to face its movement direction — so pressing a
 * movement key alone gives an legible, controllable third-person camera with no separate input
 * scheme to wire up yet. Free mouse-look is real follow-up work, not built here.
 */
export function computeThirdPersonCameraPose(
  targetPosition: Vec3Like,
  targetYawRadians: number,
  distance: number,
  height: number,
): CameraPose {
  // An Object3D at rotation.y = yaw has its local -Z ("forward") pointing at world direction
  // (-sin(yaw), 0, -cos(yaw)) — see CharacterControllerManager.ts's turn-to-face derivation,
  // which this is the exact inverse of. The camera sits behind that (i.e. along +forward's
  // negation) and above, looking back down at the target.
  const behindX = Math.sin(targetYawRadians);
  const behindZ = Math.cos(targetYawRadians);
  return {
    position: {
      x: targetPosition.x + behindX * distance,
      y: targetPosition.y + height,
      z: targetPosition.z + behindZ * distance,
    },
    lookAt: {
      x: targetPosition.x,
      y: targetPosition.y + height * 0.6,
      z: targetPosition.z,
    },
  };
}

const DEG2RAD = Math.PI / 180;

/** Camera directly above the target, tilted forward by `pitchDegrees` (0 = straight down).
 *  The overhead rig for Top-Down / twin-stick templates (docs/TEMPLATES.md). */
export function computeTopDownCameraPose(
  targetPosition: Vec3Like,
  targetYawRadians: number,
  distance: number,
  pitchDegrees: number,
): CameraPose {
  const pitch = pitchDegrees * DEG2RAD;
  // pull the camera back along the target's facing as it tilts away from straight-down
  const backX = Math.sin(targetYawRadians) * Math.sin(pitch) * distance;
  const backZ = Math.cos(targetYawRadians) * Math.sin(pitch) * distance;
  return {
    position: {
      x: targetPosition.x + backX,
      y: targetPosition.y + Math.cos(pitch) * distance,
      z: targetPosition.z + backZ,
    },
    lookAt: { ...targetPosition },
  };
}

/** Camera at the target's eye, looking where it faces. `eyeHeight` above the origin,
 *  `forwardOffset` in front so the body mesh doesn't clip the near plane. */
export function computeFirstPersonCameraPose(
  targetPosition: Vec3Like,
  targetYawRadians: number,
  eyeHeight: number,
  forwardOffset: number,
): CameraPose {
  const fwdX = -Math.sin(targetYawRadians);
  const fwdZ = -Math.cos(targetYawRadians);
  const eye = {
    x: targetPosition.x + fwdX * forwardOffset,
    y: targetPosition.y + eyeHeight,
    z: targetPosition.z + fwdZ * forwardOffset,
  };
  return {
    position: eye,
    lookAt: { x: eye.x + fwdX, y: eye.y, z: eye.z + fwdZ },
  };
}

/** Fixed world-space orbit around the target — ignores the target's facing. The isometric /
 *  tactics rig: `orbitYawDegrees` sets the compass angle, `pitchDegrees` the tilt. */
export function computeOrbitCameraPose(
  targetPosition: Vec3Like,
  distance: number,
  orbitYawDegrees: number,
  pitchDegrees: number,
): CameraPose {
  const yaw = orbitYawDegrees * DEG2RAD;
  const pitch = pitchDegrees * DEG2RAD;
  const horizontal = Math.cos(pitch) * distance;
  return {
    position: {
      x: targetPosition.x + Math.sin(yaw) * horizontal,
      y: targetPosition.y + Math.sin(pitch) * distance,
      z: targetPosition.z + Math.cos(yaw) * horizontal,
    },
    lookAt: { ...targetPosition },
  };
}

export type CameraRigMode = "thirdPerson" | "topDown" | "firstPerson" | "orbit";

export interface CameraRigParams {
  mode: CameraRigMode;
  distance: number;
  height: number;
  pitchDegrees: number;
  eyeHeight: number;
  forwardOffset: number;
  orbitYawDegrees: number;
}

/** One entry point the CameraRigSystem calls — dispatches on `params.mode`. Camera *presets*
 *  (docs/ROADMAP.md Phase 6), so Top-Down and First-Person templates need no new System. */
export function computeCameraPose(
  targetPosition: Vec3Like,
  targetYawRadians: number,
  params: CameraRigParams,
): CameraPose {
  switch (params.mode) {
    case "topDown":
      return computeTopDownCameraPose(targetPosition, targetYawRadians, params.distance, params.pitchDegrees);
    case "firstPerson":
      return computeFirstPersonCameraPose(targetPosition, targetYawRadians, params.eyeHeight, params.forwardOffset);
    case "orbit":
      return computeOrbitCameraPose(targetPosition, params.distance, params.orbitYawDegrees, params.pitchDegrees);
    case "thirdPerson":
    default:
      return computeThirdPersonCameraPose(targetPosition, targetYawRadians, params.distance, params.height);
  }
}
