import { describe, expect, it } from "vitest";
import { World, InputManager, listComponentSchemas, type Entity } from "@3jse/runtime";
import { PhysicsWorld } from "@3jse/physics-rapier";
import { CharacterControllerManager } from "./CharacterControllerManager.js";
import type { CharacterControllerData } from "./components.js";
import "./components.js";

const DEFAULTS = listComponentSchemas().find((s) => s.type === "CharacterController")!
  .createDefault() as CharacterControllerData;

function makeInput() {
  const input = new InputManager();
  input.bindAxis("moveForward", ["KeyW"], ["KeyS"]);
  input.bindAxis("moveRight", ["KeyD"], ["KeyA"]);
  input.bindAction("jump", ["Space"]);
  return input;
}

// Mirrors what the real Scheduler does each "fixed"-stage tick once both
// createCharacterControllerSystem() and @3jse/physics-rapier's createPhysicsSystem() are
// registered (in that order): the controller queues its kinematic movement, then physics.step()
// commits it and refreshes the broad-phase. CharacterControllerManager.step() deliberately does
// NOT call physics.step() itself — see systems.ts's doc comment — so these tests, which bypass
// the Scheduler and call the manager directly, have to do that pairing by hand.
function tick(
  manager: CharacterControllerManager,
  physics: PhysicsWorld,
  player: Entity,
  input: InputManager,
  dt: number,
): void {
  manager.step(player, DEFAULTS, input, dt);
  physics.step(dt);
}

describe("CharacterControllerManager", () => {
  it("falls under its own gravity when there is no ground beneath it and no input", async () => {
    const physics = await PhysicsWorld.create();
    const manager = new CharacterControllerManager(physics);
    const world = new World();
    const level = world.createLevel("Test");
    const player = level.createEntity("Player");
    player.object3D!.position.set(0, 10, 0);
    const input = makeInput();

    const startY = player.object3D!.position.y;
    for (let i = 0; i < 30; i++) tick(manager, physics, player, input, 1 / 60);

    expect(player.object3D!.position.y).toBeLessThan(startY);
    expect(manager.isGrounded(player.id)).toBe(false);
  });

  it("lands on and rests on a fixed ground collider", async () => {
    const physics = await PhysicsWorld.create();
    const manager = new CharacterControllerManager(physics);
    const world = new World();
    const level = world.createLevel("Test");

    const ground = level.createEntity("Ground");
    ground.addComponent("RigidBody", { bodyType: "fixed" });
    ground.addComponent("Collider", { shape: "box", sizeX: 20, sizeY: 0.2, sizeZ: 20 });
    physics.ensureBody(ground);

    const player = level.createEntity("Player");
    player.object3D!.position.set(0, 3, 0);
    const input = makeInput();

    for (let i = 0; i < 180; i++) tick(manager, physics, player, input, 1 / 60);

    expect(manager.isGrounded(player.id)).toBe(true);
    // Ground top at y=0.1; capsule bottom (feet) should rest near there, so its origin
    // (capsule center) sits around halfHeight + radius above the ground.
    const expectedRestY = 0.1 + DEFAULTS.capsuleHalfHeight + DEFAULTS.capsuleRadius;
    expect(player.object3D!.position.y).toBeCloseTo(expectedRestY, 1);
  });

  it("moves horizontally in the direction of WASD input and turns to face it", async () => {
    const physics = await PhysicsWorld.create();
    const manager = new CharacterControllerManager(physics);
    const world = new World();
    const level = world.createLevel("Test");
    const player = level.createEntity("Player");
    player.object3D!.position.set(0, 0, 0);
    const input = makeInput();

    input.press("KeyD"); // moveRight = +1, no forward/back
    for (let i = 0; i < 20; i++) tick(manager, physics, player, input, 1 / 60);

    expect(player.object3D!.position.x).toBeGreaterThan(0);
    expect(Math.abs(player.object3D!.position.z)).toBeLessThan(0.01);
    // Facing +X should settle the yaw near -90° (see CameraRig.ts's derivation).
    expect(player.object3D!.rotation.y).toBeCloseTo(-Math.PI / 2, 1);
  });

  it("jumps once when grounded and does not double-jump while airborne", async () => {
    const physics = await PhysicsWorld.create();
    const manager = new CharacterControllerManager(physics);
    const world = new World();
    const level = world.createLevel("Test");

    const ground = level.createEntity("Ground");
    ground.addComponent("RigidBody", { bodyType: "fixed" });
    ground.addComponent("Collider", { shape: "box", sizeX: 20, sizeY: 0.2, sizeZ: 20 });
    physics.ensureBody(ground);

    const player = level.createEntity("Player");
    player.object3D!.position.set(0, DEFAULTS.capsuleHalfHeight + DEFAULTS.capsuleRadius + 0.1, 0);
    const input = makeInput();

    // Settle on the ground first.
    for (let i = 0; i < 30; i++) tick(manager, physics, player, input, 1 / 60);
    expect(manager.isGrounded(player.id)).toBe(true);
    const groundedY = player.object3D!.position.y;

    input.press("Space");
    tick(manager, physics, player, input, 1 / 60); // jump edge consumed here
    input.endFrame();
    input.release("Space");

    // Repeatedly "press" jump again mid-air — should be ignored until grounded again.
    for (let i = 0; i < 10; i++) {
      input.press("Space");
      tick(manager, physics, player, input, 1 / 60);
      input.endFrame();
      input.release("Space");
    }

    expect(player.object3D!.position.y).toBeGreaterThan(groundedY + 0.3); // airborne, risen
  });
});
