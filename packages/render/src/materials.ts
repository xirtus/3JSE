import * as THREE from "three/webgpu";
import { texture, uv, mix, positionWorld, float } from "three/tsl";
import type { SplatMap } from "@3jse/terrain";
import { splatToTexture } from "@3jse/terrain";

/**
 * A runtime splat-blended terrain material built with TSL nodes. The `@3jse/materials`
 * `splatTerrainGraph` is the authoring/preview representation of this same blend; this is the
 * shipped path — up to 4 layer textures mixed by the channels of a splat DataTexture from
 * @3jse/terrain's `splatToTexture`. `updateSplat()` re-uploads after painting.
 */
export interface TerrainSplatOptions {
  splat: SplatMap;
  /** up to 4 albedo textures; index 0 is the base layer */
  layers: THREE.Texture[];
  /** world-space size one splat texel-grid edge covers (defaults to the splat's worldSize) */
  uvScale?: number;
  roughness?: number;
}

export interface TerrainSplatMaterial {
  material: THREE.Material;
  updateSplat(splat: SplatMap): void;
}

export function terrainSplatMaterial(opts: TerrainSplatOptions): TerrainSplatMaterial {
  const { data, width, height } = splatToTexture(opts.splat);
  const splatTex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  splatTex.needsUpdate = true;
  splatTex.minFilter = THREE.LinearFilter;
  splatTex.magFilter = THREE.LinearFilter;

  const n = Math.min(4, Math.max(1, opts.layers.length));
  const scale = (opts.uvScale ?? opts.splat.worldSize) / opts.splat.worldSize;
  // world-XZ triplanar-ish uv so tiling doesn't stretch on slopes
  const tileUv = positionWorld.xz.mul(float(0.15 / scale));
  const s = texture(splatTex, uv());

  const layer0 = texture(opts.layers[0]!, tileUv);
  // seed with a no-op mix so `color`'s type is the mix-node type the loop reassigns
  let color = mix(layer0, layer0, float(0));
  const channels = ["g", "b", "a"] as const;
  for (let i = 1; i < n; i++) {
    color = mix(color, texture(opts.layers[i]!, tileUv), s[channels[i - 1]!]);
  }

  const material = new THREE.MeshStandardNodeMaterial();
  material.colorNode = color;
  material.roughness = opts.roughness ?? 0.95;
  material.metalness = 0;

  return {
    material,
    updateSplat(splat) {
      const t = splatToTexture(splat);
      const dst = splatTex.image.data as Float32Array | null;
      if (dst) dst.set(t.data);
      else splatTex.image = { data: t.data, width: t.width, height: t.height } as typeof splatTex.image;
      splatTex.needsUpdate = true;
    },
  };
}
