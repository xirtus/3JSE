// @3jse/nav — grid navigation (bake, A* path + string-pull, flow field for group pathing) +
// a NavAgent component/system. Headless: bake/path/flow-field/agent all run in a vitest. A
// polygon navmesh + off-mesh links are a later step; a grid graph covers RTS/tactics/RPG AI.

export {
  bakeNavGrid,
  cellCentre,
  worldToCell,
  isWalkable,
  canStep,
  type NavGrid,
  type NavBounds,
  type NavBakeOptions,
} from "./grid.js";
export {
  findPath,
  nearestWalkable,
  buildFlowField,
  type Vec2,
  type PathOptions,
} from "./pathfind.js";
export { createNavAgentSystem } from "./systems.js";
export { NAV_RESOURCE, type NavAgentData } from "./components.js";

// Registers NavAgent as an import side effect.
import "./components.js";
