import { describe, expect, it } from "vitest";
import { bakeNavGrid } from "./grid.js";
import { createRecastNavMesh, gridAsPolyNavMesh, type RecastNavMeshQuery } from "./polymesh.js";

describe("createRecastNavMesh adapter", () => {
  it("wraps an injected recast NavMeshQuery to the PolyNavMesh interface", () => {
    const fake: RecastNavMeshQuery = {
      computePath: (s, e) => ({ success: true, path: [s, [1, 0, 1], e] }),
      findClosestPoint: (p) => ({ success: true, point: [p[0], 0, p[2]] }),
      raycast: (s, e) => ({ hit: true, hitPoint: [(s[0] + e[0]) / 2, 0, (s[2] + e[2]) / 2] }),
    };
    const mesh = createRecastNavMesh(fake);
    expect(mesh.findPath([0, 0, 0], [2, 0, 2])).toEqual([[0, 0, 0], [1, 0, 1], [2, 0, 2]]);
    expect(mesh.closestPoint([5, 9, 5])).toEqual([5, 0, 5]);
    expect(mesh.raycast([0, 0, 0], [4, 0, 0])).toEqual([2, 0, 0]);
  });

  it("returns [] / null on a failed recast query", () => {
    const fail: RecastNavMeshQuery = {
      computePath: () => ({ success: false, path: [] }),
      findClosestPoint: () => ({ success: false, point: [0, 0, 0] }),
      raycast: (_s, e) => ({ hit: false, hitPoint: e }),
    };
    const mesh = createRecastNavMesh(fail);
    expect(mesh.findPath([0, 0, 0], [1, 0, 1])).toEqual([]);
    expect(mesh.closestPoint([0, 0, 0])).toBeNull();
    expect(mesh.raycast([0, 0, 0], [3, 0, 0])).toEqual([3, 0, 0]); // no hit -> the endpoint
  });
});

describe("gridAsPolyNavMesh fallback", () => {
  const grid = bakeNavGrid({ minX: 0, minZ: 0, maxX: 20, maxZ: 20 }, {
    cellSize: 1,
    // radius 1.0 blocks the 0.707 diagonal between integer-spaced centres, sealing x≈10 for
    // z >= 3 and leaving z 0..2 as the only gap.
    obstacles: Array.from({ length: 18 }, (_, i) => ({ x: 10, z: i + 3, radius: 1.0 })),
  });
  const mesh = gridAsPolyNavMesh(grid, (x, z) => (x + z) * 0.1);

  it("findPath returns 3D world points with Y from the ground sampler", () => {
    const path = mesh.findPath([2, 0, 10], [18, 0, 10]);
    expect(path.length).toBeGreaterThan(0);
    const p = path[0]!;
    expect(p[1]).toBeCloseTo((p[0] + p[2]) * 0.1, 5);
  });

  it("closestPoint snaps an off-mesh point onto the grid", () => {
    const c = mesh.closestPoint([10.5, 5, 5])!;
    expect(c).not.toBeNull();
    expect(c[1]).toBeCloseTo((c[0] + c[2]) * 0.1, 5);
  });

  it("routes around the wall gap (dips toward z<2)", () => {
    const path = mesh.findPath([2, 0, 10], [18, 0, 10]);
    expect(Math.min(...path.map((q) => q[2]))).toBeLessThan(3);
  });
});
