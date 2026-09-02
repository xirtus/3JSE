import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import {
  MixerGraph,
  NullBackend,
  createAudioSystem,
  AudioEventRouter,
  quantize,
  stepDuration,
  scaleDegreeToMidi,
  MusicDirector,
  NullMidiOut,
  type MusicalContext,
} from "./index.js";
import "./components.js";

function scene() {
  const world = new World();
  const level = world.createLevel("Shot");
  const listener = level.createEntity("Ears");
  listener.addComponent("AudioListener");
  const src = level.createEntity("Speaker");
  src.object3D!.position.set(3, 0, 0);
  src.addComponent("AudioSource", { clip: "hum.opus", bus: "SFX", loop: true, volume: 0.5 });
  return { world, level, src, listener };
}

describe("MixerGraph", () => {
  it("effective gain multiplies down the bus chain, mute zeroes it", () => {
    const m = new MixerGraph();
    m.setVolume("Master", 0.5);
    m.setVolume("SFX", 0.8);
    expect(m.effectiveGain("SFX")).toBeCloseTo(0.4, 5);
    m.setMute("Master", true);
    expect(m.effectiveGain("SFX")).toBe(0);
  });

  it("ducking lowers the target bus while a source on the trigger bus plays", () => {
    const m = new MixerGraph(); // default: Voice ducks Music by 0.35
    const music = m.effectiveGain("Music");
    m.noteActive("Voice", true);
    expect(m.effectiveGain("Music")).toBeCloseTo(music * 0.35, 5);
    m.noteActive("Voice", false);
    expect(m.effectiveGain("Music")).toBeCloseTo(music, 5);
  });
});

describe("createAudioSystem", () => {
  it("starts/updates/stops the backend on the AudioSource playing edge, with resolved gain", () => {
    const { world, src } = scene();
    const mixer = new MixerGraph();
    const backend = new NullBackend();
    world.scheduler.register(createAudioSystem(mixer, backend));

    world.step(1 / 60); // playing = false -> nothing
    expect(backend.active()).toEqual([]);

    src.getComponent<Record<string, unknown>>("AudioSource")!.playing = true;
    world.step(1 / 60);
    expect(backend.active()).toEqual([src.id]);
    const play = backend.calls.find((c) => c.op === "play")!;
    expect((play.params as { clip: string }).clip).toBe("hum.opus");
    // SFX default 1 * Master 1 * source volume 0.5
    expect(backend.gainOf(src.id)).toBeCloseTo(0.5, 5);
    expect((play.params as { position?: unknown }).position).toEqual({ x: 3, y: 0, z: 0 });

    mixer.setVolume("SFX", 0.5);
    world.step(1 / 60);
    expect(backend.gainOf(src.id)).toBeCloseTo(0.25, 5);

    src.getComponent<Record<string, unknown>>("AudioSource")!.playing = false;
    world.step(1 / 60);
    expect(backend.active()).toEqual([]);
  });

  it("publishes the AudioListener pose to the backend", () => {
    const { world, listener } = scene();
    listener.object3D!.position.set(1, 2, 3);
    world.scheduler.register(createAudioSystem(new MixerGraph(), new NullBackend()));
    const backend = new NullBackend();
    world.scheduler.register(createAudioSystem(new MixerGraph(), backend));
    world.step(1 / 60);
    const l = backend.calls.find((c) => c.op === "setListener")!;
    expect((l.params as { position: unknown }).position).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe("AudioEventRouter", () => {
  it("wires an event name to a play action on a target AudioSource — no gameplay code involved", () => {
    const { world, level, src } = scene();
    const backend = new NullBackend();
    world.scheduler.register(createAudioSystem(new MixerGraph(), backend));
    const router = new AudioEventRouter().add({ event: "player.landed", action: "play", target: src.id });

    router.fire(level, "player.jumped"); // no trigger -> nothing
    world.step(1 / 60);
    expect(backend.active()).toEqual([]);

    router.fire(level, "player.landed");
    world.step(1 / 60);
    expect(backend.active()).toEqual([src.id]);
  });
});

describe("musical grid + MIDI bridge", () => {
  const ctx: MusicalContext = { bpm: 120, grid: 16, root: 0, scale: "pentatonicMinor" };

  it("quantize snaps a time up to the next grid step", () => {
    const step = stepDuration(ctx); // 60/120/16 = 0.03125 s
    expect(quantize(0, ctx)).toBeCloseTo(0, 6);
    expect(quantize(step * 0.4, ctx)).toBeCloseTo(step, 6);
    expect(quantize(step * 2.1, ctx)).toBeCloseTo(step * 3, 6);
  });

  it("scaleDegreeToMidi walks the scale and wraps octaves", () => {
    expect(scaleDegreeToMidi(ctx, 0)).toBe(60); // C5
    expect(scaleDegreeToMidi(ctx, 1)).toBe(63); // Eb (pentatonic minor: +3)
    expect(scaleDegreeToMidi(ctx, 5)).toBe(72); // one octave up = degree 0 + 12
    expect(scaleDegreeToMidi(ctx, -1)).toBe(58); // wrap down an octave to the top scale degree: Bb3
  });

  it("MusicDirector emits 24-PPQN clock from world time and plays quantized scale-degree notes", () => {
    const midi = new NullMidiOut();
    const dir = new MusicDirector(ctx, midi);
    dir.start(0);
    dir.advance(0.5); // 0.5s @ 120bpm = 1 beat = 24 ticks
    expect(midi.sent.filter((m) => m.op === "clock").length).toBe(24);

    dir.hit(0.51, 2, { velocity: 90 });
    const note = midi.sent.find((m) => m.op === "noteOn")!;
    expect(note.args[0]).toBe(scaleDegreeToMidi(ctx, 2));
    expect(note.args[1]).toBe(90);
  });
});
