import type { World, InputManager } from "@3jse/runtime";
import type { Recording } from "./InputRecorder.js";

/**
 * Plays a `Recording` back against `world`, driving `input` with the exact recorded press/
 * release edges at the exact recorded tick indices, then stepping `world` by `recording.dt`.
 * Reproduces the original run's result **exactly when `world` starts from the same initial
 * state the recording did** — replay only owns input, not scene setup (this package's own doc
 * comment): the caller builds an identical starting `World`/`Level` (the same project bootstrap
 * function a live session used, or a `@3jse/save` snapshot as the starting point for a
 * mid-session replay) and passes its `InputManager` in here.
 *
 * `RUNTIME.md`'s determinism posture is explicit about the boundary this claim lives inside:
 * "deterministic *per machine* (same build, same OS/GPU, same inputs → same result)" — not
 * claimed cross-platform bit-exact. `replayAndCompare()` in this package's test suite is the
 * concrete proof that boundary holds, including with `@3jse/physics-rapier` in the loop.
 */
export function replay(recording: Recording, world: World, input: InputManager): void {
  const eventsByTick = new Map<number, Recording["events"]>();
  for (const event of recording.events) {
    const bucket = eventsByTick.get(event.tick);
    if (bucket) bucket.push(event);
    else eventsByTick.set(event.tick, [event]);
  }

  for (let tick = 0; tick < recording.tickCount; tick++) {
    for (const event of eventsByTick.get(tick) ?? []) {
      if (event.type === "press") input.press(event.code);
      else input.release(event.code);
    }
    world.step(recording.dt);
    input.endFrame();
  }
}
