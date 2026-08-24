# Networking

## Scope and honesty up front

This document covers **gameplay networking** — client/server multiplayer for a shipped game — which is a separate concern from editor collaboration (`EDITOR.md` uses Git, not a live sync layer). It also deliberately does not promise deterministic lockstep networking: `RUNTIME.md` is explicit that 3JSE's fixed-step simulation is per-machine deterministic, not cross-platform bit-exact, so 3JSE's default networking model is **state replication with server authority**, the same category of approach Unity, Unreal, and most shipped web multiplayer games actually use — not rollback-netcode-by-default, which is a specialized, higher-cost model better left to a dedicated plugin for the genres that truly need it (fast-paced competitive action).

## Why replication fits the object model without extra machinery

Because gameplay state already lives in typed, schema-declared Components (`ENTITY_COMPONENT_MODEL.md`), replication is "which Components, on which Entities, does this connection need diffs for" — not a parallel serialization system bolted on afterward. A Component opts into replication by a schema flag; `@3jse/networking` then:

1. Tracks per-field dirty state each tick (cheap, since Component storage is already columnar — `ENTITY_COMPONENT_MODEL.md`).
2. Serializes only changed fields, per-connection, at a configurable send rate.
3. Interpolates/extrapolates on receiving clients for smooth motion between updates (standard snapshot interpolation), with per-Component override for fields that should snap instead of interpolate (e.g. discrete state like `AnimationState`).

## Authority model

- **Server-authoritative by default**: gameplay-affecting Systems (damage, inventory changes, physics resolution for contested objects) run only where a Component/Entity's `authority` field says they should — typically the server, or the current owning client for locally-predicted objects (the player's own CharacterController).
- **Client-side prediction + reconciliation** for the locally-controlled player: input is applied immediately client-side for responsiveness, corrected against the authoritative server snapshot when it arrives, using standard input-buffering/replay-on-correction — implemented once in `@3jse/networking`'s `PredictedController` behavior, not something every game reimplements.
- **RPCs**: 3JSE Graph exposes `IsServer`/`IsClient` guard nodes and RPC call/receive nodes (`VISUAL_SCRIPTING.md`) for one-off events (a fired weapon, a chat message) that don't fit the continuous-Component-diff model.

## Transport

WebSocket by default (broad compatibility, simplest server deployment); WebRTC data channels as a plugin-swappable transport for lower-latency peer-to-peer or client-server setups where an SFU/relay is available. The transport is an interface `@3jse/networking` depends on, not a hardcoded assumption — this is the same "wrap, adopt, don't build a novel protocol" posture the physics engine choice takes (`PHYSICS.md`, `PLUGIN_ARCHITECTURE.md`).

## What ships as core vs. plugin

`@3jse/networking` provides the replication core, the authority model, and RPC nodes — enough for the Multiplayer template (`TEMPLATES.md`) to work out of the box for a small-session co-op or arena game. Matchmaking, dedicated-server orchestration/scaling, and rollback netcode for competitive-action genres are explicitly **not** core — they're documented extension points for community or official plugins once real usage patterns from Phase 3–4 projects (`ROADMAP.md`) show which of them are worth standardizing.
