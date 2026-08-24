import { describe, expect, it } from "vitest";
import { InputManager } from "./InputManager.js";

describe("InputManager", () => {
  it("lists and reads back bound action/axis names and their raw bindings", () => {
    const input = new InputManager();
    input.bindAction("jump", ["Space"]);
    input.bindAxis("moveRight", ["KeyD"], ["KeyA"]);

    expect(input.listActionNames()).toEqual(["jump"]);
    expect(input.listAxisNames()).toEqual(["moveRight"]);
    expect(input.getActionBinding("jump")).toEqual(["Space"]);
    expect(input.getAxisBinding("moveRight")).toEqual({ positive: ["KeyD"], negative: ["KeyA"] });
    expect(input.getActionBinding("missing")).toBeUndefined();
  });

  it("tracks key down state and resolves bound actions", () => {
    const input = new InputManager();
    input.bindAction("jump", ["Space", "KeyJ"]);

    expect(input.isActionDown("jump")).toBe(false);
    input.press("Space");
    expect(input.isKeyDown("Space")).toBe(true);
    expect(input.isActionDown("jump")).toBe(true);

    input.release("Space");
    expect(input.isActionDown("jump")).toBe(false);
  });

  it("reports press/release edges only for the frame they occurred, cleared by endFrame()", () => {
    const input = new InputManager();
    input.bindAction("jump", ["Space"]);

    input.press("Space");
    expect(input.wasActionPressed("jump")).toBe(true);
    input.endFrame();
    expect(input.wasActionPressed("jump")).toBe(false);
    expect(input.isActionDown("jump")).toBe(true); // still held

    input.release("Space");
    expect(input.wasActionReleased("jump")).toBe(true);
    input.endFrame();
    expect(input.wasActionReleased("jump")).toBe(false);
  });

  it("holding a key down again does not re-trigger a press edge", () => {
    const input = new InputManager();
    input.bindAction("jump", ["Space"]);
    input.press("Space");
    input.endFrame();
    input.press("Space"); // already down; not a new press
    expect(input.wasActionPressed("jump")).toBe(false);
  });

  it("resolves a bound axis from opposing keys, including the both-held-cancels-out case", () => {
    const input = new InputManager();
    input.bindAxis("moveRight", ["KeyD"], ["KeyA"]);

    expect(input.getAxis("moveRight")).toBe(0);
    input.press("KeyD");
    expect(input.getAxis("moveRight")).toBe(1);
    input.press("KeyA");
    expect(input.getAxis("moveRight")).toBe(0);
    input.release("KeyD");
    expect(input.getAxis("moveRight")).toBe(-1);
  });

  it("attach() wires a target's keydown/keyup into the same state, and cleanup detaches it", () => {
    const listeners: Record<string, (e: Event) => void> = {};
    const fakeTarget = {
      addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => {
        listeners[type] = cb as (e: Event) => void;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
    };

    const input = new InputManager();
    input.bindAction("jump", ["Space"]);
    const detach = input.attach(fakeTarget as unknown as EventTarget);

    listeners.keydown!({ code: "Space" } as KeyboardEvent);
    expect(input.isActionDown("jump")).toBe(true);

    listeners.keyup!({ code: "Space" } as KeyboardEvent);
    expect(input.isActionDown("jump")).toBe(false);

    detach();
    expect(listeners.keydown).toBeUndefined();
  });
});
