import { registerComponent } from "@3jse/runtime";

/** A marker component — no fields, its presence is the whole signal. Tags an Entity as
 *  belonging in a save snapshot (docs/GAMEPLAY_FRAMEWORK.md's SaveGame row: "snapshot of tagged
 *  Components to a save slot" — Saveable *is* the tag). SaveService.captureSnapshot() saves the
 *  Entity's full state (Transform + every current Component, via @3jse/runtime's
 *  serializeEntity — the same serialization Prefab.ts uses) for any Entity carrying this,
 *  nothing more selective than that for this first pass. */
registerComponent({
  type: "Saveable",
  label: "Saveable",
  fields: [],
  createDefault: () => ({}),
});
