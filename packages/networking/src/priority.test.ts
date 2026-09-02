import { describe, expect, it } from "vitest";
import { PriorityAccumulator, HistoryBuffer, WebSocketTransport, type RepEntity, type RepConnection, type WebSocketLike } from "./index.js";

const conn: RepConnection = { viewpoint: [0, 0, 0], interestRadius: 100, byteBudget: 30 };
const ents: RepEntity[] = [
  { netId: 1, basePriority: 1, position: [1, 0, 0], size: 10 },     // close, low base
  { netId: 2, basePriority: 5, position: [50, 0, 0], size: 10 },    // mid, high base
  { netId: 3, basePriority: 1, position: [200, 0, 0], size: 10 },   // outside interest
  { netId: 4, basePriority: 1, position: [3, 0, 0], size: 10, alwaysRelevant: true },
];

describe("PriorityAccumulator", () => {
  it("culls out-of-interest entities and fits the byte budget", () => {
    const acc = new PriorityAccumulator();
    const chosen = acc.select(conn, ents).map((c) => c.netId).sort();
    expect(chosen).not.toContain(3); // outside interestRadius
    // budget 30, always-relevant (#4) is free, then 2 more of {1,2} fit (10 each)
    expect(chosen).toContain(4);
    expect(chosen.filter((id) => id !== 4).length).toBe(2);
  });

  it("always-relevant entities are sent regardless of budget", () => {
    const acc = new PriorityAccumulator();
    const tight: RepConnection = { ...conn, byteBudget: 0 };
    const chosen = acc.select(tight, ents).map((c) => c.netId);
    expect(chosen).toEqual([4]);
  });

  it("starved entities accumulate priority and eventually get picked", () => {
    const acc = new PriorityAccumulator();
    // budget only fits 1 non-always entity per tick
    const c: RepConnection = { ...conn, byteBudget: 10 };
    const seen = new Set<number>();
    for (let t = 0; t < 20; t++) {
      for (const s of acc.select(c, ents)) seen.add(s.netId);
    }
    // over 20 ticks every in-interest entity should have been sent at least once
    expect(seen).toEqual(new Set([1, 2, 4]));
  });
});

describe("HistoryBuffer (lag compensation)", () => {
  it("records ticks, rewinds (with interpolation), and drops entries past capacity", () => {
    const h = new HistoryBuffer(3);
    for (let t = 0; t < 5; t++) h.record(t, [[1, [t, 0, 0]]]);
    expect(h.length).toBe(3);
    expect(h.oldestTick).toBe(2);
    expect(h.at(3)!.positions.get(1)).toEqual([3, 0, 0]);
    // interpolate between tick 2 and 4 (tick 3 exists here, but test a fractional query)
    const h2 = new HistoryBuffer(8);
    h2.record(0, [[1, [0, 0, 0]]]);
    h2.record(10, [[1, [10, 0, 0]]]);
    expect(h2.at(4)!.positions.get(1)![0]).toBeCloseTo(4, 5);
  });

  it("validateHit rewinds and ray-tests against the historical position", () => {
    const h = new HistoryBuffer(16);
    // target at x=5 at tick 0, moved to x=50 by tick 10
    h.record(0, [[7, [5, 0, 0]]]);
    h.record(10, [[7, [50, 0, 0]]]);
    // client (200ms behind ≈ tick 4) shoots down +X from origin
    const hit = h.validateHit(4, [0, 0, 0], [1, 0, 0], 1.5, [7]);
    // at tick 4 the target is near x≈23 — a shot with radius 1.5 straight down X hits it
    expect(hit).toBe(7);
    // the same shot validated against *current* (tick 10, x=50) still hits since it's on the axis;
    // validate a miss instead: shoot up +Y
    expect(h.validateHit(4, [0, 0, 0], [0, 1, 0], 1.5, [7])).toBeNull();
  });
});

describe("WebSocketTransport", () => {
  function fakeSocket() {
    const listeners: Record<string, ((ev?: { data: unknown }) => void)[]> = {};
    const sent: string[] = [];
    const sock = {
      readyState: 0,
      send: (d: string) => sent.push(d),
      close: () => {},
      addEventListener: (type: string, cb: (ev?: { data: unknown }) => void) => {
        (listeners[type] ??= []).push(cb);
      },
    } as unknown as WebSocketLike;
    return {
      sock, sent,
      fire: (type: string, ev?: { data: unknown }) => listeners[type]?.forEach((cb) => cb(ev)),
      setOpen: () => { (sock as unknown as { readyState: number }).readyState = 1; },
    };
  }

  it("buffers sends until open, then flushes; delivers decoded messages to handlers", () => {
    const f = fakeSocket();
    const t = new WebSocketTransport(f.sock);
    t.send({ hello: 1 });
    expect(f.sent).toEqual([]);
    expect(t.pendingCount).toBe(1);

    f.setOpen();
    f.fire("open");
    expect(JSON.parse(f.sent[0]!)).toEqual({ hello: 1 });

    const got: unknown[] = [];
    t.onMessage((m) => got.push(m));
    f.fire("message", { data: JSON.stringify({ tick: 42 }) });
    expect(got).toEqual([{ tick: 42 }]);
  });

  it("drops an unparseable frame instead of throwing", () => {
    const f = fakeSocket();
    const t = new WebSocketTransport(f.sock);
    t.onMessage(() => { throw new Error("should not be called"); });
    expect(() => f.fire("message", { data: "{not json" })).not.toThrow();
  });
});
