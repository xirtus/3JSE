// CPU particle simulation (docs/EDITOR.md Particle Editor). SoA arrays, seeded + deterministic,
// headless. `emitterToBuffers` packs to Float32Arrays for a Points/InstancedMesh; a GPU
// compute path (three-vfx, vendored in @3jse/extras) is the drop-in for big counts.

import { sampleCurve, sampleGradient, type CurveKey, type GradientKey } from "./curve.js";

export interface EmitterDef {
  maxParticles: number;
  /** continuous emission, particles/second */
  rate: number;
  /** one-off burst emitted at spawn / on trigger */
  burst?: number;
  life: { min: number; max: number };
  /** initial speed along a cone around `direction` */
  speed: { min: number; max: number };
  direction: [number, number, number];
  /** cone half-angle, radians (0 = straight line, PI = full sphere) */
  spread: number;
  gravity: [number, number, number];
  /** velocity *= (1 - drag*dt) each step */
  drag: number;
  sizeOverLife: CurveKey[];
  colorOverLife: GradientKey[];
  seed: number;
}

interface Fields {
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  age: Float32Array; life: Float32Array;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One live particle system for one emitter. */
export class ParticlePool {
  private readonly f: Fields;
  private readonly rand: () => number;
  private _count = 0;
  private carry = 0; // fractional particles owed by `rate`

  constructor(readonly def: EmitterDef) {
    const n = def.maxParticles;
    this.f = {
      px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
      age: new Float32Array(n), life: new Float32Array(n),
    };
    this.rand = mulberry32(def.seed);
  }

  get count(): number {
    return this._count;
  }

  /** Emit `n` particles from `origin` (respecting maxParticles). */
  emit(n: number, origin: [number, number, number] = [0, 0, 0]): void {
    const d = this.def;
    const dir = normalize(d.direction);
    for (let i = 0; i < n && this._count < d.maxParticles; i++) {
      const idx = this._count++;
      const f = this.f;
      f.px[idx] = origin[0]; f.py[idx] = origin[1]; f.pz[idx] = origin[2];
      const [sx, sy, sz] = coneDir(dir, d.spread, this.rand);
      const sp = lerp(d.speed.min, d.speed.max, this.rand());
      f.vx[idx] = sx * sp; f.vy[idx] = sy * sp; f.vz[idx] = sz * sp;
      f.age[idx] = 0;
      f.life[idx] = lerp(d.life.min, d.life.max, this.rand());
    }
  }

  /** Advance the sim by `dt`, spawning at `rate` from `origin`, integrating, and compacting out
   *  dead particles (swap-remove). */
  step(dt: number, origin: [number, number, number] = [0, 0, 0]): void {
    const d = this.def;
    this.carry += d.rate * dt;
    const toSpawn = Math.floor(this.carry);
    this.carry -= toSpawn;
    if (toSpawn > 0) this.emit(toSpawn, origin);

    const f = this.f;
    const dragK = Math.max(0, 1 - d.drag * dt);
    for (let i = 0; i < this._count; ) {
      f.age[i]! += dt;
      if (f.age[i]! >= f.life[i]!) {
        // swap-remove
        const last = --this._count;
        for (const key of Object.keys(f) as (keyof Fields)[]) f[key][i] = f[key][last]!;
        continue;
      }
      f.vx[i]! = (f.vx[i]! + d.gravity[0] * dt) * dragK;
      f.vy[i]! = (f.vy[i]! + d.gravity[1] * dt) * dragK;
      f.vz[i]! = (f.vz[i]! + d.gravity[2] * dt) * dragK;
      f.px[i]! += f.vx[i]! * dt;
      f.py[i]! += f.vy[i]! * dt;
      f.pz[i]! += f.vz[i]! * dt;
      i++;
    }
  }

  /** Per-particle render buffers, resolving size/color over life. */
  buffers(): { positions: Float32Array; sizes: Float32Array; colors: Float32Array } {
    const n = this._count;
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    const f = this.f;
    for (let i = 0; i < n; i++) {
      positions[i * 3] = f.px[i]!;
      positions[i * 3 + 1] = f.py[i]!;
      positions[i * 3 + 2] = f.pz[i]!;
      const lt = f.age[i]! / (f.life[i]! || 1);
      sizes[i] = sampleCurve(this.def.sizeOverLife, lt);
      const c = sampleGradient(this.def.colorOverLife, lt);
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
    }
    return { positions, sizes, colors };
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function normalize([x, y, z]: [number, number, number]): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
/** A random direction within `spread` radians of `dir`. */
function coneDir(dir: [number, number, number], spread: number, rand: () => number): [number, number, number] {
  const cosA = 1 - rand() * (1 - Math.cos(spread));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const phi = rand() * Math.PI * 2;
  // build a basis around dir
  const up: [number, number, number] = Math.abs(dir[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const t = normalize(cross(up, dir));
  const b = cross(dir, t);
  return normalize([
    dir[0] * cosA + (t[0] * Math.cos(phi) + b[0] * Math.sin(phi)) * sinA,
    dir[1] * cosA + (t[1] * Math.cos(phi) + b[1] * Math.sin(phi)) * sinA,
    dir[2] * cosA + (t[2] * Math.cos(phi) + b[2] * Math.sin(phi)) * sinA,
  ]);
}
function cross(a: [number, number, number], c: [number, number, number]): [number, number, number] {
  return [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
}
