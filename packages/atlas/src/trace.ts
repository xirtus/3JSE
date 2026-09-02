// Runtime Trace view (docs/3JSE_ATLAS_FULL_PLAN.md §5.5, §26–27). Records the last configurable
// window of gameplay events; `traceLens` turns a window into a time-ordered graph; a time
// scrubber seeks by calling `window(from, to)`.

import type { LensGraph } from "./lenses.js";
import type { AtlasNode, AtlasEdge } from "./compile.js";

export interface TraceEvent {
  time: number;
  /** 3IR event name */
  name: string;
  /** system id that emitted it, if known */
  from?: string;
  /** system ids that reacted, if known */
  to?: string[];
  payload?: unknown;
}

export class TraceRecorder {
  private readonly events: TraceEvent[] = [];
  constructor(private readonly capacity = 512) {}

  record(e: TraceEvent): void {
    this.events.push(e);
    if (this.events.length > this.capacity) this.events.shift();
  }

  /** All events in `[from, to]` (seconds), in time order. Omit args for the whole buffer. */
  window(from = -Infinity, to = Infinity): TraceEvent[] {
    return this.events.filter((e) => e.time >= from && e.time <= to);
  }

  get span(): { start: number; end: number } | null {
    if (this.events.length === 0) return null;
    return { start: this.events[0]!.time, end: this.events[this.events.length - 1]!.time };
  }

  clear(): void {
    this.events.length = 0;
  }
}

/**
 * A graph of the events in `window`: one node per event fire (time-labelled), an edge from each
 * event to the next by the same emitting system (causal-ish chain), plus edges to each named
 * downstream system. Selecting an event node surfaces its originating + downstream systems.
 */
export function traceLens(events: TraceEvent[]): LensGraph {
  const nodes: AtlasNode[] = events.map((e, i) => ({
    id: `evt:${i}`,
    type: "event",
    label: e.name,
    domain: "core",
    purpose: `${e.time.toFixed(3)}s${e.from ? ` · from ${e.from}` : ""}`,
    status: "unknown",
    healthReasons: e.to ?? [],
    owns: [], requires: [], dependents: [], emits: [], listens: [],
    providers: [], assets: [], tests: [], knobs: {},
  }));

  const edges: AtlasEdge[] = [];
  let seq = 0;
  const lastByFrom = new Map<string, number>();
  events.forEach((e, i) => {
    if (e.from !== undefined) {
      const prev = lastByFrom.get(e.from);
      if (prev !== undefined) edges.push({ id: `tr${seq++}`, source: `evt:${prev}`, target: `evt:${i}`, kind: "event" });
      lastByFrom.set(e.from, i);
    } else if (i > 0) {
      edges.push({ id: `tr${seq++}`, source: `evt:${i - 1}`, target: `evt:${i}`, kind: "event" });
    }
  });
  return { nodes, edges };
}

/** Aggregate event counts per system over a window — feeds §26 runtime pulses (density, not
 *  every individual fire). */
export function pulseCounts(events: TraceEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.from) counts[e.from] = (counts[e.from] ?? 0) + 1;
    for (const t of e.to ?? []) counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}
