/**
 * The interpreter's (and, for `call`, the emitter's) only door into the outside world —
 * `@3jse/ir` has no dependency on `@3jse/runtime` or any other engine package, on purpose:
 * docs/GAMEPLAY_IR.md's whole point is that 3IR is frontend/backend-agnostic, so the package
 * that turns "entity" from an opaque value into a real `@3jse/runtime` `Entity` belongs to
 * whoever's doing the integrating (see packages/ir/src/entityRoundtrip.test.ts), not to the IR
 * core itself. Entities flow through the interpreter as `unknown` — the host is the only thing
 * that knows what to do with one.
 */
export interface IRHost {
  hasComponent(entity: unknown, component: string): boolean;
  getField(entity: unknown, component: string, field: string): unknown;
  setField(entity: unknown, component: string, field: string, value: unknown): void;
  /** Dispatches a CallNode/`target` by name — the interpreter's side of the "engine API call"
   *  half of docs/GAMEPLAY_IR.md's `{ kind: "call" }`. */
  call(name: string, args: unknown[]): unknown;
}
