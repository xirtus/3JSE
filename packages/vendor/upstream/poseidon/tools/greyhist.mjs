// Histogram of the R channel over a band, for coverage-debug renders. Counts at
// several thresholds are an AREA measurement that is immune to any tonal change
// in the foam shading — the companion gate to pxprobe.mjs, which is a
// peak-brightness test and only proxies for area while foam is uniformly bright.
//
//   node tools/greyhist.mjs shot.png 0 380 1600 520
import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const [src, x, y, w, h] = process.argv.slice(2);
const b = await launch({ executablePath: CHROME, headless: true, args: ['--headless=new', '--no-sandbox'] });
const p = await b.newPage();
const u = `data:image/png;base64,${(await readFile(src)).toString('base64')}`;
console.log(await p.evaluate(async (uu, px, py, pw, ph) => {
  const im = new Image(); im.src = uu; await im.decode();
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(px, py, pw, ph).data;
  const ts = [8, 32, 64, 128, 192, 240];
  const n = ts.map(() => 0);
  let sum = 0;
  for (let k = 0; k < d.length; k += 4) {
    sum += d[k];
    for (let i = 0; i < ts.length; i++) if (d[k] > ts[i]) n[i]++;
  }
  return ts.map((t, i) => `>${t}: ${n[i]}`).join('  ') + `  mean: ${(sum / (d.length / 4)).toFixed(2)}`;
}, u, +x, +y, +w, +h));
await b.close();
