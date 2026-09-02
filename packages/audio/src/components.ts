import { registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";

// docs/AUDIO.md §"AudioSource as a Component" — sound playback is a Component like everything
// else: inspectable, serializable, drivable from Graph nodes or a TS system.

const audioSourceFields: ComponentField[] = [
  { name: "clip", type: "string", default: "" },
  { name: "bus", type: "string", default: "SFX" },
  { name: "playing", type: "boolean", default: false },
  { name: "loop", type: "boolean", default: false },
  { name: "volume", type: "number", default: 1, min: 0, max: 1, step: 0.05 },
  { name: "spatialBlend", type: "number", default: 1, min: 0, max: 1, step: 0.05 }, // 0 = 2D, 1 = spatial
  { name: "minDistance", type: "number", default: 1, min: 0, max: 100, step: 0.5 },
  { name: "maxDistance", type: "number", default: 40, min: 1, max: 1000, step: 1 },
  { name: "rate", type: "number", default: 1, min: 0.25, max: 4, step: 0.05 },
];
export type AudioSourceData = {
  clip: string; bus: string; playing: boolean; loop: boolean; volume: number;
  spatialBlend: number; minDistance: number; maxDistance: number; rate: number;
};
registerComponent({
  type: "AudioSource",
  label: "Audio Source",
  fields: audioSourceFields,
  createDefault: () => defaultsFromFields(audioSourceFields) as AudioSourceData,
});

// The entity whose Object3D pose the spatializer treats as "the ears". Usually on the camera.
registerComponent({
  type: "AudioListener",
  label: "Audio Listener",
  fields: [],
  createDefault: () => ({}),
});

// docs/AUDIO.md §"Practical scope" — a defined extension point, not a built-in physically
// modeled reverb. Carries the zone params; a pluggable occlusion query consumes it.
const reverbZoneFields: ComponentField[] = [
  { name: "preset", type: "string", default: "room" }, // room | hall | cave | outdoor
  { name: "wet", type: "number", default: 0.3, min: 0, max: 1, step: 0.05 },
  { name: "radius", type: "number", default: 10, min: 0.5, max: 200, step: 0.5 },
];
export type ReverbZoneData = { preset: string; wet: number; radius: number };
registerComponent({
  type: "ReverbZone",
  label: "Reverb Zone",
  fields: reverbZoneFields,
  createDefault: () => defaultsFromFields(reverbZoneFields) as ReverbZoneData,
});
