export { evaluate1DBlendWeights } from "./BlendTree.js";
export type { BlendTreeEntry, ClipWeight } from "./BlendTree.js";

export { evaluateConditions, getState, stateClipWeights } from "./AnimationGraph.js";
export type {
  AnimationGraphDef,
  AnimationStateDef,
  AnimationTransitionDef,
  AnimationParams,
  TransitionCondition,
} from "./AnimationGraph.js";

export { AnimationStateMachineManager } from "./AnimationStateMachineManager.js";
export { createAnimationSystem } from "./systems.js";

export {
  retargetClip,
  autoMapSkeleton,
  canonicalizeBoneName,
  qMul,
  qConjugate,
  type RetargetClip,
  type ClipTrack,
  type SkeletonMap,
  type BoneRest,
  type RetargetOptions,
  type Quat,
  type Vec3,
} from "./retarget.js";

// Registers AnimationController against @3jse/runtime's ComponentRegistry as a side effect —
// same convention as every other @3jse/* package's builtin components.
import "./components.js";
