import type { Level } from "@3jse/runtime";
import { isActiveAt, markersCrossed, sampleTrack, type Sequence } from "./sequence.js";

export interface PlayerOptions {
  onEvent?: (name: string, payload: unknown, time: number) => void;
  /** called when a non-looping sequence reaches the end */
  onComplete?: (name: string) => void;
}

/**
 * Drives one Sequence against a live Level. `update(dt)` advances the playhead, samples every
 * property track onto the target entity's Object3D / component field, toggles activation
 * tracks, and fires event markers exactly once as they're crossed (seek- and loop-safe).
 *
 * Renderer-independent: everything it writes is Object3D transform values or plain component
 * data — the same numbers a headless mechanics check asserts (docs/REFERENCE_GAMES.md).
 */
export class SequencePlayer {
  private time = 0;
  private playing = false;
  private looped = false;

  constructor(
    private readonly sequence: Sequence,
    private readonly level: Level,
    private readonly opts: PlayerOptions = {},
  ) {}

  get currentTime(): number {
    return this.time;
  }
  get isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }

  /** jump the playhead without firing events between old and new position */
  seek(t: number): void {
    this.time = clamp(t, 0, this.sequence.duration);
    this.applyAt(this.time);
  }

  rewind(): void {
    this.seek(0);
  }

  update(dt: number): void {
    if (!this.playing) return;
    const prev = this.time;
    let next = prev + dt;
    this.looped = false;
    if (next >= this.sequence.duration) {
      if (this.sequence.loop) {
        next = next % this.sequence.duration;
        this.looped = true;
      } else {
        next = this.sequence.duration;
        this.playing = false;
      }
    }
    this.time = next;
    this.fireEvents(prev, next);
    this.applyAt(next);
    if (!this.playing && !this.sequence.loop && prev < this.sequence.duration) {
      this.opts.onComplete?.(this.sequence.name);
    }
  }

  private fireEvents(prev: number, now: number): void {
    if (!this.opts.onEvent) return;
    for (const track of this.sequence.tracks) {
      if (track.kind !== "event") continue;
      for (const m of markersCrossed(track, prev, now, this.sequence.duration, this.looped)) {
        this.opts.onEvent(m.name, m.payload, m.time);
      }
    }
  }

  private applyAt(t: number): void {
    for (const track of this.sequence.tracks) {
      if (track.kind === "property") {
        const e = this.level.getEntity(track.entity);
        if (!e) continue;
        const v = sampleTrack(track, t);
        if (v == null) continue;
        if (track.channel === "field" && track.component && track.field) {
          const data = e.getComponent<Record<string, unknown>>(track.component);
          if (data) data[track.field] = v;
        } else if (e.object3D) {
          const arr = v as [number, number, number];
          if (track.channel === "position") e.object3D.position.set(arr[0], arr[1], arr[2]);
          else if (track.channel === "rotation") e.object3D.rotation.set(arr[0], arr[1], arr[2]);
          else if (track.channel === "scale") e.object3D.scale.set(arr[0], arr[1], arr[2]);
        }
      } else if (track.kind === "activation") {
        const e = this.level.getEntity(track.entity);
        if (e?.object3D) e.object3D.visible = isActiveAt(track, t);
      }
    }
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
