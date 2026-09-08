// Experiment 07 — Bounded agent field ops (plan §22). Agents operate on the field
// through a small typed command surface (PhysTalk lesson): query / sample /
// describe / setState / addHeat / addMoisture / applyForce / paintResponse /
// inspectUncertainty / captureState. No raw buffer access, no `SetTreeOnFire`.
// Agents describe causes and constraints; the field determines consequences.

import {
  AABB,
  cellCount,
  cellPosition,
  createChunk,
  createWorldField,
  queryField,
  readChannel,
  sampleField,
  serializeChunk,
  writeChannel,
  writeField,
  WorldField,
  WorldSample,
  Vec3,
  FieldChunk,
  FIELD_STRIDE,
} from "../index.js";

export type FieldOpResult = { cellsWritten: number };

/** Bounded, typed command surface over a WorldField. The only mutation path. */
export class FieldOps {
  constructor(readonly field: WorldField) {}

  query(region: AABB, predicate?: (s: WorldSample) => boolean): WorldSample[] {
    return queryField(this.field, region, predicate ?? (() => true));
  }

  sample(position: Vec3): WorldSample | null {
    return sampleField(this.field, position);
  }

  describe() {
    const chunk = firstChunk(this.field);
    let tempSum = 0;
    let moistureSum = 0;
    let fuelSum = 0;
    const n = cellCount(chunk.resolution);
    for (let i = 0; i < n; i++) {
      tempSum += readChannel(chunk, "temperature", i);
      moistureSum += readChannel(chunk, "moisture", i);
      fuelSum += readChannel(chunk, "fuel", i);
    }
    return {
      cellCount: n,
      avgTemperature: tempSum / n,
      avgMoisture: moistureSum / n,
      avgFuel: fuelSum / n,
    };
  }

  setState(region: AABB, op: (s: WorldSample["state"]) => WorldSample["state"]): FieldOpResult {
    return { cellsWritten: writeField(this.field, region, op) };
  }

  addHeat(region: AABB, amount: number): FieldOpResult {
    return this.setState(region, (s) => ({ ...s, temperature: s.temperature + amount }));
  }

  addMoisture(region: AABB, amount: number): FieldOpResult {
    return this.setState(region, (s) => ({ ...s, moisture: Math.min(1, s.moisture + amount) }));
  }

  applyForce(region: AABB, force: Vec3): FieldOpResult {
    return this.setState(region, (s) => ({ ...s, velocity: force }));
  }

  paintResponse(region: AABB, paletteId: number): FieldOpResult {
    const chunk = firstChunk(this.field);
    let n = 0;
    const total = cellCount(chunk.resolution);
    for (let i = 0; i < total; i++) {
      const p = cellPosition(chunk, i);
      if (!aabbContains(region, p)) continue;
      chunk.responseIndex[i] = paletteId;
      n++;
    }
    return { cellsWritten: n };
  }

  inspectUncertainty() {
    return { confidence: 1, note: "synthetic field — no inferred priors yet" };
  }

  captureState() {
    return serializeChunk(firstChunk(this.field));
  }
}

function aabbContains(b: AABB, p: Vec3): boolean {
  return p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2];
}

function firstChunk(field: WorldField): FieldChunk {
  return [...field.chunks.values()][0]!;
}

export interface FireIgnition {
  step: number;
  index: number;
  cause: "source" | "spread" | "ember";
  from: number | null;
}

/** Field-level combustion chemistry: causes (heat transport + ignition + embers), no outcomes. */
export function stepFieldChemistry(
  field: WorldField,
  wind: Vec3,
  dt: number,
  opts: { step?: number; emberFrom?: Map<number, number>; ignitions?: FireIgnition[]; burning?: Set<number> } = {},
): { ignitions: FireIgnition[]; emberFrom: Map<number, number>; burning: Set<number> } {
  const chunk = firstChunk(field);
  const [nx, , nz] = chunk.resolution;
  const ignitionThreshold = 300;
  const emberFrom = opts.emberFrom ?? new Map<number, number>();
  const ignitions = opts.ignitions ?? [];
  const burning = opts.burning ?? new Set<number>();
  const step = opts.step ?? 0;
  let s = 12345 >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0xffffffff);

  // Copy current temperature column so a cell reads its neighbors' prior temps.
  const temps = new Float32Array(nx * nz);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const i = z * nx + x;
    temps[i] = readChannel(chunk, "temperature", i);
  }

  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      let temp = temps[i]!;
      let gain = 0;
      let loss = 0;
      for (const [dx, dz] of NEIGH4) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= nx || zz >= nz) continue;
        if (temps[zz * nx + xx]! >= ignitionThreshold) gain += 40; // radiation
      }
      const upx = Math.max(0, x - wind[0]), upz = Math.max(0, z - wind[2]);
      if (temps[upz * nx + upx]! >= ignitionThreshold) gain += 30; // convection
      gain += 2; // solar
      const moisture = readChannel(chunk, "moisture", i);
      if (moisture > 0 && temp > 50) loss += 25 * moisture;
      loss += 0.05 * (temp - 20);
      if (burning.has(i)) loss += 10;

      temp = Math.max(20, temp + dt * (gain - loss));
      writeChannel(chunk, "temperature", i, temp);

      // Ignition transition only — no duplicate records for an already-burning cell.
      const fuel = readChannel(chunk, "fuel", i);
      if (!burning.has(i) && temp >= ignitionThreshold && fuel > 0 && moisture < 0.4) {
        const emberSource = emberFrom.get(i);
        const cause: FireIgnition["cause"] = emberSource !== undefined ? "ember" : "spread";
        ignitions.push({ step, index: i, cause, from: cause === "ember" ? (emberSource ?? null) : null });
        burning.add(i);
        writeChannel(chunk, "temperature", i, temp + 60);
        writeChannel(chunk, "fuel", i, Math.max(0, fuel - 0.2));
        writeChannel(chunk, "smoke", i, readChannel(chunk, "smoke", i) + 0.15);
        writeChannel(chunk, "carbonization", i, readChannel(chunk, "carbonization", i) + 0.1);
      }
      if (burning.has(i) && readChannel(chunk, "fuel", i) <= 0) burning.delete(i);
    }
  }

  // Ember transport downwind: burning cells loft embers; lineage recorded.
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      if (!burning.has(i)) continue;
      const offset = 3 + Math.floor(rnd() * 4);
      const tx = x + Math.round(wind[0]) * offset;
      const tz = Math.min(nz - 1, Math.max(0, z + Math.round(wind[2]) * offset + (Math.floor(rnd() * 3) - 1)));
      if (tx >= nx) continue;
      const t = tz * nx + tx;
      if (readChannel(chunk, "fuel", t) <= 0) continue;
      writeChannel(chunk, "temperature", t, readChannel(chunk, "temperature", t) + 320);
      emberFrom.set(t, i);
    }
  }

  return { ignitions, emberFrom, burning };
}

const NEIGH4: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A forested slope field: fuel everywhere, uniform moisture, ambient temperature. */
export function buildForestField(): WorldField {
  const bounds: AABB = { min: [-60, 0, -10], max: [60, 1, 10] };
  const resolution: [number, number, number] = [60, 1, 10];
  const chunk = createChunk({ id: "forest", bounds, resolution, defaultResponse: 0 });
  const n = cellCount(resolution);
  for (let i = 0; i < n; i++) {
    writeChannel(chunk, "temperature", i, 20);
    writeChannel(chunk, "moisture", i, 0.25);
    writeChannel(chunk, "fuel", i, 1);
    writeChannel(chunk, "smoke", i, 0);
    writeChannel(chunk, "carbonization", i, 0);
    writeChannel(chunk, "velocityX", i, 1);
  }
  return createWorldField([chunk]);
}

export function runExp07() {
  const ops = new FieldOps(buildForestField());
  const west: AABB = { min: [-60, 0, -10], max: [-10, 1, 10] };

  // 1. Query the west slope (semantics/region, not per-tree selection).
  const westSamples = ops.query(west);
  const westCellCount = westSamples.length;

  // 2. Dry the west slope: hot weather (addHeat) + low moisture (setState).
  ops.addHeat(west, 10);
  ops.setState(west, (s) => ({ ...s, moisture: 0.05 }));

  // 3. A physically defined heat source (campfire) — not a forced burn outcome.
  const campfire: AABB = { min: [-14, 0, -2], max: [-10, 1, 2] };
  ops.addHeat(campfire, 300);

  // 4. Run the world.
  const ignitions: FireIgnition[] = [];
  let emberFrom = new Map<number, number>();
  let burning = new Set<number>();
  for (let t = 0; t < 20; t++) {
    const r = stepFieldChemistry(ops.field, [1, 0, 0], 1, { step: t, emberFrom, ignitions, burning });
    emberFrom = r.emberFrom;
    burning = r.burning;
  }

  // 5. Inspect state + capture evidence.
  const report = ops.describe();
  const capture = ops.captureState();

  // 6. Report emergent result: downwind spot fires from embers, with lineage.
  const emberFires = ignitions.filter((r) => r.cause === "ember");
  const downwind = emberFires.filter((r) => {
    if (r.from === null) return false;
    return (r.index % 60) - (r.from % 60) >= 2;
  });

  return {
    westCellCount,
    totalIgnitions: ignitions.length,
    emberIgnitions: emberFires.length,
    downwindSpotFires: downwind.length,
    emergentWithoutScript: downwind.length > 0,
    avgTemperature: report.avgTemperature,
    avgMoisture: report.avgMoisture,
    avgFuel: report.avgFuel,
    capturedCells: capture.data.length / FIELD_STRIDE,
    firstDownwindLineage: downwind[0] ?? null,
  };
}
