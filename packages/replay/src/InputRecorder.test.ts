import { describe, expect, it } from "vitest";
import { InputManager } from "@3jse/runtime";
import { InputRecorder } from "./InputRecorder.js";

describe("InputRecorder", () => {
  it("records press/release edges tagged with the current tick, and forwards them to the wrapped InputManager", () => {
    const input = new InputManager();
    const recorder = new InputRecorder(input);

    recorder.press("KeyW");
    expect(input.isKeyDown("KeyW")).toBe(true);
    recorder.endTick(); // tick 0 → 1

    recorder.release("KeyW");
    recorder.press("KeyD");
    recorder.endTick(); // tick 1 → 2

    const recording = recorder.toRecording(1 / 60);
    expect(recording.dt).toBe(1 / 60);
    expect(recording.tickCount).toBe(2);
    expect(recording.events).toEqual([
      { tick: 0, type: "press", code: "KeyW" },
      { tick: 1, type: "release", code: "KeyW" },
      { tick: 1, type: "press", code: "KeyD" },
    ]);
  });

  it("toRecording() is a snapshot — later press/release calls don't mutate a previously-returned recording", () => {
    const recorder = new InputRecorder(new InputManager());
    recorder.press("KeyW");
    recorder.endTick();
    const snapshot = recorder.toRecording(1 / 60);

    recorder.press("KeyD");
    recorder.endTick();

    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.tickCount).toBe(1);
  });

  it("records zero ticks/events for a recorder that never advances", () => {
    const recording = new InputRecorder(new InputManager()).toRecording(1 / 60);
    expect(recording).toEqual({ dt: 1 / 60, tickCount: 0, events: [] });
  });
});
