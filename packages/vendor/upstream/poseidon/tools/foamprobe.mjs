// Foam measurements on a shot. Two modes:
//   --mode area   the shot is a DEBUG=6 render (coverage as grey over the whole
//                 frame); reports the fraction of ocean pixels above a coverage
//                 threshold, which is the literature's whitecap area fraction W.
//   --mode value  the shot is a normal render; reports the sRGB of the brightest
//                 ocean pixels, i.e. what a lit whitecap actually prints at.
import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));

const args = process.argv.slice(2);
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'value';
const horizon = args.includes('--horizon') ? Number(args[args.indexOf('--horizon') + 1]) : 0.5;
// which channel 'area' mode reads: 0=R, 1=G, 2=B. With DEBUG=1 in foamShading
// these are the raw cap / trail / lace accumulators as the SIMULATION writes
// them, before any carve or threshold — i.e. how much foam is generated rather
// than how much is drawn.
const chan = args.includes('--chan') ? Number(args[args.indexOf('--chan') + 1]) : 0;
const files = args.filter((a) => a.endsWith('.png'));

const browser = await launch({ executablePath: CHROME, headless: true, args: ['--headless=new', '--no-sandbox'] });
const page = await browser.newPage();

for (const f of files) {
  const b64 = (await readFile(resolve(f))).toString('base64');
  const out = await page.evaluate(async (dataUrl, mode, horizon, chan) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const y0 = Math.floor(cv.height * horizon);
    const px = [];
    for (let y = y0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        px.push([d[i], d[i + 1], d[i + 2]]);
      }
    }
    const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    if (mode === 'area') {
      // DEBUG=6 writes coverage into all three channels; sRGB-decode back to it
      const cov = px.map((p) => lin(p[chan]));
      const n = cov.length;
      const frac = (t) => cov.filter((c) => c > t).length / n;
      return {
        n,
        area_gt05: frac(0.05),
        area_gt15: frac(0.15),
        area_gt30: frac(0.30),
        mean: cov.reduce((a, b) => a + b, 0) / n,
      };
    }
    const lum = px.map((p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]));
    const idx = lum.map((l, i) => [l, i]).sort((a, b) => b[0] - a[0]);
    const pick = (lo, hi) => {
      const s = idx.slice(Math.floor(idx.length * lo), Math.floor(idx.length * hi)).map((v) => px[v[1]]);
      const m = [0, 1, 2].map((c) => s.reduce((a, p) => a + p[c], 0) / s.length);
      return m.map((v) => Math.round(v));
    };
    const blown = px.filter((p) => p[0] === 255 && p[1] === 255 && p[2] === 255).length / px.length;
    return {
      n: px.length,
      top01: pick(0, 0.001),
      top1: pick(0, 0.01),
      top5: pick(0, 0.05),
      med: pick(0.49, 0.51),
      blownPct: +(blown * 100).toFixed(3),
    };
  }, `data:image/png;base64,${b64}`, mode, horizon, chan);
  console.log(f.replace(/\\/g, '/'), JSON.stringify(out));
}

await browser.close();
