// Derive the lighting rig from a baked equirect sky, so the sun the water is lit
// by is the sun that is actually painted in the panorama.
//
//   node tools/skylight.mjs public/sky/sky_131_2k.png
//
// Reports, ready to paste into params.js:
//   sunAzimuth/sunElevation  luminance-weighted centroid of the brightest pixels,
//                            through three's equirect convention.
//   colors.sun               hue of the solar disc, renormalised to full value.
//                            A low sun is strongly reddened and a white sun over
//                            a sunset sky is the single most obvious tell.
//   colors.skyHorizon        solid-angle mean of the first few degrees above the
//                            line — what haze and grazing reflections resolve to.
//   colors.skyZenith         ...and of the top of the dome.
//   ambient                  cosine-weighted irradiance of the whole upper
//                            hemisphere on a horizontal surface: the sky term.
//   sunToAmbient             solar radiance over that ambient. This is the
//                            contrast ratio of the lighting, and the number to
//                            aim intensity at.
//
// Everything is averaged in LINEAR light (the PNG is sRGB-encoded), because
// averaging in gamma space biases every result toward the bright end.
import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));

const file = process.argv[2] ?? 'public/sky/sky_131_2k.png';
const browser = await launch({
  executablePath: process.env.CHROME_PATH ?? CHROME,
  headless: true,
  args: ['--headless=new', '--no-sandbox'],
});
const page = await browser.newPage();
await page.goto('about:blank');
const b64 = (await readFile(file)).toString('base64');

const r = await page.evaluate(async (data) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const { width: W, height: H } = img;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, W, H).data;

  const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) lin[i] = s2l(i / 255);
  const lum = (R, G, B) => 0.2126 * R + 0.7152 * G + 0.0722 * B;

  // elevation of row y, and the solid-angle weight of that row (cos of latitude)
  const elevOf = (y) => ((0.5 - (y + 0.5) / H) * Math.PI); // radians, +pi/2 at top
  const acc = () => ({ r: 0, g: 0, b: 0, w: 0 });
  const add = (a, i, w) => { a.r += lin[d[i]] * w; a.g += lin[d[i + 1]] * w; a.b += lin[d[i + 2]] * w; a.w += w; };
  const out = (a) => (a.w ? [a.r / a.w, a.g / a.w, a.b / a.w] : [0, 0, 0]);

  const horizon = acc(), zenith = acc(), hemi = acc(), sunAcc = acc(), glow = acc();
  const sunward = acc(); // horizon band restricted to the sun's own azimuth

  // brightest 0.02% defines the solar disc
  const all = new Float32Array(W * H);
  for (let y = 0, k = 0; y < H; y++) {
    for (let x = 0; x < W; x++, k++) {
      const i = k * 4;
      all[k] = lum(lin[d[i]], lin[d[i + 1]], lin[d[i + 2]]);
    }
  }
  const cut = Array.from(all).sort((a, b) => b - a)[Math.floor(W * H * 0.0002)];

  let sx = 0, sy = 0, sw = 0;
  for (let y = 0, k = 0; y < H; y++) {
    const e = elevOf(y);
    const cw = Math.cos(e); // solid angle per texel row
    for (let x = 0; x < W; x++, k++) {
      const i = k * 4;
      if (e > 0) {
        add(hemi, i, cw * Math.sin(e)); // cosine-weighted irradiance on a flat sea
        if (e < 0.052) add(horizon, i, cw); // first 3 degrees
        if (e > 1.22) add(zenith, i, cw); // top 20 degrees
      }
      if (all[k] >= cut) {
        const w = all[k] - cut + 1e-4;
        sx += x * w; sy += y * w; sw += w;
        add(sunAcc, i, w);
      }
    }
  }
  // Second pass for the solar chromaticity. The disc itself is clipped — every
  // channel pinned near 255 — so its hue is gone. The unclipped glow ringing it
  // is the same light through more atmosphere, and it still carries the colour.
  // Take pixels inside GLOW_RAD of the centroid with no channel at/over 250,
  // weighted by brightness so the inner ring dominates.
  const GLOW_RAD = 0.16; // radians (~9 degrees)
  const SUNWARD_AZ = 0.35; // radians (~20 degrees) either side of the sun's azimuth
  const cxN = sx / sw, cyN = sy / sw;
  const dirOf = (x, y) => {
    const th = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
    const el = elevOf(y);
    const ce = Math.cos(el);
    return [ce * Math.cos(th), Math.sin(el), ce * Math.sin(th)];
  };
  const sunDir = dirOf(cxN, cyN);
  for (let y = 0, k = 0; y < H; y++) {
    for (let x = 0; x < W; x++, k++) {
      const i = k * 4;
      if (d[i] >= 250 || d[i + 1] >= 250 || d[i + 2] >= 250) continue;
      const v2 = dirOf(x, y);
      // the sky along the sun's azimuth in the first few degrees of elevation:
      // this is sunlight through the most air mass, so it is the best available
      // estimate of the DIRECT light's colour when the disc itself is clipped
      const e2 = elevOf(y);
      if (e2 > 0 && e2 < 0.09) {
        const dAz = Math.abs(Math.atan2(
          v2[0] * sunDir[2] - v2[2] * sunDir[0],
          v2[0] * sunDir[0] + v2[2] * sunDir[2],
        ));
        if (dAz < SUNWARD_AZ) add(sunward, i, 1);
      }
      const cosA = v2[0] * sunDir[0] + v2[1] * sunDir[1] + v2[2] * sunDir[2];
      if (cosA < Math.cos(GLOW_RAD)) continue;
      add(glow, i, all[k]);
    }
  }

  return {
    W, H, cx: cxN, cy: cyN,
    sun: out(sunAcc), glow: out(glow), sunward: out(sunward), horizon: out(horizon), zenith: out(zenith), hemi: out(hemi),
  };
}, b64);
await browser.close();

const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (rgb) => '0x' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, l2s(c))) * 255)
  .toString(16).padStart(2, '0')).join('');
const lumOf = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// renormalise the solar disc to full value: an 8-bit sun is clipped, so its
// absolute level is meaningless but its hue survives
const norm = (rgb) => { const m = Math.max(...rgb); return m > 0 ? rgb.map((c) => c / m) : rgb; };

// three's equirect: u = atan2(z,x)/2pi + 0.5, v = asin(y)/pi + 0.5, flipY -> row 0 is v=1
const u = r.cx / r.W, v = 1 - r.cy / r.H;
const theta = (u - 0.5) * 2 * Math.PI;
const y = Math.sin((v - 0.5) * Math.PI);
const c = Math.cos(Math.asin(y));

console.log(JSON.stringify({
  source: file,
  sunAzimuth: +(((Math.atan2(c * Math.cos(theta), c * Math.sin(theta)) * 180) / Math.PI + 360) % 360).toFixed(1),
  sunElevation: +((Math.asin(y) * 180) / Math.PI).toFixed(1),
  colors: {
    sun: hex(norm(r.sunward)), // sky along the sun's azimuth at low elevation
    sunGlowRing: hex(norm(r.glow)), // brighter, paler — the glow immediately around the disc
    sunClippedCore: hex(norm(r.sun)), // for comparison only; do not use this one
    skyHorizon: hex(r.horizon),
    skyZenith: hex(r.zenith),
  },
  ambientLinear: r.hemi.map((n) => +n.toFixed(4)),
  ambientHex: hex(r.hemi),
  sunToAmbient: +(lumOf(r.sun) / Math.max(lumOf(r.hemi), 1e-6)).toFixed(2),
}, null, 2));
