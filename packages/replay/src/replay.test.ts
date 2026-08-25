import { describe, expect, it } from "vitest";
import { World, InputManager, INPUT_RESOURCE, type Entity } from "@3jse/runtime";
import { registerBuiltinSystems } from "@3jse/runtime/systems/builtins";
import { InputRecorder } from "./InputRecorder.js";
import { replay } from "./replay.js";

/** One identical starting scene, built fresh each call — replay.ts's own doc comment: "replay
 *  only owns input... the caller builds an identical starting World." */
function buildScene(): { world: World; input: InputManager; mover: Entity; spinner: Entity } {
  const world = new World();
  registerBuiltinSystems(world.scheduler);
  const level = world.createLevel("Test");

  const input = new InputManager();
  input.bindAxis("moveForward", ["KeyW"], ["KeyS"]);
  input.bindAxis("moveRight", ["KeyD"], ["KeyA"]);
  world.setResource(INPUT_RESOURCE, input);

  const mover = level.createEntity("Mover");
  mover.addComponent("Movable", { speed: 3 });
  const spinner = level.createEntity("Spinner");
  spinner.addComponent("Spin", { degreesPerSecond: 45 });

  return { world, input, mover, spinner };
}

describe("replay — determinism proof (RUNTIME.md's posture, pure @3jse/runtime, no physics)", () => {
  it("replaying a recorded run against a freshly-built identical scene reproduces the exact final Object3D state", () => {
    const dt = 1 / 60;
    const original = buildScene();
    const recorder = new InputRecorder(original.input);

    // A little "session": hold W+D for a while, let go, hold S, let go.
    recorder.press("KeyW");
    recorder.press("KeyD");
    for (let i = 0; i < 30; i++) {
      original.world.step(dt);
      recorder.endTick();
    }
    recorder.release("KeyW");
    recorder.release("KeyD");
    recorder.press("KeyS");
    for (let i = 0; i < 20; i++) {
      original.world.step(dt);
      recorder.endTick();
    }
    recorder.release("KeyS");
    for (let i = 0; i < 10; i++) {
      original.world.step(dt);
      recorder.endTick();
    }

    const originalMoverPos = original.mover.object3D!.position.clone();
    const originalSpinnerRot = original.spinner.object3D!.rotation.y;
    // Sanity: the session above should have actually moved the mover and spun the spinner —
    // otherwise this test would trivially pass by comparing two untouched origins.
    expect(originalMoverPos.length()).toBeGreaterThan(0);
    expect(originalSpinnerRot).not.toBe(0);

    const recording = recorder.toRecording(dt);
    const replayed = buildScene();
    replay(recording, replayed.world, replayed.input);

    expect(replayed.mover.object3D!.position.toArray()).toEqual(originalMoverPos.toArray());
    expect(replayed.spinner.object3D!.rotation.y).toBe(originalSpinnerRot);
  });

  it("two different recordings against identical starting scenes produce two different — but each internally reproducible — results", () => {
    function recordSession(press: string): { pos: [number, number, number]; recording: ReturnType<InputRecorder["toRecording"]> } {
      const scene = buildScene();
      const recorder = new InputRecorder(scene.input);
      recorder.press(press);
      for (let i = 0; i < 15; i++) {
        scene.world.step(1 / 60);
        recorder.endTick();
      }
      return { pos: scene.mover.object3D!.position.toArray() as [number, number, number], recording: recorder.toRecording(1 / 60) };
    }

    const forward = recordSession("KeyW");
    const right = recordSession("KeyD");
    expect(forward.pos).not.toEqual(right.pos);

    const replayedForward = buildScene();
    replay(forward.recording, replayedForward.world, replayedForward.input);
    expect(replayedForward.mover.object3D!.position.toArray()).toEqual(forward.pos);
  });
});
