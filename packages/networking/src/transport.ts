/**
 * docs/NETWORKING.md: "The transport is an interface @3jse/networking depends on, not a
 * hardcoded assumption." WebSocket ships as the default in a shipped game; this package only
 * needs the interface + an in-memory loopback so the replication core is testable with no
 * server and no sockets.
 */

export interface Transport {
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
  close(): void;
}

/** A synchronous in-memory pair — a.send() is delivered to b's handler and vice versa.
 *  `latencyTicks` lets a test simulate delayed delivery via `flush()`. */
export class LoopbackPair {
  readonly a: Transport;
  readonly b: Transport;
  private aHandlers: ((m: unknown) => void)[] = [];
  private bHandlers: ((m: unknown) => void)[] = [];
  private queueToA: { at: number; m: unknown }[] = [];
  private queueToB: { at: number; m: unknown }[] = [];
  private now = 0;

  constructor(private readonly latencyTicks = 0) {
    this.a = {
      send: (m) => this.queueToB.push({ at: this.now + this.latencyTicks, m: clone(m) }),
      onMessage: (h) => this.aHandlers.push(h),
      close: () => {},
    };
    this.b = {
      send: (m) => this.queueToA.push({ at: this.now + this.latencyTicks, m: clone(m) }),
      onMessage: (h) => this.bHandlers.push(h),
      close: () => {},
    };
  }

  /** advance one tick and deliver anything now due */
  flush(): void {
    this.now++;
    const dueB = this.queueToB.filter((x) => x.at <= this.now);
    this.queueToB = this.queueToB.filter((x) => x.at > this.now);
    for (const x of dueB) for (const h of this.bHandlers) h(x.m);
    const dueA = this.queueToA.filter((x) => x.at <= this.now);
    this.queueToA = this.queueToA.filter((x) => x.at > this.now);
    for (const x of dueA) for (const h of this.aHandlers) h(x.m);
  }
}

function clone<T>(v: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);
}
