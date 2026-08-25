import type { World } from "@3jse/runtime";

export interface ConsoleEntry {
  level: "log" | "warn" | "error";
  message: string;
  time: number;
}

/** docs/AI_AGENT_API.md's `runtime.getConsole`: "Pull captured logs/errors/warnings since a
 *  given point." One sink per headless run/session; `since()`'s cursor is just "how many
 *  entries existed last time you checked," matching the tool's own "since a given point"
 *  framing without needing timestamps to be unique or monotonic across fast frames. */
export class ConsoleSink {
  private readonly entries: ConsoleEntry[] = [];

  log(level: ConsoleEntry["level"], message: string): void {
    this.entries.push({ level, message, time: Date.now() });
  }

  since(cursor: number): ConsoleEntry[] {
    return this.entries.slice(cursor);
  }

  get length(): number {
    return this.entries.length;
  }
}

/**
 * docs/AI_AGENT_API.md's `runtime.run`: "Boot the game headless." `@3jse/runtime`'s `World` has
 * no DOM dependency (docs/RUNTIME.md's headless-mode posture) — this doesn't need a separate
 * "headless renderer," it's the same `World.step()` apps/editor/src/Viewport.tsx drives every
 * frame, just called directly without a `requestAnimationFrame` loop or a canvas.
 *
 * Each frame is wrapped individually: a System throwing mid-run (docs/AI_AGENT_API.md's shark
 * example step 8, "catch a missing animation-state reference") is captured into the console
 * sink and the run continues, instead of the whole headless verify step crashing on frame one.
 * `runtime.getConsole` is how an agent's VERIFY step actually sees it.
 *
 * Not implemented in this slice: `runtime.getPerf` (needs a real render pass's draw-call/GPU
 * timing — docs/PERFORMANCE.md) and `runtime.captureFrame` (needs a real GPU-capable renderer).
 * Both require an actual rendering context this headless, Node-testable path doesn't have; a
 * browser-hosted implementation is real future work, not faked here with placeholder numbers or
 * a blank image.
 */
export function runtimeRun(world: World, sink: ConsoleSink, frames: number, dt = 1 / 60): void {
  world.play();
  for (let i = 0; i < frames; i++) {
    try {
      world.step(dt);
    } catch (err) {
      sink.log("error", err instanceof Error ? err.message : String(err));
    }
  }
}

export function runtimePause(world: World): void {
  world.pause();
}

export function runtimeStep(world: World, dt = 1 / 60): void {
  world.step(dt);
}

export function runtimeGetConsole(sink: ConsoleSink, sinceIndex = 0): ConsoleEntry[] {
  return sink.since(sinceIndex);
}
