// @3jse/cinematics — docs/GAMEPLAY_FRAMEWORK.md's Cinematics row: timeline/sequencer runtime.
// Pure + headless; the editor's Sequencer panel (docs/EDITOR.md, roadmap phase 5) authors the
// Sequence structures this plays back.

export { ease, type Easing } from "./easing.js";
export {
  sampleTrack,
  markersCrossed,
  isActiveAt,
  type Sequence,
  type Track,
  type PropertyTrack,
  type EventTrack,
  type ActivationTrack,
  type Keyframe,
  type EventMarker,
  type Channel,
} from "./sequence.js";
export { SequencePlayer, type PlayerOptions } from "./player.js";
export { createCinematicSystem, type CinematicData } from "./systems.js";

// Registers Cinematic against @3jse/runtime's ComponentRegistry as a side effect.
import "./systems.js";
