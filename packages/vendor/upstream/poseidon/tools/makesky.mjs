// Generate a clear midday equirect sky panorama (2048x1024) matching the
// reference photo: deep blue zenith, pale horizon, high white sun at the same
// azimuth as the golden panorama (122.8 deg) so every camera preset keeps
// pointing at it. Rendered via headless Chrome canvas (no image deps).
import { launch } from 'puppeteer-core';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));

const out = process.argv[2] ?? 'public/sky/sky_midday_2k.png';
const b = await launch({ executablePath: CHROME, headless: true, args: ['--headless=new', '--no-sandbox'] });
const p = await b.newPage();
const png = await p.evaluate(() => {
  const W = 2048, H = 1024;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;

  // Sun placed at the same equirect COLUMN as the golden panorama's measured
  // sun (x = 838.6 of 2048 -> azimuth 122.8 through three's convention), at
  // 52 degrees of elevation.
  const sunX = 838.6, sunEl = (52 * Math.PI) / 180;
  const sunAzU = (sunX / W) * 2 * Math.PI; // column angle, same convention both ways
  const sunDir = [Math.cos(sunEl) * Math.cos(sunAzU), Math.sin(sunEl), Math.cos(sunEl) * Math.sin(sunAzU)];

  const lerp = (a, b2, t) => a + (b2 - a) * t;
  for (let y = 0; y < H; y++) {
    const el = (0.5 - (y + 0.5) / H) * Math.PI; // +pi/2 top
    for (let x = 0; x < W; x++) {
      const azU = (x / W) * 2 * Math.PI;
      const dir = [Math.cos(el) * Math.cos(azU), Math.sin(el), Math.cos(el) * Math.sin(azU)];
      let r, gg, bb;
      if (el >= 0) {
        // Rayleigh-ish gradient: pale blue-white line, deep blue dome
        const t = Math.pow(Math.max(Math.sin(el), 0), 0.58);
        r = lerp(212, 44, t); gg = lerp(226, 98, t); bb = lerp(238, 200, t);
      } else {
        // below the line: a dim grey-blue continuation (sky.js folds it anyway)
        const t = Math.min(-el / 0.5, 1);
        r = lerp(200, 148, t); gg = lerp(212, 158, t); bb = lerp(224, 172, t);
      }
      // angular distance to the sun
      const cosD = Math.max(-1, Math.min(1, dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2]));
      const dd = Math.acos(cosD);
      // broad aureole, tight glow, hard disc
      const aur = 26 * Math.exp(-dd / 0.45);
      const glow = 90 * Math.exp(-Math.pow(dd / 0.055, 1.4));
      r += aur + glow; gg += aur * 0.98 + glow * 0.97; bb += aur * 0.92 + glow * 0.90;
      if (dd < 0.011) { r = 255; gg = 254; bb = 250; }
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, r); d[i + 1] = Math.min(255, gg); d[i + 2] = Math.min(255, bb); d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
});
await writeFile(out, Buffer.from(png.split(',')[1], 'base64'));
await b.close();
console.log('wrote', out);
