import { ease, type Easing } from "./easing.js";

/**
 * docs/GAMEPLAY_FRAMEWORK.md's Cinematics row: "Timeline/sequencer runtime (editor tooling in
 * EDITOR.md, roadmap phase 5)". This is the runtime — pure, headless, no Three.js. The editor's
 * Sequencer panel authors these structures; a shipped game plays them back.
 */

export type Channel = "position" | "rotation" | "scale" | "field";

export interface Keyframe {
  time: number;
  /** number for a scalar field; [x,y,z] for position/rotation(euler)/scale */
  value: number | [number, number, number];
  /** easing from THIS keyframe to the next (ignored on the last) */
  easing?: Easing;
}

export interface PropertyTrack {
  kind: "property";
  /** entity id (resolved by the player against a Level) */
  entity: string;
  channel: Channel;
  /** component type + field name, required when channel === "field" */
  component?: string;
  field?: string;
  keyframes: Keyframe[];
}

export interface EventMarker {
  time: number;
  name: string;
  payload?: unknown;
}
export interface EventTrack {
  kind: "event";
  markers: EventMarker[];
}

/** entity is present (visible / component-enabled) only within [start, end] */
export interface ActivationTrack {
  kind: "activation";
  entity: string;
  ranges: { start: number; end: number }[];
}

export type Track = PropertyTrack | EventTrack | ActivationTrack;

export interface Sequence {
  name: string;
  duration: number;
  loop: boolean;
  tracks: Track[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sample a property track at absolute time `t`. Returns null before the first / after the last
 *  keyframe only if there are none; otherwise clamps to the nearest. */
export function sampleTrack(track: PropertyTrack, t: number): number | [number, number, number] | null {
  const kf = track.keyframes;
  if (kf.length === 0) return null;
  if (t <= kf[0]!.time) return kf[0]!.value;
  if (t >= kf[kf.length - 1]!.time) return kf[kf.length - 1]!.value;
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i]!;
    const b = kf[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const raw = span === 0 ? 0 : (t - a.time) / span;
      const k = ease(raw, a.easing ?? "linear");
      if (Array.isArray(a.value) && Array.isArray(b.value)) {
        return [lerp(a.value[0], b.value[0], k), lerp(a.value[1], b.value[1], k), lerp(a.value[2], b.value[2], k)];
      }
      return lerp(a.value as number, b.value as number, k);
    }
  }
  return kf[kf.length - 1]!.value;
}

/** event markers whose time is crossed moving from `prev` to `now` along a (possibly looping)
 *  timeline. Handles forward play, seek-forward, and one wrap per call. */
export function markersCrossed(
  track: EventTrack,
  prev: number,
  now: number,
  duration: number,
  looped: boolean,
): EventMarker[] {
  const out: EventMarker[] = [];
  const inRange = (m: EventMarker, lo: number, hi: number) => m.time > lo && m.time <= hi;
  if (!looped || now >= prev) {
    for (const m of track.markers) if (inRange(m, prev, now)) out.push(m);
  } else {
    // wrapped: (prev, duration] then [0, now]
    for (const m of track.markers) if (m.time > prev && m.time <= duration) out.push(m);
    for (const m of track.markers) if (m.time >= 0 && m.time <= now) out.push(m);
  }
  return out;
}

export function isActiveAt(track: ActivationTrack, t: number): boolean {
  return track.ranges.some((r) => t >= r.start && t <= r.end);
}
