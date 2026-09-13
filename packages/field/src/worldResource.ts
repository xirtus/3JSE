// Runtime wiring: the causal field is a World Resource (like @3jse/nav's NavGrid),
// not per-entity data. attachCausalField stores it on a @3jse/runtime World so a
// game attaches one authoritative field and every consumer (renderer, contact,
// VFX/audio, agent) samples it through the same source. Headless: no renderer or
// scene graph is involved.

import type { World } from "@3jse/runtime";
import type { WorldField } from "./field.js";

export const CAUSAL_FIELD_RESOURCE = "CausalField";

/** Store the authoritative field on a World. One field per world is the doctrine. */
export function attachCausalField(world: World, field: WorldField): void {
  world.setResource(CAUSAL_FIELD_RESOURCE, field);
}

export function getCausalField(world: World): WorldField | undefined {
  return world.getResource<WorldField>(CAUSAL_FIELD_RESOURCE);
}
