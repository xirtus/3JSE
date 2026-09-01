import { registerComponent, defaultsFromFields, type ComponentField, type Level, type World } from "@3jse/runtime";

/**
 * docs/NETWORKING.md's replication core. "Which Components, on which Entities, does this
 * connection need diffs for" — not a parallel serializer. A Component opts in via
 * `markReplicated`; the snapshot writer then tracks per-field dirty state and sends only what
 * changed, per tick, at a configurable rate.
 *
 * State replication with server authority — deliberately NOT deterministic lockstep
 * (RUNTIME.md: per-machine deterministic, not cross-platform bit-exact).
 */

export interface ReplicationRule {
  /** fields to replicate; omitted = every field on the component */
  fields?: string[];
  /** fields that should SNAP on the client instead of interpolating (discrete state) */
  snap?: string[];
}

const rules = new Map<string, ReplicationRule>();

export function markReplicated(componentType: string, rule: ReplicationRule = {}): void {
  rules.set(componentType, rule);
}
export function isReplicated(componentType: string): boolean {
  return rules.has(componentType);
}
export function replicationRule(componentType: string): ReplicationRule | undefined {
  return rules.get(componentType);
}
export function replicatedComponentTypes(): string[] {
  return [...rules.keys()].sort();
}

// Authority: which connection may run gameplay-affecting Systems for this entity. "" = server.
const authorityFields: ComponentField[] = [
  { name: "owner", type: "string", default: "" }, // connection id, or "" for server
  { name: "predicted", type: "boolean", default: false }, // owning client predicts locally
];
export type AuthorityData = { owner: string; predicted: boolean };
registerComponent({
  type: "Authority",
  label: "Network Authority",
  fields: authorityFields,
  createDefault: () => defaultsFromFields(authorityFields) as AuthorityData,
});

// NetId: stable cross-connection identity (Entity.id is session-local). Assigned by the server.
const netIdFields: ComponentField[] = [{ name: "id", type: "number", default: 0 }];
export type NetIdData = { id: number };
registerComponent({
  type: "NetId",
  label: "Network Id",
  fields: netIdFields,
  createDefault: () => defaultsFromFields(netIdFields) as NetIdData,
});

export type Side = "server" | "client";

export function hasAuthority(
  side: Side,
  connectionId: string,
  authority: AuthorityData | undefined,
): boolean {
  if (!authority || authority.owner === "") return side === "server";
  return side === "client" && authority.owner === connectionId;
}

// ---- snapshots ------------------------------------------------------------

export interface EntitySnapshot {
  net: number;
  /** name -> present? so a client can spawn/despawn; only on full snapshots */
  spawn?: { name: string };
  despawn?: true;
  /** componentType -> changed field values */
  components: Record<string, Record<string, unknown>>;
}

export interface Snapshot {
  tick: number;
  full: boolean;
  entities: EntitySnapshot[];
}

/** Server-side: watches a Level, emits per-tick delta snapshots (or a full one on demand for a
 *  newly-joined client). Dirty tracking is a shallow value compare against the last sent
 *  values — cheap, and correct for the plain-JSON component contract (ENTITY_COMPONENT_MODEL.md). */
export class SnapshotWriter {
  private lastSent = new Map<number, Record<string, Record<string, unknown>>>();
  private knownNetIds = new Set<number>();

  constructor(private readonly level: Level) {}

  private replicatedEntities() {
    return this.level.query(["NetId"]);
  }

  full(tick: number): Snapshot {
    const entities: EntitySnapshot[] = [];
    const seen = new Set<number>();
    for (const e of this.replicatedEntities()) {
      const net = e.getComponent<NetIdData>("NetId")!.id;
      seen.add(net);
      const components: Record<string, Record<string, unknown>> = {};
      const store: Record<string, Record<string, unknown>> = {};
      for (const type of e.listComponentTypes()) {
        const rule = replicationRule(type);
        if (!rule) continue;
        const data = e.getComponent<Record<string, unknown>>(type)!;
        const picked = pick(data, rule.fields);
        components[type] = picked;
        store[type] = { ...picked };
      }
      this.lastSent.set(net, store);
      this.knownNetIds.add(net);
      entities.push({ net, spawn: { name: e.name }, components });
    }
    return { tick, full: true, entities };
  }

  delta(tick: number): Snapshot {
    const entities: EntitySnapshot[] = [];
    const seen = new Set<number>();
    for (const e of this.replicatedEntities()) {
      const net = e.getComponent<NetIdData>("NetId")!.id;
      seen.add(net);
      const prev = this.lastSent.get(net);
      const isNew = !this.knownNetIds.has(net);
      const components: Record<string, Record<string, unknown>> = {};
      const store: Record<string, Record<string, unknown>> = prev ? { ...prev } : {};
      for (const type of e.listComponentTypes()) {
        const rule = replicationRule(type);
        if (!rule) continue;
        const data = e.getComponent<Record<string, unknown>>(type)!;
        const picked = pick(data, rule.fields);
        const before = prev?.[type];
        const changed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(picked)) {
          if (!before || before[k] !== v) changed[k] = v;
        }
        if (Object.keys(changed).length || isNew) components[type] = isNew ? picked : changed;
        store[type] = { ...picked };
      }
      this.lastSent.set(net, store);
      if (isNew) {
        this.knownNetIds.add(net);
        entities.push({ net, spawn: { name: e.name }, components });
      } else if (Object.keys(components).length) {
        entities.push({ net, components });
      }
    }
    // despawns
    for (const net of [...this.knownNetIds]) {
      if (!seen.has(net)) {
        entities.push({ net, despawn: true, components: {} });
        this.knownNetIds.delete(net);
        this.lastSent.delete(net);
      }
    }
    return { tick, full: false, entities };
  }
}

function pick(data: Record<string, unknown>, fields?: string[]): Record<string, unknown> {
  if (!fields) return { ...data };
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in data) out[f] = data[f];
  return out;
}

/** Client-side: apply a snapshot onto a local Level, spawning/despawning by NetId. Fields in a
 *  component's `snap` list are written directly; everything else is written too here (snapshot
 *  interpolation is a render-time concern layered on by the interpolation buffer). */
export function applySnapshot(
  world: World,
  level: Level,
  snap: Snapshot,
  opts: { onSpawn?: (name: string, net: number) => void } = {},
): void {
  const byNet = new Map<number, ReturnType<Level["getEntity"]>>();
  for (const e of level.query(["NetId"])) byNet.set(e.getComponent<NetIdData>("NetId")!.id, e);

  for (const es of snap.entities) {
    if (es.despawn) {
      const e = byNet.get(es.net);
      if (e) level.destroyEntity(e.id);
      continue;
    }
    let e = byNet.get(es.net);
    if (!e && es.spawn) {
      e = level.createEntity(es.spawn.name);
      e.addComponent("NetId", { id: es.net });
      byNet.set(es.net, e);
      opts.onSpawn?.(es.spawn.name, es.net);
    }
    if (!e) continue; // delta for an entity we never got a spawn for — ignore until full sync
    for (const [type, fields] of Object.entries(es.components)) {
      const data = e.hasComponent(type) ? e.getComponent<Record<string, unknown>>(type)! : e.addComponent(type);
      Object.assign(data, fields);
    }
  }
}
