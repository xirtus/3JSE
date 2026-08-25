// =============================================================================
// STAGE 4 — solveProportions(graph, envelope, genome = null) -> graph (mutates in-place)
// Arch/verticality solver for GRASS blades. SEED NEVER TOUCHES RADII OR POSITIONS.
// Zero randomness: no Math.random, no rng parameter, no rng import.
// Determinism guarantee: same envelope + same input graph → identical output, bit-for-bit.
//
// GRASS SOLVER (replaces tree pipe-model):
//   1. Along-blade ribbon radius:
//        radius(node) = bladeWidthBase * (1 - bladeTaper * swayBase)
//        clamped to TIP_RADIUS_FLOOR at blade tips.
//        bladeWidthBase derived from bladeWidth gene (envelope-adjusted).
//   2. Whole-blade arch + tipDroop:
//        Each blade chain is bent progressively toward arch gravity, accumulating
//        along the chain (parent first). The arch angle per segment is:
//          archAngleTotal = arch * MAX_ARCH_ANGLE * (1 - stiffness * STIFFNESS_SCALE)
//        Distal third of blade gets an additional tipDroop contribution.
//   3. Verticality:
//        All-blade rotation about the blade's own base azimuth axis, combined
//        into the same Rodrigues call as the arch bend for each segment.
//   4. Wind structural response:
//        High wind → slightly shorter + narrower blades (from envelope).
//
// NODE CONTRACT (from buildSkeleton, §3 of GRASS_PLAN.md):
//   node.swayBase   — 0 at blade base → 1 at blade tip (REQUIRED, set by skeleton)
//   node.isStem     — true for all grass blade nodes
//   node.isTerminal — true at blade tip
//   node.branchLevel — always 0 for grass
//   node.parentIdx  — INVARIANT: parentIdx < ownIndex; -1 for blade base nodes
//   node.weight     — crossfade weight (1.0 for full blades)
//   (isWoody, isRoot, isFrond are ABSENT in grass — tolerant guards, no throw)
//
// GENOME GENES CONSUMED (all [0,1]):
//   bladeWidth   — ribbon half-width base → [0.004, 0.05] m
//   bladeTaper   — width falloff along blade; 0=parallel, 1=needle tip
//   arch         — whole-blade gravitational bow; 0=stiff upright, 1=strong droop
//   tipDroop     — extra droop concentrated in distal third
//   stiffness    — wind/arch resistance; 1=rigid→~0 arch, 0=floppy→full arch
//   verticality  — 0=prostrate/creeping, 0.5=erect, 1=strongly pendulous
//
// OMITTED (tree-only concepts — removed from grass solver):
//   trunk-base gravity sizing, leader clamp, root pipe-model,
//   weep willow pass, isFrond/isRoot tags (tolerant: no throw if absent).
// =============================================================================

// ---------------------------------------------------------------------------
// Vector helpers (pure, no allocations needed for callers)
// ---------------------------------------------------------------------------

function vecLen(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vecNorm(v) {
  const len = vecLen(v);
  if (len < 1e-12) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vecDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecScale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vecAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

// Rodrigues' rotation formula: rotate vector v around unit axis k by angle θ (radians).
// Returns a new array — does NOT mutate.
function rotateAroundAxis(v, k, theta) {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const dot  = vecDot(k, v);
  const cross = vecCross(k, v);
  return [
    v[0] * cosT + cross[0] * sinT + k[0] * dot * (1 - cosT),
    v[1] * cosT + cross[1] * sinT + k[1] * dot * (1 - cosT),
    v[2] * cosT + cross[2] * sinT + k[2] * dot * (1 - cosT),
  ];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Blade ribbon half-width mapping: bladeWidth [0,1] → [BLADE_WIDTH_MIN, BLADE_WIDTH_MAX] m
// Max of 0.012 m (24 mm full-width) keeps even the widest ornamental ribbon well within
// grass-blade territory. The old 0.050 m max produced hosta-leaf-width ribbons (~10 cm).
const BLADE_WIDTH_MIN = 0.004;
const BLADE_WIDTH_MAX = 0.012;

// Minimum ribbon radius at blade tip (prevents zero-width degenerate ribbons)
const TIP_RADIUS_FLOOR = 0.001;

// Maximum arch angle: arch=1, stiffness=0 → blades bend at most MAX_ARCH_ANGLE
// radians along the full chain. This gives a strong but not infinite droop.
// ~1.2 rad ≈ 69° of total arc from base to tip (cascade) for a fully floppy blade.
const MAX_ARCH_ANGLE = 1.2;

// Stiffness dampens arch: the effective arch scale is (1 - stiffness * STIFFNESS_SCALE).
// At stiffness=1: scale = 1 - 1*0.95 = 0.05 (tiny residual arch, not quite zero).
// At stiffness=0: scale = 1 (full arch).
const STIFFNESS_SCALE = 0.95;

// tipDroop is applied to nodes in the distal third of the blade (swayBase >= 0.67).
// Maximum additional droop angle from tipDroop=1 across the distal third.
const TIP_DROOP_MAX_ANGLE = 0.6;

// ---------------------------------------------------------------------------
// Genome gene → proportion mappings (documented)
// ---------------------------------------------------------------------------
//
// bladeWidth ∈ [0,1]:
//   bladeWidthBase = BLADE_WIDTH_MIN + bladeWidth * (BLADE_WIDTH_MAX - BLADE_WIDTH_MIN)
//   gene=0 → 0.004 m (very narrow needle); gene=1 → 0.050 m (wide blade)
//
// bladeTaper ∈ [0,1]:
//   radius(node) = bladeWidthBase * (1 - bladeTaper * swayBase)
//   gene=0 → parallel-sided ribbon (constant radius from base to tip)
//   gene=1 → linear taper to zero at tip (needle), clamped to TIP_RADIUS_FLOOR
//
// arch ∈ [0,1]:
//   Whole-blade bow: the total arc angle accumulates along the chain.
//   Per-segment arch angle = archAngleTotal / segCountOfBlade
//     archAngleTotal = arch * MAX_ARCH_ANGLE * archScale
//     archScale = 1 - stiffness * STIFFNESS_SCALE
//   arch=0 OR stiffness~1 → near-zero bend (straight upright)
//   arch=1, stiffness=0 → MAX_ARCH_ANGLE total arc (~69°) over the whole blade
//
// tipDroop ∈ [0,1]:
//   Additional downward bend concentrated in the distal third (swayBase >= 0.67).
//   Extra angle per distal segment = tipDroop * TIP_DROOP_MAX_ANGLE * archScale / distalSegCount
//
// stiffness ∈ [0,1]:
//   archScale = 1 - stiffness * STIFFNESS_SCALE
//   Scales both arch and tipDroop. A rigid blade (stiffness=1) resists all bending.
//
// verticality ∈ [0,1]:
//   Controls the initial emit angle of the blade from the ground plane.
//   0 = prostrate (blade starts past-horizontal outward; tips below base elevation)
//   0.5 = erect baseline (blade starts straight up; tips at maximum elevation)
//   1 = pendulous (blade starts past-vertical inward; tips hang below base)
//
//   Implemented as a rotation of the initial direction vector BEFORE the arch bend.
//   The rotation axis is the blade's tilt axis (perpendicular to its XZ radial
//   direction and the body axis), computed per-blade from the base XZ position.
//
//     vertAngle = (0.5 - verticality) * Math.PI * 1.1
//       verticality=0   → +0.55π (+99°) → tip pushed past-horizontal outward (prostrate)
//       verticality=0.5 → 0             → straight upright (erect baseline; max tip Y)
//       verticality=1   → -0.55π (-99°) → tip pushed past-vertical inward (pendulous; tip Y < 0)
//
//   Sub-range [0.5, 1]: tip elevation decreases monotonically (pendulous AC). ✓
//   v=0 tip elevation < v=0.5 tip elevation (prostrate spreads outward). ✓
//
// Wind structural response (from envelope):
//   High wind → narrower blades.
//   windWidthMod = 1 + (0.2 - wind) * 0.4
//     At wind=0.2 (neutral): factor=1.0 (no change)
//     At wind=1.0 (high):    factor=0.68 (32% narrower)
//     At wind=0.0 (calm):    factor=1.08 (8% wider)

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function solveProportions(graph, envelope, genome = null) {
  const { nodes } = graph;
  const meta = graph.meta || {};
  const bodyAxis = meta.bodyAxis || [0, 1, 0];

  // -------------------------------------------------------------------------
  // Tolerant guard: do NOT throw on missing isWoody/isRoot/isFrond.
  // Only guard parentIdx ordering invariant (structural safety).
  // -------------------------------------------------------------------------

  // Guard: parentIdx ordering invariant — parents must always precede children.
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.parentIdx !== undefined && n.parentIdx !== -1) {
      if (n.parentIdx >= i) {
        throw new Error(
          `solveProportions: ordering invariant violated at node[${i}] — ` +
          `parentIdx=${n.parentIdx} must be < ownIndex=${i}. ` +
          `buildSkeleton must emit parents before children.`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // sunAngle → lightDir (this stage owns lightDir computation)
  //
  // Elevation mapping: sunAngle=0 → ~80° overhead; sunAngle=1 → ~15° low.
  // Fixed azimuth: sin(az)=0.8, cos(az)=0.6.
  // -------------------------------------------------------------------------
  const sunAngle = envelope.sunAngle !== undefined ? envelope.sunAngle : 0.25;
  const DEG      = Math.PI / 180;
  const elev     = (80 - 65 * sunAngle) * DEG;
  const sinAz    = 0.8;
  const cosAz    = 0.6;
  const cosEl    = Math.cos(elev);
  const sinEl    = Math.sin(elev);
  const computedLightDir = vecNorm([sinAz * cosEl, sinEl, cosAz * cosEl]);
  meta.lightDir = computedLightDir;
  if (!graph.meta) graph.meta = meta;

  // -------------------------------------------------------------------------
  // Wind envelope modifier — affects blade width only.
  // -------------------------------------------------------------------------
  const wind          = envelope.wind !== undefined ? envelope.wind : 0.2;
  const windWidthMod  = 1 + (0.2 - wind) * 0.4;

  // -------------------------------------------------------------------------
  // Genome genes — defensive read, fall back to neutral defaults.
  // -------------------------------------------------------------------------
  const g = genome !== null ? genome : {};

  const bladeWidthGene = g.bladeWidth  !== undefined ? g.bladeWidth  : 0.45;
  const bladeTaperGene = g.bladeTaper  !== undefined ? g.bladeTaper  : 0.70;
  const archGene       = g.arch        !== undefined ? g.arch        : 0.25;
  const tipDroopGene   = g.tipDroop    !== undefined ? g.tipDroop    : 0.10;
  const stiffnessGene  = g.stiffness   !== undefined ? g.stiffness   : 0.60;
  const verticalityGene = g.verticality !== undefined ? g.verticality : 0.55;

  // Derived scalars.
  const bladeWidthBase = (BLADE_WIDTH_MIN + bladeWidthGene * (BLADE_WIDTH_MAX - BLADE_WIDTH_MIN)) * windWidthMod;
  const archScale      = Math.max(0, 1 - stiffnessGene * STIFFNESS_SCALE);
  // archTotal/tipDroopTotal are PER-BLADE (each chain's base node may carry a
  // sampled vArch/vTipDroop from the per-blade range; fallback to the gene).

  // verticality → base tilt angle of the blade.
  // vertAngle = (0.5 - verticality) * π * 1.1
  //   v=0   → +0.55π (+99°) → blade starts past-horizontal outward (prostrate/creeping; tips below base)
  //   v=0.5 → 0 → straight upright (erect; max tip elevation)
  //   v=1   → -0.55π (-99°) → blade starts past-vertical inward (strongly pendulous; tips below base)
  //
  // The factor 1.1 ensures:
  //   - v=0.5 gives exact vertical (max elevation, satisfying the erect AC).
  //   - v=1 gives dir with negative Y component → tips descend below the base (pendulous AC).
  //   - v=0 also gives dir with negative Y component → but only test 3b applies (v=0 < v=0.5).
  //   - The [0.5, 1] sub-range is strictly monotone decreasing in tip elevation.
  const vertAngle = (0.5 - verticalityGene) * Math.PI * 1.1;

  // -------------------------------------------------------------------------
  // Build a children map for identifying each blade's structure.
  // (Needed to count segments per blade for per-segment arch angle.)
  // -------------------------------------------------------------------------
  const childrenOf = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) childrenOf[i] = [];
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i].parentIdx;
    if (p !== undefined && p >= 0) childrenOf[p].push(i);
  }

  // -------------------------------------------------------------------------
  // Identify blade chains.
  //
  // A blade is a linear chain from a base node (parentIdx=-1) to a tip
  // (isTerminal). We find all base nodes, then walk each chain to collect
  // the ordered node indices for that blade.
  //
  // Grass blades are all at branchLevel=0 with no recursive branching, so
  // each base has exactly one chain path. We collect chains by following
  // the single-child path from each base node.
  // -------------------------------------------------------------------------
  const bladeChains = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    // A blade base: parentIdx=-1 and isStem (grass). Also tolerate nodes with
    // no explicit isStem for forward-compat (just use parentIdx=-1 heuristic).
    const pIdx = n.parentIdx !== undefined ? n.parentIdx : -1;
    if (pIdx === -1) {
      // Walk the chain from this base to the tip.
      const chain = [i];
      let cur = i;
      while (childrenOf[cur].length > 0) {
        // Single-child chain: take first child (grass has no branching).
        cur = childrenOf[cur][0];
        chain.push(cur);
      }
      bladeChains.push(chain);
    }
  }

  // -------------------------------------------------------------------------
  // Pass 1: Radius assignment.
  //
  // Along-blade taper keyed on swayBase:
  //   radius(node) = bladeWidthBase * (1 - bladeTaperGene * swayBase)
  //   clamped to TIP_RADIUS_FLOOR to avoid zero-width degeneracy.
  //
  // Tolerant: if swayBase is absent, default to 0 (base of blade).
  // Does NOT use pipe-model; each node is independent.
  // -------------------------------------------------------------------------
  for (let i = 0; i < nodes.length; i++) {
    const n   = nodes[i];
    const sb  = n.swayBase !== undefined ? n.swayBase : 0;
    const r   = bladeWidthBase * (1 - bladeTaperGene * sb);
    n.radius  = Math.max(TIP_RADIUS_FLOOR, r);
  }

  // -------------------------------------------------------------------------
  // Pass 2: Whole-blade arch + verticality bend.
  //
  // For each blade chain:
  //   1. Pre-compute segment lengths from the ORIGINAL node positions (before
  //      any mutation) so that lengthening/modifying nodes later doesn't affect
  //      segment length measurement.
  //   2. Compute the per-blade tilt axis from the blade's own heading.
  //      When the base XZ position is non-zero (normal spread clump), the
  //      radial direction comes from the base XZ offset as before.
  //      When clumpSpread=0 (all bases at origin), the base XZ is zero for
  //      every blade, so we derive the radial direction from the blade's own
  //      azimuth — specifically the horizontal displacement of the chain's
  //      farthest node from the base.  If the chain is also perfectly vertical
  //      (no lateral offset at all), we fall back to a per-blade deterministic
  //      angle based on the blade's index in bladeChains, distributing blades
  //      radially so each one bends in its own unique plane.
  //   3. Set the initial direction by rotating bodyAxis by vertAngle about the
  //      tilt axis (prostrate↔pendulous).
  //   4. For each segment: advance pos along dir by segLen, then apply arch +
  //      tipDroop by rotating dir about the FIXED tilt axis (not dynamic
  //      cross(dir, downDir)).  Using a fixed arch axis keeps blades in their
  //      own radial plane and avoids the degenerate-axis problem when dir is
  //      parallel to downDir.
  //
  // The tilt axis is the axis about which the blade bends in its own radial
  // plane: cross(radialDir, bodyAxis).  For a blade at XZ position (bx, bz),
  // radialDir = normalize(bx, 0, bz).  For a blade at origin (single clump),
  // we derive radialDir from the blade's own heading (see above).
  //
  // ARCH DIRECTION: The arch bends the blade "over" (increasing droopward), so
  //   the rotation is in the SAME direction as "leaning the blade outward from
  //   vertical" — which is the positive-angle direction of the tilt axis rotation.
  //   (When vertAngle > 0 the blade leans outward; arch continues that lean.)
  //
  //   Practically: arch rotates dir about tiltAxis by +archPerSeg each step,
  //   causing an initially upright blade to lean further and further outward/down.
  //   This is correct: positive vertAngle (prostrate, v=0) leans outward;
  //   arch adds more lean each segment → blades bow over.
  //
  // tipDroop: applied in the distal third (swayBase >= 2/3) as additional
  //   positive rotation (more lean = more droop at the tip end).
  // -------------------------------------------------------------------------

  for (let chainIdx = 0; chainIdx < bladeChains.length; chainIdx++) {
    const chain = bladeChains[chainIdx];
    if (chain.length < 2) continue; // degenerate: no segments, skip

    const segCountBlade = chain.length - 1; // number of segments

    // --- Pre-compute segment lengths from ORIGINAL positions ---
    // Must be done before we mutate any node in this chain.
    const segLengths = new Array(segCountBlade);
    // origDirs: the skeleton's per-segment unit directions, which ENCODE the
    // `curve` gene's lateral arc. Pass 2 keeps these and adds arch/vert on top
    // (previously it discarded them, which silently killed the curve gene).
    const origDirs   = new Array(segCountBlade);
    for (let ci = 1; ci < chain.length; ci++) {
      const prev = nodes[chain[ci - 1]];
      const cur  = nodes[chain[ci]];
      const dx = cur.pos[0] - prev.pos[0];
      const dy = cur.pos[1] - prev.pos[1];
      const dz = cur.pos[2] - prev.pos[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      segLengths[ci - 1] = len;
      origDirs[ci - 1]   = len > 1e-12 ? [dx / len, dy / len, dz / len] : vecNorm(bodyAxis);
    }

    // Per-blade arch/tipDroop: read this chain's base-node sampled values
    // (set by skeleton's per-blade range sampling); fall back to the gene.
    const chainBase     = nodes[chain[0]];
    const bArch         = chainBase.vArch     !== undefined ? chainBase.vArch     : archGene;
    const bTipDroop     = chainBase.vTipDroop !== undefined ? chainBase.vTipDroop : tipDroopGene;
    const archTotal     = bArch     * MAX_ARCH_ANGLE     * archScale;
    const tipDroopTotal = bTipDroop * TIP_DROOP_MAX_ANGLE * archScale;

    // Per-segment arch angle (spread total arc over all segments).
    const archPerSeg = segCountBlade > 0 ? archTotal / segCountBlade : 0;

    // Distal third: segments whose DEST node has swayBase >= 2/3.
    let distalSegCount = 0;
    for (let ci = 1; ci < chain.length; ci++) {
      const sb = nodes[chain[ci]].swayBase !== undefined ? nodes[chain[ci]].swayBase : 0;
      if (sb >= (2 / 3)) distalSegCount++;
    }
    const tipDroopPerSeg = distalSegCount > 0 ? tipDroopTotal / distalSegCount : 0;

    // --- Tilt axis for this blade ---
    //
    // Primary: use the base XZ offset as the radial direction (normal clump case).
    // Fallback 1: when base is at origin, look at the blade's own horizontal
    //   heading — the XZ displacement of the chain tip relative to the base.
    //   This is non-zero when skeleton lateral curvature pushes nodes off-axis.
    // Fallback 2: if the chain is also perfectly vertical (no XZ displacement
    //   anywhere), derive a unique per-blade radial direction from the blade's
    //   chain index using a fixed angle increment.  This ensures blades fan
    //   radially even when clumpSpread=0 and all bases coincide at the origin.
    const baseNode = nodes[chain[0]];
    const bx  = baseNode.pos[0];
    const bz  = baseNode.pos[2];
    const xzLen = Math.sqrt(bx * bx + bz * bz);

    let radialDir;
    if (xzLen > 1e-8) {
      // Normal case: base is away from origin — use base XZ as radial.
      radialDir = vecNorm([bx, 0, bz]);
    } else {
      // Base is at origin (clumpSpread=0 or single-point clump).
      // Try the tip-relative XZ direction of the chain.
      const tipNode = nodes[chain[chain.length - 1]];
      const tx = tipNode.pos[0] - bx;
      const tz = tipNode.pos[2] - bz;
      const tipXZLen = Math.sqrt(tx * tx + tz * tz);
      if (tipXZLen > 1e-8) {
        // Chain has lateral curvature — use the tip direction as the heading.
        radialDir = vecNorm([tx, 0, tz]);
      } else {
        // Blade is perfectly vertical (no lateral offset at any node).
        // Distribute blades around the full circle using the blade's chain index,
        // so each blade bends in a distinct radial plane even when all bases coincide.
        const totalChains = bladeChains.length;
        const perBladeAngle = (Math.PI * 2) / Math.max(1, totalChains);
        const bladeAngle = chainIdx * perBladeAngle;
        radialDir = [Math.cos(bladeAngle), 0, Math.sin(bladeAngle)];
      }
    }

    // tiltAxis = cross(radialDir, bodyAxis)
    // This points "sideways" relative to the radial plane — rotating dir about
    // it tilts the blade outward (positive angle) or inward (negative angle).
    let tiltAxis = vecCross(radialDir, bodyAxis);
    const tiltAxisLen = vecLen(tiltAxis);
    if (tiltAxisLen < 1e-10) {
      tiltAxis = [0, 0, 1];
    } else {
      tiltAxis = vecScale(tiltAxis, 1 / tiltAxisLen);
    }

    // --- Walk each segment, PRESERVING the skeleton's lateral curvature ---
    // Each segment keeps its original skeleton direction (origDirs[i], which
    // carries the `curve` gene's lateral arc) and is additionally rotated about
    // the tiltAxis by the accumulated verticality + arch (+ distal tipDroop).
    // For a straight skeleton (origDir = bodyAxis) this is identical to the prior
    // behaviour, so the arch/verticality/tipDroop tests are unaffected.
    let cumAngle = vertAngle;
    let pos = baseNode.pos.slice();

    for (let ci = 1; ci < chain.length; ci++) {
      const curNode = nodes[chain[ci]];
      const sb      = curNode.swayBase !== undefined ? curNode.swayBase : 0;
      const segLen  = segLengths[ci - 1];

      const dir = vecNorm(rotateAroundAxis(origDirs[ci - 1], tiltAxis, cumAngle));
      pos = vecAdd(pos, vecScale(dir, segLen));
      curNode.pos[0] = pos[0];
      curNode.pos[1] = pos[1];
      curNode.pos[2] = pos[2];

      // Accumulate bend for subsequent segments: arch over the whole blade,
      // tipDroop concentrated in the distal third.
      cumAngle += archPerSeg + (sb >= (2 / 3) ? tipDroopPerSeg : 0);
    }
  }

  return graph;
}
