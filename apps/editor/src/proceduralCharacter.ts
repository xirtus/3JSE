import * as THREE from "three/webgpu";

/**
 * A small hand-built "rig" — named Object3D parts in a parent/child hierarchy, each carrying a
 * primitive mesh — and hand-authored AnimationClips driving it via AnimationMixer's standard
 * name-path track addressing (`"PartName.quaternion"`), exactly the technique skeletal
 * animation uses, just without an actual THREE.Skeleton/SkinnedMesh. This is demo content for
 * the Player entity, not framework code: there's no Asset Pipeline / glTF import yet
 * (docs/ASSET_PIPELINE.md), so a real rigged character isn't something this project can pull in
 * yet — this stands in for "drop in a rigged asset" the same way sampleScene.ts as a whole
 * stands in for a real Content Browser.
 */

const DEG2RAD = Math.PI / 180;

export interface CharacterRig {
  root: THREE.Object3D;
  parts: {
    hips: THREE.Object3D;
    spine: THREE.Object3D;
    leftUpperArm: THREE.Object3D;
    rightUpperArm: THREE.Object3D;
    leftUpperLeg: THREE.Object3D;
    rightUpperLeg: THREE.Object3D;
  };
}

function limbMesh(radius: number, length: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
}

export function buildCharacterRig(color = 0x4fd1c5): CharacterRig {
  const hips = new THREE.Object3D();
  hips.name = "Hips";
  const hipsMesh = limbMesh(0.22, 0.1, color);
  hipsMesh.rotation.z = Math.PI / 2;
  hips.add(hipsMesh);

  const spine = new THREE.Object3D();
  spine.name = "Spine";
  spine.position.y = 0.15;
  hips.add(spine);
  const spineMesh = limbMesh(0.2, 0.35, color);
  spineMesh.position.y = 0.22;
  spine.add(spineMesh);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  headMesh.position.y = 0.58;
  spine.add(headMesh);

  const leftUpperArm = new THREE.Object3D();
  leftUpperArm.name = "LeftUpperArm";
  leftUpperArm.position.set(0.28, 0.42, 0);
  spine.add(leftUpperArm);
  const leftArmMesh = limbMesh(0.07, 0.35, color);
  leftArmMesh.position.y = -0.22;
  leftUpperArm.add(leftArmMesh);

  const rightUpperArm = new THREE.Object3D();
  rightUpperArm.name = "RightUpperArm";
  rightUpperArm.position.set(-0.28, 0.42, 0);
  spine.add(rightUpperArm);
  const rightArmMesh = limbMesh(0.07, 0.35, color);
  rightArmMesh.position.y = -0.22;
  rightUpperArm.add(rightArmMesh);

  const leftUpperLeg = new THREE.Object3D();
  leftUpperLeg.name = "LeftUpperLeg";
  leftUpperLeg.position.set(0.13, -0.1, 0);
  hips.add(leftUpperLeg);
  const leftLegMesh = limbMesh(0.1, 0.4, color);
  leftLegMesh.position.y = -0.25;
  leftUpperLeg.add(leftLegMesh);

  const rightUpperLeg = new THREE.Object3D();
  rightUpperLeg.name = "RightUpperLeg";
  rightUpperLeg.position.set(-0.13, -0.1, 0);
  hips.add(rightUpperLeg);
  const rightLegMesh = limbMesh(0.1, 0.4, color);
  rightLegMesh.position.y = -0.25;
  rightUpperLeg.add(rightLegMesh);

  return {
    root: hips,
    parts: { hips, spine, leftUpperArm, rightUpperArm, leftUpperLeg, rightUpperLeg },
  };
}

function swingTrack(
  partName: string,
  amplitudeDeg: number,
  duration: number,
  phaseOffset: number,
  steps = 8,
): THREE.QuaternionKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  const axis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    const phase = (i / steps) * Math.PI * 2 + phaseOffset;
    const angle = amplitudeDeg * DEG2RAD * Math.sin(phase);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    times.push(t);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${partName}.quaternion`, times, values);
}

function bobTrack(partName: string, amplitude: number, duration: number, steps = 8): THREE.NumberKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    values.push(amplitude * (1 - Math.cos((i / steps) * Math.PI * 2)) * 0.5);
    times.push(t);
  }
  return new THREE.NumberKeyframeTrack(`${partName}.position[y]`, times, values);
}

/** Idle (subtle hip bob), Walk/Run (opposite-phase arm/leg swing, arms crossed with the
 *  opposite-side leg — the natural gait pattern), and a one-shot Jump pose. Named to match
 *  sampleScene.ts's locomotion AnimationGraphDef exactly. */
export function buildLocomotionClips(): THREE.AnimationClip[] {
  const idle = new THREE.AnimationClip("Idle", 2, [bobTrack("Hips", 0.02, 2)]);

  const walkDuration = 0.9;
  const walk = new THREE.AnimationClip("Walk", walkDuration, [
    swingTrack("LeftUpperLeg", 28, walkDuration, 0),
    swingTrack("RightUpperLeg", 28, walkDuration, Math.PI),
    swingTrack("LeftUpperArm", 22, walkDuration, Math.PI),
    swingTrack("RightUpperArm", 22, walkDuration, 0),
  ]);

  const runDuration = 0.45;
  const run = new THREE.AnimationClip("Run", runDuration, [
    swingTrack("LeftUpperLeg", 48, runDuration, 0),
    swingTrack("RightUpperLeg", 48, runDuration, Math.PI),
    swingTrack("LeftUpperArm", 40, runDuration, Math.PI),
    swingTrack("RightUpperArm", 40, runDuration, 0),
  ]);

  const jumpDuration = 0.4;
  const legTuck = THREE.MathUtils.degToRad(-50);
  const armRaise = THREE.MathUtils.degToRad(-120);
  const legQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), legTuck);
  const armQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), armRaise);
  const identity = new THREE.Quaternion();
  const jump = new THREE.AnimationClip("Jump", jumpDuration, [
    new THREE.QuaternionKeyframeTrack(
      "LeftUpperLeg.quaternion",
      [0, jumpDuration],
      [identity.x, identity.y, identity.z, identity.w, legQuat.x, legQuat.y, legQuat.z, legQuat.w],
    ),
    new THREE.QuaternionKeyframeTrack(
      "RightUpperLeg.quaternion",
      [0, jumpDuration],
      [identity.x, identity.y, identity.z, identity.w, legQuat.x, legQuat.y, legQuat.z, legQuat.w],
    ),
    new THREE.QuaternionKeyframeTrack(
      "LeftUpperArm.quaternion",
      [0, jumpDuration],
      [identity.x, identity.y, identity.z, identity.w, armQuat.x, armQuat.y, armQuat.z, armQuat.w],
    ),
    new THREE.QuaternionKeyframeTrack(
      "RightUpperArm.quaternion",
      [0, jumpDuration],
      [identity.x, identity.y, identity.z, identity.w, armQuat.x, armQuat.y, armQuat.z, armQuat.w],
    ),
  ]);

  return [idle, walk, run, jump];
}
