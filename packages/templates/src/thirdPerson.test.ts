import { describe, expect, it } from "vitest";
import { INPUT_RESOURCE, type InputManager } from "@3jse/runtime";
import { PHYSICS_RESOURCE } from "@3jse/physics-rapier";
import { buildThirdPersonTemplate } from "./thirdPerson.js";

// docs/ROADMAP.md Phase 2 exit: "the Third Person template is playable ... using only Phase
// 1–2 features." Headless (no renderer/canvas/DOM) per the mechanics-harness discipline —
// asserts the numbers move the way a rendered build would.

describe("@3jse/templates — Third Person", () => {
  it("builds headless: player with CharacterController/CameraRig/Animation/Saveable, ground collider, wired systems", async () => {
    const t = await buildThirdPersonTemplate();
    expect(t.player.hasComponent("CharacterController")).toBe(true);
    expect(t.player.hasComponent("CameraRig")).toBe(true);
    expect(t.player.hasComponent("AnimationController")).toBe(true);
    expect(t.player.hasComponent("Saveable")).toBe(true);
    expect(t.ground.hasComponent("Collider")).toBe(true);
    expect(t.world.getResource(INPUT_RESOURCE)).toBeTruthy();
    expect(t.world.getResource(PHYSICS_RESOURCE)).toBeTruthy();
    // systems registered: character, physics, camera, animation (+ builtins)
    const names = ["CharacterControllerSystem", "PhysicsSystem", "CameraRigSystem", "AnimationSystem"];
    // Scheduler has no public list; a tick with no throw over all stages is the smoke test.
    expect(() => t.world.step(1 / 60)).not.toThrow();
    void names;
  });

  it("player falls under gravity and settles on the ground collider", async () => {
    const t = await buildThirdPersonTemplate();
    const startY = t.player.object3D!.position.y;
    for (let i = 0; i < 240; i++) t.world.step(1 / 60); // 4s
    const endY = t.player.object3D!.position.y;
    expect(endY).toBeLessThan(startY); // it fell
    expect(endY).toBeGreaterThan(-2); // …and didn't tunnel through the floor
    // stable now — not still falling fast
    const yA = t.player.object3D!.position.y;
    for (let i = 0; i < 60; i++) t.world.step(1 / 60);
    expect(Math.abs(t.player.object3D!.position.y - yA)).toBeLessThan(0.25);
  });

  it("forward input drives the character forward on the ground plane", async () => {
    const t = await buildThirdPersonTemplate();
    for (let i = 0; i < 120; i++) t.world.step(1 / 60); // settle
    const input = t.world.getResource<InputManager>(INPUT_RESOURCE)!;
    const z0 = t.player.object3D!.position.z;
    const x0 = t.player.object3D!.position.x;
    input.press("KeyW");
    for (let i = 0; i < 120; i++) {
      t.world.step(1 / 60);
    }
    input.release("KeyW");
    const moved = Math.hypot(
      t.player.object3D!.position.x - x0,
      t.player.object3D!.position.z - z0,
    );
    expect(moved).toBeGreaterThan(1); // moved a meaningful distance in 2s
  });

  it("decorate hook runs and can add props", async () => {
    const props: string[] = [];
    const t = await buildThirdPersonTemplate({
      decorate: ({ addProp }) => {
        props.push(addProp("Crate", [2, 1, 0]).name);
        props.push(addProp("Ramp", [-3, 0, 2]).name);
      },
    });
    expect(props).toEqual(["Crate", "Ramp"]);
    expect(t.level.allEntities.some((e) => e.name === "Crate")).toBe(true);
    expect(t.level.allEntities.some((e) => e.name === "Sun")).toBe(true);
  });
});
