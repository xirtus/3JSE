# Project Format

## Requirements, restated as constraints

A 3JSE project must be readable, inspectable, Git-friendly, diffable, portable, and recoverable without the editor. Every choice below is in service of those six words specifically — none of them are negotiable trade-offs against "but a binary format would be faster," because none of the operations that matter (load time, editor responsiveness) actually require a binary project format to hit their targets; the runtime's in-memory representation, not the on-disk format, is what performance-sensitive code touches.

## Directory layout

```
/project
  /assets            imported source assets (meshes, textures, audio, fonts)
  /scenes            Level files
  /prefabs           Prefab files
  /graphs            3JSE Graph files (.3jgraph)
  /materials         Material Graph files
  /scripts           hand-written TypeScript systems/components
  /systems           compiled output when a Graph is "ejected" to code (GAMEPLAY_IR.md)
  /ui                UI/HUD layout files
  /audio             audio-specific config (mixer buses, not raw clips — those live in /assets)
  /plugins           project-local plugin packages (not published to a registry)
  project.json       engine version, dependencies, build targets, quality tiers
```

This is the literal structure the brief specifies, because it already matches how a working software project is organized — there's no reason to deviate from it for novelty's sake.

## Serialization rules

- **Deterministic key ordering.** Every serializer writes object keys in a fixed, schema-defined order (never object-insertion order, never alphabetical-by-accident) — this is what keeps a trivial value change producing a one-line diff instead of a reshuffled file.
- **Stable IDs, not array position.** Entities, Components, and graph nodes are referenced by a stable ID (ULID-style: sortable, collision-resistant, generated once at creation), never by array index — reordering a list in the editor must never look like every element changed in the diff.
- **Human-readable JSON**, pretty-printed with a fixed indent, not minified and not a binary pack format — this is the direct implementation of "readable, diffable, recoverable without the editor": any text editor, and any AI agent's plain file-read tool, can open a scene file and understand it.
- **Large binary payloads stay binary, referenced by path/hash** — a texture or a mesh's binary data doesn't belong inlined into a JSON scene file; the scene file stores a reference (`asset://<hash>`), and the asset itself sits under `/assets` as its native binary format, which is both the correct diff granularity (a texture re-export shows as one changed binary file, not a giant base64 diff) and how Git's own binary-diffing (or Git LFS, for large asset sets) is meant to be used.

## Example: a Level file (abbreviated)

```json
{
  "kind": "Level",
  "id": "01J8Z…",
  "name": "MainMenu",
  "entities": [
    {
      "id": "01J8ZA…",
      "name": "Player",
      "components": {
        "Transform": { "position": [0, 1, 0], "rotation": [0, 0, 0, 1] },
        "CharacterController": { "maxSpeed": 6, "jumpHeight": 1.4 },
        "Health": { "current": 100, "max": 100 }
      }
    }
  ]
}
```

This is exactly the shape shown in `ENTITY_COMPONENT_MODEL.md` for a single Entity — a Level file is simply a list of these plus level-scoped settings (environment, sublevel references from `WORLD_SYSTEM.md`). There is deliberately no separate "runtime scene format" a build step converts this into beyond the ordinary bundling described in `BUILD_DEPLOYMENT.md` — the same JSON structure that's diffable in a PR is what the runtime loads (parsed once at Level-load, not re-parsed per frame).

## Recoverability without the editor

Because every file is plain JSON (or a native binary asset format loaders elsewhere already understand) under a conventional directory tree, a developer who has lost access to 3JSE entirely can still: read exactly what a scene contained, hand-edit a Component value with a text editor, and — because `@3jse/runtime` is a normal npm package with no editor dependency (`RUNTIME.md`) — write a small script that loads the project's `project.json` and boots the game with no editor installed at all. The project file format's only real dependency is the schema definitions published by whichever `@3jse/*` packages the project uses, which are themselves versioned, published packages, not editor-internal state.

## Git workflow implications

This format is what makes `EDITOR.md`'s Git-based collaboration model (rather than live CRDT co-editing) actually viable day-to-day: two developers' changes to different Entities in the same Level file produce a clean line-level merge in the overwhelming common case, and a genuine conflict (both editing the same Component's same field) shows up as an ordinary, human-resolvable Git conflict marker in readable JSON — not a binary merge failure requiring the editor to arbitrate.
