import type { Entity } from "./Entity.js";
import type { Level } from "./Level.js";
import type { World } from "./World.js";

/** Matches docs/RUNTIME.md's tick loop stages 2/3/6 (fixed step, variable step, late). */
export type SystemStage = "fixed" | "variable" | "late";

export interface SystemContext {
  world: World;
  level: Level;
  dt: number;
}

export interface SystemDef {
  name: string;
  stage: SystemStage;
  /** Component types an Entity must have for this System to run against it. */
  query: string[];
  run: (entities: Entity[], ctx: SystemContext) => void;
}

const STAGE_ORDER: SystemStage[] = ["fixed", "variable", "late"];

/** Registers Systems and runs them in stage order across every loaded Level each tick. */
export class Scheduler {
  private readonly systems: SystemDef[] = [];

  /** Registering a name that's already present replaces that entry in place rather than
   *  appending a duplicate — this *is* docs/RUNTIME.md's hot-reload "function swap": Entities
   *  and their component data live in the Level, untouched by a Scheduler change, so swapping
   *  a System's `run` here is enough for edited TypeScript (or a recompiled 3JSE Graph) to take
   *  effect on the next tick with no teardown/rebuild. */
  register(system: SystemDef): void {
    const i = this.systems.findIndex((s) => s.name === system.name);
    if (i !== -1) {
      this.systems[i] = system;
    } else {
      this.systems.push(system);
    }
  }

  unregister(name: string): void {
    const i = this.systems.findIndex((s) => s.name === name);
    if (i !== -1) this.systems.splice(i, 1);
  }

  /** Read-only census of registered Systems in stage/registration order — what a Profiler
   *  panel (docs/PERFORMANCE.md) and the headless perf report (`@3jse/agent`'s runtime.getPerf)
   *  list. Returns copies so callers can't mutate the schedule through it. */
  describe(): { name: string; stage: SystemStage; query: string[] }[] {
    return STAGE_ORDER.flatMap((stage) =>
      this.systems
        .filter((s) => s.stage === stage)
        .map((s) => ({ name: s.name, stage: s.stage, query: [...s.query] })),
    );
  }

  tick(world: World, dt: number): void {
    for (const stage of STAGE_ORDER) {
      for (const system of this.systems) {
        if (system.stage !== stage) continue;
        for (const level of world.allLevels) {
          const matched = system.query.length === 0 ? level.allEntities : level.query(system.query);
          if (matched.length > 0) system.run(matched, { world, level, dt });
        }
      }
    }
  }
}
