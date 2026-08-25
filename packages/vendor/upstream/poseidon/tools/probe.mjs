// Pixel measurements on a shot, so "the horizon reads" is a number and not an
// opinion. Decodes the PNG in a headless page (no image deps) and reports the
// things that were actually wrong and invisible to the eye:
//
//   node tools/probe.mjs shots/r3-state/away.png
//
//   horizonStep  luminance of water at the sea/sky boundary MINUS sky above it.
//                Must be NEGATIVE — water darker than the sky it meets — or the
//                sea has no terminating edge and the frame loses scale.
//                Reported per column band (left/mid/right) and at four offsets
//                either side of the line, because a single left-third sample
//                structurally cannot see the sunward-side failure.
//   clipR/G/B    % of pixels with a channel crushed to exactly 0, which is what
//                prints a hard seam through a smooth sky gradient.
//   blown        % at exactly 255,255,255 (foam going to a flat paper card).
//   warmPct      % of lower-40% pixels with R > G — sun colour reaching the
//                water. A frame with none of these is monochromatically cool.
//   hueSplit     mean hue of the top luminance decile minus that of the bottom
//                decile, in degrees on the warm-negative convention (positive =
//                highlights warmer than shadows).
//   histogram    8 buckets of luminance — a fat midtone means a real photograph,
//                a bimodal one means crushed foreground against a blown sky.
//
// WHERE THE LINE IS. The previous version took the row of steepest luminance
// gradient in the left third, which on an aerial frame locks onto a cloud base
// three hundred rows below the real boundary and certifies a broken horizon.
// The boundary is now computed ANALYTICALLY from the capture preset — the row
// where a ray leaves the camera with world y-component zero, which is what a
// horizon is — and cross-checked against a chroma scan (the sea is saturated,
// the sky is not). They have to agree within CHROMA_TOL or the probe says so.
import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { PRESETS } from '../src/util/capture.js';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));

const SAT_CROSS = 2; // per-row median (G - B) in code values that says "this is sea"
const SAT_RUN = 8; // ...and how many rows it has to hold it for
const CHROMA_TOL = 20; // px of disagreement allowed against the analytic row
const OFFSETS = [2, 4, 8, 16]; // px either side of the line the step is read at
const BANDS = { left: [0.06, 0.33], mid: [0.38, 0.62], right: [0.67, 0.94] };

const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: node tools/probe.mjs <shot.png> [...]');

// Row of the true horizon for a preset, from the camera basis alone. lookAt with
// a +Y up gives an unrolled camera, so the screen-right vector is horizontal and
// the set of rays with d.y = 0 is a single image ROW: solve
// f.y + yNdc * tan(fovY/2) * u.y = 0 for yNdc.
function analyticHorizonRow(preset, W, H) {
  if (!preset) return null;
  const [px, py, pz] = preset.pos;
  const [tx, ty, tz] = preset.target;
  const fv = [tx - px, ty - py, tz - pz];
  const fl = Math.hypot(...fv);
  const f = fv.map((v) => v / fl);
  // r = normalize(f x up) is horizontal by construction; u = r x f
  const r = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[2]) || 1e-9;
  const rn = [r[0] / rl, 0, r[2] / rl];
  const u = [
    rn[1] * f[2] - rn[2] * f[1],
    rn[2] * f[0] - rn[0] * f[2],
    rn[0] * f[1] - rn[1] * f[0],
  ];
  const tanY = Math.tan((preset.fov * Math.PI) / 360);
  if (Math.abs(u[1]) < 1e-9) return null;
  const yNdc = -f[1] / (tanY * u[1]);
  return ((1 - yNdc) * H) / 2;
}

const browser = await launch({
  executablePath: process.env.CHROME_PATH ?? CHROME,
  headless: true,
  args: ['--headless=new', '--no-sandbox'],
});
const page = await browser.newPage();
await page.goto('about:blank');

const out = [];
let failed = false;
for (const f of files) {
  const b64 = (await readFile(resolve(f))).toString('base64');
  const name = basename(f).replace(/\.png$/i, '');
  const preset = PRESETS[name] ?? null;
  const stats = await page.evaluate(async (data, cfg) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const { width: W, height: H } = img;
    const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, W, H).data;
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

    let clipR = 0, clipG = 0, clipB = 0, blown = 0;
    const hist = new Array(8).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 0) clipR++;
      if (d[i + 1] === 0) clipG++;
      if (d[i + 2] === 0) clipB++;
      if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) blown++;
      hist[Math.min(7, lum(i) >> 5)]++;
    }
    const n = W * H;
    const pct = (v) => +((100 * v) / n).toFixed(2);

    // --- boundary by chroma ---------------------------------------------------
    // HSV saturation cannot separate this sea from this sky: the zenith is a
    // deep cobalt whose median saturation runs past 0.5, so a "first row over
    // 0.35" scan locks onto open blue three hundred rows above the water. What
    // does separate them is the SIGN of green against blue — the sea is a
    // blue-GREEN body (G > B), every part of the sky from cobalt to haze to
    // cloud shadow is blue-dominant (B > G). Per-row median, scanned downward
    // for the first sustained upward crossing. Median, not mean, so a foam cap
    // or a cloud cannot drag it.
    const rowGB = new Float64Array(H);
    const buf = new Float64Array(W);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        buf[x] = d[i + 1] - d[i + 2];
      }
      const s = Array.prototype.slice.call(buf).sort((a, b) => a - b);
      rowGB[y] = s[W >> 1];
    }
    let chromaRow = -1;
    for (let y = 1; y < H - cfg.satRun; y++) {
      if (rowGB[y - 1] < cfg.satCross && rowGB[y] >= cfg.satCross) {
        let ok = true;
        for (let k = 0; k < cfg.satRun; k++) if (rowGB[y + k] < cfg.satCross) { ok = false; break; }
        if (ok) { chromaRow = y; break; }
      }
    }

    const hz = cfg.analyticRow !== null ? Math.round(cfg.analyticRow) : chromaRow;
    const bandMean = (y, [a, b]) => {
      if (y < 0 || y >= H) return null;
      const x0 = (W * a) | 0, x1 = (W * b) | 0;
      let s = 0;
      for (let x = x0; x < x1; x++) s += lum((y * W + x) * 4);
      return s / (x1 - x0);
    };

    const steps = {};
    const bandWorst = {};
    for (const [bn, range] of Object.entries(cfg.bands)) {
      const per = {};
      let worst = -1e9;
      for (const o of cfg.offsets) {
        const sky = bandMean(hz - o, range);
        const sea = bandMean(hz + o, range);
        const v = sky === null || sea === null ? null : +(sea - sky).toFixed(1);
        per['+' + o] = v;
        if (v !== null && v > worst) worst = v;
      }
      steps[bn] = per;
      bandWorst[bn] = worst === -1e9 ? null : +worst.toFixed(1);
    }

    // --- grade: warm/cool separation -----------------------------------------
    // Warm pixels in the lower 40% of frame (the water), and the hue split
    // between the brightest and darkest deciles of the whole frame.
    const y0 = (H * 0.6) | 0;
    let warm = 0, low = 0;
    for (let y = y0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        low++;
        if (d[i] > d[i + 1]) warm++;
      }
    }

    // Sky-dome signature below the waterline: raw dome is strongly blue-over-
    // green, water never is. Anything counted here is sky rendering where sea
    // should be — a submerged camera with no underwater treatment.
    let blueBelow = 0, belowN = 0;
    for (let y = Math.max(0, hz + 8); y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        belowN++;
        if (d[i + 2] - d[i + 1] > 20) blueBelow++;
      }
    }
    const lums = new Float64Array(n);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) lums[k] = lum(i);
    const sorted = Float64Array.from(lums).sort();
    const loCut = sorted[(n * 0.1) | 0], hiCut = sorted[(n * 0.9) | 0];
    const hueOf = (i) => {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      if (c < 1e-6) return null;
      let h;
      if (mx === r) h = ((g - b) / c) % 6;
      else if (mx === g) h = (b - r) / c + 2;
      else h = (r - g) / c + 4;
      h *= 60;
      return h < 0 ? h + 360 : h;
    };
    // circular mean, then reported as "degrees warmer" = how far the hue has
    // rotated from cyan-blue back toward yellow-red (i.e. decreasing hue angle
    // in the 180-260 range the whole frame lives in)
    const meanHue = (test) => {
      let sx = 0, sy = 0, c = 0;
      for (let i = 0, k = 0; i < d.length; i += 4, k++) {
        if (!test(lums[k])) continue;
        const h = hueOf(i);
        if (h === null) continue;
        const rad = (h * Math.PI) / 180;
        sx += Math.cos(rad); sy += Math.sin(rad); c++;
      }
      if (!c) return null;
      let a = (Math.atan2(sy, sx) * 180) / Math.PI;
      return a < 0 ? a + 360 : a;
    };
    const hiH = meanHue((v) => v >= hiCut);
    const loH = meanHue((v) => v <= loCut);
    let hueSplit = null;
    if (hiH !== null && loH !== null) {
      let dh = loH - hiH; // positive when the highlight hue sits warmer (lower angle)
      while (dh > 180) dh -= 360;
      while (dh < -180) dh += 360;
      hueSplit = +dh.toFixed(1);
    }

    return {
      size: `${W}x${H}`,
      horizonRow: hz,
      chromaRow,
      analyticRow: cfg.analyticRow === null ? null : +cfg.analyticRow.toFixed(1),
      rowGBatHz: hz >= 0 && hz < H ? +rowGB[Math.min(H - 1, hz + 8)].toFixed(1) : null,
      blueBelow: +((100 * blueBelow) / Math.max(belowN, 1)).toFixed(2),
      horizonStep: bandWorst.mid,
      stepWorst: Math.max(...Object.values(bandWorst).filter((v) => v !== null)),
      bands: bandWorst,
      steps,
      clipR: pct(clipR), clipG: pct(clipG), clipB: pct(clipB),
      blown: pct(blown),
      warmPct: +((100 * warm) / Math.max(low, 1)).toFixed(2),
      hueSplit,
      hist: hist.map((v) => pct(v)),
    };
  }, b64, {
    analyticRow: preset ? analyticHorizonRow(preset, 1600, 900) : null,
    satCross: SAT_CROSS, satRun: SAT_RUN, bands: BANDS, offsets: OFFSETS,
  });

  // The analytic row is computed against the shot script's default 1600x900; if
  // the image is a different size, redo it at the real one.
  if (preset && stats.size !== '1600x900') {
    const [w, h] = stats.size.split('x').map(Number);
    stats.analyticRow = +analyticHorizonRow(preset, w, h).toFixed(1);
  }
  stats.chromaCheck = stats.analyticRow === null || stats.chromaRow < 0
    ? 'n/a'
    : Math.abs(stats.chromaRow - stats.analyticRow) <= CHROMA_TOL
      ? 'ok'
      : `DISAGREE ${Math.abs(stats.chromaRow - Math.round(stats.analyticRow))}px`;
  if (stats.stepWorst >= -12) failed = true;
  out.push({ file: f, preset: preset ? name : '(unknown, no analytic row)', ...stats });
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
if (failed) {
  console.log('FAIL: horizonStep >= -12 in at least one band — the sea does not terminate.');
  process.exitCode = 1;
}
