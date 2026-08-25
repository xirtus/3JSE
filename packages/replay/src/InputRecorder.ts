import type { InputManager } from "@3jse/runtime";

export type InputEventType = "press" | "release";

export interface RecordedInputEvent {
  /** Which fixed-step tick this edge happened on — 0-indexed, matching the tick count
   *  `world.step()` is called (RUNTIME.md's tick loop), not wall-clock time. Replay is driven
   *  by tick index, not a timer, which is what makes it reproducible independent of how fast
   *  the recording session's real frame rate happened to be. */
  tick: number;
  type: InputEventType;
  code: string;
}

export interface Recording {
  /** Fixed step size every recorded tick advanced by — RUNTIME.md's determinism posture is
   *  scoped to "same build, same inputs," and dt is part of "same inputs": replaying at a
   *  different dt than the recording used is not the same input sequence, even with identical
   *  press/release edges. */
  dt: number;
  tickCount: number;
  events: RecordedInputEvent[];
}

/**
 * docs/ROADMAP.md Phase 5's replay system, recording half — "building on RUNTIME.md's
 * per-machine determinism." Records only the edges (`press`/`release`), not a per-tick key-state
 * snapshot: `InputManager`'s own state (`isKeyDown`, axis values, `wasActionPressed`) is entirely
 * derived from the press/release history, so replaying the same edges at the same ticks against
 * a fresh `InputManager` reproduces every derived value automatically — nothing else needs
 * recording. A game's own input-reading code (`world.getResource<InputManager>(...)`) doesn't
 * need to know whether it's driving a live session or a replay; both are the same InputManager
 * API, per docs/ARCHITECTURE.md principle 3.
 *
 * Wraps an `InputManager` rather than subclassing it or requiring engine changes — a project
 * opts into recording by routing its own `press`/`release` calls (from `attach()`'s keyboard
 * listener, or hand-written for a bot/AI-driven session) through the recorder instead of the
 * `InputManager` directly, and reads everything else (`isKeyDown`, `getAxis`, …) off the same
 * `InputManager` as always.
 */
export class InputRecorder {
  private tick = 0;
  private readonly events: RecordedInputEvent[] = [];

  constructor(private readonly target: InputManager) {}

  press(code: string): void {
    this.events.push({ tick: this.tick, type: "press", code });
    this.target.press(code);
  }

  release(code: string): void {
    this.events.push({ tick: this.tick, type: "release", code });
    this.target.release(code);
  }

  /** Call once per fixed step, after `world.step()` — the same point `InputManager.endFrame()`
   *  is normally called (RUNTIME.md's tick loop stage 1). Calls the wrapped `InputManager`'s own
   *  `endFrame()` internally (clearing its this-tick press/release edges) *and* advances which
   *  tick subsequent `press`/`release` calls get attributed to, both in one call — deliberately
   *  not two separate calls a consumer has to remember to keep in sync. Forgetting the
   *  `endFrame()` half specifically is a real, easy-to-hit bug: `wasActionPressed()`-gated logic
   *  (a jump, an attack) stays edge-"true" for extra ticks it shouldn't, and `replay()` — which
   *  does call `endFrame()` every tick — then reproduces a *different*, wrong trajectory instead
   *  of the recorded one. Found by hitting it while writing this package's own determinism test
   *  (replayPhysics.test.ts), not by inspection — fixed here at the API level so it can't recur
   *  for any other caller. */
  endTick(): void {
    this.target.endFrame();
    this.tick++;
  }

  toRecording(dt: number): Recording {
    return { dt, tickCount: this.tick, events: [...this.events] };
  }
}
