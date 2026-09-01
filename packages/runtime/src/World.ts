import { Level } from "./Level.js";
import { Scheduler } from "./Scheduler.js";
import { EntityRegistry, type EntityHandle } from "./EntityRegistry.js";
import type { Entity } from "./Entity.js";
import { snapshotWorld, restoreWorld, type WorldSnapshot } from "./snapshot.js";

/** The runtime container for loaded Levels, Resources, and the scheduler — docs/RUNTIME.md. */
export class World {
  readonly scheduler = new Scheduler();
  /** Generational entity handles, shared across every Level in this World (Phase 1.1). */
  readonly entities = new EntityRegistry();
  private readonly levels = new Map<string, Level>();
  private readonly resources = new Map<string, unknown>();
  private playing = false;

  /** Resolve a compact `EntityHandle` to its live Entity (or `undefined` if freed). */
  resolveEntity(handle: EntityHandle): Entity | undefined {
    return this.entities.resolve(handle);
  }

  /** Full in-memory snapshot of every Level's entities/components/transforms — the time-travel
   *  primitive @3jse/replay and the agent's counterfactual debugging build on (docs/RUNTIME.md,
   *  AI_AGENT_API.md). Distinct from @3jse/save (selective, tagged) and @3jse/project (on disk). */
  snapshot(): WorldSnapshot {
    return snapshotWorld(this);
  }

  /** Rebuild this World's Levels from a snapshot — destroys current entities, recreates under
   *  their persisted ids. Old EntityHandles become stale by design. */
  restore(snap: WorldSnapshot): void {
    restoreWorld(this, snap);
  }

  createLevel(name: string, id?: string): Level {
    const level = new Level(this, name, id);
    this.levels.set(level.id, level);
    return level;
  }

  getLevel(id: string): Level | undefined {
    return this.levels.get(id);
  }

  /** Unload a Level. Callers are responsible for destroying its entities first if they want
   *  handles freed (World.restore does). */
  removeLevel(id: string): void {
    this.levels.delete(id);
  }

  get allLevels(): Level[] {
    return Array.from(this.levels.values());
  }

  setResource<T>(key: string, value: T): void {
    this.resources.set(key, value);
  }

  getResource<T>(key: string): T | undefined {
    return this.resources.get(key) as T | undefined;
  }

  /** Every registered Resource/Service key — what a Project Settings panel lists
   *  (docs/EDITOR.md, docs/RUNTIME.md's Resource registry). */
  listResourceKeys(): string[] {
    return Array.from(this.resources.keys());
  }

  /** Advances every registered System by one step. Caller-driven, not rAF-owned, so this
   *  runs identically in the editor's Play mode, a headless test, and a shipped game's loop
   *  — docs/RUNTIME.md's headless-mode requirement. */
  step(dt: number): void {
    this.scheduler.tick(this, dt);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }
}
