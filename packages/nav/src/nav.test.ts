import { describe, expect, it } from "vitest";
import { World } from "@3jse/runtime";
import {
  bakeNavGrid, isWalkable, worldToCell,
  findPath, nearestWalkable, buildFlowField,
  createNavAgentSystem, NAV_RESOURCE,
  type NavGrid,
} from "./index.js";
import "./components.js";

const bounds = { minX: 0, minZ: 0, maxX: 20, maxZ: 20 };

function openGrid(): NavGrid {
  return bakeNavGrid(bounds, { cellSize: 1 });
}
function wallGrid(): NavGrid {
  // a vertical wall at x≈10 with a gap at z 0..2
  return bakeNavGrid(bounds, {
    cellSize: 1,
    obstacles: Array.from({ length: 18 }, (_, i) => ({ x: 10, z: i + 2.5, radius: 0.6 })),
  });
}

describe("bakeNavGrid", () => {
  it("open ground is all walkable; a steep sampler blocks cells", () => {
    expect(openGrid().walkable.every((w) => w === 1)).toBe(true);
    const steep = bakeNavGrid(bounds, { cellSize: 1, ground: (x) => x * 5, maxSlope: 0.3 });
    expect(steep.walkable.some((w) => w === 0)).toBe(true);
  });

  it("obstacles (dilated by agentRadius) carve out cells", () => {
    const g = bakeNavGrid(bounds, { cellSize: 1, obstacles: [{ x: 10, z: 10, radius: 2 }], agentRadius: 1 });
    const [cx, cz] = worldToCell(g, 10, 10);
    expect(isWalkable(g, cx, cz)).toBe(false);
    expect(isWalkable(g, 0, 0)).toBe(true);
  });
});

describe("findPath", () => {
  it("straight line across open ground, string-pulled to ~2 points", () => {
    const p = findPath(openGrid(), [1, 1], [18, 1], { smooth: true });
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p[0]![0]).toBeCloseTo(1.5, 1);
    expect(p[p.length - 1]![0]).toBeCloseTo(18.5, 1);
    // roughly straight: every point near z≈1.5
    expect(p.every((q) => Math.abs(q[1] - 1.5) < 1.5)).toBe(true);
  });

  it("routes through the gap in a wall", () => {
    const p = findPath(wallGrid(), [2, 10], [18, 10]);
    expect(p.length).toBeGreaterThan(0);
    // must dip toward the z<2.5 gap to get past x=10
    expect(Math.min(...p.map((q) => q[1]))).toBeLessThan(3);
    expect(p[p.length - 1]![0]).toBeGreaterThan(17);
  });

  it("returns [] when the goal is walled off entirely", () => {
    const sealed = bakeNavGrid(bounds, {
      cellSize: 1,
      // radius 1.2 covers the 0.707 diagonal between integer-spaced obstacle centres, so the
      // column at x≈10 is fully blocked top to bottom.
      obstacles: Array.from({ length: 24 }, (_, i) => ({ x: 10, z: i - 2, radius: 1.2 })),
    });
    expect(findPath(sealed, [2, 10], [18, 10])).toEqual([]);
  });

  it("nearestWalkable snaps an off-mesh point onto the grid", () => {
    const g = bakeNavGrid(bounds, { cellSize: 1, obstacles: [{ x: 5, z: 5, radius: 2 }] });
    const c = nearestWalkable(g, 5, 5)!;
    expect(isWalkable(g, c[0], c[1])).toBe(true);
  });
});

describe("buildFlowField (group pathing)", () => {
  it("every walkable cell gets a unit direction toward the goal, cost rises with distance", () => {
    const g = openGrid();
    const { dir, cost } = buildFlowField(g, [18, 18]);
    const near = cost[worldToCell(g, 17, 17).reverse()[0]! * g.cols + 0];
    void near;
    // a cell far from the goal has higher cost than one near it
    const kFar = 1 * g.cols + 1; // cell (1,1)
    const kNear = 17 * g.cols + 17;
    expect(cost[kFar]!).toBeGreaterThan(cost[kNear]!);
    // direction at a far cell is roughly toward +x,+z
    expect(dir[kFar * 2]!).toBeGreaterThan(0);
    expect(dir[kFar * 2 + 1]!).toBeGreaterThan(0);
  });
});

describe("createNavAgentSystem", () => {
  it("walks an entity to its target across open ground", () => {
    const world = new World();
    world.setResource(NAV_RESOURCE, openGrid());
    world.scheduler.register(createNavAgentSystem());
    const level = world.createLevel("L");
    const agent = level.createEntity("Unit");
    agent.object3D!.position.set(2, 0, 2);
    agent.addComponent("NavAgent", { speed: 6, targetX: 17, targetZ: 15, hasTarget: true });

    for (let i = 0; i < 600; i++) world.step(1 / 60); // 10s
    const p = agent.object3D!.position;
    expect(Math.hypot(p.x - 17, p.z - 15)).toBeLessThan(0.6);
    expect(agent.getComponent<Record<string, unknown>>("NavAgent")!.hasTarget).toBe(false); // arrived
  });
});
