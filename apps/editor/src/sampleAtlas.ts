import { SystemRegistry, type AtlasSystemSpec, type SystemEvidence } from "@3jse/atlas";
import type { World, Level, Entity } from "@3jse/runtime";

/**
 * Test totals from the last full `pnpm -r test`, attributed to the systems those packages back.
 * Static in this slice — the Profiler panel / a live `runtime.getPerf` probe will replace it
 * with measured numbers (docs/PERFORMANCE.md, §31). Health badges in the panel are derived from
 * this, never invented (§32).
 */
export const SAMPLE_EVIDENCE: Record<string, SystemEvidence> = {
  input: { tests: { passed: 6, failed: 0, total: 6 } },
  "player.movement": { tests: { passed: 8, failed: 0, total: 8 } },
  "player.camera": { tests: { passed: 8, failed: 0, total: 8 } },
  "player.animation": { tests: { passed: 18, failed: 0, total: 18 } },
  physics: { tests: { passed: 4, failed: 0, total: 4 } },
  save: { tests: { passed: 5, failed: 0, total: 5 } },
  "world.props": {}, // no dedicated suite -> shows "untested", honestly
};

/**
 * §63's "apply it to one existing 3JSE game": the semantic model of the Third Person template
 * (`@3jse/templates` `buildThirdPersonTemplate`, which `sampleScene.ts` builds the editor scene
 * from). These `defineSystem` declarations describe what that template's runtime Systems *mean*
 * — they are not the ECS Systems themselves. Knob edits write straight through to the live
 * component field they mirror, so Atlas's "direct parameter change" (§3.1) is real here, not a
 * disconnected slider.
 */
export function buildSampleAtlas(): SystemRegistry {
  const r = new SystemRegistry();
  const specs: AtlasSystemSpec[] = [
    {
      id: "input",
      label: "Input",
      domain: "core",
      purpose: "Maps keyboard/gamepad to the moveForward / moveRight axes and the jump action.",
      owns: ["packages/runtime/src/InputManager.ts"],
      emits: ["input.move", "input.jump"],
      tests: ["packages/runtime/src/InputManager.test.ts"],
    },
    {
      id: "player.movement",
      label: "Movement",
      domain: "gameplay",
      purpose: "Kinematic capsule character controller — ground movement, jump, gravity.",
      owns: ["packages/character/src/CharacterControllerManager.ts", "packages/character/src/systems.ts"],
      requires: ["input", "physics"],
      listens: ["input.move", "input.jump"],
      emits: ["player.moved", "player.grounded", "player.airborne"],
      tests: ["packages/character/src/CharacterControllerManager.test.ts"],
      mechanic: "third_person_platforming",
      feelSpec: "profiles/player-movement",
      knobs: {
        moveSpeed: { type: "number", default: 5, value: 5, min: 0, max: 30, step: 0.5, unit: "m/s", category: "ground", describe: "How fast the player runs on the ground." },
        jumpSpeed: { type: "number", default: 7, value: 7, min: 0, max: 30, step: 0.5, unit: "m/s", category: "air", describe: "Initial upward velocity of a jump." },
        turnSpeedDegPerSec: { type: "number", default: 720, value: 720, min: 0, max: 3600, step: 30, unit: "deg/s", category: "ground", describe: "How quickly the player rotates to face the move direction." },
      },
    },
    {
      id: "player.camera",
      label: "Camera",
      domain: "gameplay",
      purpose: "Third-person follow camera — trails the player at a fixed distance and height.",
      owns: ["packages/character/src/CameraRig.ts"],
      requires: ["player.movement"],
      listens: ["player.moved"],
      tests: ["packages/character/src/CameraRig.test.ts"],
      feelSpec: "profiles/player-camera",
      knobs: {
        distance: { type: "number", default: 6, value: 6, min: 0.5, max: 50, step: 0.5, unit: "m", category: "framing", describe: "How far behind the player the camera sits." },
        height: { type: "number", default: 2.2, value: 2.2, min: 0, max: 20, step: 0.1, unit: "m", category: "framing", describe: "How high above the player the camera sits." },
      },
    },
    {
      id: "player.animation",
      label: "Animation",
      domain: "animation",
      purpose: "Locomotion blend tree (Idle/Walk/Run by speed) crossfading to a Jump pose while airborne.",
      owns: ["packages/animation/src"],
      requires: ["player.movement"],
      listens: ["player.grounded", "player.airborne"],
      tests: ["packages/animation/src"],
    },
    {
      id: "physics",
      label: "Physics",
      domain: "physics",
      purpose: "Rapier rigid-body + collider simulation. Commits the character's queued move, then steps.",
      owns: ["packages/physics-rapier/src"],
      tests: ["packages/physics-rapier/src"],
    },
    {
      id: "save",
      label: "Save",
      domain: "core",
      purpose: "Snapshots Saveable-tagged entities so player/prop positions survive save → reload → load.",
      owns: ["packages/save/src"],
      requires: ["player.movement"],
      tests: ["packages/save/src"],
    },
    {
      id: "world.props",
      label: "Scene Props",
      domain: "world",
      purpose: "The sample scene's tunable demo entities — a spinning cube and a WASD-movable sphere.",
      owns: ["apps/editor/src/sampleScene.ts"],
      knobs: {
        cubeSpinRate: { type: "number", default: 60, value: 60, min: 0, max: 720, step: 10, unit: "deg/s", category: "cube", describe: "Cube rotation speed (Spin component)." },
        sphereMoveSpeed: { type: "number", default: 3, value: 3, min: 0, max: 20, step: 0.5, unit: "m/s", category: "sphere", describe: "Sphere movement speed under WASD (Movable component)." },
      },
    },
  ];
  for (const s of specs) r.define(s);
  return r;
}

type KnobBinding = { entityName: string; component: string; field: string };

/** Which live component field each knob mirrors. Absent => the knob is descriptive only for now. */
const KNOB_BINDINGS: Record<string, Record<string, KnobBinding>> = {
  "player.movement": {
    moveSpeed: { entityName: "Player", component: "CharacterController", field: "moveSpeed" },
    jumpSpeed: { entityName: "Player", component: "CharacterController", field: "jumpSpeed" },
    turnSpeedDegPerSec: { entityName: "Player", component: "CharacterController", field: "turnSpeedDegPerSec" },
  },
  "player.camera": {
    distance: { entityName: "Player", component: "CameraRig", field: "distance" },
    height: { entityName: "Player", component: "CameraRig", field: "height" },
  },
  "world.props": {
    cubeSpinRate: { entityName: "Cube", component: "Spin", field: "degreesPerSecond" },
    sphereMoveSpeed: { entityName: "Sphere", component: "Movable", field: "speed" },
  },
};

/** Write a knob change straight to the live component it mirrors (§3.1). Returns a human line
 *  describing what happened, for the editor log. */
export function applyAtlasKnob(
  level: Level,
  systemId: string,
  knob: string,
  value: number,
): { applied: boolean; message: string } {
  const binding = KNOB_BINDINGS[systemId]?.[knob];
  if (!binding) {
    return { applied: false, message: `Atlas: ${systemId}.${knob} = ${value} (descriptive knob — no live binding yet).` };
  }
  const entity: Entity | undefined = level.allEntities.find((e) => e.name === binding.entityName);
  const data = entity?.getComponent<Record<string, unknown>>(binding.component);
  if (!entity || !data) {
    return { applied: false, message: `Atlas: could not find ${binding.entityName}.${binding.component} to apply ${knob}.` };
  }
  data[binding.field] = value;
  return {
    applied: true,
    message: `Atlas: applied ${binding.entityName}.${binding.component}.${binding.field} = ${value} (live).`,
  };
}

/** Read the current live value for a bound knob, so the panel opens showing reality. */
export function readAtlasKnob(level: Level, systemId: string, knob: string): number | undefined {
  const binding = KNOB_BINDINGS[systemId]?.[knob];
  if (!binding) return undefined;
  const entity = level.allEntities.find((e) => e.name === binding.entityName);
  const data = entity?.getComponent<Record<string, unknown>>(binding.component);
  const v = data?.[binding.field];
  return typeof v === "number" ? v : undefined;
}

export { type World };
