// Connected-component analysis of a DEBUG=6 coverage render.
//
// "Clumpy" is a statement about how foam is DISTRIBUTED, not about the noise
// inside it, and neither the area fraction nor any texture statistic can see
// it. This counts the actual patches: how many there are, how big they are, and
// how much of the total foam sits in the largest few. A scattered field has
// many small components and a flat concentration curve; a clumped one has its
// area in a handful of blobs.
//
//   node tools/foamblobs.mjs shots/x/aerial.png [horizonFrac] [threshold]
import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));

const files = process.argv.slice(2).filter((a) => a.endsWith('.png'));
const rest = process.argv.slice(2).filter((a) => !a.endsWith('.png'));
const horizon = rest[0] ? Number(rest[0]) : 0.52;
const thresh = rest[1] ? Number(rest[1]) : 0.15;

const browser = await launch({ executablePath: CHROME, headless: true, args: ['--headless=new', '--no-sandbox'] });
const page = await browser.newPage();

for (const f of files) {
  const b64 = (await readFile(f)).toString('base64');
  const out = await page.evaluate(async (url, h, t) => {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const y0 = Math.floor(cv.height * h);
    const W = cv.width, H = cv.height - y0;
    const on = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) on[y * W + x] = lin(d[((y + y0) * W + x) * 4]) > t ? 1 : 0;
    }
    // iterative flood fill (4-connected), explicit stack so deep blobs are safe
    const lab = new Int32Array(W * H).fill(-1);
    const sizes = [];
    const stack = new Int32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!on[i] || lab[i] >= 0) continue;
      const id = sizes.length;
      let sp = 0, n = 0;
      stack[sp++] = i; lab[i] = id;
      while (sp > 0) {
        const p = stack[--sp]; n++;
        const px = p % W, py = (p / W) | 0;
        if (px > 0 && on[p - 1] && lab[p - 1] < 0) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (px < W - 1 && on[p + 1] && lab[p + 1] < 0) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (py > 0 && on[p - W] && lab[p - W] < 0) { lab[p - W] = id; stack[sp++] = p - W; }
        if (py < H - 1 && on[p + W] && lab[p + W] < 0) { lab[p + W] = id; stack[sp++] = p + W; }
      }
      sizes.push(n);
    }
    sizes.sort((a, b) => b - a);
    const total = sizes.reduce((a, b) => a + b, 0);
    const cum = (k) => sizes.slice(0, k).reduce((a, b) => a + b, 0) / Math.max(total, 1);
    const med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
    return {
      blobs: sizes.length,
      foamPx: total,
      // how much of all foam lives in the biggest few components
      top1: +cum(1).toFixed(3), top5: +cum(5).toFixed(3), top20: +cum(20).toFixed(3),
      largestPx: sizes[0] || 0,
      medianPx: med,
      // components big enough to read as a whitecap rather than as speckle
      over50px: sizes.filter((s) => s > 50).length,
      over500px: sizes.filter((s) => s > 500).length,
    };
  }, `data:image/png;base64,${b64}`, horizon, thresh);
  console.log(f, JSON.stringify(out));
}

await browser.close();
