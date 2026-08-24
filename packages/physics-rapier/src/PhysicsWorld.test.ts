import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import { PhysicsWorld } from "./PhysicsWorld.js";
import { createPhysicsSystem } from "./systems.js";
import "./components.js";

describe("PhysicsWorld", () => {
  it("a dynamic body with RigidBody+Collider falls under gravity and syncs to Object3D", async () => {
    const physics = await PhysicsWorld.create();
    const world = new World();
    world.scheduler.register(createPhysicsSystem(physics));
    const level = world.createLevel("Test");

    const ball = level.createEntity("Ball");
    ball.object3D!.position.set(0, 10, 0);
    ball.addComponent("RigidBody", { bodyType: "dynamic", mass: 1 });
    ball.addComponent("Collider", { shape: "sphere", radius: 0.5 });

    const startY = ball.object3D!.position.y;
    for (let i = 0; i < 30; i++) world.step(1 / 60);

    expect(ball.object3D!.position.y).toBeLessThan(startY);
    expect(physics.hasBody(ball.id)).toBe(true);
  });

  it("a dynamic capsule body falls under gravity and syncs to Object3D", async () => {
    const physics = await PhysicsWorld.create();
    const world = new World();
    world.scheduler.register(createPhysicsSystem(physics));
    const level = world.createLevel("Test");

    const capsule = level.createEntity("Capsule");
    capsule.object3D!.position.set(0, 10, 0);
    capsule.addComponent("RigidBody", { bodyType: "dynamic", mass: 1 });
    capsule.addComponent("Collider", { shape: "capsule", radius: 0.4, halfHeight: 0.5 });

    const startY = capsule.object3D!.position.y;
    for (let i = 0; i < 30; i++) world.step(1 / 60);

    expect(capsule.object3D!.position.y).toBeLessThan(startY);
    expect(physics.hasBody(capsule.id)).toBe(true);
  });

  it("a fixed body does not move under gravity", async () => {
    const physics = await PhysicsWorld.create();
    const world = new World();
    world.scheduler.register(createPhysicsSystem(physics));
    const level = world.createLevel("Test");

    const ground = level.createEntity("Ground");
    ground.object3D!.position.set(0, 0, 0);
    ground.addComponent("RigidBody", { bodyType: "fixed" });
    ground.addComponent("Collider", { shape: "box", sizeX: 20, sizeY: 0.2, sizeZ: 20 });

    for (let i = 0; i < 30; i++) world.step(1 / 60);

    expect(ground.object3D!.position.y).toBeCloseTo(0, 5);
  });

  it("a falling dynamic body comes to rest on a fixed ground collider", async () => {
    const physics = await PhysicsWorld.create();
    const world = new World();
    world.scheduler.register(createPhysicsSystem(physics));
    const level = world.createLevel("Test");

    const ground = level.createEntity("Ground");
    ground.addComponent("RigidBody", { bodyType: "fixed" });
    ground.addComponent("Collider", { shape: "box", sizeX: 20, sizeY: 0.2, sizeZ: 20 });

    const box = level.createEntity("Box");
    box.object3D!.position.set(0, 3, 0);
    box.addComponent("RigidBody", { bodyType: "dynamic", mass: 1 });
    box.addComponent("Collider", { shape: "box", sizeX: 1, sizeY: 1, sizeZ: 1 });

    for (let i = 0; i < 300; i++) world.step(1 / 60); // 5 simulated seconds — plenty to settle

    // Ground top face is at y=0.1 (half of 0.2), box half-height 0.5 → rests around y≈0.6
    expect(box.object3D!.position.y).toBeGreaterThan(0.4);
    expect(box.object3D!.position.y).toBeLessThan(0.8);
  });
});
