import type { Side } from "./replication.js";

/**
 * docs/NETWORKING.md: RPC call/receive for one-off events (a fired weapon, a chat message)
 * that don't fit the continuous-Component-diff model. 3JSE Graph exposes these as nodes plus
 * `IsServer`/`IsClient` guards; this is the runtime side those nodes compile against.
 */
export type RpcDirection = "toServer" | "toClients" | "toOwner";

export interface RpcDef<T> {
  name: string;
  direction: RpcDirection;
}

export function defineRpc<T>(name: string, direction: RpcDirection): RpcDef<T> {
  return { name, direction };
}

export interface RpcEnvelope {
  rpc: string;
  payload: unknown;
  /** connection this came from (server fills this in on receive) */
  from?: string;
}

export type RpcSender = (envelope: RpcEnvelope, target?: string) => void;

export class RpcHub {
  private handlers = new Map<string, ((payload: unknown, from: string) => void)[]>();

  constructor(private readonly side: Side, private readonly send: RpcSender) {}

  isServer(): boolean {
    return this.side === "server";
  }
  isClient(): boolean {
    return this.side === "client";
  }

  on<T>(def: RpcDef<T>, handler: (payload: T, from: string) => void): void {
    const list = this.handlers.get(def.name) ?? [];
    list.push(handler as (p: unknown, f: string) => void);
    this.handlers.set(def.name, list);
  }

  /** invoke an RPC. Routing is checked against the def's direction and this hub's side. */
  call<T>(def: RpcDef<T>, payload: T, target?: string): void {
    if (def.direction === "toServer" && this.side !== "client") {
      throw new Error(`RPC "${def.name}" is toServer — only a client may call it.`);
    }
    if ((def.direction === "toClients" || def.direction === "toOwner") && this.side !== "server") {
      throw new Error(`RPC "${def.name}" is ${def.direction} — only the server may call it.`);
    }
    this.send({ rpc: def.name, payload }, target);
  }

  /** transport delivers an envelope here */
  receive(envelope: RpcEnvelope): void {
    const list = this.handlers.get(envelope.rpc);
    if (!list) return;
    for (const h of list) h(envelope.payload, envelope.from ?? "");
  }
}
