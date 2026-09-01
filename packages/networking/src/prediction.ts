/**
 * docs/NETWORKING.md: "Client-side prediction + reconciliation for the locally-controlled
 * player: input is applied immediately client-side for responsiveness, corrected against the
 * authoritative server snapshot when it arrives, using standard input-buffering/replay-on-
 * correction — implemented once in @3jse/networking, not something every game reimplements."
 *
 * Generic over the predicted state `S` and the per-tick input `I`. The caller supplies a pure
 * `step(state, input, dt)` (the same integration the server runs) — this class owns only the
 * buffering and replay.
 */
export interface PredictionConfig<S, I> {
  step: (state: S, input: I, dt: number) => S;
  /** structural clone of a state value (default: structuredClone/JSON) */
  clone?: (s: S) => S;
  /** true if the predicted and authoritative states are close enough to skip a correction */
  reconciled?: (predicted: S, authoritative: S) => boolean;
}

interface Pending<I> {
  seq: number;
  input: I;
  dt: number;
}

export class PredictedController<S, I> {
  private pending: Pending<I>[] = [];
  private seq = 0;
  private _state: S;
  private readonly clone: (s: S) => S;

  constructor(initial: S, private readonly cfg: PredictionConfig<S, I>) {
    this.clone = cfg.clone ?? ((s) => (typeof structuredClone === "function" ? structuredClone(s) : JSON.parse(JSON.stringify(s))));
    this._state = this.clone(initial);
  }

  get state(): S {
    return this._state;
  }
  get pendingCount(): number {
    return this.pending.length;
  }

  /** apply an input locally right now, buffer it for later replay, return its sequence number
   *  (the client sends `{ seq, input }` to the server) */
  applyInput(input: I, dt: number): number {
    const seq = ++this.seq;
    this.pending.push({ seq, input, dt });
    this._state = this.cfg.step(this._state, input, dt);
    return seq;
  }

  /** server told us "at your input `ackSeq`, the authoritative state was `authoritative`".
   *  Drop acked inputs, and if the server disagrees with what we predicted, snap to the
   *  server state and replay every still-unacked input on top of it. */
  reconcile(ackSeq: number, authoritative: S): { corrected: boolean; replayed: number } {
    this.pending = this.pending.filter((p) => p.seq > ackSeq);
    const ok = this.cfg.reconciled
      ? this.cfg.reconciled(this._state, authoritative)
      : shallowEqual(this._state, authoritative);
    if (ok) return { corrected: false, replayed: 0 };
    let s = this.clone(authoritative);
    for (const p of this.pending) s = this.cfg.step(s, p.input, p.dt);
    this._state = s;
    return { corrected: true, replayed: this.pending.length };
  }
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
