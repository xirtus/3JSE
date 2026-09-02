import { registerComponent, type SystemDef } from "@3jse/runtime";
import { ParticlePool, type EmitterDef } from "./system.js";

// A ParticleEmitter names a registered EmitterDef and whether it's currently emitting. The
// EmitterDef library is a resource, not per-entity data (defs are shared, like Sequences).

registerComponent({
  type: "ParticleEmitter",
  label: "Particle Emitter",
  fields: [
    { name: "emitter", type: "string", default: "" },
    { name: "emitting", type: "boolean", default: true },
    { name: "burstOnStart", type: "boolean", default: false },
  ],
  createDefault: () => ({ emitter: "", emitting: true, burstOnStart: false }),
});

export type ParticleEmitterData = { emitter: string; emitting: boolean; burstOnStart: boolean };

/**
 * Drives every `ParticleEmitter` entity: one ParticlePool per entity, stepped each tick from
 * the entity's world position, emitting only while `emitting` is true. Headless — the pools'
 * `buffers()` feed a Points/InstancedMesh in the editor; here a test asserts the counts.
 */
export type ParticleSystemDef = SystemDef & { pools: Map<string, ParticlePool> };

export function createParticleSystem(emitters: Record<string, EmitterDef>): ParticleSystemDef {
  const pools = new Map<string, ParticlePool>();
  const bursted = new Set<string>();

  const system: ParticleSystemDef = {
    name: "ParticleSystem",
    stage: "late",
    query: ["ParticleEmitter"],
    pools,
    run: (entities, { dt }) => {
      const seen = new Set<string>();
      for (const e of entities) {
        seen.add(e.id);
        const data = e.getComponent<ParticleEmitterData>("ParticleEmitter");
        if (!data) continue;
        const def = emitters[data.emitter];
        if (!def) continue;

        let pool = pools.get(e.id);
        if (!pool || pool.def !== def) {
          pool = new ParticlePool(def);
          pools.set(e.id, pool);
          bursted.delete(e.id);
        }
        const origin: [number, number, number] = e.object3D
          ? [e.object3D.position.x, e.object3D.position.y, e.object3D.position.z]
          : [0, 0, 0];

        if (data.burstOnStart && def.burst && !bursted.has(e.id)) {
          pool.emit(def.burst, origin);
          bursted.add(e.id);
        }
        // step always (so live particles keep integrating), but suppress new emission when off
        const rate = data.emitting ? dt : 0;
        pool.step(rate, origin);
      }
      for (const id of [...pools.keys()]) if (!seen.has(id)) { pools.delete(id); bursted.delete(id); }
    },
  };
  return system;
}
