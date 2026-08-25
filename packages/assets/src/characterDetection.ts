import type { GltfDocument } from "./gltfTypes.js";

export interface CharacterDetectionResult {
  likelyCharacter: boolean;
  /** Which of the recognized humanoid bone categories were actually matched, by name — the
   *  "why" behind `likelyCharacter`, so a human (or an agent) reviewing the suggestion can see
   *  the reasoning instead of a bare boolean. */
  matchedCategories: string[];
  skinIndex: number | null;
}

// docs/ASSET_PIPELINE.md: "bone-naming/hierarchy heuristics (root/hip/spine/limb pattern
// matching), not a black-box ML classifier." Deliberately simple substring matching against
// common DCC/rig-tool naming conventions (Mixamo, Unreal Mannequin, generic humanoid rigs) —
// case-insensitive, checked as a substring so "mixamorig:Hips" or "LeftUpperArm" both match.
const BONE_PATTERNS: Record<string, RegExp> = {
  hip: /hip|pelvis/i,
  spine: /spine|chest|torso/i,
  head: /head|neck|skull/i,
  arm: /arm|shoulder|clavicle/i,
  hand: /hand|wrist|finger/i,
  leg: /leg|thigh|knee|shin/i,
  foot: /foot|ankle|toe/i,
};

/** A skin needs at least this many distinct bone categories present to be flagged — one or two
 *  incidental name matches (a prop mesh with a node helpfully named "Head_Socket") shouldn't be
 *  enough on their own. */
const MIN_CATEGORY_MATCHES = 4;

export function detectCharacter(doc: GltfDocument): CharacterDetectionResult {
  const nodes = doc.nodes ?? [];
  let best: CharacterDetectionResult = { likelyCharacter: false, matchedCategories: [], skinIndex: null };

  for (const [skinIndex, skin] of (doc.skins ?? []).entries()) {
    const matched = new Set<string>();
    for (const jointIndex of skin.joints) {
      const name = nodes[jointIndex]?.name;
      if (!name) continue;
      for (const [category, pattern] of Object.entries(BONE_PATTERNS)) {
        if (pattern.test(name)) matched.add(category);
      }
    }
    if (matched.size > best.matchedCategories.length) {
      best = { likelyCharacter: matched.size >= MIN_CATEGORY_MATCHES, matchedCategories: Array.from(matched), skinIndex };
    }
  }

  return best;
}
