// A WebSocket-backed Transport (docs/NETWORKING.md: "WebSocket is the default transport in a
// shipped game"). Depends only on the standard WebSocket shape, so it works with the browser
// global, a Node `ws`, or a fake in tests. JSON framing by default; a binary codec is a drop-in.

import type { Transport } from "./transport.js";

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: "message", cb: (ev: { data: unknown }) => void): void;
  addEventListener(type: "open" | "close" | "error", cb: () => void): void;
  readyState: number;
}

export interface WebSocketTransportOptions {
  /** serialize an outgoing message (default JSON.stringify) */
  encode?: (message: unknown) => string;
  /** parse an incoming frame (default JSON.parse) */
  decode?: (data: string) => unknown;
  /** buffer sends until the socket is OPEN, then flush (default true) */
  bufferUntilOpen?: boolean;
}

const OPEN = 1;

export class WebSocketTransport implements Transport {
  private readonly handlers: ((m: unknown) => void)[] = [];
  private readonly outbox: unknown[] = [];
  private open: boolean;
  private readonly encode: (m: unknown) => string;
  private readonly decode: (d: string) => unknown;

  constructor(private readonly socket: WebSocketLike, opts: WebSocketTransportOptions = {}) {
    this.encode = opts.encode ?? ((m) => JSON.stringify(m));
    this.decode = opts.decode ?? ((d) => JSON.parse(d));
    this.open = socket.readyState === OPEN;

    socket.addEventListener("message", (ev) => {
      let parsed: unknown;
      try {
        parsed = this.decode(String(ev.data));
      } catch {
        return; // drop unparseable frames rather than throw in the socket callback
      }
      for (const h of this.handlers) h(parsed);
    });
    socket.addEventListener("open", () => {
      this.open = true;
      if (opts.bufferUntilOpen !== false) {
        for (const m of this.outbox.splice(0)) this.socket.send(this.encode(m));
      }
    });
    socket.addEventListener("close", () => {
      this.open = false;
    });
  }

  send(message: unknown): void {
    if (this.open) this.socket.send(this.encode(message));
    else this.outbox.push(message);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handlers.push(handler);
  }

  close(): void {
    this.socket.close();
    this.open = false;
  }

  get pendingCount(): number {
    return this.outbox.length;
  }
}
