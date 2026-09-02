import { describe, expect, it } from "vitest";
import * as THREE from "three/webgpu";
import { valueNoise2D, fbm } from "@3jse/terrain";
import { ParticlePool, type EmitterDef } from "@3jse/vfx";
import { TerrainRenderer, FoliageRenderer, ParticleRenderer, GpuParticleRenderer } from "./index.js";

// THREE objects construct fine in node (no GPU needed) — same as @3jse/runtime's tests.
// These assert the object lifecycle: create / update / remove / dispose.

describe("TerrainRenderer", () => {
  it("adds a mesh per resident chunk, re-meshes on LOD change, removes on move", () => {
    const scene = new THREE.Scene();
    const r = new TerrainRenderer(scene, fbm(valueNoise2D(3), 3), { chunkSize: 32, ring: 1, baseResolution: 8 });
    r.update(0, 0);
    expect(r.chunkCount).toBe(9); // 3x3
    expect(r.group.children.length).toBe(9);
    const g0 = (r.group.children[0] as THREE.Mesh).geometry;
    expect(g0.getAttribute("position").count).toBeGreaterThan(0);
    expect(g0.getIndex()).not.toBeNull();

    r.update(300, 0); // far move -> different residency
    expect(r.chunkCount).toBe(9);
    r.dispose();
    expect(r.group.parent).toBeNull();
  });
});

describe("FoliageRenderer", () => {
  it("builds an InstancedMesh from the deterministic scatter, skips a no-op re-set", () => {
    const scene = new THREE.Scene();
    const r = new FoliageRenderer(scene);
    const species = { id: "grass", geometry: new THREE.PlaneGeometry(0.2, 0.6), material: new THREE.MeshBasicMaterial() };
    const area = { minX: 0, minZ: 0, maxX: 20, maxZ: 20 };
    const opts = { density: 1, seed: 5, ground: () => 0 };

    r.set(species, area, opts, "5:1:0,0,20,20");
    const n = r.instanceCount("grass");
    expect(n).toBeGreaterThan(0);
    expect(r.group.children[0]).toBeInstanceOf(THREE.InstancedMesh);

    // same key -> no rebuild (same count, no throw)
    r.set(species, area, opts, "5:1:0,0,20,20");
    expect(r.instanceCount("grass")).toBe(n);

    r.remove("grass");
    expect(r.instanceCount("grass")).toBe(0);
  });
});

describe("ParticleRenderer", () => {
  const def: EmitterDef = {
    maxParticles: 200, rate: 0, burst: 0,
    life: { min: 1, max: 1 }, speed: { min: 1, max: 1 }, direction: [0, 1, 0], spread: 0,
    gravity: [0, 0, 0], drag: 0,
    sizeOverLife: [{ t: 0, v: 1 }], colorOverLife: [{ t: 0, color: [1, 1, 1] }], seed: 1,
  };

  it("keeps one Points per pool, streams buffers, prunes removed pools", () => {
    const scene = new THREE.Scene();
    const r = new ParticleRenderer(scene);
    const pool = new ParticlePool(def);
    pool.emit(50);
    const pools = new Map([["fx1", pool]]);

    r.sync(pools);
    expect(r.group.children.length).toBe(1);
    const pts = r.group.children[0] as THREE.Points;
    expect(pts.geometry.getAttribute("position").count).toBe(50);
    expect(r.count("fx1")).toBe(50);

    pool.step(2); // life 1s -> all dead
    r.sync(pools);
    expect(r.count("fx1")).toBe(0);

    r.sync(new Map()); // pool removed
    expect(r.group.children.length).toBe(0);
  });
});

describe("GpuParticleRenderer", () => {
  const def: EmitterDef = {
    maxParticles: 200, rate: 0, burst: 0,
    life: { min: 1, max: 1 }, speed: { min: 1, max: 1 }, direction: [0, 1, 0], spread: 0,
    gravity: [0, 0, 0], drag: 0,
    sizeOverLife: [{ t: 0, v: 1 }], colorOverLife: [{ t: 0, color: [1, 1, 1] }], seed: 1,
  };

  it("streams position/color/size into storage attributes on a node material, prunes pools", () => {
    const scene = new THREE.Scene();
    const r = new GpuParticleRenderer(scene);
    const pool = new ParticlePool(def);
    pool.emit(40);
    const pools = new Map([["fx1", pool]]);

    r.sync(pools);
    const pts = r.group.children[0] as THREE.Points;
    expect(pts.material).toBeInstanceOf(THREE.PointsNodeMaterial);
    expect(pts.geometry.getAttribute("position")).toBeInstanceOf(THREE.StorageBufferAttribute);
    expect(pts.geometry.getAttribute("size").count).toBe(40);
    expect(r.count("fx1")).toBe(40);

    pool.emit(40); // grows -> attributes reallocated, no throw
    r.sync(pools);
    expect(r.count("fx1")).toBe(80);

    r.sync(new Map());
    expect(r.group.children.length).toBe(0);
    r.dispose();
    expect(r.group.parent).toBeNull();
  });
});
