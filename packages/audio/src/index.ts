// @3jse/audio — the mixing, event, and generative-music layer over Web Audio (docs/AUDIO.md).
// Headless: the mixer graph, the AudioSource/AudioListener/ReverbZone components, the audio
// System (driven against a pluggable AudioBackend — NullBackend for tests, a Three.js/Web-Audio
// backend in the browser), the event router, and the musical grid + MIDI/OSC bridge all run in
// a plain vitest with no AudioContext.

export { MixerGraph, type BusConfig, type BusId, type DuckRule } from "./mixer.js";
export {
  NullBackend,
  type AudioBackend,
  type PlayParams,
  type Vec3,
  type RecordedCall,
} from "./backend.js";
export { createAudioSystem } from "./systems.js";
export { AudioEventRouter, type AudioTrigger } from "./events.js";
export {
  quantize,
  stepIndex,
  stepDuration,
  scaleDegreeToMidi,
  MusicDirector,
  NullMidiOut,
  type MusicalContext,
  type ScaleName,
  type GridDivision,
  type MidiOut,
  type RecordedMidi,
} from "./music.js";
export type { AudioSourceData, ReverbZoneData } from "./components.js";

// Registers AudioSource / AudioListener / ReverbZone as an import side effect.
import "./components.js";
