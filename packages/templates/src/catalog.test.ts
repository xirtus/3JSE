import { describe, expect, it } from "vitest";
import { INPUT_RESOURCE, type InputManager } from "@3jse/runtime";
import { buildTopDownTemplate } from "./topDown.js";
import { buildFirstPersonTemplate } from "./firstPerson.js";
import { TEMPLATE_CATALOG } from "./index.js";
import type { CameraRigData } from "@3jse/character";

// docs/ROADMAP.md Phase 6: "more templates (Top-Down, First-Person)". Same headless discipline
// as thirdPerson.test.ts — the wiring is shared, only the camera preset differs.

describe("@3jse/templates catalog", () => {
  it("lists the three genre starters", () => {
    expect(TEMPLATE_CATALOG.map((t) => t.id)).toEqual(["third-person", "top-down", "first-person"]);
  });

  it("Top-Down: full character wiring, overhead camera preset, player falls & settles", async () => {
    const t = await buildTopDownTemplate();
    const cam = t.player.getComponent<CameraRigData>("CameraRig")!;
    expect(cam.mode).toBe("topDown");
    expect(t.player.hasComponent("CharacterController")).toBe(true);
    expect(t.world.getResource(INPUT_RESOURCE)).toBeTruthy();

    const startY = t.player.object3D!.position.y;
    for (let i = 0; i < 240; i++) t.world.step(1 / 60);
    expect(t.player.object3D!.position.y).toBeLessThan(startY);
    expect(t.player.object3D!.position.y).toBeGreaterThan(-2);
  });

  it("First Person: eye-level camera preset, forward input still drives movement", async () => {
    const t = await buildFirstPersonTemplate();
    expect(t.player.getComponent<CameraRigData>("CameraRig")!.mode).toBe("firstPerson");

    for (let i = 0; i < 120; i++) t.world.step(1 / 60); // settle
    const input = t.world.getResource<InputManager>(INPUT_RESOURCE)!;
    const x0 = t.player.object3D!.position.x;
    const z0 = t.player.object3D!.position.z;
    input.press("KeyW");
    for (let i = 0; i < 120; i++) t.world.step(1 / 60);
    input.release("KeyW");
    const moved = Math.hypot(t.player.object3D!.position.x - x0, t.player.object3D!.position.z - z0);
    expect(moved).toBeGreaterThan(1);
  });

  it("camera overrides pass through the wrapper", async () => {
    const t = await buildTopDownTemplate({ camera: { distance: 30, pitchDegrees: 10 } });
    const cam = t.player.getComponent<CameraRigData>("CameraRig")!;
    expect(cam.mode).toBe("topDown"); // wrapper default kept
    expect(cam.distance).toBe(30); // caller override applied
    expect(cam.pitchDegrees).toBe(10);
  });
});
