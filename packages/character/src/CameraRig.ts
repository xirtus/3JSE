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
