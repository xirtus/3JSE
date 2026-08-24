import { describe, expect, it } from "vitest";
import * as THREE from "three/webgpu";
import { World } from "@3jse/runtime";
import { AnimationStateMachineManager } from "./AnimationStateMachineManager.js";
import type { AnimationGraphDef } from "./AnimationGraph.js";

function makeClip(name: string, duration = 1): THREE.AnimationClip {
  const track = new THREE.NumberKeyframeTrack(".position[y]", [0, duration], [0, 1]);
  return new THREE.AnimationClip(name, duration, [track]);
}

function weightOf(manager: AnimationStateMachineManager, entityId: string, clip: string): number {
  // Reach into the private map only for assertions — fine in a test, not something production
  // code does (the class's public surface is step()/getCurrentStateName()).
  const state = (manager as unknown as { characters: Map<string, { actions: Map<string, THREE.AnimationAction> }> })
    .characters.get(entityId);
  return state?.actions.get(clip)?.getEffectiveWeight() ?? -1;
}

describe("AnimationStateMachineManager", () => {
  it("plays the entry state's clip at full weight from the first tick", () => {
    const manager = new AnimationStateMachineManager();
    const world = new World();
    const level = world.createLevel("Test");
    const entity = level.createEntity("Character");

    const graph: AnimationGraphDef = {
      states: [{ name: "Idle", clip: "Idle", loop: true }],
      transitions: [],
      entryState: "Idle",
    };
    const clips = [makeClip("Idle")];

    manager.step(entity, graph, clips, {}, 1 / 60);

    expect(weightOf(manager, entity.id, "Idle")).toBe(1);
    expect(manager.getCurrentStateName(entity.id)).toBe("Idle");
  });

  it("crossfades between two single-clip states when a transition condition is met", () => {
    const manager = new AnimationStateMachineManager();
    const world = new World();
    const level = world.createLevel("Test");
    const entity = level.createEntity("Character");

    const graph: AnimationGraphDef = {
      states: [
        { name: "Idle", clip: "Idle", loop: true },
        { name: "Jump", clip: "Jump", loop: false },
      ],
      transitions: [
        { from: "Idle", to: "Jump", conditions: [{ param: "grounded", op: "==", value: 0 }], duration: 0.2 },
        { from: "Jump", to: "Idle", conditions: [{ param: "grounded", op: "==", value: 1 }], duration: 0.2 },
      ],
      entryState: "Idle",
    };
    const clips = [makeClip("Idle"), makeClip("Jump")];

    manager.step(entity, graph, clips, { grounded: 1 }, 1 / 60);
    expect(weightOf(manager, entity.id, "Idle")).toBe(1);
    expect(weightOf(manager, entity.id, "Jump")).toBe(0);

    // Leave the ground: transition fires this tick; Jump becomes the primary state immediately
    // even though its weight is still ramping up.
    manager.step(entity, graph, clips, { grounded: 0 }, 1 / 60);
    expect(manager.getCurrentStateName(entity.id)).toBe("Jump");
    expect(weightOf(manager, entity.id, "Jump")).toBeGreaterThan(0);
    expect(weightOf(manager, entity.id, "Jump")).toBeLessThan(1);
    expect(weightOf(manager, entity.id, "Idle")).toBeGreaterThan(0); // still fading out
    expect(weightOf(manager, entity.id, "Idle") + weightOf(manager, entity.id, "Jump")).toBeCloseTo(1, 5);

    // Advance well past the 0.2s crossfade duration.
    for (let i = 0; i < 30; i++) manager.step(entity, graph, clips, { grounded: 0 }, 1 / 60);
    expect(weightOf(manager, entity.id, "Jump")).toBeCloseTo(1, 5);
    expect(weightOf(manager, entity.id, "Idle")).toBeCloseTo(0, 5);
  });

  it("blends a 1D blend-tree state's clips by the driving parameter, no crossfade needed within one state", () => {
    const manager = new AnimationStateMachineManager();
    const world = new World();
    const level = world.createLevel("Test");
    const entity = level.createEntity("Character");

    const graph: AnimationGraphDef = {
      states: [
        {
          name: "Locomotion",
          loop: true,
          blendTree: [
            { clip: "Idle", threshold: 0 },
            { clip: "Walk", threshold: 1 },
            { clip: "Run", threshold: 2 },
          ],
        },
      ],
      transitions: [],
      entryState: "Locomotion",
    };
    const clips = [makeClip("Idle"), makeClip("Walk"), makeClip("Run")];

    manager.step(entity, graph, clips, { speed: 1.5 }, 1 / 60);

    expect(weightOf(manager, entity.id, "Idle")).toBe(0);
    expect(weightOf(manager, entity.id, "Walk")).toBeCloseTo(0.5, 5);
    expect(weightOf(manager, entity.id, "Run")).toBeCloseTo(0.5, 5);
  });

  it("does not re-trigger a transition back into the state it's already in", () => {
    const manager = new AnimationStateMachineManager();
    const world = new World();
    const level = world.createLevel("Test");
    const entity = level.createEntity("Character");

    const graph: AnimationGraphDef = {
      states: [
        { name: "Idle", clip: "Idle", loop: true },
        { name: "Jump", clip: "Jump", loop: false },
      ],
      transitions: [
        { from: "*", to: "Jump", conditions: [{ param: "grounded", op: "==", value: 0 }], duration: 0.1 },
      ],
      entryState: "Idle",
    };
    const clips = [makeClip("Idle"), makeClip("Jump")];

    for (let i = 0; i < 20; i++) manager.step(entity, graph, clips, { grounded: 0 }, 1 / 60);
    expect(manager.getCurrentStateName(entity.id)).toBe("Jump");
    expect(weightOf(manager, entity.id, "Jump")).toBeCloseTo(1, 5);

    // Only one Jump entry should ever have been pushed — weight must not have exceeded 1 at any
    // point from a duplicate entry stacking on top of it.
    for (let i = 0; i < 20; i++) manager.step(entity, graph, clips, { grounded: 0 }, 1 / 60);
    expect(weightOf(manager, entity.id, "Jump")).toBeLessThanOrEqual(1);
  });
});
