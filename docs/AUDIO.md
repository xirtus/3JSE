# Audio

## Foundation

Built on the Web Audio API via Three.js's existing `Audio`/`PositionalAudio` and `AudioListener` — spatialization, distance attenuation, and doppler are Three.js/Web-Audio-native, not reimplemented. `@3jse/audio` adds the mixing, event, and authoring layer around them.

## Mixer

A bus-graph model (Master → categories: Music, SFX, Voice, UI, Ambience, each independently volume/effect-controllable), authored in Project Settings (`EDITOR.md`) and addressable from both TypeScript and 3JSE Graph. Buses map to Web Audio `GainNode`/effect-node chains under the hood; ducking (lower Music when Voice plays) is a bus-level rule, not something each sound designer wires by hand per clip.

## AudioSource as a Component

Sound playback is a Component (`AudioSource`: clip reference, bus, loop, spatial-blend, min/max distance) exactly like everything else in `ENTITY_COMPONENT_MODEL.md` — inspectable, and controllable from 3JSE Graph nodes (`PlaySound`, `StopSound`, `SetVolume`) that are thin wrappers over the same API a TypeScript system would call, per the pattern established in `GAMEPLAY_FRAMEWORK.md`.

## Event-driven triggering

Sounds are triggered from 3IR events, not hardcoded into gameplay systems — a footstep sync node from `ANIMATION.md`, a `Health.onDamaged` event from `GAMEPLAY_FRAMEWORK.md`, a `OnTriggerEnter` from `VISUAL_SCRIPTING.md`'s worked example all connect to a `PlaySound` node the same way. This keeps sound design editable by wiring, not by finding and modifying the gameplay code that happens to also play a sound.

## Generative audio — gameplay *is* the score

The event-driven model above has a proven far end, demonstrated by three reference games (`REFERENCE_GAMES.md`): **PULSEHOP** rebuilds Q*bert as a musical instrument — every hop quantized to a 16th-note grid, tiles mapped to scale degrees, combos fading in groove layers (kick/hats/snare/bass/echo arps), board clear as a cadence — with Web MIDI out (lead/chords/bass/drums + MIDI clock) and an OSC-over-WebSocket bridge so the game literally sequences a DAW. **ZENDRIVE** runs a generative vaporwave engine that *listens to driving state*: speed opens the filter and thickens the arp, drifting bends the tape, checkpoints ring FM bells. **MANDELHOP** uses its generative score as *progression*: hops climb a pentatonic ladder, biome crossings swell, enemy telegraphs glissando, checkpoints resolve the phrase, and rhythm-chained landings enter a flow state with generative percussion and score ×2 — all synthesized, no recordings. 3JSE's audio layer should therefore treat the mixer/event model as the *plumbing* and ship two additional first-class surfaces: (1) a **sequencer/quantizer** — gameplay events quantized to a musical grid with scale/root/BPM per level, so audio directors can be authored in 3JSE Graph and FeelSpec; and (2) a **MIDI/OSC out bridge** as a standard audio device, because "the game composes a DAW" is a shipping feature, not a debug tool.

## Practical scope

Occlusion/reverb-zone modeling (a room-aware reverb graph keyed to level geometry) is a defined extension point (`@3jse/audio` exposes a `ReverbZone` component and a pluggable occlusion query) rather than a built-in physically-modeled solution in early phases — see `ROADMAP.md` for when deeper acoustic modeling is revisited. Audio asset import (compression, format normalization) is handled by the Asset Pipeline (`ASSET_PIPELINE.md`), not duplicated here.
