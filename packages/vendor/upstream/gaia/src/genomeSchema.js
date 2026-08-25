// =============================================================================
// genomeSchema.js — declarative GRASS genome schema (continuous morphospace)
//
// Keystone of the phylogeny layer. Describes every gene's tier, kind, and valid
// domain. Used by genome-agnostic mutate() and by distance/divergence calcs.
//
// GRASS SCHEMA — 19 genes (18 continuous + 1 seed):
//   STRUCTURAL:   tillerCount, clumpSpread, bladeSegments, seedHead, fanSpread
//   PROPORTIONS:  bladeLength, bladeWidth, bladeTaper, arch, curve,
//                 stiffness, verticality, tipDroop
//   COSMETIC:     pigment, bladeRaggedness, colorVariation, jitter,
//                 midribStrength, structuralSeed
//
// CONTINUOUS MORPHOSPACE (No Man's Sky-style):
//   All genes are kind:'continuous' (float in [lo,hi]) except structuralSeed
//   which is kind:'seed' (uint32). Ranges chosen so the neutral vector is a
//   believable mid lawn blade and identity defaults are no-ops.
//
// Tier assignments affect mutation-rate multipliers in mutate.js:
//   structural  — gross body plan axes (rare mutation, macromutation)
//   proportions — shape/proportion axes (moderate mutation)
//   cosmetic    — surface detail axes (frequent mutation)
//
// Pure ESM — no three.js dependency; importable via `node --input-type=module`.
// =============================================================================

// ---------------------------------------------------------------------------
// GRASS_SCHEMA
// ---------------------------------------------------------------------------

/**
 * Schema map: field -> gene descriptor.
 *
 * tier:  'structural' | 'proportions' | 'cosmetic'
 * kind:  'continuous' | 'seed'
 * range: (continuous only) [lo, hi] inclusive
 */
export const GRASS_SCHEMA = Object.freeze({

  // -------------------------------------------------------------------------
  // STRUCTURAL TIER — gross body plan
  // -------------------------------------------------------------------------

  /**
   * Fractional basal blade count → blades ∈ [1,12] via (1 + tillerCount*11).
   * 0 = single blade, 1 = maximally dense clump.
   */
  tillerCount: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Basal footprint radius; 0 = single-point clump, 1 = maximally spread ring.
   * Reuses the skeleton stemSpread mechanism.
   */
  clumpSpread: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Internode count per blade → segments ∈ [3,8] via (3 + round(bladeSegments*5)).
   * Controls blade chain resolution.
   */
  bladeSegments: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Inflorescence intensity; 0 = no seed head, 1 = full panicle at blade tips.
   * Drives foliage seed-head emission count.
   */
  seedHead: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Azimuthal fan angle of tiller bases (replaces radialOrder).
   * 0 = all blades parallel, 1 = full 360° fan spread.
   */
  fanSpread: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  // --- Inflorescence / grain head (foliage.js structured spike) ------------
  // Together with seedHead (presence/density) these build a wheat-style ear:
  // a rachis bearing spikelets, each with several grains, optionally awned.
  // inflorescenceType=0 keeps the legacy radial-fan panicle (identity).

  /**
   * Inflorescence form: 0 = none / legacy fan (identity), low = open panicle
   * (golden-angle spiral), high = tight spike/ear (distichous two-ranked).
   */
  inflorescenceType: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /** Spikelets per ear → ~[8,28]; controls head length/density. */
  spikeletCount: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /** Grains (fertile florets) per spikelet → ~[1,5]. */
  grainsPerSpikelet: Object.freeze({
    tier: 'structural',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  // -------------------------------------------------------------------------
  // PROPORTIONS TIER — shape
  // -------------------------------------------------------------------------

  /**
   * World-height of a full blade → [0.15, 2.2] m.
   * 0 = very short ground cover, 1 = tall reed/grass.
   */
  bladeLength: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Base ribbon half-width → [0.004, 0.05] m.
   * 0 = needle-thin, 1 = broad ribbon.
   */
  bladeWidth: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Along-blade width falloff; 0 = parallel-sided ribbon, 1 = needle tip.
   * Applied as (1 - bladeTaper * swayBase) from base to tip.
   */
  bladeTaper: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Whole-blade gravitational bow; 0 = stiff upright, 1 = strong droop/cascade.
   * Scaled by stiffness (1 = rigid → ~0 arch).
   */
  arch: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * In-plane S/C lateral curvature of the blade (deterministic, no rng).
   * 0 = straight, 1 = strongly curved side-to-side.
   */
  curve: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Wind/arch resistance; 1 = rigid (≈0 sway/arch), 0 = floppy.
   * Maps to swayFactor amplitude and arch scale.
   */
  stiffness: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Growth direction: 0 = prostrate/creeping, 0.5 = erect, 1 = strongly pendulous.
   * Kept from proportions; drives basal tilt angle.
   */
  verticality: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Extra droop concentrated in the distal third of the blade.
   * 0 = no tip droop, 1 = heavy tip cascade.
   */
  tipDroop: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  // --- Per-blade range maxima (two-point sliders) --------------------------
  // The base gene above is the MIN of the range; the …Max gene is the MAX. Each
  // blade in a clump samples its own value in [min, max] (skeleton.js), so a
  // clump has varied heights/widths/droop instead of identical tillers. When a
  // …Max equals its base gene there is NO variation (identity).
  bladeLengthMax: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),
  bladeWidthMax: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),
  bladeTaperMax: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),
  archMax: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),
  tipDroopMax: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  // --- Blade silhouette profile (bladeMesh.js widthAt) ---------------------
  // These three deform the along-blade WIDTH profile away from the default
  // linear base→tip taper, spanning linear / strap / lanceolate / elliptic /
  // acuminate / needle silhouettes. Identity (bladeShape=0, tipSharpness=0.25)
  // reproduces the prior linear-taper ribbon byte-for-byte.

  /**
   * Belly amount: blend from the straight linear taper (0, identity) toward a
   * bellied profile whose width peaks at `widestPos` (1 = full lanceolate belly).
   */
  bladeShape: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Along-blade position of maximum width (only active when bladeShape > 0).
   * 0 = widest at base, 0.5 = widest at mid (lanceolate), 1 = widest near tip.
   */
  widestPos: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Cross-section curl (bladeMesh.js): cups the blade across its width into a
   * channel/gutter, with per-vertex normals recomputed from the curve so the
   * fold catches light. 0 = flat ribbon (identity). Combines with midribStrength
   * (central crease) → flat / channeled / V-folded / deep-gutter cross-sections.
   */
  crossSectionCurl: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Blade twist (bladeMesh.js): spirals the ribbon along its length.
   * 0 = untwisted (identity); 1 ≈ 1.25 turns base→tip (corkscrew ornamentals).
   */
  bladeTwist: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Stem roundness (bladeMesh.js): closes the cross-section from a flat blade
   * (0 = identity, ribbon) into a solid ROUND TUBE / culm (1 = circular cane).
   * This is the leaf↔stalk axis — reeds, rushes, bamboo, horsetails are round
   * stalks, not flat blades. Intermediate values give a thick flattened stem.
   */
  stemRoundness: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Awn (bristle) length on the ear, as a fraction of ear length. 0 = awnless
   * (identity). Only meaningful when an inflorescence is present.
   */
  awnLength: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Mid-ear bulge: spindle factor making mid-ear spikelets largest. 0.5 ≈ uniform.
   */
  midEarBulge: Object.freeze({
    tier: 'proportions',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  // -------------------------------------------------------------------------
  // COSMETIC TIER — surface detail
  // -------------------------------------------------------------------------

  /**
   * Hue position along colorRamp; green-ish neutral ~0.30.
   * pigment 0→1 sweeps hue 0°→360° (HSL, S=0.55, L=0.42).
   */
  pigment: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Edge raggedness amplitude — vertex jitter on ribbon edges.
   * 0 = smooth geometric ribbon, 1 = heavily frayed edge.
   */
  bladeRaggedness: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Per-blade hue/lightness spread within the clump.
   * 0 = all blades identical pigment, 1 = maximum per-blade variety.
   */
  colorVariation: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Positional/azimuth noise amplitude; kept from tree schema.
   */
  jitter: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1.5]),
  }),

  /**
   * Midrib crease depth (geometry fold + shading); 0 = flat ribbon.
   * Drives the center vertex offset in the blade ribbon mesher.
   */
  midribStrength: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Math-derived blade surface texture strength (bladeMesh.js fragment shader):
   * longitudinal veins/striations + midrib band + fibre mottle + tip/edge
   * dryness. 0 = smooth flat colour (identity); 1 = strong striation + drying.
   */
  veining: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  // --- Condition-driven color: per-species baselines for the pigment stack ---
  // The FINAL colour axes are computed in genome.js computeColorAxes() by
  // combining these seed baselines with environment (fertility/aridity/temp/
  // light/sun/starTemp). `pigment` (above) is reinterpreted as the species hue.

  /**
   * Chlorophyll vigour baseline — species' inherent green darkness/saturation.
   * 0 = pale/yellow-green, 1 = deep saturated green. Env (fertility, water,
   * light) shifts the final value around this baseline.
   */
  chlorophyll: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Senescence baseline — green→gold→straw dryness/ripeness. 0 = lush (identity),
   * 1 = fully straw. Env (aridity, heat) + maturity add on top. High for cereals.
   */
  senescence: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Anthocyanin propensity — how readily the species reddens/purples under the
   * cold×light stress gate. 0 = stays green (identity), 1 = reddens strongly.
   */
  anthoPropensity: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Glaucousness baseline — waxy blue-grey surface bloom (desaturate + blue tilt
   * + faint sheen). 0 = no wax (identity), 1 = strong blue-grey. Env (aridity,
   * sun) adds on top. High for blue fescue / blue oat grass.
   */
  glaucousness: Object.freeze({
    tier: 'cosmetic',
    kind: 'continuous',
    range: Object.freeze([0, 1]),
  }),

  /**
   * Per-plant uint32 seed that drives fine-grained jitter / curvature / detail.
   * Always re-derived in every child (see mutate.js draw schedule).
   */
  structuralSeed: Object.freeze({
    tier: 'cosmetic',
    kind: 'seed',
  }),
});

// ---------------------------------------------------------------------------
// Back-compat alias — mutate.js and biosphere.js import FLORA_SCHEMA.
// They are schema-agnostic and work unchanged on GRASS_SCHEMA.
// ---------------------------------------------------------------------------

export const FLORA_SCHEMA = GRASS_SCHEMA;

// ---------------------------------------------------------------------------
// Tier-partitioned field arrays — DERIVED from GRASS_SCHEMA (no hardcoded lists)
// ---------------------------------------------------------------------------

/** All field names with tier === 'structural'. */
export const STRUCTURAL_FIELDS = Object.freeze(
  Object.keys(GRASS_SCHEMA).filter(f => GRASS_SCHEMA[f].tier === 'structural')
);

/** All field names with tier === 'proportions'. */
export const PROPORTIONS_FIELDS = Object.freeze(
  Object.keys(GRASS_SCHEMA).filter(f => GRASS_SCHEMA[f].tier === 'proportions')
);

/** All field names with tier === 'cosmetic'. */
export const COSMETIC_FIELDS = Object.freeze(
  Object.keys(GRASS_SCHEMA).filter(f => GRASS_SCHEMA[f].tier === 'cosmetic')
);

// ---------------------------------------------------------------------------
// Tier weights used by genomeDistance
// ---------------------------------------------------------------------------

const TIER_WEIGHT = Object.freeze({
  structural:  3.0,
  proportions: 1.5,
  cosmetic:    0.5,
});

// ---------------------------------------------------------------------------
// clampField(schema, field, value) -> coerced value
// ---------------------------------------------------------------------------

/**
 * Coerce `value` into the valid domain for `field` as described by `schema`.
 *
 *   continuous  → clamp to [lo, hi].
 *   seed        → return value >>> 0  (coerce to uint32).
 *   unknown field → return value unchanged.
 */
export function clampField(schema, field, value) {
  const gene = schema[field];
  if (gene === undefined) return value;

  switch (gene.kind) {
    case 'continuous': {
      const [lo, hi] = gene.range;
      return value < lo ? lo : value > hi ? hi : value;
    }
    case 'seed': {
      return value >>> 0;
    }
    default:
      return value;
  }
}

// ---------------------------------------------------------------------------
// genomeDistance(a, b, schema) -> number in [0, 1]
// ---------------------------------------------------------------------------

/**
 * Normalized, tier-weighted phenotypic distance between two genome objects.
 *
 * Per-field distance:
 *   continuous   → |a - b| / (hi - lo)
 *   seed         → SKIPPED (not a phenotype axis)
 *
 * Tier weights: structural ×3, proportions ×1.5, cosmetic ×0.5.
 *
 * Returns sum(weight * fieldDist) / sum(weights of fields actually compared).
 * Returns 0 if no comparable fields exist.
 */
export function genomeDistance(a, b, schema) {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const field of Object.keys(schema)) {
    const gene = schema[field];

    // Seeds are not a phenotype axis — skip them entirely.
    if (gene.kind === 'seed') continue;

    const weight = TIER_WEIGHT[gene.tier] ?? 1.0;
    let fieldDist;

    switch (gene.kind) {
      case 'continuous': {
        const [lo, hi] = gene.range;
        const span = hi - lo;
        fieldDist = span === 0 ? 0 : Math.abs(a[field] - b[field]) / span;
        break;
      }
      default:
        continue;
    }

    weightedSum += weight * fieldDist;
    weightTotal += weight;
  }

  return weightTotal === 0 ? 0 : weightedSum / weightTotal;
}
