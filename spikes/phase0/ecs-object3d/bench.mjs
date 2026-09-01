// Phase 0 spike benchmark — 10k entities, Object3D-backed Transform, archetype vs. naive.
//
// Run: node spikes/phase0/ecs-object3d/bench.mjs [entityCount] [frames]
//
// Measures, per frame:
//   systems  — the cost of running 4 gameplay systems over their component queries
//   matrix   — scene.updateMatrixWorld(true): the Object3D "Transform bridge" tax, i.e.
//              whether driving 10k Object3Ds per frame fights three's scene-graph internals
//   total    — systems + matrix
// then reports avg / median / p95 / max ms and the implied headroom against a 16.67 ms
// (60 fps) frame budget.

import * as THREE from "three/webgpu";
import { ArchetypeWorld, TRANSFORM } from "./archetype.mjs";
import { NaiveWorld } from "./naive.mjs";

const N = Number(process.argv[2] || 10000);
const FRAMES = Number(process.argv[3] || 900);
const WARMUP = 100;
const DT = 1 / 60;

const SCHEMAS = {
  Velocity: { fields: ["x", "y", "z"] },
  Mass: { fields: ["value"] },
  Spin: { fields: ["rate"] },
  Lifetime: { fields: ["remaining"] },
};

// Entity mix (~N): a spread of archetypes so query() has to discriminate, plus a parented
// subtree so updateMatrixWorld walks real hierarchy, not a flat list.
function composition(n) {
  return [
    { types: [TRANSFORM, "Velocity", "Mass", "Spin", "Lifetime"], frac: 0.4, parented: false },
    { types: [TRANSFORM, "Velocity", "Mass"], frac: 0.3, parented: false },
    { types: [TRANSFORM, "Spin"], frac: 0.2, parented: true },
    { types: [TRANSFORM, "Velocity", "Lifetime"], frac: 0.1, parented: false },
  ].map((g) => ({ ...g, count: Math.round(n * g.frac) }));
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// ---- archetype build + systems -------------------------------------------------

function buildArchetype(n) {
  const w = new ArchetypeWorld(SCHEMAS);
  const parents = [];
  for (let i = 0; i < Math.max(1, Math.round(n * 0.02)); i++) {
    parents.push(w.create([TRANSFORM], { [TRANSFORM]: { position: [rand(-50, 50), 0, rand(-50, 50)] } }));
  }
  for (const g of composition(n)) {
    for (let i = 0; i < g.count; i++) {
      const init = {
        [TRANSFORM]: {
          position: [rand(-100, 100), rand(0, 20), rand(-100, 100)],
          parent: g.parented ? parents[i % parents.length] : undefined,
        },
      };
      if (g.types.includes("Velocity")) init.Velocity = { x: rand(-2, 2), y: rand(-1, 1), z: rand(-2, 2) };
      if (g.types.includes("Mass")) init.Mass = { value: rand(1, 5) };
      if (g.types.includes("Spin")) init.Spin = { rate: rand(0.5, 3) };
      if (g.types.includes("Lifetime")) init.Lifetime = { remaining: rand(1, 8) };
      w.create(g.types, init);
    }
  }
  return w;
}

function stepArchetype(w, dt) {
  // Gravity: Velocity + Mass
  for (const a of w.query(["Velocity", "Mass"])) {
    const vy = a.col("Velocity", "y");
    for (let r = 0; r < a.count; r++) vy[r] -= 9.81 * dt;
  }
  // Movement: Transform + Velocity  (writes Object3D.position directly — no parallel copy)
  for (const a of w.query([TRANSFORM, "Velocity"])) {
    const vx = a.col("Velocity", "x"), vy = a.col("Velocity", "y"), vz = a.col("Velocity", "z");
    for (let r = 0; r < a.count; r++) {
      const p = a.transform[r].position;
      p.x += vx[r] * dt;
      p.y += vy[r] * dt;
      p.z += vz[r] * dt;
    }
  }
  // Spin: Transform + Spin
  for (const a of w.query([TRANSFORM, "Spin"])) {
    const rate = a.col("Spin", "rate");
    for (let r = 0; r < a.count; r++) a.transform[r].rotation.y += rate[r] * dt;
  }
  // Lifetime: decrement; on expiry do a structural change (drop Lifetime, respawn timer as
  // a fresh entity of the same archetype) so archetype moves are exercised every frame.
  const expired = [];
  for (const a of w.query(["Lifetime"])) {
    const rem = a.col("Lifetime", "remaining");
    for (let r = 0; r < a.count; r++) {
      rem[r] -= dt;
      if (rem[r] <= 0) expired.push(a.ids[r]);
    }
  }
  for (const id of expired) {
    if (w.has(id, "Lifetime")) w.setFieldById?.(id); // no-op guard
    w.removeComponent(id, "Lifetime");
    w.addComponent(id, "Lifetime", { remaining: rand(2, 8) });
  }
}

// ---- naive build + systems ---------------------------------------------------

function buildNaive(n) {
  const w = new NaiveWorld();
  const parents = [];
  for (let i = 0; i < Math.max(1, Math.round(n * 0.02)); i++) {
    parents.push(w.create(["Transform"], { Transform: { position: [rand(-50, 50), 0, rand(-50, 50)] } }));
  }
  for (const g of composition(n)) {
    for (let i = 0; i < g.count; i++) {
      const init = {
        Transform: {
          position: [rand(-100, 100), rand(0, 20), rand(-100, 100)],
          parent: g.parented ? parents[i % parents.length] : undefined,
        },
      };
      if (g.types.includes("Velocity")) init.Velocity = { x: rand(-2, 2), y: rand(-1, 1), z: rand(-2, 2) };
      if (g.types.includes("Mass")) init.Mass = { value: rand(1, 5) };
      if (g.types.includes("Spin")) init.Spin = { rate: rand(0.5, 3) };
      if (g.types.includes("Lifetime")) init.Lifetime = { remaining: rand(1, 8) };
      w.create(g.types, init);
    }
  }
  return w;
}

function stepNaive(w, dt) {
  for (const e of w.query(["Velocity", "Mass"])) e.components.get("Velocity").y -= 9.81 * dt;
  for (const e of w.query(["Transform", "Velocity"])) {
    const v = e.components.get("Velocity");
    e.object3D.position.x += v.x * dt;
    e.object3D.position.y += v.y * dt;
    e.object3D.position.z += v.z * dt;
  }
  for (const e of w.query(["Transform", "Spin"])) e.object3D.rotation.y += e.components.get("Spin").rate * dt;
  for (const e of w.query(["Lifetime"])) {
    const l = e.components.get("Lifetime");
    l.remaining -= dt;
    if (l.remaining <= 0) l.remaining = rand(2, 8); // naive path: no archetype move to make
  }
}

// ---- measurement -----------------------------------------------------------

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(label, samples) {
  const s = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((x, y) => x + y, 0) / samples.length;
  return {
    label,
    avg: +avg.toFixed(3),
    median: +pct(s, 50).toFixed(3),
    p95: +pct(s, 95).toFixed(3),
    max: +s[s.length - 1].toFixed(3),
  };
}

function run(name, build, step, n, frames) {
  const w = build(n);
  const sysMs = [];
  const mtxMs = [];
  const totMs = [];
  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    step(w, DT);
    const t1 = performance.now();
    w.scene.updateMatrixWorld(true);
    const t2 = performance.now();
    if (f >= WARMUP) {
      sysMs.push(t1 - t0);
      mtxMs.push(t2 - t1);
      totMs.push(t2 - t0);
    }
  }
  return {
    name,
    entities: w.entityCount,
    archetypes: w.archetypes ? w.archetypes.size : "n/a",
    systems: summarize("systems", sysMs),
    matrix: summarize("matrix", mtxMs),
    total: summarize("total", totMs),
  };
}

function printResult(r) {
  console.log(`\n### ${r.name}  (${r.entities} entities, archetypes: ${r.archetypes})`);
  const rows = [r.systems, r.matrix, r.total];
  console.log("  stage    avg      median   p95      max     (ms)");
  for (const x of rows) {
    console.log(
      `  ${x.label.padEnd(8)} ${String(x.avg).padEnd(8)} ${String(x.median).padEnd(8)} ${String(x.p95).padEnd(8)} ${x.max}`,
    );
  }
  const budget = 1000 / 60;
  const frac = (r.total.avg / budget) * 100;
  console.log(`  -> total avg is ${frac.toFixed(1)}% of the 16.67 ms/60fps frame budget`);
  console.log(`  -> gameplay+bridge ceiling: ~${Math.floor(1000 / r.total.avg)} fps if nothing else ran`);
}

console.log(`Phase 0 ECS-over-Object3D spike — N=${N}, frames=${FRAMES} (warmup ${WARMUP}), dt=${DT.toFixed(5)}s`);
console.log(`node ${process.version}, three r${THREE.REVISION}, platform ${process.platform} ${process.arch}`);

const arche = run("archetype ECS (SoA columns + Object3D Transform)", buildArchetype, stepArchetype, N, FRAMES);
const naive = run("naive (Map components + full-scan query, mirrors packages/runtime today)", buildNaive, stepNaive, N, FRAMES);

printResult(arche);
printResult(naive);

console.log(`\n### delta`);
console.log(`  systems avg:  archetype ${arche.systems.avg} ms  vs  naive ${naive.systems.avg} ms  (${(naive.systems.avg / arche.systems.avg).toFixed(1)}x)`);
console.log(`  total avg:    archetype ${arche.total.avg} ms  vs  naive ${naive.total.avg} ms  (${(naive.total.avg / arche.total.avg).toFixed(1)}x)`);
console.log(`  matrix avg:   archetype ${arche.matrix.avg} ms  vs  naive ${naive.matrix.avg} ms  (bridge cost is storage-independent, as expected)`);

const PASS = arche.total.p95 < 1000 / 60;
console.log(`\nGATE: archetype total p95 (${arche.total.p95} ms) < 16.67 ms  ->  ${PASS ? "PASS" : "FAIL"}`);
process.exit(PASS ? 0 : 1);
