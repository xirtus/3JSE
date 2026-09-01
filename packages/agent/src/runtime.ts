import type { World } from "@3jse/runtime";

export interface ConsoleEntry {
  level: "log" | "warn" | "error";
  message: string;
  time: number;
}

/** docs/AI_AGENT_API.md's `runtime.getConsole`: "Pull captured logs/errors/warnings since a
 *  given point." One sink per headless run/session; `since()`'s cursor is just "how many
 *  entries existed last time you checked," matching the tool's own "since a given point"
 *  framing without needing timestamps to be unique or monotonic across fast frames. */
export class ConsoleSink {
  private readonly entries: ConsoleEntry[] = [];

  log(level: ConsoleEntry["level"], message: string): void {
    this.entries.push({ level, message, time: Date.now() });
  }

  since(cursor: number): ConsoleEntry[] {
    return this.entries.slice(cursor);
  }

  get length(): number {
    return this.entries.length;
  }
}

/** docs/AI_AGENT_API.md's `runtime.getPerf`. Records the wall-clock cost of each `World.step()`
 *  during a headless run so the harness's Performance QA gate can measure rather than guess.
 *  This is CPU/simulation timing only — see `runtimeGetPerf`'s doc for what it deliberately
 *  does not claim. */
export class PerfRecorder {
  private readonly frameMs: number[] = [];

  record(ms: number): void {
    this.frameMs.push(ms);
  }

  get frames(): number {
    return this.frameMs.length;
  }

  get totalMs(): number {
    return this.frameMs.reduce((a, b) => a + b, 0);
  }

  /** Per-frame CPU time, milliseconds. `[]` when nothing has run yet. */
  samples(): number[] {
    return [...this.frameMs];
  }
}

// `performance` is a global in browsers and in Node >= 16; `Date.now()` is the universal
// fallback. No `process` reference — this module is type-checked by the browser-only editor build.
const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * docs/AI_AGENT_API.md's `runtime.run`: "Boot the game headless." `@3jse/runtime`'s `World` has
 * no DOM dependency (docs/RUNTIME.md's headless-mode posture) — this doesn't need a separate
 * "headless renderer," it's the same `World.step()` apps/editor/src/Viewport.tsx drives every
 * frame, just called directly without a `requestAnimationFrame` loop or a canvas.
 *
 * Each frame is wrapped individually: a System throwing mid-run (docs/AI_AGENT_API.md's shark
 * example step 8, "catch a missing animation-state reference") is captured into the console
 * sink and the run continues, instead of the whole headless verify step crashing on frame one.
 * `runtime.getConsole` is how an agent's VERIFY step actually sees it.
 *
 * Pass a `PerfRecorder` to time each step for `runtime.getPerf`. `runtime.captureFrame` is still
 * not implemented as a pixel capture — that needs a real GPU renderer this Node path has no
 * access to, and a blank placeholder image would be worse than nothing. `runtimeCaptureState`
 * below is the headless-honest analog: the authoritative simulation state the renderer would be
 * drawing, as a deterministic, diffable snapshot.
 */
export function runtimeRun(
  world: World,
  sink: ConsoleSink,
  frames: number,
  dt = 1 / 60,
  perf?: PerfRecorder,
): void {
  world.play();
  for (let i = 0; i < frames; i++) {
    const t0 = perf ? now() : 0;
    try {
      world.step(dt);
    } catch (err) {
      sink.log("error", err instanceof Error ? err.message : String(err));
    }
    if (perf) perf.record(now() - t0);
  }
}

export function runtimePause(world: World): void {
  world.pause();
}

export function runtimeStep(world: World, dt = 1 / 60): void {
  world.step(dt);
}

export function runtimeGetConsole(sink: ConsoleSink, sinceIndex = 0): ConsoleEntry[] {
  return sink.since(sinceIndex);
}

export interface SceneCensus {
  levels: number;
  entities: number;
  spatialEntities: number;
  systems: number;
  /** component type -> number of Entities carrying it, across every loaded Level. */
  components: Record<string, number>;
}

export interface PerfReport {
  frames: number;
  totalMs: number;
  avgMsPerFrame: number;
  minMsPerFrame: number;
  maxMsPerFrame: number;
  /** avg-frame-time -> frames/second the simulation could sustain on this machine. */
  estimatedFps: number;
  scene: SceneCensus;
  /** What this report does NOT cover, spelled out so it is never mistaken for a GPU profile. */
  note: string;
}

function census(world: World): SceneCensus {
  const components: Record<string, number> = {};
  let entities = 0;
  let spatialEntities = 0;
  for (const level of world.allLevels) {
    for (const e of level.allEntities) {
      entities++;
      if (e.object3D) spatialEntities++;
      for (const t of e.listComponentTypes()) components[t] = (components[t] ?? 0) + 1;
    }
  }
  return {
    levels: world.allLevels.length,
    entities,
    spatialEntities,
    systems: world.scheduler.describe().length,
    components,
  };
}

/**
 * docs/AI_AGENT_API.md's `runtime.getPerf`, honestly scoped. Reports the measured CPU cost of
 * the simulation over a headless run plus a census of what was simulated. It deliberately does
 * NOT report draw calls, triangles, instance counts, or GPU frame time — those need a real
 * render pass and belong to the Profiler panel (docs/PERFORMANCE.md). Reported numbers here are
 * real measurements from `PerfRecorder`, never estimates.
 */
export function runtimeGetPerf(world: World, perf: PerfRecorder): PerfReport {
  const s = perf.samples();
  const frames = s.length;
  const totalMs = s.reduce((a, b) => a + b, 0);
  const avg = frames ? totalMs / frames : 0;
  return {
    frames,
    totalMs: round(totalMs, 4),
    avgMsPerFrame: round(avg, 4),
    minMsPerFrame: round(frames ? Math.min(...s) : 0, 4),
    maxMsPerFrame: round(frames ? Math.max(...s) : 0, 4),
    estimatedFps: avg > 0 ? round(1000 / avg, 1) : 0,
    scene: census(world),
    note: "CPU/simulation timing only, headless. Draw calls, triangles, and GPU frame time need a renderer (docs/PERFORMANCE.md Profiler panel).",
  };
}

export interface CapturedEntity {
  id: string;
  name: string;
  spatial: boolean;
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  scale?: [number, number, number];
  components: Record<string, Record<string, unknown>>;
}

export interface CapturedState {
  levels: { id: string; name: string; entities: CapturedEntity[] }[];
}

/**
 * The headless-honest analog of docs/AI_AGENT_API.md's `runtime.captureFrame`. Not a pixel
 * grab — it is the authoritative simulation state the renderer observes (docs/RUNTIME.md: "the
 * simulation is authoritative; the renderer observes"), serialized deterministically so a
 * harness VERIFY step can diff two moments, assert an invariant, or answer "what is that entity
 * doing?" without a GPU. Transform numbers are rounded to `precision` decimals so the snapshot
 * diffs stably across machines. Entities and component keys come out in insertion order; use
 * `capturedStateToText` for a fully key-sorted, stable string.
 */
export function runtimeCaptureState(world: World, opts: { precision?: number } = {}): CapturedState {
  const p = opts.precision ?? 4;
  return {
    levels: world.allLevels.map((level) => ({
      id: level.id,
      name: level.name,
      entities: level.allEntities.map((e) => {
        const out: CapturedEntity = {
          id: e.id,
          name: e.name,
          spatial: e.object3D != null,
          components: Object.fromEntries(
            e.listComponentTypes().map((t) => [t, { ...(e.getComponent(t) ?? {}) }]),
          ),
        };
        if (e.object3D) {
          const o = e.object3D;
          out.position = [round(o.position.x, p), round(o.position.y, p), round(o.position.z, p)];
          out.quaternion = [
            round(o.quaternion.x, p),
            round(o.quaternion.y, p),
            round(o.quaternion.z, p),
            round(o.quaternion.w, p),
          ];
          out.scale = [round(o.scale.x, p), round(o.scale.y, p), round(o.scale.z, p)];
        }
        return out;
      }),
    })),
  };
}

/** Deterministic, key-sorted text form of a capture — stable enough to snapshot-test or `diff`. */
export function capturedStateToText(state: CapturedState): string {
  return JSON.stringify(state, sortedReplacer, 2);
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value;
}

function round(n: number, decimals: number): number {
  // Normalize -0 to 0 so snapshots don't flip on sign of a zeroed axis.
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}
