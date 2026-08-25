import { describe, expect, it } from "vitest";
import { World, InputManager, INPUT_RESOURCE, type Entity } from "@3jse/runtime";
import { PhysicsWorld, PHYSICS_RESOURCE, createPhysicsSystem } from "@3jse/physics-rapier";
import { CharacterControllerManager, createCharacterControllerSystem } from "@3jse/character";
import { InputRecorder } from "./InputRecorder.js";
import { replay } from "./replay.js";

/**
 * The stronger determinism claim: docs/RUNTIME.md says "deterministic *per machine* (same
 * build, same OS/GPU, same inputs → same result)," not scoped to pure-JS gameplay logic — it's
 * meant to cover physics too. `replay.test.ts` proves the mechanism against plain
 * `@3jse/runtime` Systems; this file proves the actual claim, with Rapier's WASM simulation
 * (`@3jse/physics-rapier`) and a kinematic `CharacterController` (`@3jse/character`) genuinely
 * in the loop — not assumed to hold just because the input-replay mechanism itself is correct.
 */
async function buildScene(): Promise<{ world: World; input: InputManager; player: Entity }> {
  const world = new World();
  const level = world.createLevel("Test");

  const input = new InputManager();
  input.bindAxis("moveForward", ["KeyW"], ["KeyS"]);
  input.bindAxis("moveRight", ["KeyD"], ["KeyA"]);
  input.bindAction("jump", ["Space"]);
  world.setResource(INPUT_RESOURCE, input);

  const physics = await PhysicsWorld.create();
  world.setResource(PHYSICS_RESOURCE, physics);
  const characterManager = new CharacterControllerManager(physics);
  world.scheduler.register(createCharacterControllerSystem(physics, characterManager));
  world.scheduler.register(createPhysicsSystem(physics));

  const ground = level.createEntity("Ground");
  ground.addComponent("RigidBody", { bodyType: "fixed" });
  ground.addComponent("Collider", { shape: "box", sizeX: 20, sizeY: 0.2, sizeZ: 20 });

  const player = level.createEntity("Player");
  player.object3D!.position.set(0, 1, 0);
  player.addComponent("CharacterController");

  return { world, input, player };
}

describe("replay — determinism through real physics (Rapier WASM) and a kinematic CharacterController", () => {
  it("replaying a recorded move-and-jump session reproduces the exact final player position", async () => {
    const dt = 1 / 60;
    const original = await buildScene();
    const recorder = new InputRecorder(original.input);

    // `recorder.endTick()` calls the wrapped InputManager's `endFrame()` internally
    // (InputRecorder.ts's doc comment on why that's not left to the caller) — one call per
    // tick, matching RUNTIME.md's real tick-loop contract.
    recorder.press("KeyW");
    for (let i = 0; i < 10; i++) {
      original.world.step(dt);
      recorder.endTick();
    }
    recorder.press("Space"); // jump
    for (let i = 0; i < 5; i++) {
      original.world.step(dt);
      recorder.endTick();
    }
    recorder.release("Space");
    recorder.release("KeyW");
    recorder.press("KeyD");
    for (let i = 0; i < 40; i++) {
      original.world.step(dt); // enough ticks to land back on the ground
      recorder.endTick();
    }

    const originalPos = original.player.object3D!.position.clone();
    // Sanity: the session actually moved the player off its start point (0, 1, 0).
    const movedDistance = Math.hypot(originalPos.x - 0, originalPos.y - 1, originalPos.z - 0);
    expect(movedDistance).toBeGreaterThan(0.1);

    const recording = recorder.toRecording(dt);
    const replayed = await buildScene();
    replay(recording, replayed.world, replayed.input);

    const replayedPos = replayed.player.object3D!.position;
    expect(replayedPos.x).toBeCloseTo(originalPos.x, 10);
    expect(replayedPos.y).toBeCloseTo(originalPos.y, 10);
    expect(replayedPos.z).toBeCloseTo(originalPos.z, 10);
  });
});
