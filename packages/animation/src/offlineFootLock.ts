import { Vector3 } from "three";

// Offline foot-sliding removal — a port of Daniel Holden's position-based-dynamics method
// (theorangeduck.com/page/inverse-kinematics-foot-locking, MIT, 2024). Treats the per-frame
// pelvis + left/right toe locations as connected particles and iteratively enforces: (hard)
// zero relative movement between consecutive in-contact toe frames, (soft) preservation of the
// source animation's inter-frame offsets and hip-to-toe lengths. Produces new pelvis/toe target
// locations per frame to feed into solveLegChain. Build-time only (has the whole clip + cycles),
// complementing the runtime foot-locking state machine.

export interface OfflineFootLockInput {
  /** source per-frame world locations */
  pelvis: Vector3[];
  leftToe: Vector3[];
  rightToe: Vector3[];
  /** source per-frame contact flags (0/1 or boolean) */
  leftContact: boolean[];
  rightContact: boolean[];
}

export interface OfflineFootLockOptions {
  /** how strongly non-contact frames bias back toward the source animation */
  softFactor?: number;
  /** how strongly in-contact toe frames pull toward their shared midpoint */
  hardFactor?: number;
  /** constraint iterations over the whole clip */
  iterations?: number;
  /** ground height for in-contact toes */
  toeMinHeight?: number;
}

export interface OfflineFootLockResult {
  pelvis: Vector3[];
  leftToe: Vector3[];
  rightToe: Vector3[];
}

function enforceLeg(
  pelvis: Vector3[],
  toe: Vector3[],
  contact: boolean[],
  restPelvis: Vector3[],
  restToe: Vector3[],
  frameCount: number,
  softFactor: number,
  hardFactor: number,
  toeMinHeight: number,
): void {
  // Inter-frame constraints.
  for (let i = 1; i < frameCount; i++) {
    const prev = i - 1;
    if (contact[prev] && contact[i]) {
      // Both frames in contact: pull both toes to their shared midpoint, grounded.
      const midpoint = toe[prev]!.clone().add(toe[i]!).multiplyScalar(0.5);
      midpoint.y = toeMinHeight;
      toe[prev]!.lerp(midpoint, hardFactor);
      toe[i]!.lerp(midpoint, hardFactor);
    } else {
      // Softly bias toward the source animation's relative offsets, removing ground penetration.
      const prevTarget = toe[i]!.clone().add(restToe[prev]!.clone().sub(restToe[i]!));
      const currTarget = toe[prev]!.clone().add(restToe[i]!.clone().sub(restToe[prev]!));
      prevTarget.y = Math.max(prevTarget.y, toeMinHeight);
      currTarget.y = Math.max(currTarget.y, toeMinHeight);
      toe[prev]!.lerp(prevTarget, softFactor);
      toe[i]!.lerp(currTarget, softFactor);
    }
    // Softly move the pelvis toward the source animation's relative motion.
    const prevPelvisTarget = pelvis[i]!.clone().add(restPelvis[prev]!.clone().sub(restPelvis[i]!));
    const currPelvisTarget = pelvis[prev]!.clone().add(restPelvis[i]!.clone().sub(restPelvis[prev]!));
    pelvis[prev]!.lerp(prevPelvisTarget, softFactor);
    pelvis[i]!.lerp(currPelvisTarget, softFactor);
  }

  // In-frame constraints: preserve the source hip-to-toe length (softly).
  for (let i = 0; i < frameCount; i++) {
    const restHip = restPelvis[i]!;
    const restToe_i = restToe[i]!;
    const restLength = restHip.distanceTo(restToe_i);

    const currHip = pelvis[i]!;
    const currToe = toe[i]!;
    const dir = currHip.clone().sub(currToe).normalize();

    pelvis[i]!.lerp(currToe.clone().addScaledVector(dir, restLength), softFactor);
    toe[i]!.lerp(currHip.clone().addScaledVector(dir, -restLength), softFactor);
  }
}

/**
 * Run the offline foot-sliding removal. Returns new locations; the input arrays are untouched.
 * Feed the result's pelvis/toe per frame into solveLegChain to adjust local rotations.
 */
export function offlineFootLock(
  input: OfflineFootLockInput,
  opts: OfflineFootLockOptions = {},
): OfflineFootLockResult {
  const softFactor = opts.softFactor ?? 0.05;
  const hardFactor = opts.hardFactor ?? 0.9;
  const iterations = opts.iterations ?? 25000;
  const toeMinHeight = opts.toeMinHeight ?? 0;
  const frameCount = input.pelvis.length;

  const pelvis = input.pelvis.map((p) => p.clone());
  const leftToe = input.leftToe.map((p) => p.clone());
  const rightToe = input.rightToe.map((p) => p.clone());
  const restPelvis = input.pelvis;
  const restLeftToe = input.leftToe;
  const restRightToe = input.rightToe;

  for (let it = 0; it < iterations; it++) {
    enforceLeg(pelvis, leftToe, input.leftContact, restPelvis, restLeftToe, frameCount, softFactor, hardFactor, toeMinHeight);
    enforceLeg(pelvis, rightToe, input.rightContact, restPelvis, restRightToe, frameCount, softFactor, hardFactor, toeMinHeight);
  }

  return { pelvis, leftToe, rightToe };
}
