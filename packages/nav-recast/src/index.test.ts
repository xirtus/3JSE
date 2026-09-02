import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { bakeRecastNavMesh, collectWalkable, toRecastQuery } from "./index.js";
import type { NavMeshQuery } from "@recast-navigation/core";

describe("toRecastQuery adapter", () => {
  // A stand-in shaped like the slice of NavMeshQuery the adapter touches.
  const fake = {
    computePath: (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
      success: true,
      path: [a, { x: 5, y: 0, z: 0 }, b],
    }),
    findClosestPoint: (p: { x: number; y: number; z: number }) => ({ success: true, point: { x: p.x, y: 0, z: p.z } }),
    findNearestPoly: () => ({ success: true, nearestRef: 42 }),
    raycast: (_ref: number, _s: unknown, _e: unknown) => ({ success: true, t: 0.5 }),
  } as unknown as NavMeshQuery;

  it("maps computePath tuples ↔ objects and reports reachability", () => {
    const q = toRecastQuery(fake);
    const r = q.computePath([0, 0, 0], [10, 0, 0]);
    expect(r.success).toBe(true);
    expect(r.path).toEqual([[0, 0, 0], [5, 0, 0], [10, 0, 0]]);
  });

  it("closestPoint returns the snapped point", () => {
    const q = toRecastQuery(fake);
    expect(q.findClosestPoint([3, 9, 4])).toEqual({ success: true, point: [3, 0, 4] });
  });

  it("raycast interpolates the hit point at parameter t", () => {
    const q = toRecastQuery(fake);
    expect(q.raycast([0, 0, 0], [10, 0, 20])).toEqual({ hit: true, hitPoint: [5, 0, 10] });
  });

  it("raycast with t > 1 (segment cleared) reports no hit", () => {
    const cleared = { ...fake, raycast: () => ({ success: true, t: 3.4e38 }) } as unknown as NavMeshQuery;
    expect(toRecastQuery(cleared).raycast([0, 0, 0], [1, 0, 0])).toEqual({ hit: false, hitPoint: [1, 0, 0] });
  });
});

describe("collectWalkable", () => {
  it("collects meshes, skipping nav:ignore subtrees", () => {
    const root = new Group();
    const floor = new Mesh(new PlaneGeometry(10, 10), new MeshBasicMaterial());
    floor.name = "Floor";
    const fxRoot = new Group();
    fxRoot.name = "sparks nav:ignore";
    fxRoot.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    root.add(floor, fxRoot);
    const walkable = collectWalkable(root);
    expect(walkable).toEqual([floor]);
  });
});

describe("bakeRecastNavMesh (real WASM)", () => {
  it("bakes a walkable navmesh from a ground plane and paths across it", async () => {
    const ground = new Mesh(new PlaneGeometry(20, 20), new MeshBasicMaterial());
    ground.rotation.x = -Math.PI / 2;
    ground.updateMatrixWorld(true);

    const navmesh = await bakeRecastNavMesh([ground], { cs: 0.3, ch: 0.2, walkableRadius: 1 });
    const path = navmesh.findPath([-8, 0, -8], [8, 0, 8]);
    expect(path.length).toBeGreaterThan(0);
    const snapped = navmesh.closestPoint([0, 5, 0]);
    expect(snapped).not.toBeNull();
    expect(Math.abs(snapped![1])).toBeLessThan(1);
  }, 20_000);
});
