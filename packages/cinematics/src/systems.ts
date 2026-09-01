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
 * authored control surface (an Inspector or a Graph node toggles `playing`), and `time` is
 * mirrored back each tick so it's visible/seekable.
 */
export function createCinematicSystem(
  sequences: Record<string, Sequence>,
  opts: PlayerOptions = {},
): SystemDef {
  const players = new Map<string, SequencePlayer>();
  const lastPlaying = new Map<string, boolean>();

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

        const was = lastPlaying.get(e.id) ?? false;
        if (data.playing && !was) player.play();
        if (!data.playing && was) player.pause();
        lastPlaying.set(e.id, data.playing);

        player.update(dt);
        data.time = player.currentTime;
        data.playing = player.isPlaying; // a finished non-looping sequence flips this back off
      }
      for (const id of [...players.keys()]) if (!seen.has(id)) {
        players.delete(id);
        lastPlaying.delete(id);
      }
    },
  };
}
