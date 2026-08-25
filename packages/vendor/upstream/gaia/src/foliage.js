// =============================================================================
// foliage.js — BLADE / SEED-HEAD SoA instance generation for the grass pipeline.
//
// generateFoliage(graph, genome, opts) -> Structure-of-Arrays instance set.
//
// GRASS V1 STRATEGY:
//   Blades themselves ARE the mesh (built by bladeMesh.js from the skeleton
//   graph). Foliage in v1 emits SEED-HEAD instances only — small instanced
//   cards / sprites at blade tips. When seedHead === 0 the function returns
//   count: 0 immediately with zero work.
//
// ITERATION TARGET:
//   Each `isTerminal` node is a blade tip. When seedHead > 0 we emit a small
//   cluster of instance cards at each such tip. branchLevel is always 0 in
//   the grass graph — the old branchLevel>=1 filter is dropped entirely.
//
// SEED-HEAD CLUSTER RULES:
//   - count scales monotonically with genome.seedHead.
//   - Each isTerminal tip receives SEED_HEAD_CLUSTER_BASE * seedHead instances,
//     rounded and clamped ∈ [1, SEED_HEAD_MAX_PER_TIP].
//   - Position: along the blade segment direction from the parent, with small
//     radial fan spread (azimuthal variation for a natural panicle look).
//   - Normal: biased toward +Y (phototropism, same convention as old foliage).
//   - Exposure: blade-height based (swayBase used when present; Y-height fallback).
//   - boneIndex: reinterpreted as bladeIndex via opts.nodeToBlade; defaults to 0
//     (same backward-compat convention as old nodeToBone).
//
// DETERMINISM INVARIANT:
//   rng = mulberry32((genome.structuralSeed ^ 0x1EAF1EAF) >>> 0)
//   This stream is completely separate from the skeleton rng and never
//   interferes with it. Same graph+genome → byte-identical SoA output.
//
// SoA SHAPE (identical to old foliage — consumer contract stable):
//   count:     number
//   position:  Float32Array  3 * MAX_SEED_HEADS  — world instance base
//   normal:    Float32Array  3 * MAX_SEED_HEADS  — unit face normal
//   tangent:   Float32Array  3 * MAX_SEED_HEADS  — unit base→tip direction
//   scale:     Float32Array      MAX_SEED_HEADS  — per-instance world-unit size
//   rotation:  Float32Array      MAX_SEED_HEADS  — roll about tangent (radians)
//   ageColor:  Float32Array      MAX_SEED_HEADS  — 0..1 tip/age tint
//   exposure:  Float32Array      MAX_SEED_HEADS  — 0=shaded, 1=sunlit
//   boneIndex: Float32Array      MAX_SEED_HEADS  — blade/bone index; 0 if no map
//   shape:     number                            — always genome.seedHead (≡ old appendageBreadth role)
//
// No three.js, pure ESM.
// =============================================================================

import { mulberry32 } from './rng.js';

// ---------------------------------------------------------------------------
// Public constants — exposed for tuning and tests.
// ---------------------------------------------------------------------------

/**
 * Salt XOR'd with structuralSeed to produce the isolated foliage RNG stream.
 * Kept at 0x1EAF1EAF for backward compatibility with the determinism invariant.
 */
export const FOLIAGE_SALT = 0x1EAF1EAF;

/**
 * Maximum seed-head instances allocated (hard budget).
 * Kept reasonably small — grass seed heads are sparse decorative accents.
 */
export const MAX_SEED_HEADS = 2000;

/**
 * Base cluster count per terminal tip at seedHead=1.
 * Scales linearly: clustersPerTip = round(SEED_HEAD_CLUSTER_BASE * seedHead).
 */
export const SEED_HEAD_CLUSTER_BASE = 5;

/**
 * Maximum instances per blade tip (clamped regardless of seedHead).
 */
export const SEED_HEAD_MAX_PER_TIP = 8;

/**
 * World-unit size of each seed-head card at seedHead=1.
 * Scales with seedHead so a low value gives a subtle spikelet.
 */
export const SEED_HEAD_BASE_SIZE = 0.06;

/**
 * Azimuthal spread of instances around the blade tip axis (radians).
 * A full fan gives a natural panicle silhouette.
 */
export const SEED_HEAD_FAN_ANGLE = Math.PI * 2;

/**
 * How far along the tip segment the instances are placed.
 * 0 = at the parent node, 1 = exactly at the tip, >1 = past the tip.
 * Values in [0.85, 1.10] give "at and just past the tip" placement.
 */
export const SEED_HEAD_T_BASE = 0.90;
export const SEED_HEAD_T_RANGE = 0.25;

/**
 * Outward radial push of instances from the blade axis (world units).
 * Small so instances cluster tightly around the tip, like a grass panicle.
 */
export const SEED_HEAD_RADIAL_PUSH = 0.01;

/**
 * Size jitter range (±SIZE_JITTER fraction of the base size).
 */
export const SIZE_JITTER = 0.25;

/**
 * Phototropism strength: how strongly the instance tangent is lerped toward +Y.
 */
export const PHOTO_STRENGTH = 0.30;

// ---------------------------------------------------------------------------
// Internal math helpers (no allocations beyond small arrays).
// ---------------------------------------------------------------------------

function len3(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function norm3(v) {
  const l = len3(v);
  if (l < 1e-10) return [0, 1, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Rodrigues rotation: rotate v around unit axis ax by angle (radians). */
function rotate3(v, ax, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = dot3(v, ax);
  const cr = cross3(ax, v);
  return [
    v[0] * c + cr[0] * s + ax[0] * d * (1 - c),
    v[1] * c + cr[1] * s + ax[1] * d * (1 - c),
    v[2] * c + cr[2] * s + ax[2] * d * (1 - c),
  ];
}

/** Return a unit vector perpendicular to dir (arbitrary but stable). */
function perpTo(dir) {
  if (Math.abs(dot3(dir, [1, 0, 0])) < 0.9) {
    return norm3(cross3(dir, [1, 0, 0]));
  }
  return norm3(cross3(dir, [0, 0, 1]));
}

// ---------------------------------------------------------------------------
// generateFoliage
// ---------------------------------------------------------------------------

/**
 * Generate seed-head instance set for the solved graph+genome.
 *
 * V1 behavior:
 *   - seedHead === 0 → count: 0 (no instances emitted; buffers are allocated
 *     but only count=0 is valid).
 *   - seedHead > 0  → one cluster of instances at each isTerminal blade tip.
 *
 * @param {object} graph  — output of buildSkeleton (mutated by solveProportions)
 * @param {object} genome — grass genome (all [0,1] fields per GRASS_SCHEMA)
 * @param {object} [opts] — optional
 * @param {Int32Array} [opts.nodeToBlade] — node index → blade index (length
 *   nodes.length, -1 if the node has no blade). When provided, each instance's
 *   boneIndex SoA field is set from the attachment node's blade index. When
 *   absent, boneIndex defaults to 0 (backward-compatible with old nodeToBone).
 * @returns {{
 *   count:     number,
 *   position:  Float32Array,  // 3 * MAX_SEED_HEADS — world instance base
 *   normal:    Float32Array,  // 3 * MAX_SEED_HEADS — unit face normal
 *   tangent:   Float32Array,  // 3 * MAX_SEED_HEADS — unit base→tip direction
 *   scale:     Float32Array,  // MAX_SEED_HEADS — per-instance world-unit size
 *   rotation:  Float32Array,  // MAX_SEED_HEADS — roll about tangent (radians)
 *   ageColor:  Float32Array,  // MAX_SEED_HEADS — 0..1 tip/age tint
 *   exposure:  Float32Array,  // MAX_SEED_HEADS — 0=shaded, 1=sunlit
 *   boneIndex: Float32Array,  // MAX_SEED_HEADS — blade index; 0 if no nodeToBlade
 *   shape:     number         // = genome.seedHead
 * }}
 */
export function generateFoliage(graph, genome, opts) {
  // -------------------------------------------------------------------------
  // Allocate SoA buffers (full MAX_SEED_HEADS size; only first `count` valid).
  // -------------------------------------------------------------------------
  const position  = new Float32Array(3 * MAX_SEED_HEADS);
  const normal    = new Float32Array(3 * MAX_SEED_HEADS);
  const tangent   = new Float32Array(3 * MAX_SEED_HEADS);
  const scale     = new Float32Array(MAX_SEED_HEADS);
  const rotation  = new Float32Array(MAX_SEED_HEADS);
  const ageColor  = new Float32Array(MAX_SEED_HEADS);
  const exposure  = new Float32Array(MAX_SEED_HEADS);
  const boneIndex = new Float32Array(MAX_SEED_HEADS); // default 0 (backward-compat)
  // aspect: per-instance length/width ratio (1 = round grain/card; large = thin
  // awn bristle). Consumed by the viewer's grain InstancedMesh to stretch awns.
  const aspect    = new Float32Array(MAX_SEED_HEADS).fill(1);

  // nodeToBlade map from opts (optional).
  const nodeToBlade = (opts && opts.nodeToBlade) ? opts.nodeToBlade : null;

  // -------------------------------------------------------------------------
  // Genome genes with safe defaults.
  // -------------------------------------------------------------------------
  const seedHead = genome.seedHead !== undefined ? genome.seedHead : 0;
  const shape    = seedHead; // semantic role of old appendageBreadth

  // Inflorescence genes (structured ear). inflorescenceType<=0 keeps the legacy
  // radial-fan panicle so all existing foliage contracts are byte-identical.
  const inflorescenceType = genome.inflorescenceType !== undefined ? genome.inflorescenceType : 0;
  const spikeletCountG    = genome.spikeletCount     !== undefined ? genome.spikeletCount     : 0.5;
  const grainsPerSpkG     = genome.grainsPerSpikelet !== undefined ? genome.grainsPerSpikelet : 0.5;
  const awnLengthG        = genome.awnLength         !== undefined ? genome.awnLength         : 0;
  const midEarBulgeG      = genome.midEarBulge       !== undefined ? genome.midEarBulge       : 0.5;

  // -------------------------------------------------------------------------
  // V1 EARLY EXIT: seedHead === 0 → no instances, count: 0.
  //
  // This is the default path. Blades ARE the mesh; foliage is purely
  // decorative seed-head accents. Most genomes ship with count: 0.
  // -------------------------------------------------------------------------
  if (seedHead <= 0) {
    return {
      count: 0,
      position,
      normal,
      tangent,
      scale,
      rotation,
      ageColor,
      exposure,
      boneIndex,
      aspect,
      shape,
    };
  }

  // -------------------------------------------------------------------------
  // Separate deterministic RNG stream — NEVER touches the skeleton stream.
  // Seeded with the same salt as the old foliage stream for docstring compat.
  // -------------------------------------------------------------------------
  const rng = mulberry32((genome.structuralSeed ^ FOLIAGE_SALT) >>> 0);

  const { nodes } = graph;

  // -------------------------------------------------------------------------
  // Collect blade tip nodes: iterate over ALL nodes with isTerminal === true.
  //
  // Grass blades are all branchLevel 0 — the old branchLevel>=1 filter is
  // DROPPED. We use isTerminal as the sole criterion (one per blade chain).
  // Nodes without a valid parent are skipped (degenerate graph).
  // -------------------------------------------------------------------------
  const tips = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.isTerminal) continue;
    const pIdx = node.parentIdx;
    if (pIdx === undefined || pIdx < 0) continue;
    tips.push({ nodeIdx: i, node, parentIdx: pIdx });
  }

  // -------------------------------------------------------------------------
  // STRUCTURED INFLORESCENCE (wheat-style ear) — inflorescenceType > 0.
  //
  // A rachis rises from each blade tip bearing N spikelets — distichous (two
  // ranked, azimuth (i mod 2)·π) for a tight spike/ear, or golden-angle spiral
  // for an open panicle — each holding G grain ovoids, optionally awned. Grains
  // and awns share the SoA; `aspect` stretches awns into thin bristles. Mid-ear
  // bulge makes central spikelets largest (spindle). Uses ONLY the isolated
  // foliage rng. Legacy fan (below) handles inflorescenceType <= 0.
  // -------------------------------------------------------------------------
  if (inflorescenceType > 0) {
    const N = Math.max(3, Math.round(8 + spikeletCountG * 20));  // spikelets/ear ∈ [8,28]
    const G = Math.max(1, Math.round(1 + grainsPerSpkG * 4));    // grains/spikelet ∈ [1,5]
    const distichous = inflorescenceType >= 0.5;                 // spike vs panicle
    const GOLDEN = 2.399963229728653;                            // 137.50776° in radians
    const UP = [0, 1, 0];

    const grainBase = 0.006 + 0.005 * seedHead;                  // ~6–11 mm grain
    let count = 0;

    for (const { node, parentIdx } of tips) {
      if (count >= MAX_SEED_HEADS) break;
      const parent = nodes[parentIdx];
      const tipPos = node.pos;

      // Blade heading at the tip; the ear stands up (blend toward world up).
      const dir = norm3([tipPos[0] - parent.pos[0], tipPos[1] - parent.pos[1], tipPos[2] - parent.pos[2]]);
      const earDir = norm3([dir[0] * 0.4 + UP[0] * 0.6, dir[1] * 0.4 + UP[1] * 0.6, dir[2] * 0.4 + UP[2] * 0.6]);
      const perp = perpTo(earDir);

      const earLen    = 0.05 + 0.13 * spikeletCountG;            // ~5–18 cm
      const internode = earLen / Math.max(N - 1, 1);
      const azBase    = rng() * Math.PI * 2;                     // one draw per ear

      for (let i = 0; i < N && count < MAX_SEED_HEADS; i++) {
        const u  = N > 1 ? i / (N - 1) : 0;
        const z  = i * internode;
        const cx = tipPos[0] + earDir[0] * z;
        const cy = tipPos[1] + earDir[1] * z;
        const cz = tipPos[2] + earDir[2] * z;
        const az = distichous ? azBase + (i % 2) * Math.PI : azBase + i * GOLDEN;
        const radial = rotate3(perp, earDir, az);
        // Mid-ear bulge: spindle that peaks at u=0.5 when midEarBulge>0.5.
        const bulge   = 1.0 + (midEarBulgeG - 0.5) * 1.4 * (Math.sin(Math.PI * u) - 0.5);
        const spkScale = grainBase * Math.max(0.3, bulge);

        for (let k = 0; k < G && count < MAX_SEED_HEADS; k++) {
          const side  = (k % 2 === 0) ? 1 : -1;
          const stack = (k * 0.5) * spkScale;
          const off   = spkScale * 0.6 * side;
          const jx    = (rng() - 0.5) * spkScale * 0.3;
          const gt = norm3([earDir[0] * 0.7 + radial[0] * 0.3, earDir[1] * 0.7 + radial[1] * 0.3, earDir[2] * 0.7 + radial[2] * 0.3]);
          const gn = norm3(cross3(gt, radial));
          const sj = 0.85 + rng() * 0.3;
          const i3 = count * 3;
          position[i3]     = cx + radial[0] * off + earDir[0] * stack + jx;
          position[i3 + 1] = cy + radial[1] * off + earDir[1] * stack;
          position[i3 + 2] = cz + radial[2] * off + earDir[2] * stack;
          tangent[i3]      = gt[0]; tangent[i3 + 1] = gt[1]; tangent[i3 + 2] = gt[2];
          normal[i3]       = gn[0]; normal[i3 + 1]  = gn[1]; normal[i3 + 2]  = gn[2];
          scale[count]     = spkScale * sj;
          aspect[count]    = 1.6;                               // ovoid grain
          rotation[count]  = (rng() - 0.5) * Math.PI;
          ageColor[count]  = Math.min(1, 0.3 + 0.6 * u);        // riper toward the tip
          exposure[count]  = Math.min(1, Math.max(0, u));
          boneIndex[count] = 0;
          count++;
        }

        // Awn bristle (one per spikelet) when awned.
        if (awnLengthG > 0 && count < MAX_SEED_HEADS) {
          const awnWidth = Math.max(0.0012, spkScale * 0.18);
          const awnLen   = awnLengthG * earLen * 1.1 + 0.01;
          const at = norm3([earDir[0] * 0.85 + radial[0] * 0.15, earDir[1] * 0.85 + radial[1] * 0.15, earDir[2] * 0.85 + radial[2] * 0.15]);
          const an = norm3(cross3(at, radial));
          const i3 = count * 3;
          position[i3]     = cx + radial[0] * spkScale * 0.5;
          position[i3 + 1] = cy + radial[1] * spkScale * 0.5;
          position[i3 + 2] = cz + radial[2] * spkScale * 0.5;
          tangent[i3]      = at[0]; tangent[i3 + 1] = at[1]; tangent[i3 + 2] = at[2];
          normal[i3]       = an[0]; normal[i3 + 1]  = an[1]; normal[i3 + 2]  = an[2];
          scale[count]     = awnWidth;
          aspect[count]    = awnLen / awnWidth;                 // long thin bristle
          rotation[count]  = 0;
          ageColor[count]  = 0.9;                               // straw
          exposure[count]  = Math.min(1, Math.max(0, u));
          boneIndex[count] = 0;
          count++;
        }
      }
    }

    return { count, position, normal, tangent, scale, rotation, ageColor, exposure, boneIndex, aspect, shape };
  }

  // -------------------------------------------------------------------------
  // Determine Y-height range across all tip nodes for exposure normalization.
  // -------------------------------------------------------------------------
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { node } of tips) {
    if (node.pos[1] < minY) minY = node.pos[1];
    if (node.pos[1] > maxY) maxY = node.pos[1];
  }
  const yRange = Math.max(maxY - minY, 1e-6);

  // -------------------------------------------------------------------------
  // How many instances per tip?
  // Scales monotonically with seedHead ∈ (0,1] so:
  //   seedHead=0.01 → 1 instance per tip (minimum)
  //   seedHead=1.0  → SEED_HEAD_MAX_PER_TIP instances per tip
  // clustersPerTip = clamp(round(SEED_HEAD_CLUSTER_BASE * seedHead), 1, max)
  // -------------------------------------------------------------------------
  const clustersPerTip = Math.min(
    SEED_HEAD_MAX_PER_TIP,
    Math.max(1, Math.round(SEED_HEAD_CLUSTER_BASE * seedHead))
  );

  let count = 0;

  // -------------------------------------------------------------------------
  // Emit instances for each blade tip.
  //
  // PER-TIP LOOP:
  //   One azimuth-base rng draw per tip (always consumed for determinism even
  //   if budget would prevent any instances for this tip).
  //   Then per-instance draws (t jitter, sizeJitter, azJitter, roll).
  // -------------------------------------------------------------------------
  for (const { nodeIdx, node, parentIdx } of tips) {
    if (count >= MAX_SEED_HEADS) break;

    const parent = nodes[parentIdx];
    const pPos   = parent.pos;
    const nPos   = node.pos;

    // Segment direction from parent → tip
    const rawAxis = [
      nPos[0] - pPos[0],
      nPos[1] - pPos[1],
      nPos[2] - pPos[2],
    ];
    const segLen = len3(rawAxis);

    // Consume azBase rng draw for determinism even on degenerate segments.
    const azBase = rng() * SEED_HEAD_FAN_ANGLE;

    if (segLen < 1e-10) continue;

    const axis = norm3(rawAxis);
    const perp = perpTo(axis);

    // Exposure: height-based — use swayBase when present, else normalised Y.
    const heightFrac = node.swayBase !== undefined
      ? Math.max(0, Math.min(1, node.swayBase))
      : Math.max(0, Math.min(1, (node.pos[1] - minY) / yRange));

    // ageColor: height fraction (tips are the "youngest" / most sun-exposed)
    const tipAge = heightFrac;

    // Blade index for boneIndex field (no rng draw).
    let bladeIdx = 0;
    if (nodeToBlade !== null && nodeIdx >= 0 && nodeIdx < nodeToBlade.length) {
      const bi = nodeToBlade[nodeIdx];
      bladeIdx = (bi >= 0) ? bi : 0;
    }

    const toPlace = Math.min(clustersPerTip, MAX_SEED_HEADS - count);

    for (let k = 0; k < toPlace; k++) {
      // t: position along the segment from parent (base=0, tip=1, overshoot=1+)
      // Use a fixed t spread and a small rng jitter for natural scatter.
      const tJitter = rng() * SEED_HEAD_T_RANGE;
      const t       = SEED_HEAD_T_BASE + tJitter;

      // Instance position: along segment axis
      const instPos = [
        pPos[0] + rawAxis[0] * t,
        pPos[1] + rawAxis[1] * t,
        pPos[2] + rawAxis[2] * t,
      ];

      // Azimuth fan: evenly distributed + per-instance rng jitter
      const azStep   = SEED_HEAD_FAN_ANGLE / Math.max(toPlace, 1);
      const azJitter = (rng() - 0.5) * azStep;
      const azFinal  = azBase + k * azStep + azJitter;
      const radialDir = rotate3(perp, axis, azFinal);

      // Radial push (small — stays near tip)
      instPos[0] += radialDir[0] * SEED_HEAD_RADIAL_PUSH;
      instPos[1] += radialDir[1] * SEED_HEAD_RADIAL_PUSH;
      instPos[2] += radialDir[2] * SEED_HEAD_RADIAL_PUSH;

      // Size
      const sizeJitter   = 1.0 + (rng() - 0.5) * 2.0 * SIZE_JITTER;
      const instScale    = SEED_HEAD_BASE_SIZE * seedHead * sizeJitter;

      // Tangent: blade tip direction blended toward +Y (phototropism)
      const UP     = [0, 1, 0];
      let instTangent = norm3([
        axis[0] * (1 - PHOTO_STRENGTH) + UP[0] * PHOTO_STRENGTH,
        axis[1] * (1 - PHOTO_STRENGTH) + UP[1] * PHOTO_STRENGTH,
        axis[2] * (1 - PHOTO_STRENGTH) + UP[2] * PHOTO_STRENGTH,
      ]);

      // Normal: perpendicular to tangent in the radial plane
      const instNormal = norm3(cross3(instTangent, radialDir));

      // Roll: random spin about tangent axis
      const instRoll = (rng() - 0.5) * Math.PI;

      // Write into SoA buffers
      const i3 = count * 3;
      position[i3]     = instPos[0];
      position[i3 + 1] = instPos[1];
      position[i3 + 2] = instPos[2];
      normal[i3]       = instNormal[0];
      normal[i3 + 1]   = instNormal[1];
      normal[i3 + 2]   = instNormal[2];
      tangent[i3]      = instTangent[0];
      tangent[i3 + 1]  = instTangent[1];
      tangent[i3 + 2]  = instTangent[2];
      scale[count]     = instScale;
      rotation[count]  = instRoll;
      ageColor[count]  = tipAge;
      exposure[count]  = heightFrac;
      boneIndex[count] = bladeIdx;

      count++;
    }
  }

  return {
    count,
    position,
    normal,
    tangent,
    scale,
    rotation,
    ageColor,
    exposure,
    boneIndex,
    aspect,
    shape,
  };
}
