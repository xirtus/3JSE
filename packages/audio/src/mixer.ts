// The bus-graph mixer (docs/AUDIO.md §Mixer). Master → categories, each independently
// volume/mute-controllable, with bus-level ducking rules. Pure data + a resolver; the actual
// GainNode chain lives in the WebAudio backend.

export type BusId = "Master" | "Music" | "SFX" | "Voice" | "UI" | "Ambience" | (string & {});

export interface BusConfig {
  id: BusId;
  parent: BusId | null;
  /** 0..1 linear */
  volume: number;
  mute: boolean;
}

/** "lower `target` by `amount` while any source routed to `trigger` is playing" (§Mixer). */
export interface DuckRule {
  trigger: BusId;
  target: BusId;
  /** multiplier applied to `target` while ducked, 0..1 (e.g. 0.35) */
  amount: number;
}

const DEFAULT_BUSES: BusConfig[] = [
  { id: "Master", parent: null, volume: 1, mute: false },
  { id: "Music", parent: "Master", volume: 0.8, mute: false },
  { id: "SFX", parent: "Master", volume: 1, mute: false },
  { id: "Voice", parent: "Master", volume: 1, mute: false },
  { id: "UI", parent: "Master", volume: 0.9, mute: false },
  { id: "Ambience", parent: "Master", volume: 0.7, mute: false },
];

export class MixerGraph {
  private readonly buses = new Map<BusId, BusConfig>();
  private readonly ducks: DuckRule[] = [];
  /** bus -> count of currently-playing sources routed to it (for ducking) */
  private readonly active = new Map<BusId, number>();

  constructor(buses: BusConfig[] = DEFAULT_BUSES, ducks: DuckRule[] = [{ trigger: "Voice", target: "Music", amount: 0.35 }]) {
    for (const b of buses) this.buses.set(b.id, { ...b });
    this.ducks.push(...ducks);
  }

  addBus(config: BusConfig): void {
    this.buses.set(config.id, { ...config });
  }
  setVolume(id: BusId, volume: number): void {
    const b = this.buses.get(id);
    if (b) b.volume = clamp01(volume);
  }
  setMute(id: BusId, mute: boolean): void {
    const b = this.buses.get(id);
    if (b) b.mute = mute;
  }
  addDuckRule(rule: DuckRule): void {
    this.ducks.push(rule);
  }
  list(): BusConfig[] {
    return [...this.buses.values()];
  }

  /** Called by the audio System when a source on `bus` starts/stops — drives ducking. */
  noteActive(bus: BusId, playing: boolean): void {
    const n = (this.active.get(bus) ?? 0) + (playing ? 1 : -1);
    this.active.set(bus, Math.max(0, n));
  }

  /** Effective linear gain for `id` = product of its own and every ancestor's volume (0 if any
   *  is muted), times any duck multiplier currently applying to it. */
  effectiveGain(id: BusId): number {
    let gain = 1;
    let cur: BusId | null = id;
    const seen = new Set<BusId>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const b = this.buses.get(cur);
      if (!b) break;
      if (b.mute) return 0;
      gain *= b.volume;
      cur = b.parent;
    }
    for (const d of this.ducks) {
      if (d.target === id && (this.active.get(d.trigger) ?? 0) > 0) gain *= d.amount;
    }
    return gain;
  }
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
