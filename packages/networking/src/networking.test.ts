import { describe, expect, it, beforeAll } from "vitest";
import { World, registerComponent, defaultsFromFields, type ComponentField } from "@3jse/runtime";
import {
  markReplicated,
  hasAuthority,
  SnapshotWriter,
  applySnapshot,
} from "./replication.js";
import { LoopbackPair } from "./transport.js";
import { PredictedController } from "./prediction.js";
import { defineRpc, RpcHub, type RpcEnvelope } from "./rpc.js";
import "./replication.js";

const posFields: ComponentField[] = [
  { name: "x", type: "number", default: 0 },
  { name: "y", type: "number", default: 0 },
  { name: "state", type: "string", default: "idle" },
];
beforeAll(() => {
  registerComponent({
    type: "NetPos",
    label: "NetPos",
    fields: posFields,
    createDefault: () => defaultsFromFields(posFields) as Record<string, unknown>,
  });
  markReplicated("NetPos", { snap: ["state"] });
});

describe("@3jse/networking — replication", () => {
  it("full snapshot then deltas carry only changed fields", () => {
    const server = new World();
    const sLevel = server.createLevel("S");
    const e = sLevel.createEntity("Player");
    e.addComponent("NetId", { id: 1 });
    e.addComponent("NetPos", { x: 0, y: 0, state: "idle" });

    const writer = new SnapshotWriter(sLevel);
    const full = writer.full(0);
    expect(full.entities).toHaveLength(1);
    expect(full.entities[0]!.components.NetPos).toEqual({ x: 0, y: 0, state: "idle" });

    // no change -> empty delta
    expect(writer.delta(1).entities).toHaveLength(0);

    // change one field -> delta has only that field
    e.getComponent<Record<string, unknown>>("NetPos")!.x = 5;
    const d = writer.delta(2);
    expect(d.entities[0]!.components.NetPos).toEqual({ x: 5 });
  });

  it("client applies snapshots: spawn, update, despawn by NetId", () => {
    const server = new World();
    const sLevel = server.createLevel("S");
    const e = sLevel.createEntity("Bot");
    e.addComponent("NetId", { id: 7 });
    e.addComponent("NetPos", { x: 1, y: 2, state: "run" });
    const writer = new SnapshotWriter(sLevel);

    const client = new World();
    const cLevel = client.createLevel("C");
    const spawns: number[] = [];

    applySnapshot(client, cLevel, writer.full(0), { onSpawn: (_n, net) => spawns.push(net) });
    expect(spawns).toEqual([7]);
    const ce = cLevel.query(["NetId"])[0]!;
    expect(ce.getComponent<Record<string, unknown>>("NetPos")).toMatchObject({ x: 1, y: 2, state: "run" });

    e.getComponent<Record<string, unknown>>("NetPos")!.x = 99;
    applySnapshot(client, cLevel, writer.delta(1));
    expect(ce.getComponent<Record<string, unknown>>("NetPos")!.x).toBe(99);

    sLevel.destroyEntity(e.id);
    applySnapshot(client, cLevel, writer.delta(2));
    expect(cLevel.query(["NetId"])).toHaveLength(0);
  });

  it("authority: server owns unowned entities; owning client owns predicted ones", () => {
    expect(hasAuthority("server", "conn-a", { owner: "", predicted: false })).toBe(true);
    expect(hasAuthority("client", "conn-a", { owner: "", predicted: false })).toBe(false);
    expect(hasAuthority("client", "conn-a", { owner: "conn-a", predicted: true })).toBe(true);
    expect(hasAuthority("client", "conn-b", { owner: "conn-a", predicted: true })).toBe(false);
  });
});

describe("@3jse/networking — prediction / reconciliation", () => {
  type S = { x: number };
  type I = { dx: number };
  const step = (s: S, i: I) => ({ x: s.x + i.dx });

  it("no correction when server agrees", () => {
    const pc = new PredictedController<S, I>({ x: 0 }, { step });
    pc.applyInput({ dx: 1 }, 1);
    pc.applyInput({ dx: 1 }, 1);
    expect(pc.state.x).toBe(2);
    const r = pc.reconcile(2, { x: 2 });
    expect(r.corrected).toBe(false);
    expect(pc.pendingCount).toBe(0);
  });

  it("snaps to server state and replays unacked inputs on a mismatch", () => {
    const pc = new PredictedController<S, I>({ x: 0 }, { step });
    pc.applyInput({ dx: 1 }, 1); // seq 1
    pc.applyInput({ dx: 1 }, 1); // seq 2
    pc.applyInput({ dx: 1 }, 1); // seq 3, local x = 3
    // server processed up to seq 1 but says x was 10 there (e.g. knockback)
    const r = pc.reconcile(1, { x: 10 });
    expect(r.corrected).toBe(true);
    expect(r.replayed).toBe(2); // seq 2 and 3 replayed
    expect(pc.state.x).toBe(12); // 10 + 1 + 1
  });
});

describe("@3jse/networking — transport + RPC", () => {
  it("LoopbackPair delivers with configurable latency", () => {
    const pair = new LoopbackPair(2);
    const got: unknown[] = [];
    pair.b.onMessage((m) => got.push(m));
    pair.a.send({ hi: 1 });
    pair.flush(); // t=1
    expect(got).toHaveLength(0);
    pair.flush(); // t=2, due
    expect(got).toEqual([{ hi: 1 }]);
  });

  it("RPC routing respects direction and side", () => {
    const fire = defineRpc<{ weapon: string }>("fire", "toServer");
    const outbox: RpcEnvelope[] = [];
    const client = new RpcHub("client", (env) => outbox.push(env));
    const server = new RpcHub("server", () => {});
    const heard: string[] = [];
    server.on(fire, (p, from) => heard.push(`${from}:${p.weapon}`));

    client.call(fire, { weapon: "rail" });
    expect(outbox[0]).toMatchObject({ rpc: "fire", payload: { weapon: "rail" } });
    server.receive({ ...outbox[0]!, from: "conn-x" });
    expect(heard).toEqual(["conn-x:rail"]);

    // a server-only RPC can't be called from the server-less... i.e. client can't call toClients
    const spawn = defineRpc("spawn", "toClients");
    expect(() => client.call(spawn, {})).toThrow(/only the server/);
  });
});
