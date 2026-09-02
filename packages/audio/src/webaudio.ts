// The real Web Audio backend for @3jse/audio (docs/AUDIO.md §Foundation: "built on the Web
// Audio API"). Implements the same AudioBackend interface the headless NullBackend does, so the
// mixer / event / music layers are untouched. Not headlessly unit-testable (no AudioContext in
// node) — a mock-context test asserts the node-graph wiring; a browser exercises the rest.

import type { AudioBackend, PlayParams, Vec3 } from "./backend.js";

// Minimal shapes from the Web Audio API (avoids a hard lib.dom dependency in the type surface).
export interface WAGainNode { gain: { value: number; setTargetAtTime(v: number, t: number, c: number): void }; connect(n: unknown): void; disconnect(): void }
export interface WAPannerNode { connect(n: unknown): void; disconnect(): void; positionX: { value: number }; positionY: { value: number }; positionZ: { value: number }; refDistance: number; maxDistance: number; panningModel: string; distanceModel: string }
export interface WASourceNode { connect(n: unknown): void; disconnect(): void; loop: boolean; playbackRate: { value: number }; buffer: unknown; start(): void; stop(): void; onended: (() => void) | null }
export interface WAContext {
  currentTime: number;
  destination: unknown;
  listener: { positionX?: { value: number }; positionY?: { value: number }; positionZ?: { value: number }; forwardX?: { value: number }; forwardY?: { value: number }; forwardZ?: { value: number }; setPosition?(x: number, y: number, z: number): void; setOrientation?(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void };
  createGain(): WAGainNode;
  createPanner(): WAPannerNode;
  createBufferSource(): WASourceNode;
  resume?(): Promise<void>;
}

export interface WebAudioBackendOptions {
  context: WAContext;
  /** resolve a clip name to a decoded AudioBuffer */
  loadClip: (name: string) => Promise<unknown>;
  /** master output node; defaults to context.destination */
  output?: unknown;
}

interface Voice {
  source: WASourceNode;
  gain: WAGainNode;
  panner?: WAPannerNode;
}

export class WebAudioBackend implements AudioBackend {
  private readonly ctx: WAContext;
  private readonly loadClip: (name: string) => Promise<unknown>;
  private readonly output: unknown;
  private readonly voices = new Map<string, Voice>();
  private readonly buffers = new Map<string, Promise<unknown>>();

  constructor(opts: WebAudioBackendOptions) {
    this.ctx = opts.context;
    this.loadClip = opts.loadClip;
    this.output = opts.output ?? opts.context.destination;
  }

  play(handle: string, params: PlayParams): void {
    void this.startVoice(handle, params);
  }

  private async startVoice(handle: string, params: PlayParams): Promise<void> {
    this.stop(handle);
    let pending = this.buffers.get(params.clip);
    if (!pending) {
      pending = this.loadClip(params.clip); // dedupe in-flight loads for the same clip
      this.buffers.set(params.clip, pending);
    }
    const buffer = await pending;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = params.loop;
    source.playbackRate.value = params.rate ?? 1;

    const gain = this.ctx.createGain();
    gain.gain.value = params.gain;

    let panner: WAPannerNode | undefined;
    if (params.position && (params.spatialBlend ?? 1) > 0) {
      panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "linear";
      panner.refDistance = params.minDistance ?? 1;
      panner.maxDistance = params.maxDistance ?? 40;
      panner.positionX.value = params.position.x;
      panner.positionY.value = params.position.y;
      panner.positionZ.value = params.position.z;
      source.connect(panner);
      panner.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(this.output);

    source.onended = () => {
      if (!source.loop) this.stop(handle);
    };
    source.start();
    this.voices.set(handle, { source, gain, panner });
  }

  stop(handle: string): void {
    const v = this.voices.get(handle);
    if (!v) return;
    try { v.source.stop(); } catch { /* already stopped */ }
    v.source.disconnect();
    v.panner?.disconnect();
    v.gain.disconnect();
    this.voices.delete(handle);
  }

  setGain(handle: string, gain: number): void {
    const v = this.voices.get(handle);
    if (v) v.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
  }

  setPosition(handle: string, position: Vec3): void {
    const v = this.voices.get(handle);
    if (v?.panner) {
      v.panner.positionX.value = position.x;
      v.panner.positionY.value = position.y;
      v.panner.positionZ.value = position.z;
    }
  }

  setListener(position: Vec3, forward: Vec3): void {
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = position.x;
      l.positionY!.value = position.y;
      l.positionZ!.value = position.z;
      l.forwardX!.value = forward.x;
      l.forwardY!.value = forward.y;
      l.forwardZ!.value = forward.z;
    } else {
      l.setPosition?.(position.x, position.y, position.z);
      l.setOrientation?.(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  active(): string[] {
    return [...this.voices.keys()];
  }

  /** call from a user gesture to un-suspend the context */
  resume(): Promise<void> {
    return this.ctx.resume?.() ?? Promise.resolve();
  }
}
