import { describe, expect, it } from "vitest";
import { World, registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";
import { ease } from "./easing.js";
import { sampleTrack, markersCrossed, type PropertyTrack, type EventTrack, type Sequence } from "./sequence.js";
import { SequencePlayer } from "./player.js";
import { createCinematicSystem } from "./systems.js";
import "./systems.js";

const fields: ComponentField[] = [{ name: "intensity", type: "number", default: 0 }];
registerComponent({
  type: "CineLamp",
  label: "Lamp",
  fields,
  createDefault: () => defaultsFromFields(fields) as Record<string, unknown>,
});

describe("@3jse/cinematics — easing + sampling", () => {
  it("easings are clamped and monotonic at the ends", () => {
    expect(ease(0, "easeInOut")).toBe(0);
    expect(ease(1, "easeInOut")).toBe(1);
    expect(ease(-5, "linear")).toBe(0);
    expect(ease(0.5, "step")).toBe(0);
  });

  it("sampleTrack interpolates vec3 position with easing and clamps outside range", () => {
    const track: PropertyTrack = {
      kind: "property",
      entity: "e1",
      channel: "position",
      keyframes: [
        { time: 0, value: [0, 0, 0], easing: "linear" },
        { time: 2, value: [10, 0, 0] },
      ],
    };
    expect(sampleTrack(track, -1)).toEqual([0, 0, 0]);
    expect(sampleTrack(track, 1)).toEqual([5, 0, 0]);
    expect(sampleTrack(track, 9)).toEqual([10, 0, 0]);
  });

  it("markersCrossed fires once per crossing, loop-aware", () => {
    const t: EventTrack = { kind: "event", markers: [{ time: 0.5, name: "a" }, { time: 1.5, name: "b" }] };
    expect(markersCrossed(t, 0, 1, 2, false).map((m) => m.name)).toEqual(["a"]);
    expect(markersCrossed(t, 1, 1.9, 2, false).map((m) => m.name)).toEqual(["b"]);
    // wrapped from 1.6 -> 0.7 across duration 2: (1.6,2] catches nothing new, [0,0.7] catches 'a'
    expect(markersCrossed(t, 1.6, 0.7, 2, true).map((m) => m.name)).toEqual(["a"]);
    // wrapped from 1.4 -> 0.6: (1.4,2] catches 'b', [0,0.6] catches 'a'
    expect(markersCrossed(t, 1.4, 0.6, 2, true).map((m) => m.name)).toEqual(["b", "a"]);
  });
});

function scene() {
  const world = new World();
  const level = world.createLevel("Shot");
  const cam = level.createEntity("Camera");
  const lamp = level.createEntity("Lamp");
  lamp.addComponent("CineLamp", { intensity: 0 });
  const seq: Sequence = {
    name: "intro",
    duration: 2,
    loop: false,
    tracks: [
      {
        kind: "property",
        entity: cam.id,
        channel: "position",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 2, value: [0, 0, -20] },
        ],
      },
      {
        kind: "property",
        entity: lamp.id,
        channel: "field",
        component: "CineLamp",
        field: "intensity",
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 5 },
        ],
      },
      { kind: "event", markers: [{ time: 1, name: "flash", payload: { color: "white" } }] },
      { kind: "activation", entity: lamp.id, ranges: [{ start: 0.5, end: 1.5 }] },
    ],
  };
  return { world, level, cam, lamp, seq };
}

describe("@3jse/cinematics — SequencePlayer", () => {
  it("animates Object3D transforms and component fields, fires events, toggles activation", () => {
    const { level, cam, lamp, seq } = scene();
    const events: string[] = [];
    const player = new SequencePlayer(seq, level, { onEvent: (n) => events.push(n) });
    player.play();

    player.update(1); // t=1
    expect(cam.object3D!.position.z).toBeCloseTo(-10);
    expect(lamp.getComponent<Record<string, number>>("CineLamp")!.intensity).toBeCloseTo(5);
    expect(events).toEqual(["flash"]);
    expect(lamp.object3D!.visible).toBe(true); // inside [0.5, 1.5]

    player.update(1); // t=2, completes
    expect(cam.object3D!.position.z).toBeCloseTo(-20);
    expect(player.isPlaying).toBe(false);
    expect(lamp.object3D!.visible).toBe(false); // past 1.5
  });

  it("seek does not fire events between old and new position", () => {
    const { level, seq } = scene();
    const events: string[] = [];
    const player = new SequencePlayer(seq, level, { onEvent: (n) => events.push(n) });
    player.seek(1.5);
    expect(events).toEqual([]);
  });
});

describe("@3jse/cinematics — CinematicSystem", () => {
  it("plays a named sequence when the Cinematic component's playing flag is set", () => {
    const { world, level, cam, seq } = scene();
    world.scheduler.register(createCinematicSystem({ intro: seq }));
    const director = level.createEntity("Director", { spatial: false });
    director.addComponent("Cinematic", { sequence: "intro", playing: true });

    for (let i = 0; i < 60; i++) world.step(1 / 30); // 2s
    expect(cam.object3D!.position.z).toBeCloseTo(-20, 1);
    expect(director.getComponent<Record<string, unknown>>("Cinematic")!.playing).toBe(false);
    expect(director.getComponent<Record<string, number>>("Cinematic")!.time).toBeCloseTo(2, 1);
  });

  it("an external write to `time` scrubs the player instead of drifting forward normally (the Sequencer panel's seek)", () => {
    const { world, level, cam, seq } = scene();
    world.scheduler.register(createCinematicSystem({ intro: seq }));
    const director = level.createEntity("Director", { spatial: false });
    director.addComponent("Cinematic", { sequence: "intro", playing: false });

    world.step(1 / 30); // establish lastEmittedTime at 0, still paused
    expect(cam.object3D!.position.z).toBeCloseTo(0, 5);

    // Panel-driven scrub: jump straight to the midpoint while paused.
    director.getComponent<Record<string, unknown>>("Cinematic")!.time = 1;
    world.step(1 / 30);
    expect(cam.object3D!.position.z).toBeCloseTo(-10, 1); // halfway through the -20 move
    expect(director.getComponent<Record<string, unknown>>("Cinematic")!.playing).toBe(false); // still paused

    // Resuming play continues from the scrubbed time, not from 0.
    director.getComponent<Record<string, unknown>>("Cinematic")!.playing = true;
    world.step(1 / 30);
    expect(director.getComponent<Record<string, number>>("Cinematic")!.time).toBeGreaterThan(1);
  });
});
