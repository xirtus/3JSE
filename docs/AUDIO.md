# Audio

## Foundation

Built on the Web Audio API via Three.js's existing `Audio`/`PositionalAudio` and `AudioListener` — spatialization, distance attenuation, and doppler are Three.js/Web-Audio-native, not reimplemented. `@3jse/audio` adds the mixing, event, and authoring layer around them.

## Mixer

A bus-graph model (Master → categories: Music, SFX, Voice, UI, Ambience, each independently volume/effect-controllable), authored in Project Settings (`EDITOR.md`) and addressable from both TypeScript and 3JSE Graph. Buses map to Web Audio `GainNode`/effect-node chains under the hood; ducking (lower Music when Voice plays) is a bus-level rule, not something each sound designer wires by hand per clip.

## AudioSource as a Component

Sound playback is a Component (`AudioSource`: clip reference, bus, loop, spatial-blend, min/max distance) exactly like everything else in `ENTITY_COMPONENT_MODEL.md` — inspectable, and controllable from 3JSE Graph nodes (`PlaySound`, `StopSound`, `SetVolume`) that are thin wrappers over the same API a TypeScript system would call, per the pattern established in `GAMEPLAY_FRAMEWORK.md`.

## Event-driven triggering

Sounds are triggered from 3IR events, not hardcoded into gameplay systems — a footstep sync node from `ANIMATION.md`, a `Health.onDamaged` event from `GAMEPLAY_FRAMEWORK.md`, a `OnTriggerEnter` from `VISUAL_SCRIPTING.md`'s worked example all connect to a `PlaySound` node the same way. This keeps sound design editable by wiring, not by finding and modifying the gameplay code that happens to also play a sound.

## Practical scope

Occlusion/reverb-zone modeling (a room-aware reverb graph keyed to level geometry) is a defined extension point (`@3jse/audio` exposes a `ReverbZone` component and a pluggable occlusion query) rather than a built-in physically-modeled solution in early phases — see `ROADMAP.md` for when deeper acoustic modeling is revisited. Audio asset import (compression, format normalization) is handled by the Asset Pipeline (`ASSET_PIPELINE.md`), not duplicated here.
