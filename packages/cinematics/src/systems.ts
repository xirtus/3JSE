import { registerComponent, defaultsFromFields, type ComponentField, type SystemDef } from "@3jse/runtime";
import { SequencePlayer, type PlayerOptions } from "./player.js";
import type { Sequence } from "./sequence.js";

// A Cinematic component names a registered Sequence and whether it's currently rolling.
const cinematicFields: ComponentField[] = [
  { name: "sequence", type: "string", default: "" },
  { name: "playing", type: "boolean", default: false },
  { name: "time", type: "number", default: 0 },
];
export type CinematicData = { sequence: string; playing: boolean; time: number };
registerComponent({
  type: "Cinematic",
  label: "Cinematic",
  fields: cinematicFields,
  createDefault: () => defaultsFromFields(cinematicFields) as CinematicData,
});

/**
 * Drives every entity carrying a `Cinematic` whose `sequence` resolves in `sequences`. One
 * SequencePlayer is kept per entity id; the component's `playing`/`time` fields are the
 * authored control surface — an Inspector, a Graph node, or the editor's Sequencer panel
 * toggles `playing` or writes `time` directly to scrub, and `time` is mirrored back each tick
 * so it stays visible/seekable either way.
 *
 * External scrubbing (docs/EDITOR.md's Sequencer panel): if `data.time` doesn't match what this
 * System itself last wrote, something else moved the playhead — seek the player there (seek is
 * event-free, per SequencePlayer's own doc comment) before resuming normal update/play.
 */
export function createCinematicSystem(
  sequences: Record<string, Sequence>,
  opts: PlayerOptions = {},
): SystemDef {
  const players = new Map<string, SequencePlayer>();
  const lastPlaying = new Map<string, boolean>();
  const lastEmittedTime = new Map<string, number>();

  return {
    name: "CinematicSystem",
    stage: "variable",
    query: ["Cinematic"],
    run: (entities, { level, dt }) => {
      const seen = new Set<string>();
      for (const e of entities) {
        seen.add(e.id);
        const data = e.getComponent<CinematicData>("Cinematic");
        if (!data) continue;
        const seq = sequences[data.sequence];
        if (!seq) continue;

        let player = players.get(e.id);
        if (!player) {
          player = new SequencePlayer(seq, level, opts);
          players.set(e.id, player);
        }

        const lastTime = lastEmittedTime.get(e.id);
        if (lastTime !== undefined && Math.abs(data.time - lastTime) > 1e-6) {
          player.seek(data.time); // external write since our last tick -> scrub, not drift
        }

        const was = lastPlaying.get(e.id) ?? false;
        if (data.playing && !was) player.play();
        if (!data.playing && was) player.pause();
        lastPlaying.set(e.id, data.playing);

        player.update(dt);
        data.time = player.currentTime;
        data.playing = player.isPlaying; // a finished non-looping sequence flips this back off
        lastEmittedTime.set(e.id, data.time);
      }
      for (const id of [...players.keys()]) if (!seen.has(id)) {
        players.delete(id);
        lastPlaying.delete(id);
        lastEmittedTime.delete(id);
      }
    },
  };
}
