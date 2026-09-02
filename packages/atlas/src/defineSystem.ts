// The Atlas semantic contract — docs/3JSE_ATLAS_FULL_PLAN.md §4, §40.
//
// This is NOT the ECS Scheduler's SystemDef (@3jse/runtime). That defines *execution*: a
// query + a run() the tick loop calls. `defineSystem` here defines *meaning*: what a chunk of
// the game is for, what it owns, what it depends on, what it emits, and which values are safe
// for a human to tune. Atlas is generated from these declarations plus other project sources;
// it never becomes the source of program logic (§2.1, §60).

export type AtlasDomain =
  | "gameplay"
  | "physics"
  | "animation"
  | "world"
  | "ai"
  | "ui"
  | "audio"
  | "assets"
  | "providers"
  | "style"
  | "core";

/** One safe, human-tunable value on a system (§4 `knobs`, §21 node interior, §54.4). */
export interface AtlasKnob {
  type: "number" | "boolean" | "enum";
  /** current value; falls back to `default` when absent */
  value?: number | boolean | string;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** groups knobs in the inspector (§4 `category`) */
  category?: string;
  /** enum only */
  options?: string[];
  /** short "what does turning this do" line for Explain */
  describe?: string;
}

/** A semantic system declaration (§4). Everything except `id`/`label`/`domain` is optional —
 *  a partial declaration still produces a useful Atlas node. */
export interface AtlasSystemSpec {
  id: string;
  label: string;
  domain: AtlasDomain;
  purpose?: string;
  /** glob(s) of files this system owns — used for agent scoping and the ownership lens */
  owns?: string[];
  /** ids of systems this one depends on (§4 `requires`) — becomes a "dependency" edge */
  requires?: string[];
  /** event/signal names this system raises (§4 `emits`) */
  emits?: string[];
  /** event/signal names this system reacts to (§4 `listens`) */
  listens?: string[];
  /** safe tuning values, keyed by knob name */
  knobs?: Record<string, AtlasKnob>;
  /** glob(s) of tests that cover this system */
  tests?: string[];
  /** provider ids this system is implemented on top of (§5.7, §34) */
  providers?: string[];
  /** asset ids this system needs (§5.6, §36) */
  assets?: string[];
  /** id of the FeelSpec profile that describes this system's intent (§6) */
  feelSpec?: string;
  /** id of a mechanic-registry entry this system realizes (§37) */
  mechanic?: string;
  /** free-form parent id for progressive disclosure (§2.2) — a MECHANIC under a SYSTEM, etc. */
  parent?: string;
  /** optional state machine this system runs (§5.3 State Machine View). Only declared where a
   *  state machine is genuinely meaningful — "used only where state machines actually are". */
  stateMachine?: {
    initial: string;
    states: string[];
    transitions: { from: string; to: string; on?: string; when?: string }[];
  };
  /** ordered player-facing beats this system contributes to (§5.2 Gameplay Flow View) —
   *  design flow, not control flow. */
  flow?: string[];
}

/** Registry of semantic systems. A module-scope default instance mirrors @3jse/runtime's
 *  ComponentRegistry so a game can just call `defineSystem(...)` at import time. */
export class SystemRegistry {
  private readonly systems = new Map<string, AtlasSystemSpec>();

  define(spec: AtlasSystemSpec): AtlasSystemSpec {
    if (!spec.id) throw new Error("defineSystem: `id` is required.");
    if (this.systems.has(spec.id)) {
      throw new Error(`defineSystem: "${spec.id}" is already registered.`);
    }
    // Freeze a normalized copy so later mutation of the caller's object can't desync Atlas.
    const frozen: AtlasSystemSpec = { ...spec };
    this.systems.set(spec.id, frozen);
    return frozen;
  }

  /** Replace an existing declaration (editor hot-reload / re-registration). */
  upsert(spec: AtlasSystemSpec): AtlasSystemSpec {
    this.systems.delete(spec.id);
    return this.define(spec);
  }

  get(id: string): AtlasSystemSpec | undefined {
    return this.systems.get(id);
  }

  list(): AtlasSystemSpec[] {
    return Array.from(this.systems.values());
  }

  has(id: string): boolean {
    return this.systems.has(id);
  }

  clear(): void {
    this.systems.clear();
  }
}

/** The default registry `defineSystem()` writes to — one per process, like the component one. */
export const systemRegistry = new SystemRegistry();

/** Declare a semantic system against the default registry (§4). Returns the normalized spec. */
export function defineSystem(spec: AtlasSystemSpec): AtlasSystemSpec {
  return systemRegistry.define(spec);
}

/** Current value of a knob — its `value` if set, else its `default`. */
export function knobValue(knob: AtlasKnob): number | boolean | string {
  return knob.value ?? knob.default;
}
