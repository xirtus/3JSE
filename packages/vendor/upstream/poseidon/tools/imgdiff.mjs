// Pixel-wise difference between two renders over a band, split by how bright
// the pixel is. Answers "did this edit reach the image, and where" without
// eyeballing — the companion to pxprobe.mjs, which only counts.
//
//   node tools/imgdiff.mjs a.png b.png 0 380 1600 520
import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
const [a, b, x, y, w, h] = process.argv.slice(2);
const browser = await launch({ executablePath: CHROME, headless: true, args: ['--headless=new', '--no-sandbox'] });
const page = await browser.newPage();
const load = async (f) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`;
const out = await page.evaluate(async (ua, ub, px, py, pw, ph) => {
  const grab = async (u) => {
    const im = new Image(); im.src = u; await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    return g.getImageData(px, py, pw, ph).data;
  };
  const [da, db] = [await grab(ua), await grab(ub)];
  let changed = 0; let changedBright = 0; let bright = 0; let sum = 0; let worst = 0;
  for (let k = 0; k < da.length; k += 4) {
    const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]),
      Math.abs(da[k + 2] - db[k + 2]));
    const isBright = da[k] > 200 || db[k] > 200;
    if (isBright) bright++;
    if (d > 3) { changed++; sum += d; if (isBright) changedBright++; }
    if (d > worst) worst = d;
  }
  const n = (da.length / 4);
  return `pixels ${n}, changed(>3) ${changed} (${(100 * changed / n).toFixed(1)}%), `
    + `mean|d| over changed ${(sum / Math.max(changed, 1)).toFixed(1)}, max|d| ${worst}, `
    + `bright-in-either ${bright}, of which changed ${changedBright} `
    + `(${(100 * changedBright / Math.max(bright, 1)).toFixed(1)}%)`;
}, await load(a), await load(b), +x, +y, +w, +h);
console.log(out);
await browser.close();
