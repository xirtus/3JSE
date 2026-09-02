import { registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";

// A NavAgent follows a path toward `targetX/Z`, re-pathing when the target moves. The nav grid
// itself is a World Resource (NAV_RESOURCE), not per-entity data.

const navAgentFields: ComponentField[] = [
  { name: "speed", type: "number", default: 3, min: 0, max: 30, step: 0.5 },
  { name: "arriveRadius", type: "number", default: 0.4, min: 0.05, max: 5, step: 0.05 },
  { name: "targetX", type: "number", default: 0 },
  { name: "targetZ", type: "number", default: 0 },
  { name: "hasTarget", type: "boolean", default: false },
  { name: "repathIntervalMs", type: "number", default: 400, min: 0, max: 5000, step: 50 },
];
export type NavAgentData = {
  speed: number; arriveRadius: number; targetX: number; targetZ: number;
  hasTarget: boolean; repathIntervalMs: number;
};
registerComponent({
  type: "NavAgent",
  label: "Nav Agent",
  fields: navAgentFields,
  createDefault: () => defaultsFromFields(navAgentFields) as NavAgentData,
});

export const NAV_RESOURCE = "NavGrid";
