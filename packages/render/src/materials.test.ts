import { describe, expect, it } from "vitest";
import * as THREE from "three/webgpu";
import { createSplatMap, paintSplat } from "@3jse/terrain";
import { terrainSplatMaterial } from "./materials.js";

describe("terrainSplatMaterial", () => {
  it("builds a node material and re-uploads the splat texture on paint", () => {
    const splat = createSplatMap({ resolution: 16, layers: 3, worldSize: 64 });
    const layers = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()];
    const tm = terrainSplatMaterial({ splat, layers });
    expect(tm.material).toBeInstanceOf(THREE.Material);
    expect((tm.material as THREE.MeshStandardNodeMaterial).colorNode).toBeTruthy();

    paintSplat(splat, { x: 32, z: 32, radius: 8, layer: 1, strength: 1, falloff: 0.5 });
    expect(() => tm.updateSplat(splat)).not.toThrow();
  });
});
