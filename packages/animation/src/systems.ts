import * as THREE from "three/webgpu";
import type { Entity, SystemDef } from "@3jse/runtime";
import { AnimationStateMachineManager } from "./AnimationStateMachineManager.js";
import type { AnimationGraphDef, AnimationParams } from "./AnimationGraph.js";

/**
 * Registers animation stepping as a System — same factory-closes-over-a-manager pattern as
 * @3jse/physics-rapier's createPhysicsSystem and @3jse/character's
 * createCharacterControllerSystem. Runs in the "variable" stage, after "fixed" (where
 * CharacterControllerSystem, if present, already moved the target this tick) fully completes —
 * docs/RUNTIME.md's stage ordering, and the exact same reasoning CameraRigSystem's doc comment
 * gives for the same stage choice.
 *
 * `getParams` is the seam that keeps this package free of any dependency on @3jse/character or
 * anything else: whoever registers the System decides how animation parameters ("speed",
 * "grounded", ...) get derived for a given Entity each tick. apps/editor's sampleScene.ts is
 * where the actual "read CharacterControllerManager, feed it in as `speed`/`grounded`" bridge
 * lives — application glue, not framework code.
 */
export function createAnimationSystem(
  manager: AnimationStateMachineManager,
  graph: AnimationGraphDef,
  clips: THREE.AnimationClip[],
  getParams: (entity: Entity) => AnimationParams,
): SystemDef {
  return {
    name: "AnimationSystem",
    stage: "variable",
    query: ["AnimationController"],
    run: (entities, { dt }) => {
      for (const entity of entities) {
        manager.step(entity, graph, clips, getParams(entity), dt);
      }
    },
  };
}
