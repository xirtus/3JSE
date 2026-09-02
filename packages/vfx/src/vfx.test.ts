import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import {
  ParticlePool, createParticleSystem, sampleCurve, sampleGradient,
  type EmitterDef,
} from "./index.js";
import "./components.js";

const def: EmitterDef = {
  maxParticles: 100,
  rate: 50,
  burst: 20,
  life: { min: 1, max: 1 },
  speed: { min: 5, max: 5 },
  direction: [0, 1, 0],
  spread: 0,
  gravity: [0, -10, 0],
  drag: 0,
  sizeOverLife: [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }],
  colorOverLife: [{ t: 0, color: [1, 1, 0] }, { t: 1, color: [1, 0, 0] }],
  seed: 7,
};

describe("curve + gradient", () => {
  it("sampleCurve is piecewise-linear and clamps at the ends", () => {
    const k = [{ t: 0, v: 2 }, { t: 1, v: 4 }];
    expect(sampleCurve(k, -1)).toBe(2);
    expect(sampleCurve(k, 0.5)).toBe(3);
    expect(sampleCurve(k, 2)).toBe(4);
  });
  it("sampleGradient interpolates per channel", () => {
    const g = [{ t: 0, color: [0, 0, 0] as [number, number, number] }, { t: 1, color: [1, 1, 1] as [number, number, number] }];
    expect(sampleGradient(g, 0.25)).toEqual([0.25, 0.25, 0.25]);
  });
});

describe("ParticlePool", () => {
  it("emits a burst, integrates under gravity, and kills expired particles", () => {
    const p = new ParticlePool({ ...def, rate: 0 }); // no continuous emission for this test
    p.emit(20, [0, 0, 0]);
    expect(p.count).toBe(20);

    for (let i = 0; i < 12; i++) p.step(1 / 60); // 0.2s: up at speed 5, gravity -10
    const b = p.buffers();
    expect(b.positions[1]).toBeGreaterThan(0); // rose
    expect(b.positions.length).toBe(p.count * 3);

    for (let i = 0; i < 120; i++) p.step(1 / 60); // past life (1s) -> all dead
    expect(p.count).toBe(0);
  });

  it("continuous rate spawns ~rate*dt per step, capped at maxParticles", () => {
    const p = new ParticlePool({ ...def, life: { min: 100, max: 100 }, rate: 50 });
    for (let i = 0; i < 60; i++) p.step(1 / 60); // 1s @ 50/s -> ~50
    expect(p.count).toBeGreaterThanOrEqual(48);
    expect(p.count).toBeLessThanOrEqual(52);
    for (let i = 0; i < 600; i++) p.step(1 / 60);
    expect(p.count).toBe(100); // capped
  });

  it("is deterministic for a given seed (varying emitter)", () => {
    const varying: EmitterDef = { ...def, spread: 0.6, speed: { min: 3, max: 9 }, life: { min: 0.8, max: 1.5 } };
    const a = new ParticlePool(varying);
    const b = new ParticlePool({ ...varying });
    for (let i = 0; i < 30; i++) { a.step(1 / 60); b.step(1 / 60); }
    expect(a.buffers().positions).toEqual(b.buffers().positions);
    const c = new ParticlePool({ ...varying, seed: 8 });
    for (let i = 0; i < 30; i++) c.step(1 / 60);
    expect(c.buffers().positions).not.toEqual(a.buffers().positions);
  });

  it("spread 0 sends every particle along `direction`; spread PI fills a sphere", () => {
    const line = new ParticlePool({ ...def, spread: 0, rate: 0 });
    line.emit(10);
    const lb = line.buffers();
    for (let i = 0; i < line.count; i++) {
      // velocity is +Y only -> after a tiny step, x and z stay ~0
      expect(Math.abs(lb.positions[i * 3]!)).toBeLessThan(1e-6);
    }
    const sphere = new ParticlePool({ ...def, spread: Math.PI, rate: 0 });
    sphere.emit(50);
    sphere.step(0.1);
    const sb = sphere.buffers();
    let anyX = false;
    for (let i = 0; i < sphere.count; i++) if (Math.abs(sb.positions[i * 3]!) > 0.1) anyX = true;
    expect(anyX).toBe(true);
  });
});

describe("createParticleSystem", () => {
  it("drives a ParticleEmitter entity from its world position; burstOnStart fires once", () => {
    const world = new World();
    const sys = createParticleSystem({ spark: def });
    world.scheduler.register(sys);
    const level = world.createLevel("L");
    const e = level.createEntity("FX");
    e.object3D!.position.set(3, 1, 0);
    e.addComponent("ParticleEmitter", { emitter: "spark", emitting: true, burstOnStart: true });

    world.step(1 / 60);
    const pool = sys.pools.get(e.id)!;
    // burst 20 + ~1 from rate 50 * (1/60)
    expect(pool.count).toBeGreaterThanOrEqual(20);
    const b = pool.buffers();
    // spawned at the entity's position
    expect(b.positions[0]).toBeCloseTo(3, 5);

    // toggle emitting off -> count stops growing (existing particles still integrate)
    e.getComponent<Record<string, unknown>>("ParticleEmitter")!.emitting = false;
    const before = pool.count;
    for (let i = 0; i < 10; i++) world.step(1 / 60);
    expect(pool.count).toBeLessThanOrEqual(before);
  });
});
