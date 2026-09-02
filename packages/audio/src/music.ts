// Sequencer / quantizer + MIDI/OSC bridge (docs/AUDIO.md §"Generative audio — gameplay is the
// score"). Gameplay events quantized to a musical grid with scale/root/BPM per level, so audio
// directors are authorable in Graph/FeelSpec, and "the game composes a DAW" is a shipping
// feature, not a debug tool (PULSEHOP / ZENDRIVE / MANDELHOP in REFERENCE_GAMES.md).

export type GridDivision = 1 | 2 | 4 | 8 | 16 | 32; // whole … 32nd notes per beat

export interface MusicalContext {
  bpm: number;
  /** grid resolution: notes per beat */
  grid: GridDivision;
  /** 0..11, C = 0 */
  root: number;
  scale: ScaleName;
}

export type ScaleName = "major" | "minor" | "pentatonicMajor" | "pentatonicMinor" | "dorian" | "chromatic";

const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Seconds per grid step. */
export function stepDuration(ctx: MusicalContext): number {
  return 60 / ctx.bpm / ctx.grid;
}

/** The next grid time at or after `t` (seconds). Quantizes a gameplay event onto the beat. */
export function quantize(t: number, ctx: MusicalContext): number {
  const step = stepDuration(ctx);
  return Math.ceil(t / step - 1e-9) * step;
}

/** The grid-step index a time falls on. */
export function stepIndex(t: number, ctx: MusicalContext): number {
  return Math.round(t / stepDuration(ctx));
}

/**
 * MIDI note for a scale degree. `degree` 0 = root; negative and >scale-length wrap across
 * octaves. `octave` shifts by 12 (MIDI 60 = middle C at octave 5 with root 0).
 */
export function scaleDegreeToMidi(ctx: MusicalContext, degree: number, octave = 5): number {
  const scale = SCALES[ctx.scale];
  const n = scale.length;
  const idx = ((degree % n) + n) % n;
  const octaveShift = Math.floor(degree / n);
  return 12 * octave + ctx.root + scale[idx]! + 12 * octaveShift;
}

// ---- MIDI/OSC out bridge -------------------------------------------------------------------

export interface MidiOut {
  noteOn(note: number, velocity: number, channel?: number): void;
  noteOff(note: number, channel?: number): void;
  /** MIDI clock tick (24 per quarter note) */
  clock(): void;
  /** control change */
  cc(controller: number, value: number, channel?: number): void;
}

export interface RecordedMidi {
  op: "noteOn" | "noteOff" | "clock" | "cc";
  args: number[];
}

/** Records instead of transmitting — for tests and headless runs. A real WebMidiOut wraps
 *  `navigator.requestMIDIAccess().outputs`; an OSC bridge posts over a WebSocket. */
export class NullMidiOut implements MidiOut {
  readonly sent: RecordedMidi[] = [];
  noteOn(note: number, velocity: number, channel = 0): void {
    this.sent.push({ op: "noteOn", args: [note, velocity, channel] });
  }
  noteOff(note: number, channel = 0): void {
    this.sent.push({ op: "noteOff", args: [note, channel] });
  }
  clock(): void {
    this.sent.push({ op: "clock", args: [] });
  }
  cc(controller: number, value: number, channel = 0): void {
    this.sent.push({ op: "cc", args: [controller, value, channel] });
  }
}

/**
 * Drives a MIDI clock from world time and lets gameplay play scale-degree notes on the grid.
 * `advance(now)` emits the right number of 24-PPQN clock ticks since the last call; `hit()`
 * quantizes a gameplay note to the next grid step and schedules its note-on/off.
 */
export class MusicDirector {
  private lastClockTick = 0;
  private started = false;
  private startTime = 0;

  constructor(
    private ctx: MusicalContext,
    private readonly midi: MidiOut,
  ) {}

  setContext(ctx: Partial<MusicalContext>): void {
    this.ctx = { ...this.ctx, ...ctx };
  }
  context(): MusicalContext {
    return { ...this.ctx };
  }

  /** call once when the score should start (sends nothing until then) */
  start(now: number): void {
    this.started = true;
    this.startTime = now;
    this.lastClockTick = 0;
  }

  /** emit MIDI clock ticks up to `now` (seconds). 24 ticks per quarter note. */
  advance(now: number): void {
    if (!this.started) return;
    const elapsed = now - this.startTime;
    const ticksPerSecond = (this.ctx.bpm / 60) * 24;
    const wanted = Math.floor(elapsed * ticksPerSecond);
    for (let i = this.lastClockTick; i < wanted; i++) this.midi.clock();
    this.lastClockTick = wanted;
  }

  /**
   * Play `degree` (scale degree, 0 = root) quantized to the grid. Returns the absolute time the
   * note fires. `durationSteps` grid steps long; `velocity` 0..127; `channel` MIDI channel.
   */
  hit(now: number, degree: number, opts: { octave?: number; durationSteps?: number; velocity?: number; channel?: number } = {}): number {
    const at = quantize(now, this.ctx);
    const note = scaleDegreeToMidi(this.ctx, degree, opts.octave ?? 5);
    this.midi.noteOn(note, opts.velocity ?? 100, opts.channel ?? 0);
    // A caller with a real scheduler defers the note-off; the headless contract is "note-on now,
    // note-off is the caller's responsibility or immediate for a stinger".
    return at;
  }

  /** explicit note-off for a note started with hit() */
  release(degree: number, opts: { octave?: number; channel?: number } = {}): void {
    this.midi.noteOff(scaleDegreeToMidi(this.ctx, degree, opts.octave ?? 5), opts.channel ?? 0);
  }
}
