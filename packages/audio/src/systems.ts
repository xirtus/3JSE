import type { SystemDef } from "@3jse/runtime";
import type { AudioBackend, Vec3 } from "./backend.js";
import type { MixerGraph } from "./mixer.js";
import type { AudioSourceData } from "./components.js";

/**
 * Drives every `AudioSource` component against the backend, applying `mixer.effectiveGain(bus)
 * * source.volume`. A rising `playing` edge starts the clip; a falling edge stops it; while
 * playing, the resolved gain and (for spatial sources) the entity's world position are pushed
 * every tick so mixer/volume/duck changes and movement are heard live. The `AudioListener`
 * entity's pose is published to the backend as "the ears".
 *
 * Renderer-independent: everything it reads is component data + Object3D world positions — the
 * same numbers a headless mechanics check asserts (docs/REFERENCE_GAMES.md); with a NullBackend
 * the whole audio layer runs in a plain vitest.
 */
export function createAudioSystem(mixer: MixerGraph, backend: AudioBackend): SystemDef {
  const wasPlaying = new Map<string, boolean>();
  const lastBus = new Map<string, string>();

  return {
    name: "AudioSystem",
    stage: "late",
    query: [], // needs to see both AudioSource and AudioListener entities
    run: (entities) => {
      // listener first
      for (const e of entities) {
        if (!e.hasComponent("AudioListener") || !e.object3D) continue;
        const p = e.object3D.position;
        // -Z is forward for an Object3D at identity rotation; good enough without decomposing quats
        backend.setListener({ x: p.x, y: p.y, z: p.z }, forwardOf(e.object3D));
        break;
      }

      for (const e of entities) {
        const src = e.getComponent<AudioSourceData>("AudioSource");
        if (!src) continue;
        const handle = e.id;
        const was = wasPlaying.get(handle) ?? false;
        const gain = mixer.effectiveGain(src.bus) * clamp01(src.volume);
        const pos: Vec3 | undefined =
          src.spatialBlend > 0 && e.object3D
            ? { x: e.object3D.position.x, y: e.object3D.position.y, z: e.object3D.position.z }
            : undefined;

        if (src.playing && !was) {
          backend.play(handle, {
            clip: src.clip,
            gain,
            loop: src.loop,
            position: pos,
            spatialBlend: src.spatialBlend,
            minDistance: src.minDistance,
            maxDistance: src.maxDistance,
            rate: src.rate,
          });
          mixer.noteActive(src.bus, true);
          lastBus.set(handle, src.bus);
        } else if (!src.playing && was) {
          backend.stop(handle);
          mixer.noteActive(lastBus.get(handle) ?? src.bus, false);
        } else if (src.playing && was) {
          backend.setGain(handle, gain);
          if (pos) backend.setPosition(handle, pos);
        }
        wasPlaying.set(handle, src.playing);
      }

      // drop bookkeeping for despawned sources
      for (const id of [...wasPlaying.keys()]) {
        if (!entities.some((e) => e.id === id)) {
          if (wasPlaying.get(id)) {
            backend.stop(id);
            mixer.noteActive(lastBus.get(id) ?? "SFX", false);
          }
          wasPlaying.delete(id);
          lastBus.delete(id);
        }
      }
    },
  };
}

function forwardOf(obj: { rotation: { y: number } }): Vec3 {
  return { x: -Math.sin(obj.rotation.y), y: 0, z: -Math.cos(obj.rotation.y) };
}
function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
