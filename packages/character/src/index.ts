export { CharacterControllerManager } from "./CharacterControllerManager.js";
export {
  computeThirdPersonCameraPose,
  computeTopDownCameraPose,
  computeFirstPersonCameraPose,
  computeOrbitCameraPose,
  computeCameraPose,
} from "./CameraRig.js";
export type { CameraPose, Vec3Like, CameraRigMode, CameraRigParams } from "./CameraRig.js";
export { createCharacterControllerSystem, createCameraRigSystem, CAMERA_FOLLOW_RESOURCE } from "./systems.js";
export type { CharacterControllerData, CameraRigData } from "./components.js";

// Registers CharacterController/CameraRig against @3jse/runtime's ComponentRegistry as a side
// effect — same convention as @3jse/runtime's own builtins and @3jse/physics-rapier's.
import "./components.js";
