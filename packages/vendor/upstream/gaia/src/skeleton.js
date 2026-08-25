// =============================================================================
// STAGE 3 — buildSkeleton(genome, rng, jitterAmp=1.0) -> { nodes, bones, meta }
// Clump-of-tillers builder for procedural GRASS generation.
//
// CONTINUOUS MORPHOSPACE — no discrete body-plan modes.
// All structural parameters are derived from continuous [0,1] genes so that
// every gene interpolation yields a valid, smoothly-changing organism.
//
// GENOME FIELDS CONSUMED HERE (all [0,1] unless noted):
//   tillerCount    — fractional basal blade count → blades ∈ [1,12]
//                    via (1 + tillerCount*11)
//   clumpSpread    — basal footprint ring radius; 0 = single point
//   bladeSegments  — internode count per blade → segments ∈ [3,8]
//                    via (3 + round(bladeSegments*5))
//   fanSpread      — azimuthal fan angle [0,1]; 0 = all parallel, 1 = full 360°
//   bladeLength    — world-height of a full blade → [0.15, 2.2] m
//   jitter         — base positional jitter amplitude (multiplied by jitterAmp)
//   structuralSeed — deterministic curvature seed; no rng draws consumed
//   curve          — in-plane lateral curvature; deterministic, no rng draws
//
// =============================================================================
//
// FRACTIONAL-COUNT CROSSFADE — the load-bearing continuity trick
// ==============================================================
// Many structural properties are "counts" (number of blades, segments, etc.)
// Discrete count changes cause population jumps. We avoid this with:
//
//   Given fractional count x (e.g. 5.7 blades):
//     - Build floor(x) FULL elements normally.
//     - Build ONE extra "crossfade" element at weight frac = x - floor(x).
//     - Scale that element's radius AND length by frac, so it GROWS IN FROM ZERO.
//     - At frac≈0 the element is invisible (zero-size); at frac≈1 it matches full.
//     - A small gene delta moves frac continuously with no population discontinuity.
//
// Applied to:
//   tillerCount → fullBlades full blades + 1 crossfade blade at weight bladeFrac
//
// =============================================================================
//
// SKELETON STAGE RNG DRAW ORDER:
//   For each blade (fullBlades + [0 or 1] crossfade) in sequence:
//     draw 1:  azimuth jitter for this blade's base position
//
//   INVARIANT: rng draw count/order is NEVER affected by jitterAmp.
//   INVARIANT: jitterAmp scales VALUE only; all rng() calls happen regardless.
//
// NOTE ON CURVATURE:
//   Per-blade lateral curvature is computed deterministically from structuralSeed
//   and blade index — it does NOT consume any additional rng draws.
//   The `curve` gene drives the S/C arc shape; no rng consumed for it.
//
// BONE BUDGET:
//   12 blades × 8 segments ≈ 96 nodes; margin kept at 200.
//   Exported MAX_BONES = 200 — the upper bound; callers may reference it.
//
// NODE SHAPE (per §3 of GRASS_PLAN.md):
//   {
//     pos:         [x, y, z],
//     radius:      number,    // ribbon half-width (set to bladeWidth base; proportions refines)
//     weight:      number,    // crossfade weight (1.0 for full blades, bladeFrac for crossfade)
//     branchLevel: 0,         // always 0 for grass (no recursive branching)
//     parentIdx:   int,       // INVARIANT: parentIdx < ownIndex; -1 for blade base nodes
//     isStem:      true,      // every blade-chain node
//     isTerminal:  bool,      // true only at blade tip (one per blade)
//     swayBase:    number,    // 0 at blade base → 1 at blade tip (drives windGlsl + arch)
//   }
// =============================================================================

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function normalize(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  if (len < 1e-10) return [0, 1, 0];
  return [v[0]/len, v[1]/len, v[2]/len];
}

function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

function dot(a, b) {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

// Rodrigues rotation: rotate vector v by angle around unit axis ax
function rotateAround(v, ax, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = dot(v, ax);
  const cr = cross(ax, v);
  return [
    v[0]*c + cr[0]*s + ax[0]*d*(1 - c),
    v[1]*c + cr[1]*s + ax[1]*d*(1 - c),
    v[2]*c + cr[2]*s + ax[2]*d*(1 - c)
  ];
}

// Compute a perpendicular vector to dir (unit)
function perpTo(dir) {
  if (Math.abs(dot(dir, [1, 0, 0])) < 0.9) {
    return normalize(cross(dir, [1, 0, 0]));
  }
  return normalize(cross(dir, [0, 0, 1]));
}

// ---------------------------------------------------------------------------
// MAX_BONES — exported bone budget ceiling.
//
// Grass has far fewer bones than the old tree (12 blades × 8 segs ≈ 96).
// We keep a comfortable upper bound with margin.
// ---------------------------------------------------------------------------
export const MAX_BONES = 200;

// ---------------------------------------------------------------------------
// Blade world-height mapping: bladeLength ∈ [0,1] → world meters ∈ [0.15, 2.2]
// ---------------------------------------------------------------------------
const BLADE_LENGTH_MIN = 0.15;
const BLADE_LENGTH_MAX = 2.2;

// ---------------------------------------------------------------------------
// MAX_FOOTPRINT — maximum clump ring radius at clumpSpread=1.
// 0.5 world units gives a natural dense clump without visually disconnecting.
// ---------------------------------------------------------------------------
const MAX_FOOTPRINT = 0.5;

// ---------------------------------------------------------------------------
// computeBladeArc — deterministic in-plane lateral curvature for a blade.
//
// Returns a total arc angle in radians for the blade's S/C curve.
// Keyed on structuralSeed and blade index — no rng draws consumed.
// Scaled by `curve` gene. Sign alternates per blade for organic variety.
// ---------------------------------------------------------------------------
function computeBladeArc(structuralSeed, bladeIndex, curve) {
  // Simple sine hash to give each blade a unique-but-deterministic curvature.
  const h = Math.sin(structuralSeed * 5.4321 + bladeIndex * 2.3999 + 1.6180);
  // S-curve: direction alternates (sign from hash) and magnitude from curve gene.
  return h * curve * 0.55; // max ±0.55 rad ≈ ±31° total arc
}

// ---------------------------------------------------------------------------
// buildSkeleton
//
// genome: continuous gene vector (grass genes; see file header).
// rng:    mulberry32 function (closed over seed) — call rng() to draw.
// jitterAmp: scales ALL per-node jitter magnitudes uniformly.
//   1.0 (default) → full jitter. 0 → unjittered ideal positions.
//   INVARIANT: rng draw count/order is NEVER affected by jitterAmp.
//
// Returns: { nodes, bones, meta }
// ---------------------------------------------------------------------------
export function buildSkeleton(genome, rng, jitterAmp = 1.0) {
  const {
    tillerCount   = 0.45,  // [0,1] → blades ∈ [1,12]
    clumpSpread   = 0.30,  // [0,1] → basal footprint radius
    bladeSegments = 0.40,  // [0,1] → segments per blade ∈ [3,8]
    fanSpread     = 0.50,  // [0,1] → azimuthal fan angle
    bladeLength   = 0.35,  // [0,1] → world height in [0.15, 2.2] m (MIN of the per-blade range)
    jitter        = 0.40,  // [0,1] → positional jitter amplitude
    structuralSeed = 0,    // uint32 or [0,1] float — deterministic curvature seed
    curve         = 0.15,  // [0,1] → in-plane lateral curvature
  } = genome;

  // Per-blade range maxima. Each blade samples its own value in [base, max] so a
  // clump has varied tillers (height/width/taper/arch/droop). Fallback max=base
  // → no variation, keeping hand-built test genomes (no …Max fields) identical.
  const bladeLengthMax = genome.bladeLengthMax !== undefined ? genome.bladeLengthMax : bladeLength;
  const bladeWidth     = genome.bladeWidth     !== undefined ? genome.bladeWidth     : 0.45;
  const bladeWidthMax  = genome.bladeWidthMax  !== undefined ? genome.bladeWidthMax  : bladeWidth;
  const bladeTaper     = genome.bladeTaper     !== undefined ? genome.bladeTaper     : 0.70;
  const bladeTaperMax  = genome.bladeTaperMax  !== undefined ? genome.bladeTaperMax  : bladeTaper;
  const archG          = genome.arch           !== undefined ? genome.arch           : 0.25;
  const archMax        = genome.archMax        !== undefined ? genome.archMax        : archG;
  const tipDroopG      = genome.tipDroop       !== undefined ? genome.tipDroop       : 0.10;
  const tipDroopMax    = genome.tipDroopMax    !== undefined ? genome.tipDroopMax    : tipDroopG;

  // -------------------------------------------------------------------------
  // Derive structural counts from continuous genes.
  //
  //   totalBlades:   fractional tiller count → integer + crossfade.
  //   segCount:      internode count per blade ∈ [3,8].
  //   worldLength:   full-blade world height.
  // -------------------------------------------------------------------------

  // Blade count: tillerCount ∈ [0,1] → fractBlades ∈ [1,12]
  const fractBlades = 1 + tillerCount * 11;
  const fullBlades  = Math.floor(fractBlades);
  const bladeFrac   = fractBlades - fullBlades; // ∈ [0,1) crossfade weight

  // Total blades to emit: full blades + up to 1 crossfade blade
  const totalBlades = fullBlades + (bladeFrac > 0 ? 1 : 0);

  // Segments per blade: bladeSegments ∈ [0,1] → ∈ [3,8]
  // Note: all blades share the same segment count (a genome-level parameter).
  const segCount = Math.max(3, Math.min(8, 3 + Math.round(bladeSegments * 5)));

  // World-height of one full-weight blade.
  const worldLength = BLADE_LENGTH_MIN + bladeLength * (BLADE_LENGTH_MAX - BLADE_LENGTH_MIN);

  // Combined jitter amplitude (genome jitter × call-site jitterAmp).
  // All rng draws happen regardless; jAmp only scales the drawn value.
  const jAmp = jitter * jitterAmp;

  // -------------------------------------------------------------------------
  // RNG DRAW SCHEDULE
  //
  // We draw one azimuth per blade (for jitter), always consuming draws for ALL
  // blades (full + crossfade) in sequence to keep draw count deterministic.
  // -------------------------------------------------------------------------
  // Per blade: an azimuth-jitter draw + a per-blade variate draw [0,1]. The
  // variate seeds the per-blade range sampling (decorrelated per param below).
  const bladeAzimuths = [];
  const bladeVariates = [];
  for (let bi = 0; bi < totalBlades; bi++) {
    bladeAzimuths.push(rng() * Math.PI * 2); // azimuth jitter
    bladeVariates.push(rng());               // per-blade variate
  }

  // fract + range sampler (lo/hi auto-ordered so a min>max gene pair is safe).
  const fract = (x) => x - Math.floor(x);
  const sampleRange = (base, hi, t) => {
    const lo = Math.min(base, hi), h = Math.max(base, hi);
    return lo + (h - lo) * t;
  };

  const nodes = [];
  const bones = [];

  const BODY_AXIS = [0, 1, 0];
  const LIGHT_DIR = normalize([0.4, 0.9, 0.3]);

  // -------------------------------------------------------------------------
  // Emit each blade chain.
  //
  // A blade is a single linear chain of (segCount + 1) nodes:
  //   node 0: base (at clump ring, swayBase=0, parentIdx=-1)
  //   nodes 1..segCount-1: intermediate (swayBase=i/segCount)
  //   node segCount: tip (isTerminal=true, swayBase=1)
  //
  // parentIdx invariant: each node's parentIdx is the previous node in its
  // chain, which was just pushed → parentIdx < ownIndex guaranteed.
  // -------------------------------------------------------------------------
  for (let bi = 0; bi < totalBlades; bi++) {
    const isCrossfade = bi === fullBlades;
    const weight      = isCrossfade ? bladeFrac : 1.0;

    // -----------------------------------------------------------------------
    // Base position: place on a ring of radius R at the drawn azimuth.
    //
    // clumpSpread=0 → R=0 → all blades share origin (single-point clump).
    // clumpSpread=1 → R=MAX_FOOTPRINT * weight.
    // SINGLE-BLADE EXCEPTION: when totalBlades === 1, always origin regardless
    // of clumpSpread (a lone blade has no footprint to spread).
    // -----------------------------------------------------------------------
    let baseX = 0;
    let baseZ = 0;

    if (totalBlades > 1) {
      const R = clumpSpread * MAX_FOOTPRINT * weight;
      // Azimuth: distribute blades across the fan angle, plus small jitter.
      // fanSpread=0 → all blades at az=0 (parallel cluster).
      // fanSpread=1 → evenly spread over 360°.
      // We first place them deterministically across the fan angle, then
      // the jitter draw offsets the final position.
      const baseFanAngle = fanSpread * Math.PI * 2;
      // Distribute blades across the FULL fan sweep:
      // fanStep = baseFanAngle / (totalBlades - 1) places blade 0 at az=0 and
      // blade N-1 at az=baseFanAngle, using the entire intended sweep with no gap.
      // With a single blade (totalBlades===1) there is nothing to distribute.
      const fanStep = totalBlades > 1 ? baseFanAngle / Math.max(1, totalBlades - 1) : 0;
      const deterministicAz = bi * fanStep;
      // The jitter draw gives us a random offset; scale by jAmp.
      const jitterAz = (bladeAzimuths[bi] - Math.PI) * (2.0 / Math.PI) * 0.25 * jAmp;
      const az = deterministicAz + jitterAz;
      baseX = Math.cos(az) * R;
      baseZ = Math.sin(az) * R;
    }

    // -----------------------------------------------------------------------
    // Build the blade's chain from base (y=0) to tip (y=worldLength*weight).
    //
    // Upward direction: we start near-vertical. Arch/verticality are handled
    // by proportions.js (Task 3), not here. Skeleton sets initial straight-up
    // chain; proportions bends it.
    //
    // Deterministic lateral curvature via computeBladeArc (no rng draws).
    //   arcAngle: total arc the chain subtends across all segments.
    //   arcAxis:  in-plane axis perpendicular to up and to a hash-derived lateral.
    // -----------------------------------------------------------------------
    const arcAngle  = computeBladeArc(structuralSeed, bi, curve);
    const upDir     = [0, 1, 0];
    const latAxis   = perpTo(upDir); // lateral axis for the arc plane
    // Rotate latAxis around upDir by a deterministic per-blade angle
    // to give each blade a distinct curvature plane (no rng draw).
    const latPlaneAngle = Math.sin(structuralSeed * 3.1416 + bi * 1.7321) * Math.PI;
    const arcAxis = normalize(rotateAround(latAxis, upDir, latPlaneAngle));

    // Arc per segment: spread total arc evenly across segments.
    const arcPerSeg = segCount > 1 ? arcAngle / segCount : 0;

    // --- Per-blade range sampling (decorrelated per param from one variate) ---
    const vt = bladeVariates[bi];
    const lenGene = sampleRange(bladeLength, bladeLengthMax, vt);
    const bladeWorldLenFull = BLADE_LENGTH_MIN + lenGene * (BLADE_LENGTH_MAX - BLADE_LENGTH_MIN);

    // Blade chain length (height) for this blade (crossfade scaled).
    const bladeWorldLen = bladeWorldLenFull * weight;
    const segLen        = bladeWorldLen / segCount;

    // Track the growing chain direction and position.
    let dir = [...upDir];
    let pos = [baseX, 0, baseZ];

    // Index of the base node (the node we're about to push).
    const baseNodeIdx = nodes.length;

    // Emit base node (swayBase=0, parentIdx=-1). It carries the per-blade sampled
    // gene values consumed downstream: proportions.js reads vArch/vTipDroop;
    // bladeMesh.js reads vWidth/vTaper. (Decorrelated via fract so a blade isn't
    // uniformly small in every axis.)
    nodes.push({
      pos:         [...pos],
      radius:      0.012 * weight, // placeholder; proportions refines this
      weight,
      branchLevel: 0,
      parentIdx:   -1,
      isStem:      true,
      isTerminal:  false,
      swayBase:    0,
      vWidth:      sampleRange(bladeWidth, bladeWidthMax, fract(vt * 1.37 + 0.11)),
      vTaper:      sampleRange(bladeTaper, bladeTaperMax, fract(vt * 2.13 + 0.29)),
      vArch:       sampleRange(archG,      archMax,       fract(vt * 0.71 + 0.53)),
      vTipDroop:   sampleRange(tipDroopG,  tipDroopMax,   fract(vt * 3.07 + 0.17)),
    });

    // Emit intermediate + tip nodes.
    for (let si = 0; si < segCount; si++) {
      // Apply arc curvature incrementally (bend direction toward arcAxis plane).
      if (Math.abs(arcPerSeg) > 1e-7) {
        dir = normalize(rotateAround(dir, arcAxis, arcPerSeg));
      }

      // Advance position along current direction.
      pos = [
        pos[0] + dir[0] * segLen,
        pos[1] + dir[1] * segLen,
        pos[2] + dir[2] * segLen,
      ];

      const newIdx     = nodes.length;
      const prevIdx    = newIdx - 1; // parentIdx < ownIndex guaranteed
      const isLastSeg  = si === segCount - 1;
      const swayBase   = (si + 1) / segCount; // 1/N, 2/N, … N/N=1

      nodes.push({
        pos:         [...pos],
        radius:      0.012 * weight * (1 - 0.8 * swayBase), // rough taper; proportions refines
        weight,
        branchLevel: 0,
        parentIdx:   prevIdx,
        isStem:      true,
        isTerminal:  isLastSeg,
        swayBase,
      });

      bones.push({ a: prevIdx, b: newIdx });

      // The tip node (isLastSeg) also carries attachPos for foliage.
      if (isLastSeg) {
        nodes[newIdx].attachPos = [...nodes[baseNodeIdx].pos];
      }
    }
  }

  return {
    nodes,
    bones,
    meta: {
      bodyAxis: BODY_AXIS,
      lightDir: LIGHT_DIR
    }
  };
}
