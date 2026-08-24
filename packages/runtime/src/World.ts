import { Level } from "./Level.js";
import { Scheduler } from "./Scheduler.js";

/** The runtime container for loaded Levels, Resources, and the scheduler — docs/RUNTIME.md. */
export class World {
  readonly scheduler = new Scheduler();
  private readonly levels = new Map<string, Level>();
  private readonly resources = new Map<string, unknown>();
  private playing = false;

  createLevel(name: string): Level {
    const level = new Level(this, name);
    this.levels.set(level.id, level);
    return level;
  }

  getLevel(id: string): Level | undefined {
    return this.levels.get(id);
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
