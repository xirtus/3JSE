// =============================================================================
// colorRamp.js — single source of truth for the pigment → [r,g,b] color ramp.
//
// pigment ∈ [0,1] maps the full HSL hue wheel (0→360°) with foliage-sensible
// saturation and lightness so leaves read as saturated at any hue.
//
// Pure ESM, no three.js dependency.
// =============================================================================

/**
 * HSL to RGB conversion.
 * h in [0,1] (0=red, 1/3=green, 2/3=blue), s and l in [0,1].
 * Returns [r, g, b] each in [0,1].
 */
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  function f(n) {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  }
  return [f(0), f(8), f(4)];
}

/**
 * pigmentToColor(pigment) -> [r, g, b]  — values in [0, 1].
 *
 * Full hue sweep: pigment 0→1 maps hue 0°→360° (full color wheel).
 * Saturation: 0.55 — vivid but not over-saturated.
 * Lightness:  0.42 — dark enough to read as foliage, bright enough at any hue.
 *
 * pigment is clamped to [0, 1] before lookup.
 */
export function pigmentToColor(pigment) {
  const p = pigment < 0 ? 0 : pigment > 1 ? 1 : pigment;
  return hslToRgb(p, 0.55, 0.42);
}

// ---------------------------------------------------------------------------
// colorStackRGB(axes) -> [r,g,b] in sRGB [0,1]  — JS mirror of the blade
// shader's condition-driven pigment stack (bladeMesh.js bladeColorTint), for UI
// swatches. Anchors here are the dossier's sRGB swatch colors; the shader uses
// the same anchors converted to LINEAR. Keep the two in sync. Omits the
// per-blade/per-clump variation and base→tip gradient (a swatch is one colour).
//
// axes: { chlorophyllVigor, senescence, anthoTint, glaucousness, speciesHue,
//         starWarm, starDark } — output of genome.js computeColorAxes.
// ---------------------------------------------------------------------------

const _A_PALE  = [0.549, 0.686, 0.353];  // #8CAF5A pale yellow-green
const _A_DEEP  = [0.133, 0.353, 0.133];  // #225A22 deep green
const _A_GOLD  = [0.843, 0.784, 0.275];  // #D7C846 senescent gold
const _A_STRAW = [0.745, 0.647, 0.431];  // #BEA56E dormant straw
const _A_ANTHO = [0.549, 0.196, 0.275];  // #8C3246 anthocyanin red/purple
const _A_GLAUC = [0.376, 0.510, 0.714];  // #6082B6 glaucous blue-grey

function _mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function _smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function _clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function colorStackRGB(axes) {
  const a = axes || {};
  const vigor = a.chlorophyllVigor !== undefined ? a.chlorophyllVigor : 0.6;
  const sen   = a.senescence       !== undefined ? a.senescence       : 0.0;
  const antho = a.anthoTint        !== undefined ? a.anthoTint        : 0.0;
  const glauc = a.glaucousness     !== undefined ? a.glaucousness     : 0.0;
  const hue   = a.speciesHue       !== undefined ? a.speciesHue       : 0.30;
  const warm  = a.starWarm         !== undefined ? a.starWarm         : 0.0;
  const dark  = a.starDark         !== undefined ? a.starDark         : 1.0;

  let col = _mix3(_A_PALE, _A_DEEP, vigor);
  col = _mix3(col, _A_GOLD,  _smooth(0.0, 0.6, sen));
  col = _mix3(col, _A_STRAW, _smooth(0.6, 1.0, sen));
  col = _mix3(col, _A_ANTHO, antho * 0.7);
  col = _mix3(col, _A_GLAUC, 0.45 * glauc);
  col = [col[0] + glauc * 0.05 * 0.35, col[1] + glauc * 0.05 * 0.60, col[2] + glauc * 0.05 * 1.0];
  const sh = hue - 0.30;
  col = _mix3(col, _A_GOLD,  Math.max(0, -sh) * 0.25);
  col = _mix3(col, _A_GLAUC, Math.max(0,  sh) * 0.20);
  col = _mix3(col, _A_GOLD,  Math.max(0,  warm) * 0.40);
  col = _mix3(col, _A_ANTHO, Math.max(0, -warm) * 0.50);
  col = [col[0] * dark, col[1] * dark, col[2] * dark];
  return [_clamp01(col[0]), _clamp01(col[1]), _clamp01(col[2])];
}
