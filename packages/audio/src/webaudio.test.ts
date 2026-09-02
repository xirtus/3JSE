import { describe, expect, it, vi } from "vitest";
import { WebAudioBackend, type WAContext } from "./webaudio.js";

// A mock AudioContext that records the node graph, so the backend's wiring is testable with
// no real Web Audio. The browser exercises actual playback.
function mockContext() {
  const connections: [string, string][] = [];
  let nodeSeq = 0;
  const node = (kind: string) => {
    const id = `${kind}${nodeSeq++}`;
    return {
      id,
      connect: (t: { id?: string }) => connections.push([id, t?.id ?? "destination"]),
      disconnect: vi.fn(),
    };
  };
  const ctx = {
    currentTime: 0,
    destination: { id: "destination" },
    listener: { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, forwardX: { value: 0 }, forwardY: { value: 0 }, forwardZ: { value: -1 } },
    createGain: () => ({ ...node("gain"), gain: { value: 1, setTargetAtTime: vi.fn() } }),
    createPanner: () => ({ ...node("panner"), positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 }, refDistance: 1, maxDistance: 40, panningModel: "", distanceModel: "" }),
    createBufferSource: () => ({ ...node("source"), loop: false, playbackRate: { value: 1 }, buffer: null as unknown, start: vi.fn(), stop: vi.fn(), onended: null }),
    resume: vi.fn(async () => {}),
  } as unknown as WAContext;
  return { ctx, connections };
}

describe("WebAudioBackend", () => {
  it("2D sound: source -> gain -> destination", async () => {
    const { ctx, connections } = mockContext();
    const backend = new WebAudioBackend({ context: ctx, loadClip: async () => ({ mock: "buffer" }) });
    backend.play("s1", { clip: "hit.opus", gain: 0.5, loop: false, spatialBlend: 0 });
    await Promise.resolve(); await Promise.resolve();
    expect(backend.active()).toEqual(["s1"]);
    expect(connections).toContainEqual(["source0", "gain1"]);
    expect(connections).toContainEqual(["gain1", "destination"]);
  });

  it("spatial sound inserts a panner: source -> panner -> gain -> destination", async () => {
    const { ctx, connections } = mockContext();
    const backend = new WebAudioBackend({ context: ctx, loadClip: async () => ({}) });
    backend.play("s2", { clip: "wind.opus", gain: 1, loop: true, position: { x: 3, y: 0, z: 0 }, spatialBlend: 1, minDistance: 2, maxDistance: 50 });
    await Promise.resolve(); await Promise.resolve();
    // node order: createBufferSource (source0), createGain (gain1), createPanner (panner2)
    expect(connections).toContainEqual(["source0", "panner2"]);
    expect(connections).toContainEqual(["panner2", "gain1"]);
    expect(connections).toContainEqual(["gain1", "destination"]);
  });

  it("caches decoded buffers per clip name", async () => {
    const { ctx } = mockContext();
    const loadClip = vi.fn(async () => ({}));
    const backend = new WebAudioBackend({ context: ctx, loadClip });
    backend.play("a", { clip: "same.opus", gain: 1, loop: false });
    backend.play("b", { clip: "same.opus", gain: 1, loop: false });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(loadClip).toHaveBeenCalledTimes(1);
  });

  it("stop() disconnects and drops the voice; setListener writes the AudioListener", async () => {
    const { ctx } = mockContext();
    const backend = new WebAudioBackend({ context: ctx, loadClip: async () => ({}) });
    backend.play("s", { clip: "c.opus", gain: 1, loop: true });
    await Promise.resolve(); await Promise.resolve();
    backend.stop("s");
    expect(backend.active()).toEqual([]);
    backend.setListener({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 });
    expect(ctx.listener.positionX!.value).toBe(1);
    expect(ctx.listener.positionZ!.value).toBe(3);
  });
});
