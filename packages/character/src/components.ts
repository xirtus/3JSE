import { registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";

// CharacterController/CameraRig are plain data, same convention as @3jse/physics-rapier's
// RigidBody/Collider — the kinematic capsule body and the camera-follow math both live in
// CharacterControllerManager.ts / CameraRig.ts, driven by these fields.

const characterControllerFields: ComponentField[] = [
  { name: "moveSpeed", type: "number", default: 5, min: 0, max: 30, step: 0.5 },
  { name: "jumpSpeed", type: "number", default: 7, min: 0, max: 30, step: 0.5 },
  { name: "gravity", type: "number", default: -20, min: -100, max: 0, step: 1 },
  { name: "capsuleRadius", type: "number", default: 0.4, min: 0.05, max: 2, step: 0.05 },
  { name: "capsuleHalfHeight", type: "number", default: 0.5, min: 0.05, max: 2, step: 0.05 },
  { name: "turnSpeedDegPerSec", type: "number", default: 720, min: 0, max: 3600, step: 30 },
  { name: "coyoteTimeMs", type: "number", default: 120, min: 0, max: 1000, step: 10 },
];

registerComponent({
  type: "CharacterController",
  label: "Character Controller",
  fields: characterControllerFields,
  createDefault: () => defaultsFromFields(characterControllerFields) as CharacterControllerData,
});

const cameraRigFields: ComponentField[] = [
  { name: "distance", type: "number", default: 6, min: 0.5, max: 50, step: 0.5 },
  { name: "height", type: "number", default: 2.2, min: 0, max: 20, step: 0.1 },
];

registerComponent({
  type: "CameraRig",
  label: "Camera Rig",
  fields: cameraRigFields,
  createDefault: () => defaultsFromFields(cameraRigFields) as CameraRigData,
});

export type CharacterControllerData = {
  moveSpeed: number;
  jumpSpeed: number;
  gravity: number;
  capsuleRadius: number;
  capsuleHalfHeight: number;
  turnSpeedDegPerSec: number;
  coyoteTimeMs: number;
};

export type CameraRigData = {
  distance: number;
  height: number;
};
