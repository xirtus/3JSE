import { registerComponent } from "@3jse/runtime";

/** A marker component, like Saveable (@3jse/save) — its presence is what a
 *  createAnimationSystem()-registered System queries for. The graph/clip/parameter wiring
 *  itself is supplied to the System factory in code for this first pass (docs/ANIMATION.md's
 *  MVP), the same way @3jse/character's CharacterController config lives on its own component
 *  but the *shape* of a state machine doesn't have a natural ComponentField representation yet
 *  — that's 3JSE Graph's Animation Graph node family (docs/VISUAL_SCRIPTING.md), not this. */
registerComponent({
  type: "AnimationController",
  label: "Animation Controller",
  fields: [],
  createDefault: () => ({}),
});
