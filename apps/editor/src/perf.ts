import { PerfRecorder } from "@3jse/agent";
import type { World } from "@3jse/runtime";

/**
 * docs/PERFORMANCE.md's Profiler panel, made real: the same `@3jse/agent` `PerfRecorder` the
 * headless `runtime.getPerf` tool uses, fed by the editor's actual render loop
 * (Viewport.tsx's `animate()`) instead of a separate simulated run — so the numbers the
 * Profiler panel shows are the real cost of the frames the user is watching, not a synthetic
 * probe. Kept as a World Resource so any panel can reach it through the same
 * `world.getResource` seam everything else uses (docs/RUNTIME.md's Resource registry).
 */
export const PERF_RESOURCE = "EditorPerfRecorder";

export function installPerfRecorder(world: World): PerfRecorder {
  const perf = new PerfRecorder();
  world.setResource(PERF_RESOURCE, perf);
  return perf;
}

export function getPerfRecorder(world: World): PerfRecorder | undefined {
  return world.getResource<PerfRecorder>(PERF_RESOURCE);
}
