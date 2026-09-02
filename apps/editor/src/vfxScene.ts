import { createParticleSystem, type EmitterDef } from "@3jse/vfx";

/** The editor's shared particle-emitter library + the one ParticleSystem instance. sampleScene
 *  registers the system and tags entities; Viewport reads `particleSystem.pools` to render. */
export const emitters: Record<string, EmitterDef> = {
  sparks: {
    maxParticles: 300,
    rate: 90,
    burst: 0,
    life: { min: 0.8, max: 1.6 },
    speed: { min: 1.5, max: 3.5 },
    direction: [0, 1, 0],
    spread: 0.7,
    gravity: [0, -2.5, 0],
    drag: 0.5,
    sizeOverLife: [{ t: 0, v: 0 }, { t: 0.15, v: 1 }, { t: 1, v: 0 }],
    colorOverLife: [{ t: 0, color: [1, 0.95, 0.5] }, { t: 0.5, color: [1, 0.45, 0.1] }, { t: 1, color: [0.35, 0.25, 0.4] }],
    seed: 4242,
  },
};

export const particleSystem = createParticleSystem(emitters);
