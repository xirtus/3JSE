// The audio backend seam. Gameplay/mixer logic (headless, testable) talks to this; the real
// implementation (WebAudioBackend, below the fold) wraps Three.js Audio/PositionalAudio +
// Web Audio nodes. NullBackend records calls so a headless test can assert what would play.

export interface Vec3 { x: number; y: number; z: number }

export interface PlayParams {
  clip: string;
  /** final linear gain (bus gain * source volume, already resolved) */
  gain: number;
  loop: boolean;
  /** omit for a 2D sound; present for spatial */
  position?: Vec3;
  /** 0 = fully 2D, 1 = fully spatial */
  spatialBlend?: number;
  minDistance?: number;
  maxDistance?: number;
  /** playback rate (musical pitch / doppler-free retune) */
  rate?: number;
}

export interface AudioBackend {
  play(handle: string, params: PlayParams): void;
  stop(handle: string): void;
  setGain(handle: string, gain: number): void;
  setPosition(handle: string, position: Vec3): void;
  setListener(position: Vec3, forward: Vec3): void;
  /** currently-sounding handles */
  active(): string[];
}

export interface RecordedCall {
  op: "play" | "stop" | "setGain" | "setPosition" | "setListener";
  handle?: string;
  params?: unknown;
}

/** Deterministic no-audio backend for tests / headless runs. */
export class NullBackend implements AudioBackend {
  readonly calls: RecordedCall[] = [];
  private readonly playing = new Set<string>();
  private readonly gains = new Map<string, number>();

  play(handle: string, params: PlayParams): void {
    this.playing.add(handle);
    this.gains.set(handle, params.gain);
    this.calls.push({ op: "play", handle, params });
  }
  stop(handle: string): void {
    this.playing.delete(handle);
    this.calls.push({ op: "stop", handle });
  }
  setGain(handle: string, gain: number): void {
    this.gains.set(handle, gain);
    this.calls.push({ op: "setGain", handle, params: gain });
  }
  setPosition(handle: string, position: Vec3): void {
    this.calls.push({ op: "setPosition", handle, params: position });
  }
  setListener(position: Vec3, forward: Vec3): void {
    this.calls.push({ op: "setListener", params: { position, forward } });
  }
  active(): string[] {
    return [...this.playing];
  }
  gainOf(handle: string): number | undefined {
    return this.gains.get(handle);
  }
}
