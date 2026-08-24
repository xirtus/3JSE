import { evaluate1DBlendWeights, type BlendTreeEntry } from "./BlendTree.js";

/** Parameters an AnimationGraph's transition conditions and blend trees read each tick — plain
 *  numbers only (a boolean like "grounded" is 1/0), so a transition condition can stay a small
 *  declarative comparison instead of an opaque closure. */
export type AnimationParams = Record<string, number>;

export interface TransitionCondition {
  param: string;
  op: ">" | ">=" | "<" | "<=" | "==";
  value: number;
}

export function evaluateConditions(conditions: TransitionCondition[], params: AnimationParams): boolean {
  return conditions.every((c) => {
    const value = params[c.param] ?? 0;
    switch (c.op) {
      case ">":
        return value > c.value;
      case ">=":
        return value >= c.value;
      case "<":
        return value < c.value;
      case "<=":
        return value <= c.value;
      case "==":
        return value === c.value;
    }
  });
}

export interface AnimationStateDef {
  name: string;
  loop: boolean;
  /** Either a single clip, or a 1D blend tree over several — not both. */
  clip?: string;
  blendTree?: BlendTreeEntry[];
}

export interface AnimationTransitionDef {
  /** A specific state name, or "*" to match from any state (docs/ANIMATION.md's state
   *  machine — the "*" convention Unity/Unreal state machines use for the same thing). */
  from: string;
  to: string;
  conditions: TransitionCondition[];
  /** Crossfade duration in seconds. */
  duration?: number;
}

export interface AnimationGraphDef {
  states: AnimationStateDef[];
  transitions: AnimationTransitionDef[];
  entryState: string;
}

export function getState(graph: AnimationGraphDef, name: string): AnimationStateDef | undefined {
  return graph.states.find((s) => s.name === name);
}

/** The clip weights a state contributes at full activation — a blend-tree state's weights per
 *  its current parameter value, or `{clip: 1}` for a single-clip state. */
export function stateClipWeights(
  state: AnimationStateDef,
  params: AnimationParams,
): { clip: string; weight: number }[] {
  if (state.blendTree) {
    // A blend tree currently always reads a parameter named "speed" — the one case this MVP's
    // locomotion demo needs (docs/ANIMATION.md). A blend tree keyed by an arbitrary named
    // parameter is a straightforward follow-up, not built here.
    return evaluate1DBlendWeights(state.blendTree, params.speed ?? 0);
  }
  return state.clip ? [{ clip: state.clip, weight: 1 }] : [];
}
