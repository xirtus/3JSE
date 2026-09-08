// Experiment 03 — Live splat projection (plan §18), headless half. A Gaussian or
// cluster samples the field and evaluates its ResponseCard; the base splat asset
// (positions/covariance) is never rebuilt — only projected attributes change.
//
// The GPU-backed gate (Three native GS / Brush backend) is the remaining
// renderer-dependent step; this experiment proves the projection math and the
// no-per-splat-loop discipline that the GPU backend will compile to.

import {
  buildSyntheticField,
  cellCount,
  cellPosition,
  evaluate,
  makeCard,
  sampleChunk,
  writeField,
  WorldField,
  FieldChunk,
  ResponseCard,
  AABB,
} from "../index.js";

export interface SplatCluster {
  id: number;
  fieldCell: number;
  splatCount: number;
  /** base visual data — the "splat asset", fixed across projections */
  baseColor: [number, number, number];
  baseOpacity: number;
  baseCovariance: number;
}

export interface ProjectedAttributes {
  colorMultiplier: number;
  opacity: number;
  covarianceScale: number;
  emission: number;
  albedoMultiplier: number;
}

export function buildClusters(field: WorldField, clusters: number, splatsPerCluster: number): SplatCluster[] {
  const chunk = firstChunk(field);
  const cells = cellCount(chunk.resolution);
  const out: SplatCluster[] = [];
  for (let i = 0; i < clusters; i++) {
    out.push({
      id: i,
      fieldCell: i % cells,
      splatCount: splatsPerCluster,
      baseColor: [1, 1, 1],
      baseOpacity: 1,
      baseCovariance: 1,
    });
  }
  return out;
}

/** Project field -> per-cluster attributes. Iterates clusters only, never splats. */
export function projectClusters(
  field: WorldField,
  clusters: SplatCluster[],
  card: ResponseCard,
): { attributes: ProjectedAttributes[]; evaluateCalls: number } {
  const chunk = firstChunk(field);
  const attributes: ProjectedAttributes[] = new Array(clusters.length);
  let evaluateCalls = 0;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]!;
    const p = cellPosition(chunk, c.fieldCell);
    const state = sampleChunk(chunk, p);
    const proj = evaluate(card, state);
    evaluateCalls++;
    attributes[i] = {
      colorMultiplier: proj.visual.albedoMultiplier,
      opacity: proj.visual.opacity,
      covarianceScale: 1 - proj.visual.transmission * 0.5,
      emission: proj.visual.emission,
      albedoMultiplier: proj.visual.albedoMultiplier,
    };
  }
  return { attributes, evaluateCalls };
}

function firstChunk(field: WorldField): FieldChunk {
  return [...field.chunks.values()][0]!;
}

export function runExp03() {
  const field = buildSyntheticField({ size: [64, 8, 64], resolution: [20, 4, 20], id: "proj" });
  const card = makeCard({
    id: 0,
    label: "snow",
    expertBase: [0.13, 0.78, 0.08, 0.01],
    albedoMultiplier: 1.6,
    transmission: 0.1,
    meltPoint: 0,
  });

  const clusters = buildClusters(field, 400, 500); // 400 clusters -> 200k splats
  const totalSplats = clusters.reduce((a, c) => a + c.splatCount, 0);

  const before = projectClusters(field, clusters, card);

  // Change a small region's temperature/moisture; the splat asset is untouched.
  const region: AABB = { min: [-32, 0, -32], max: [0, 8, 32] };
  writeField(field, region, (s) => ({
    ...s,
    temperature: s.temperature + 8,
    moisture: s.moisture + 0.4,
    liquidFraction: Math.min(1, s.liquidFraction + 0.3),
  }));

  const after = projectClusters(field, clusters, card);

  let changedClusters = 0;
  for (let i = 0; i < before.attributes.length; i++) {
    if (Math.abs(before.attributes[i]!.albedoMultiplier - after.attributes[i]!.albedoMultiplier) > 1e-6) changedClusters++;
  }

  return {
    totalSplats,
    clusterCount: clusters.length,
    evaluateCallsBefore: before.evaluateCalls,
    evaluateCallsAfter: after.evaluateCalls,
    projectionIteratesClustersNotSplats: before.evaluateCalls === clusters.length && after.evaluateCalls === clusters.length,
    splatAssetUnchanged: clusters.every((c) => c.baseOpacity === 1 && c.baseCovariance === 1),
    changedClusterCount: changedClusters,
    appearanceChangedWithoutRebuild: changedClusters > 0,
  };
}
