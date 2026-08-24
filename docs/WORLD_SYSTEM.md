# World System

## The deliberate non-assumption

3JSE does not assume every game is a giant seamless open world, and does not assume every game is a single tiny scene either. The World system is built so a tiny arcade game, a linear level-select game (Crash Bandicoot-style), a sector-based game (KOTOR-style discrete zones with loading transitions), a large streamed environment, and an interconnected multi-space project (Roblox/UEFN-style hub-and-experiences) are all the *same* underlying mechanism configured differently — not five separate features.

## Vocabulary recap and extension

`ENTITY_COMPONENT_MODEL.md` defines **World** (the runtime container) and **Level** (a serializable unit of Entities). This document specifies how multiple Levels compose:

- **Sublevel**: a Level that streams in/out as a unit alongside a persistent base Level — the standard technique for both "large environment split into loadable chunks" and "hub level with an optional decoration layer."
- **Sector**: a named group of sublevels that stream together, with defined transition triggers (volume-based, portal-based, or explicit loading-screen). This is what a KOTOR-style discrete-zone game configures: each planet/area is a sector, transitions are explicit loads rather than seamless streaming.
- **Portal**: a paired trigger volume between two Levels/sectors — either a hard transition (loading screen) or, where budgets allow, a seamless streamed handoff (both sides loaded briefly, camera crosses, far side unloads).
- **World Partition** (large open worlds): automatic grid-based sublevel generation from a single authored large Level, streamed by camera-distance, analogous to Unreal's World Partition but implemented as an authoring-time *cell splitter* over ordinary sublevels rather than a distinct runtime concept — a large-world project is still "a base Level plus streamed sublevels," just with the sublevel boundaries computed instead of hand-drawn.
- **Persistent World State**: state that survives a Level unloading — inventory, quest flags, defeated-enemy markers — lives on `@3jse/save`'s tagged-Component persistence (`GAMEPLAY_FRAMEWORK.md`) keyed by a stable id, not on the Level itself, specifically so it survives the Level being unloaded and reloaded (or never having been loaded again at all, for a "defeated enemies don't respawn" pattern).

## How each use case configures the same mechanism

| Game shape | Configuration |
|---|---|
| Tiny arcade game | One World, one Level, no streaming, no sectors |
| Linear level-select (Crash Bandicoot-style) | One World, N Levels, hard transitions between them via a level-select Resource, no sublevel streaming needed |
| Sector-based (KOTOR-style) | One World, sectors = discrete zones, portal-triggered hard transitions with a loading Level shown during the swap |
| Large streamed environment | One World, one authored Level auto-split into a World Partition grid of sublevels, camera-distance streaming |
| Interconnected multi-space (Roblox/UEFN-style) | One persistent "hub" World/Level plus independently-loadable "experience" Levels, each with its own Entities but sharing player-identity/inventory state via `@3jse/save`'s cross-Level persistence |

## Multiple open Levels in the editor

The Editor (`EDITOR.md`) supports multiple Levels open simultaneously — the same runtime capability that enables sublevel streaming lets a level designer edit a sublevel in isolation or in the context of its neighbors loaded read-only around it, without a separate "isolation mode" needing to be built as a distinct feature.

## Input contexts

Per-Level (or per-sector) **input context** stacking is part of the World system rather than a separate system: entering a vehicle, a dialogue, or a menu pushes an input context that remaps or blocks actions without the underlying `InputManager` (`GAMEPLAY_FRAMEWORK.md`) needing per-game special-casing — a natural fit for World-level transitions (entering a sector-specific minigame area, for instance) as well as gameplay-state transitions within one Level.
