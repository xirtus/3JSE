import { registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";

// Authoring components the editor Viewport (and a shipped bootstrap) read to drive the
// renderers. The generation params live here; @3jse/terrain / @3jse/foliage do the work.

const terrainFields: ComponentField[] = [
  { name: "seed", type: "number", default: 7, min: 1, max: 9999, step: 1 },
  { name: "chunkSize", type: "number", default: 32, min: 8, max: 256, step: 8 },
  { name: "ring", type: "number", default: 2, min: 1, max: 6, step: 1 },
  { name: "baseResolution", type: "number", default: 16, min: 4, max: 64, step: 4 },
  { name: "heightScale", type: "number", default: 6, min: 0, max: 200, step: 1 },
  { name: "frequency", type: "number", default: 0.04, min: 0.001, max: 0.5, step: 0.001 },
];
export type TerrainData = {
  seed: number; chunkSize: number; ring: number; baseResolution: number; heightScale: number; frequency: number;
};
registerComponent({
  type: "Terrain",
  label: "Terrain",
  fields: terrainFields,
  createDefault: () => defaultsFromFields(terrainFields) as TerrainData,
});

const foliageFields: ComponentField[] = [
  { name: "species", type: "string", default: "grass" },
  { name: "seed", type: "number", default: 5, min: 1, max: 9999, step: 1 },
  { name: "density", type: "number", default: 0.5, min: 0, max: 8, step: 0.1 },
  { name: "areaSize", type: "number", default: 60, min: 4, max: 500, step: 4 }, // square, centred on the entity
  { name: "slopeMax", type: "number", default: 0.7, min: 0, max: 1.57, step: 0.05 },
];
export type FoliageFieldData = { species: string; seed: number; density: number; areaSize: number; slopeMax: number };
registerComponent({
  type: "FoliageField",
  label: "Foliage Field",
  fields: foliageFields,
  createDefault: () => defaultsFromFields(foliageFields) as FoliageFieldData,
});
