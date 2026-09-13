// Bounded agent command surface (plan §11, §22). Agents operate on the field
// through a small typed command surface (the PhysTalk lesson): query / sample /
// describe / setState / addHeat / addMoisture / applyForce / paintResponse /
// inspectUncertainty / captureState. No raw buffer access, no `SetTreeOnFire` —
// agents describe causes and constraints; the field determines consequences.

import { aabbContains, type AABB, type Vec3, type WorldSample } from "./types.js";
import {
  cellCount,
  cellPosition,
  queryField,
  readChannel,
  sampleField,
  writeField,
  type FieldChunk,
  type WorldField,
} from "./field.js";
import { serializeChunk } from "./synthetic.js";

export type FieldOpResult = { cellsWritten: number };

/** The only mutation path over a WorldField. */
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

function firstChunk(field: WorldField): FieldChunk {
  return [...field.chunks.values()][0]!;
}
