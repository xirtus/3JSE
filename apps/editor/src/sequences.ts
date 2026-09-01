import type { Sequence } from "@3jse/cinematics";

/**
 * docs/EDITOR.md Phase 5's Sequencer panel needs a Sequence registry to author against — this
 * is the editor's (mutable so the panel can add tracks/keyframes; a project file is real future
 * work per @3jse/cinematics' own doc comment: "the editor's Sequencer panel authors these
 * structures"). One demo sequence ships so the panel opens with real content: the Sun sweeps
 * across the sky and fires a "midday" event marker at its peak.
 */
export const sequences: Record<string, Sequence> = {
  sunSweep: {
    name: "sunSweep",
    duration: 8,
    loop: true,
    tracks: [
      {
        kind: "property",
        entity: "", // filled in by sampleScene.ts once the Sun entity's id is known
        channel: "position",
        keyframes: [
          { time: 0, value: [-6, 3, 3], easing: "easeInOut" },
          { time: 4, value: [4, 8, 3], easing: "easeInOut" },
          { time: 8, value: [-6, 3, 3] },
        ],
      },
      {
        kind: "event",
        markers: [{ time: 4, name: "midday" }],
      },
    ],
  },
};
