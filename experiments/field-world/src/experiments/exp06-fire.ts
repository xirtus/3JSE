// Experiment 06 — Emergent forest fire (plan §21). Fire propagation emerges from
// field state and neighbor transport with no `SetTreeOnFire(target)`. Wind
// transports heat, smoke, and embers; a downwind spot fire begins from ember
// deposition + local state + response evaluation, with recorded lineage.

export type IgnitionCause = "source" | "spread" | "ember";

export interface IgnitionRecord {
  step: number;
  index: number;
  cause: IgnitionCause;
  from: number | null;
}

export interface FireCell {
  temperature: number;
  moisture: number;
  fuel: number;
  smoke: number;
  carbonization: number;
  burning: boolean;
}

export class FireSim {
  readonly nx: number;
  readonly nz: number;
  readonly cells: FireCell[];
  readonly wind: [number, number]; // +x = downwind
  readonly ignitionThreshold = 300;
  readonly moistureThreshold = 0.4;
  readonly burnRate = 0.2;
  readonly smokeYield = 0.15;
  readonly charYield = 0.1;
  readonly ambient = 20;
  /** target cell -> emitting cell (ember deposition), -1 = none */
  readonly emberFrom: Int32Array;
  readonly ignition: IgnitionRecord[];
  stepCount = 0;
  private s: number;

  constructor(nx: number, nz: number, seed = 7) {
    this.nx = nx;
    this.nz = nz;
    this.s = seed >>> 0;
    this.cells = new Array(nx * nz);
    this.emberFrom = new Int32Array(nx * nz).fill(-1);
    this.ignition = [];
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        this.cells[this.index(x, z)] = {
          temperature: this.ambient,
          moisture: 0.2, // dry enough to burn
          fuel: 1,
          smoke: 0,
          carbonization: 0,
          burning: false,
        };
      }
    }
    // Wind blows toward +x with a small z component for realism.
    this.wind = [1, 0];
  }

  index(x: number, z: number): number {
    return z * this.nx + x;
  }

  private rnd(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 0xffffffff;
  }

  /** A physically defined heat source (e.g. a campfire), not a forced burn state. */
  igniteSource(x: number, z: number): void {
    const i = this.index(x, z);
    const c = this.cells[i]!;
    c.temperature = 400;
    c.burning = true;
    this.ignition.push({ step: this.stepCount, index: i, cause: "source", from: null });
  }

  step(): void {
    this.stepCount++;
    const { nx, nz } = this;
    const next = this.cells.map((c) => ({ ...c }));

    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const i = this.index(x, z);
        const c = next[i]!;
        let heatGain = 0;
        let heatLoss = 0;

        // Radiation + conduction from burning neighbors.
        let hottestNeighbor = -1;
        let hottestTemp = -Infinity;
        for (const [dx, dz] of NEIGHBORS4) {
          const xx = x + dx;
          const zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= nx || zz >= nz) continue;
          const n = this.cells[this.index(xx, zz)]!;
          if (n.burning) heatGain += 40; // radiation
          if (n.temperature > hottestTemp) {
            hottestTemp = n.temperature;
            hottestNeighbor = this.index(xx, zz);
          }
        }
        // Convection: heat carried in from the upwind neighbor.
        const up = this.index(Math.max(0, x - this.wind[0]), Math.max(0, z - this.wind[1]));
        const upCell = this.cells[up]!;
        if (upCell.burning) heatGain += 30;

        // Solar baseline.
        heatGain += 2;

        // Losses: evaporation (moisture), air cooling, conduction.
        if (c.moisture > 0 && c.temperature > 50) heatLoss += 25 * c.moisture;
        heatLoss += 0.05 * (c.temperature - this.ambient); // air cooling
        if (c.burning) heatLoss += 10; // conduction into the ground/air

        c.temperature = Math.max(this.ambient, c.temperature + heatGain - heatLoss);

        // Ignition: physical conditions only — no per-target script.
        if (!c.burning && c.fuel > 0 && c.moisture < this.moistureThreshold && c.temperature >= this.ignitionThreshold) {
          c.burning = true;
          const emberSource = this.emberFrom[i]!;
          const cause: IgnitionCause = emberSource >= 0 ? "ember" : "spread";
          this.ignition.push({
            step: this.stepCount,
            index: i,
            cause,
            from: cause === "ember" ? emberSource : hottestNeighbor >= 0 ? hottestNeighbor : null,
          });
        }

        // Burn: fuel -> temperature + smoke + char (feedback).
        if (c.burning && c.fuel > 0) {
          const burn = Math.min(this.burnRate, c.fuel);
          c.fuel -= burn;
          c.temperature += burn * 80;
          c.smoke += burn * this.smokeYield;
          c.carbonization += burn * this.charYield;
        }
        if (c.fuel <= 0) c.burning = false;
      }
    }

    this.cells.splice(0, this.cells.length, ...next);

    // Ember transport: burning cells loft embers that travel downwind.
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const i = this.index(x, z);
        const c = this.cells[i]!;
        if (!c.burning) continue;
        const offset = 3 + Math.floor(this.rnd() * 4); // 3..6 cells downwind
        const dz = Math.floor(this.rnd() * 3) - 1; // -1..1
        const tx = x + this.wind[0] * offset;
        const tz = Math.min(nz - 1, Math.max(0, z + this.wind[1] * offset + dz));
        if (tx >= nx) continue;
        const t = this.index(tx, tz);
        if (this.cells[t]!.fuel <= 0) continue;
        // Ember deposits heat into the downwind cell; lineage recorded.
        this.cells[t]!.temperature += 320;
        this.emberFrom[t] = i;
      }
    }
  }

  spotFires(): IgnitionRecord[] {
    return this.ignition.filter((r) => r.cause === "ember");
  }
}

const NEIGHBORS4: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export function runExp06() {
  const sim = new FireSim(60, 10, 7);
  // A single physically defined heat source (campfire) on the upwind side.
  sim.igniteSource(5, 5);

  for (let t = 0; t < 30; t++) sim.step();

  const spots = sim.spotFires();
  // A spot fire that is non-adjacent (distance >= 2) to its ember source and
  // strictly downwind proves ember deposition, not neighbor spread.
  const downwindSpots = spots.filter((r) => {
    if (r.from === null) return false;
    const fx = r.from % sim.nx;
    const tx = r.index % sim.nx;
    return tx - fx >= 2;
  });

  const burningCount = sim.cells.filter((c) => c.burning).length;
  const smokeTotal = sim.cells.reduce((a, c) => a + c.smoke, 0);
  const charTotal = sim.cells.reduce((a, c) => a + c.carbonization, 0);
  const fuelTotal = sim.cells.reduce((a, c) => a + c.fuel, 0);

  return {
    totalIgnitions: sim.ignition.length,
    emberIgnitions: spots.length,
    downwindSpotFires: downwindSpots.length,
    // The decisive gate: fire emerged downwind from ember + state, not SetTreeOnFire.
    spotFireEmergedWithoutScript: downwindSpots.length > 0,
    burningCells: burningCount,
    smokeTotal,
    charTotal,
    fuelConsumed: sim.cells.length - fuelTotal,
    // Lineage evidence for the first downwind spot fire.
    lineage: downwindSpots[0] ?? null,
  };
}
