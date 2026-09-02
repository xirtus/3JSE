// @3jse/foliage — deterministic scatter that turns a field boundary + density into
// InstancedMesh instance data (BUILD_TASKS.md 5.1). "The field is authoritative; everything
// inside it is derived" — a forest exists anywhere with no painted data stored. Headless.

export {
  scatterArea,
  toInstanceMatrices,
  type ScatterArea,
  type ScatterConstraints,
  type ScatterOptions,
  type Instance,
} from "./scatter.js";
