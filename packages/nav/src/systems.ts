import type { SystemDef } from "@3jse/runtime";
import { NAV_RESOURCE, type NavAgentData } from "./components.js";
import { findPath, type Vec2 } from "./pathfind.js";
import type { NavGrid } from "./grid.js";

interface AgentRuntime {
  path: Vec2[];
  leg: number;
  sinceRepathMs: number;
  lastTarget: [number, number] | null;
}

/**
 * Moves every `NavAgent` toward its target along an A* path. Re-paths when the target changes
 * by more than a cell or `repathIntervalMs` elapses. Kinematic — writes `entity.object3D`
 * position directly on the XZ plane; a project layering physics can instead consume the desired
 * velocity. Headless: with no renderer the Object3D positions still update and a test asserts
 * the agent reaches the goal.
 */
export function createNavAgentSystem(): SystemDef {
  const rt = new Map<string, AgentRuntime>();

  return {
    name: "NavAgentSystem",
    stage: "fixed",
    query: ["NavAgent"],
    run: (entities, { world, dt }) => {
      const grid = world.getResource<NavGrid>(NAV_RESOURCE);
      if (!grid) return;
      const dtMs = dt * 1000;

      for (const e of entities) {
        const a = e.getComponent<NavAgentData>("NavAgent");
        if (!a || !e.object3D || !a.hasTarget) continue;
        let r = rt.get(e.id);
        if (!r) { r = { path: [], leg: 0, sinceRepathMs: 1e9, lastTarget: null }; rt.set(e.id, r); }

        const pos = e.object3D.position;
        const target: [number, number] = [a.targetX, a.targetZ];
        const targetMoved =
          !r.lastTarget || Math.hypot(target[0] - r.lastTarget[0], target[1] - r.lastTarget[1]) > grid.cellSize;
        r.sinceRepathMs += dtMs;
        if (targetMoved || r.sinceRepathMs >= a.repathIntervalMs) {
          r.path = findPath(grid, [pos.x, pos.z], target, { smooth: true });
          r.leg = r.path.length > 1 ? 1 : 0;
          r.sinceRepathMs = 0;
          r.lastTarget = target;
        }
        if (r.path.length === 0) continue;

        // arrived?
        if (Math.hypot(pos.x - target[0], pos.z - target[1]) <= a.arriveRadius) {
          a.hasTarget = false;
          r.path = [];
          continue;
        }

        const wp = r.path[r.leg] ?? r.path[r.path.length - 1]!;
        const dx = wp[0] - pos.x;
        const dz = wp[1] - pos.z;
        const d = Math.hypot(dx, dz);
        const stepDist = a.speed * dt;
        if (d <= stepDist) {
          pos.x = wp[0];
          pos.z = wp[1];
          if (r.leg < r.path.length - 1) r.leg++;
        } else {
          pos.x += (dx / d) * stepDist;
          pos.z += (dz / d) * stepDist;
        }
        // face movement direction
        if (d > 1e-4) e.object3D.rotation.y = Math.atan2(dx, dz);
      }

      for (const id of [...rt.keys()]) if (!entities.some((e) => e.id === id)) rt.delete(id);
    },
  };
}
