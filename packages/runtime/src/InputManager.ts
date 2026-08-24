/** The Resource key InputManager registers itself under — docs/RUNTIME.md's Resource registry. */
export const INPUT_RESOURCE = "Input";

export interface AxisBinding {
  positive: string[];
  negative: string[];
}

type EventTargetLike = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Device-agnostic action/axis input mapping — docs/GAMEPLAY_FRAMEWORK.md's InputManager row.
 * Framework-agnostic on purpose: `press()`/`release()` drive all state directly, so a headless
 * test (or a future non-keyboard device) never needs a DOM. `attach()` is the optional adapter
 * that wires real browser keyboard events onto that same state machine.
 */
export class InputManager {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly releasedThisFrame = new Set<string>();
  private readonly actions = new Map<string, string[]>();
  private readonly axes = new Map<string, AxisBinding>();

  bindAction(name: string, keys: string[]): void {
    this.actions.set(name, keys);
  }

  /** What an Input Mapping panel lists (docs/EDITOR.md) — read-only introspection; editing
   *  bindings from the panel is docs/ROADMAP.md Phase 5 territory, not built yet. */
  getActionBinding(name: string): string[] | undefined {
    return this.actions.get(name);
  }

  getAxisBinding(name: string): AxisBinding | undefined {
    return this.axes.get(name);
  }

  listActionNames(): string[] {
    return Array.from(this.actions.keys());
  }

  listAxisNames(): string[] {
    return Array.from(this.axes.keys());
  }

  bindAxis(name: string, positive: string[], negative: string[]): void {
    this.axes.set(name, { positive, negative });
  }

  press(code: string): void {
    if (!this.down.has(code)) this.pressedThisFrame.add(code);
    this.down.add(code);
  }

  release(code: string): void {
    this.down.delete(code);
    this.releasedThisFrame.add(code);
  }

  isKeyDown(code: string): boolean {
    return this.down.has(code);
  }

  isActionDown(name: string): boolean {
    return (this.actions.get(name) ?? []).some((k) => this.down.has(k));
  }

  wasActionPressed(name: string): boolean {
    return (this.actions.get(name) ?? []).some((k) => this.pressedThisFrame.has(k));
  }

  wasActionReleased(name: string): boolean {
    return (this.actions.get(name) ?? []).some((k) => this.releasedThisFrame.has(k));
  }

  /** -1..1. Both directions held (or neither) resolves to 0. */
  getAxis(name: string): number {
    const binding = this.axes.get(name);
    if (!binding) return 0;
    const positive = binding.positive.some((k) => this.down.has(k)) ? 1 : 0;
    const negative = binding.negative.some((k) => this.down.has(k)) ? 1 : 0;
    return positive - negative;
  }

  /** Clears this-frame press/release edges. Call once per tick after Systems have read them —
   *  docs/RUNTIME.md's tick loop stage 1 (input sampling). */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  /** Wires real `keydown`/`keyup` listeners onto `target` (typically `window`). Returns a
   *  cleanup function. Entirely optional — see the class doc comment. */
  attach(target: EventTargetLike): () => void {
    const onKeyDown = (e: Event) => this.press((e as KeyboardEvent).code);
    const onKeyUp = (e: Event) => this.release((e as KeyboardEvent).code);
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
    return () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
    };
  }
}
