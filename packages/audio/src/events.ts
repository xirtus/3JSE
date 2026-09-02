// Event-driven triggering (docs/AUDIO.md §"Event-driven triggering"). Sounds are wired to 3IR
// event names, not hardcoded in gameplay systems — a footstep sync, Health.onDamaged, and
// OnTriggerEnter all connect to a "play" action the same way.

import type { Level } from "@3jse/runtime";
import type { AudioSourceData } from "./components.js";

export interface AudioTrigger {
  /** 3IR event name this reacts to */
  event: string;
  action: "play" | "stop" | "toggle";
  /** entity id whose AudioSource to act on; or "$emitter" to use the event's own entity */
  target: string | "$emitter";
  /** one-shot: reset `playing` to false immediately after `play` so it retriggers cleanly */
  oneShot?: boolean;
}

/**
 * Holds the wiring table and applies a fired event to the level's AudioSource components. This
 * is pure component mutation — the AudioSystem picks up the `playing` edge next tick.
 */
export class AudioEventRouter {
  private readonly triggers: AudioTrigger[] = [];

  add(trigger: AudioTrigger): this {
    this.triggers.push(trigger);
    return this;
  }

  addMany(triggers: AudioTrigger[]): this {
    this.triggers.push(...triggers);
    return this;
  }

  list(): AudioTrigger[] {
    return [...this.triggers];
  }

  /** Apply every trigger matching `event`. `emitterId` resolves "$emitter" targets. */
  fire(level: Level, event: string, emitterId?: string): void {
    for (const t of this.triggers) {
      if (t.event !== event) continue;
      const id = t.target === "$emitter" ? emitterId : t.target;
      if (!id) continue;
      const src = level.getEntity(id)?.getComponent<AudioSourceData>("AudioSource");
      if (!src) continue;
      if (t.action === "play") src.playing = true;
      else if (t.action === "stop") src.playing = false;
      else src.playing = !src.playing;
      // one-shot playback: the AudioSystem sees the rising edge this frame, and the source's
      // own natural end (non-loop) or the next stop handles the rest; we flip the flag back so
      // a re-fire next frame is a fresh rising edge.
      if (t.oneShot && t.action !== "stop") src.playing = true;
    }
  }
}
